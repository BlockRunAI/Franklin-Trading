/**
 * Raw BlockRun primitive demo — Surf data calls without the LLM layer.
 * Deterministic, cheap, useful for screenshots / promo content / sanity checks.
 *
 * Usage:
 *   node scripts/surf-demo.mjs gas         # /v1/surf/onchain/gas-price ($0.001)
 *   node scripts/surf-demo.mjs feargreed   # /v1/surf/market/fear-greed ($0.001)
 *   node scripts/surf-demo.mjs ranking     # /v1/surf/market/ranking ($0.001)
 *
 * Defaults to `feargreed` if no arg.
 */
import { blockrunCapability } from '../dist/tools/blockrun.js';

const which = process.argv[2] || 'feargreed';

const DEMOS = {
  gas:       { path: '/v1/surf/onchain/gas-price', method: 'GET', params: { chain: 'base' } },
  feargreed: { path: '/v1/surf/market/fear-greed', method: 'GET' },
  ranking:   { path: '/v1/surf/market/ranking',    method: 'GET' },
};

const demo = DEMOS[which];
if (!demo) {
  console.error(`Unknown demo "${which}". Options: ${Object.keys(DEMOS).join(', ')}`);
  process.exit(1);
}

const ctx = { workingDir: process.cwd(), abortSignal: new AbortController().signal };

console.log(`→ BlockRun(${JSON.stringify(demo)})`);
const result = await blockrunCapability.execute(demo, ctx);
console.log('\n' + result.output.slice(0, 1500));
