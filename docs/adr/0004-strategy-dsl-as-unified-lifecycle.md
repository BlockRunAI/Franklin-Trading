# 0004 — Strategy DSL as a unified backtest/paper/live lifecycle, shipped in M1

**Status:** accepted (supersedes M5 scoping in the original plan)

## Decision

A single `defineStrategy({ ... })` artifact — one TypeScript module per
strategy — runs unmodified in three modes:

```
franklin-trading run <name> --mode backtest [--from <date> --to <date>]
franklin-trading run <name> --mode paper
franklin-trading run <name> --mode live
```

Slippage parity is enforced across modes by routing all three through the
same `src/trading/slippage.ts` model (see [CONVICTIONS.md §2](../CONVICTIONS.md)).
The strategy author writes one file; the runtime picks the data source
(historical OHLCV, live feed, or live feed + real connectors) per mode.

The Strategy DSL + the walk-forward backtest engine are **M1 deliverables**
(not M5). Live execution against Jupiter + Hyperliquid is **M1 wired with
real wallets but feature-flagged off**; the full multi-venue live story
lands in M5 with the remaining connectors.

## Why this matters

Two pieces of competitor evidence forced the promotion:

1. **Vibe-Trading [#100](https://github.com/HKUDS/Vibe-Trading/issues/100)** —
   the OKX team explicitly offered to contribute live execution code.
   HKUDS still hasn't merged it. The bridge from backtest to live is the
   #1 user pain in the LLM-trading category — and the project that owns
   it wins the segment.
2. **AI-Trader [#207](https://github.com/HKUDS/AI-Trader/issues/207)** —
   a quant trader demanded backtest evidence (Sharpe, walk-forward,
   out-of-sample). Silence. Without unified lifecycle, we can't generate
   the audit-grade evidence demanded by institutional buyers either.

If we ship paper-only in v1 and add live in v2, we land in the same
research-only quadrant as TradingAgents and Vibe-Trading. The fork's
whole point is to escape that quadrant.

## Considered alternatives

- **Paper-only v1, live in v2 (rejected).** The original plan. Lower
  M1 scope but loses our biggest differentiator for 4+ months. Worse,
  the API shape of "paper" and "live" tends to diverge unless they
  share code from day one — porting later is harder than designing
  unified now.
- **Three separate runners (rejected).** A `backtest-runner.ts`,
  `paper-runner.ts`, `live-runner.ts` each consuming the strategy file.
  Conceptually clean; in practice each runner drifts and slippage parity
  silently breaks. The unified runner with a `mode` parameter is the
  forcing function that keeps them honest.
- **DSL-first, runtime later (rejected).** Ship `defineStrategy` API
  in M1 with backtest only; add paper + live in M2/M3. Same divergence
  risk as above.

## Consequences

- The `src/strategies/runtime.ts` module is the single execution loop
  for all three modes. Adding a new mode is a configuration switch, not
  a new runner.
- `src/backtest/walk-forward.ts`, `src/backtest/slippage-aware-fill.ts`,
  and `src/backtest/regime-tagged-metrics.ts` land in M1, not M5.
- The two example strategies in the original M1 scope
  (`btc-funding-basis`, `sol-mean-reversion`) must be runnable in
  `--mode live` against a real (but small-balance) wallet before M1
  exit. This forces the connector contract to stabilise early.
- Live execution stays gated behind explicit `--live` confirmation +
  wallet balance check at runtime (per the original plan); the
  *capability* shipping in M1 doesn't mean the *default* is live.

## Test contract

`test/strategies.mjs` runs each example strategy in all three modes and
asserts:

- Backtest produces a deterministic Sharpe ± slippage tolerance.
- Paper run for 60 simulated minutes produces the same trade set the
  backtest would have at those prices.
- Live run (against a wallet seeded with $5 USDC) submits exactly the
  same order shape, gated by a confirmation prompt.

If any of those three diverge, the lifecycle isn't unified — fail loud,
fix the runtime.
