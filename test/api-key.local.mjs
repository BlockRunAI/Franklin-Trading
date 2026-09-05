import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.FRANKLIN_NO_AUDIT = '1';
process.env.FRANKLIN_NO_PERSIST = '1';
process.env.FRANKLIN_NO_PREFETCH = '1';
process.env.FRANKLIN_NO_EVAL = '1';
process.env.FRANKLIN_NO_ANALYZER = '1';

const key = 'brk_live_unit_test';
const originalFetch = globalThis.fetch;
const savedKey = process.env.BLOCKRUN_API_KEY;
const savedBase = process.env.BLOCKRUN_API_BASE_URL;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', ...headers },
});

beforeEach(() => {
  process.env.BLOCKRUN_API_KEY = key;
  delete process.env.BLOCKRUN_API_BASE_URL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (savedKey === undefined) delete process.env.BLOCKRUN_API_KEY;
  else process.env.BLOCKRUN_API_KEY = savedKey;
  if (savedBase === undefined) delete process.env.BLOCKRUN_API_BASE_URL;
  else process.env.BLOCKRUN_API_BASE_URL = savedBase;
});

test('account auth rewrites BlockRun gateways and never forwards payment headers', async () => {
  const { gatewayFetch } = await import('../dist/payments/account.js');
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push([String(url), options]);
    return json({ ok: true });
  };

  await gatewayFetch('https://sol.blockrun.ai/api/v1/search?q=x', {
    headers: { 'PAYMENT-SIGNATURE': 'remove', 'x-api-key': 'placeholder' },
  });
  assert.equal(seen[0][0], 'https://api.blockrun.ai/v1/search?q=x');
  assert.equal(seen[0][1].headers.get('authorization'), `Bearer ${key}`);
  assert.equal(seen[0][1].headers.get('payment-signature'), null);
  assert.equal(seen[0][1].redirect, 'error');
  await assert.rejects(() => gatewayFetch('https://evil.example/job'), /unknown gateway/);
  assert.equal(seen.length, 1);
});

test('account auth redacts credentials and does not x402-sign quota errors', async () => {
  const { ModelClient } = await import('../dist/agent/llm.js');
  const { classifyAgentError } = await import('../dist/agent/error-classifier.js');
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return json({ error: { message: key } }, 402, { 'payment-required': 'must-not-sign' });
  };
  const client = new ModelClient({ apiUrl: 'https://sol.blockrun.ai/api', chain: 'solana' });
  const chunks = [];
  for await (const chunk of client.streamCompletion({
    model: 'anthropic/claude-sonnet-4.6',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 5,
    stream: false,
  })) chunks.push(chunk);

  assert.equal(count, 1);
  const error = chunks.find(chunk => chunk.kind === 'error');
  assert.equal(error.payload.status, 402);
  assert.match(error.payload.message, /account credits exhausted/i);
  assert.equal(classifyAgentError(error.payload.message).isTransient, false);
  assert.equal(client.getLastPaidUsd(), 0);
  assert.ok(!JSON.stringify(chunks).includes(key));
});

test('ModelClient preserves Anthropic SSE events in account mode', async () => {
  const { ModelClient } = await import('../dist/agent/llm.js');
  let seen;
  globalThis.fetch = async (url, options) => {
    seen = [String(url), options];
    return new Response(
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  };
  const client = new ModelClient({ apiUrl: 'https://blockrun.ai/api', chain: 'base' });
  const chunks = [];
  for await (const chunk of client.streamCompletion({
    model: 'anthropic/claude-sonnet-4.6',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 5,
  })) chunks.push(chunk);

  assert.equal(seen[0], 'https://api.blockrun.ai/v1/messages');
  assert.equal(seen[1].headers.get('authorization'), `Bearer ${key}`);
  assert.ok(chunks.some(chunk => chunk.kind === 'content_block_delta'));
});

test('Exa account requests authenticate once without creating a payment wallet', async () => {
  const { exaAnswerCapability } = await import('../dist/tools/exa.js');
  let count = 0;
  globalThis.fetch = async (_url, options) => {
    count++;
    assert.equal(options.headers.get('authorization'), `Bearer ${key}`);
    return json({ answer: 'account answer', citations: [] });
  };
  const result = await exaAnswerCapability.execute(
    { query: 'hi' },
    { workingDir: process.cwd(), abortSignal: new AbortController().signal },
  );
  assert.notEqual(result.isError, true);
  assert.match(result.output, /account answer/);
  assert.equal(count, 1);
});

test('trading market-data client uses account auth without wallet signing', async () => {
  const { blockrunGetPaid, clearCache } = await import('../dist/trading/providers/blockrun/client.js');
  clearCache();
  let count = 0;
  globalThis.fetch = async (url, options) => {
    count++;
    assert.equal(String(url), 'https://api.blockrun.ai/v1/stocks/us/price/AAPL');
    assert.equal(options.headers.get('authorization'), `Bearer ${key}`);
    return json({ data: { symbol: 'AAPL', price: 200 } });
  };
  const result = await blockrunGetPaid('/api/v1/stocks/us/price/AAPL', { endpoint: 'stock-price', costUsd: 0.001 });
  assert.equal(result.data.price, 200);
  assert.equal(count, 1);
});

test('local proxy returns account quota errors without wallet fallback', async () => {
  const { createProxy } = await import('../dist/proxy/server.js');
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return json({ error: { message: 'quota' } }, 402);
  };
  const proxy = createProxy({ port: 0, apiUrl: 'https://blockrun.ai/api', chain: 'base', fallbackEnabled: true });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  try {
    const response = await originalFetch(`http://127.0.0.1:${proxy.address().port}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'anthropic/claude-sonnet-4.6', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(response.status, 402);
    assert.match(await response.text(), /account credits exhausted/i);
    assert.equal(count, 1);
  } finally {
    proxy.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve));
  }
});
