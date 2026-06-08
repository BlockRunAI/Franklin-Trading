import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineStrategy } from '@blockrun/franklin-trading/strategy';

const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));

function runCli(args, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [DIST, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 0 });
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test('defineStrategy validates and freezes a strategy artifact', async () => {
  const strategy = defineStrategy({
    name: ' btc-funding-basis ',
    universe: [' BTC-PERP@hyperliquid ', 'BTC@jupiter'],
    risk: { maxNotionalUsd: 1000, maxDrawdownPct: 5, killSwitch: true },
    schedule: { every: ' 1m ' },
    metadata: { venue: 'hyperliquid+jupiter' },
    signal: async (ctx) => {
      const funding = await ctx.market.fundingRate('BTC-PERP@hyperliquid');
      return funding > 0.0001
        ? { action: 'arb-long-spot-short-perp', size: 0.2 }
        : null;
    },
  });

  assert.equal(strategy.name, 'btc-funding-basis');
  assert.deepEqual(strategy.universe, ['BTC-PERP@hyperliquid', 'BTC@jupiter']);
  assert.equal(Object.isFrozen(strategy), true);
  assert.equal(Object.isFrozen(strategy.universe), true);
  assert.equal(Object.isFrozen(strategy.risk), true);
  assert.equal(Object.isFrozen(strategy.schedule), true);
  assert.equal(Object.isFrozen(strategy.metadata), true);
  assert.equal(strategy.schedule.every, '1m');

  const signal = await strategy.signal({
    mode: 'paper',
    now: new Date('2026-05-25T00:00:00Z'),
    market: {
      price: async () => 100000,
      fundingRate: async () => 0.0002,
    },
  });
  assert.deepEqual(signal, { action: 'arb-long-spot-short-perp', size: 0.2 });
});

test('defineStrategy rejects invalid strategy shapes', () => {
  assert.throws(
    () => defineStrategy({ name: '', universe: ['BTC'], signal: () => null }),
    /Strategy name is required/,
  );
  assert.throws(
    () => defineStrategy({ name: 'x', universe: [], signal: () => null }),
    /universe must include/,
  );
  assert.throws(
    () => defineStrategy({ name: 'x', universe: ['BTC'], signal: () => null, risk: { maxNotionalUsd: -1 } }),
    /risk\.maxNotionalUsd/,
  );
  assert.throws(
    () => defineStrategy({ name: 'x', universe: ['BTC', ' BTC '], signal: () => null }),
    /duplicate instrument/,
  );
  assert.throws(
    () => defineStrategy({ name: 'x', universe: ['BTC'], signal: () => null, schedule: { every: ' ' } }),
    /schedule\.every is required/,
  );
  assert.throws(
    () => defineStrategy({ name: 'x', universe: [42], signal: () => null }),
    /universe\[0\] must be a string/,
  );
  assert.throws(
    () => defineStrategy({ name: 'x', universe: ['BTC'], signal: () => null, risk: null }),
    /risk must be an object/,
  );
  assert.throws(
    () => defineStrategy({ name: 'x', universe: ['BTC'], signal: () => null, metadata: [] }),
    /metadata must be an object/,
  );
});

test('strategy runner CLI exits with an explicit M1 roadmap message', async () => {
  const result = await runCli(['run', 'btc-funding-basis', '--mode', 'paper']);

  assert.equal(result.code, 1, `Expected runner placeholder to exit 1.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stderr, /Strategy runner is M1 roadmap work/);
  assert.match(result.stderr, /btc-funding-basis/);
  assert.match(result.stderr, /paper mode/);
});
