import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.FRANKLIN_NO_AUDIT = '1';
process.env.FRANKLIN_NO_PERSIST = '1';
process.env.FRANKLIN_NO_PREFETCH = '1';
process.env.FRANKLIN_NO_EVAL = '1';
process.env.FRANKLIN_NO_ANALYZER = '1';

const enabled = Boolean(process.env.BLOCKRUN_API_KEY);

test('live account API: catalog, model stream and Exa answer', { skip: !enabled, timeout: 180_000 }, async () => {
  const { getGatewayModels } = await import('../dist/gateway-models.js');
  const { ModelClient } = await import('../dist/agent/llm.js');
  const { exaAnswerCapability } = await import('../dist/tools/exa.js');

  const models = await getGatewayModels();
  assert.ok(models.length > 0, 'account model catalog must not be empty');

  const client = new ModelClient({ apiUrl: 'https://sol.blockrun.ai/api', chain: 'solana' });
  let text = '';
  for await (const chunk of client.streamCompletion({
    model: 'openai/gpt-4.1-nano',
    messages: [{ role: 'user', content: 'Reply with exactly: FRANKLIN_TRADING_API_OK' }],
    max_tokens: 32,
  })) {
    if (chunk.kind === 'error') throw new Error(String(chunk.payload.message || 'model stream failed'));
    if (chunk.kind === 'content_block_delta') {
      const delta = chunk.payload.delta;
      if (delta && typeof delta === 'object' && 'text' in delta) text += String(delta.text);
    }
  }
  assert.equal(text.trim(), 'FRANKLIN_TRADING_API_OK');

  const exa = await exaAnswerCapability.execute(
    { query: 'What is the x402 protocol?' },
    { workingDir: process.cwd(), abortSignal: new AbortController().signal },
  );
  assert.notEqual(exa.isError, true, exa.output);
  assert.ok(exa.output.length > 100, 'Exa answer must contain substantive text');
  assert.match(exa.output, /Sources/);
});
