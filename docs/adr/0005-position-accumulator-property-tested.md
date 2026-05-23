# 0005 — `PositionAccumulator` as a single property-tested primitive

**Status:** accepted

## Decision

There is exactly **one** position-accounting module in Franklin Trading:
`src/trading/portfolio.ts`'s `PositionAccumulator` class. Every connector
emits canonical `Fill` events into it; no connector implements position
averaging, cost-basis calculation, or P&L math itself.

The accumulator is **property-tested** with
[`fast-check`](https://fast-check.dev/) — 1000+ randomized fill sequences
per CI run, asserting:

- `total_cost_basis(symbol) == Σ(fill.qty × fill.price) for buys − Σ(fill.qty × fill.price) for sells of that symbol`
- `position_qty(symbol) ≥ 0` (or strictly tracked as short via a `side` field; never accidentally negative)
- `realized_pnl + unrealized_pnl == total_pnl` at any snapshot
- `cash + Σ(position_value) == nav` invariant holds after every fill
- Fee accounting: `Σ(fill.fee_usd) ≤ Σ(fill.notional_usd) × max_fee_bps`

`Fill` is an immutable event:

```ts
interface Fill {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;          // always positive; side determines direction
  priceUsd: number;
  feeUsd: number;
  venue: string;        // 'hyperliquid' | 'jupiter' | 'zerox' | ...
  filledAtMs: number;
}
```

Connectors emit fills; the accumulator derives state. Historical state
is recoverable by replaying the fill log.

## Why this matters

Hummingbot has fixed position-math bugs **at least four times** in seven
years, each in a different connector:

- [#2480](https://github.com/hummingbot/hummingbot/issues/2480) — Bittrex fill tracking
- [#2541](https://github.com/hummingbot/hummingbot/issues/2541) — Loopring history
- [#8236](https://github.com/hummingbot/hummingbot/issues/8236) — KuCoin decimal conversion
- [#8248](https://github.com/hummingbot/hummingbot/issues/8248) — OKX position size

AI-Trader has the same class of bug:
- [#186](https://github.com/HKUDS/AI-Trader/issues/186) — multi-leg short merged quantities but only displayed first price.

The root cause is the same every time: each connector reimplements
position math, makes a slightly different assumption (decimal vs string,
ms vs s, signed qty vs side+abs qty), and ships a new bug class.

**We pay the property-testing tax once. Hummingbot has paid it
forever.**

## Considered alternatives

- **Per-connector position tracking with a shared interface
  (rejected).** This is Hummingbot's approach. The interface ensures the
  *shape* matches, not the *math*. Bugs hide in the math.
- **Database-backed positions (rejected for v1).** A SQL or KV store
  is the right v2 move (multi-process correctness, audit trail). For v1,
  an event log written to `~/.blockrun/fills.jsonl` is sufficient and
  doesn't add infra to onboarding.
- **Type-level proofs (rejected).** Liquid-types-style invariants would
  be ideal but TypeScript can't express them. Property tests are the
  closest practical equivalent.

## Consequences

- `src/trading/portfolio.ts` is rewritten in M1 to be the
  `PositionAccumulator` pattern (the current MVP class becomes an
  internal detail).
- New CI dependency: `fast-check` (~150KB, MIT license, zero transitive).
- Every connector's contract is "emit `Fill` events" — they don't even
  expose a position-query method. The accumulator is the single source
  of truth.
- `test/position-accumulator.property.mjs` is a M1 exit criterion.

## Test contract

The property test runs against 1000 randomly-generated `Fill` sequences
of length up to 200, mixing buys/sells across 3–5 symbols, with random
fees and prices. **Any invariant violation fails the build.** A
regression test (deterministic seed) is added for each historic bug
class (Hummingbot #2480 reproducer, AI-Trader #186 reproducer, etc.)
so we can never re-introduce them.
