# Franklin Trading — Convictions

> *Strong stances, formed from real user pain.*

This document captures the **design convictions** that shape every Franklin
Trading PR. Each is non-negotiable and traceable to specific failures in
upstream LLM-trading projects (TradingAgents, AI-Trader, Vibe-Trading) or
seven years of Hummingbot's production scar tissue.

When a PR conflicts with a conviction, the PR loses. When a model improves
to the point a conviction's underlying gap closes, we delete the conviction
(per [ADR 0003](adr/0003-harness-as-removable-components.md)) and the
mechanism that enforced it — never the other way around.

---

## 1. Hallucination is the #1 sales objection — and the fix must be **visible**

**Evidence**:
- TradingAgents [#814](https://github.com/TauricResearch/TradingAgents/issues/814) — ticker `TOTDY` (Japanese bathroom fixtures) hallucinated as TotalEnergies SE. 5 of 6 analysts failed. 1,500-line wrong report.
- TradingAgents [#781](https://github.com/TauricResearch/TradingAgents/issues/781) — gold price returned `431` vs actual `4,715` (**10× wrong**).
- TradingAgents [#830](https://github.com/TauricResearch/TradingAgents/issues/830) — user quote: *"Can I reliably trust the tool on basic things such as price data?"*
- TradingAgents closed [#828](https://github.com/TauricResearch/TradingAgents/issues/828) (prompt-quality improvements) as **"not planned"** — a permanent reputation wound.

**Position**: Every persona output passes through a deterministic
entity resolver (the `fact-check.ts` moat). In the TUI, every claim shows
the **source citation** ("BTC from coingecko 2026-05-23T14:32Z") — not
just "BTC price." The fact-check isn't a backend gate, it's a UI element.
Sales-grade transparency, not best-effort hidden code.

**Enforced by**: `src/agent/fact-check.ts` (M3) + the persona output
schemas + a regression set that includes the TOTDY repro + 50 ambiguous
tickers.

---

## 2. Stale price data destroys trust faster than any other bug

**Evidence**:
- AI-Trader [#188](https://github.com/HKUDS/AI-Trader/issues/188) — HD price returned $338.91 vs actual $350.34 (3.26% off); BA $218.88 vs $226.76 (3.48% off). User quote: *"Trading bots record incorrect entry prices; followers cannot replicate signals."*
- AI-Trader [#185](https://github.com/HKUDS/AI-Trader/issues/185) — restricted symbol coverage and no real-time quotes.
- AI-Trader has **not fixed** #188; it sits open as a credibility wound.

**Position**: Every price the agent uses for a decision has a `fetchedAtMs`
timestamp surfaced in the response. If `age > 60s` for crypto or
`age > 5 min` for equities, the agent **refuses** to submit an order
against it (not "warns" — refuses). The slippage moat (`src/trading/slippage.ts`)
and the staleness check are the same code path: cost-of-uncertainty.

**Enforced by**: `src/trading/slippage.ts` + a connector contract requiring
`fetchedAtMs` on every price quote.

---

## 3. Audit-grade backtest evidence is the institutional pitch winner

**Evidence**:
- AI-Trader [#207](https://github.com/HKUDS/AI-Trader/issues/207) — a quantitative trader publicly demanding **equity curves, Sharpe ratios, walk-forward validation, transaction-cost modeling, out-of-sample analysis**. Maintainer response: **silence.** Issue remains open. AI-Trader is **structurally unfit for institutional adoption** until this is answered.
- TradingAgents [#838](https://github.com/TauricResearch/TradingAgents/issues/838) — user pointing at AlphArena.io as a *verified P&L leaderboard*, signaling distrust of backtest claims.
- TradingAgents [#805](https://github.com/TauricResearch/TradingAgents/issues/805) — temporal knowledge leakage: a 2026-trained model backtesting 2023 has hindsight bias baked into weights.

**Position**: Every strategy ships with an auto-generated
`backtest-report.md` containing: walk-forward Sharpe + Sortino + Calmar,
max drawdown, **regime-broken-down** results, slippage-adjusted vs raw,
monthly equity curve PNG, transaction-cost decomposition, temporal-leakage
disclosure (which knowledge cutoff the model has vs the backtest dates).
Published quarterly in `docs/benchmark/<YYYY-Q>/<strategy>.md` and
auto-regenerated on every tagged release.

**The pitch**: "Show me your Sharpe" gets answered in 30 seconds.

**Enforced by**: `src/backtest/walk-forward.ts` + `src/backtest/regime-tagged-metrics.ts` (M1) + CI artifact upload on tag.

---

## 4. Backtest → Live is a chasm, and bridging it is our biggest moat

**Evidence**:
- Vibe-Trading [#100](https://github.com/HKUDS/Vibe-Trading/issues/100) — the OKX team **offered to contribute** live trading code via OKX Agent Trade Kit; maintainers have not landed it. **Users with proven backtest strategies cannot deploy them.**
- TradingAgents [#880](https://github.com/TauricResearch/TradingAgents/issues/880) — user building an external paid-review API because no live execution path exists.
- TradingAgents [#867](https://github.com/TauricResearch/TradingAgents/issues/867) — institutional trade-commitment framework requested.

**Position**: The Strategy DSL executes the **same `.strategy.ts`
file** in `backtest | paper | live` from M1 — not a deferred M5
feature. Slippage parity is enforced (the same `slippage.ts` model runs
in all three modes). One artifact, three contexts.

**This conviction promotes Strategy DSL + unified lifecycle from M5 to M1.**
See [ADR 0004](adr/0004-strategy-dsl-as-unified-lifecycle.md).

---

## 5. Risk constraints MUST live OUTSIDE the LLM

**Evidence**:
- TradingAgents [#479](https://github.com/TauricResearch/TradingAgents/issues/479) — in long sessions, configured risk limits **silently drop from context** as compaction fires. The agent stops respecting them without erroring. **A blow-up machine.**

**Position**: Risk caps (per-position USD, max drawdown, kill switch
threshold, regime-conditional limits) live in `~/.blockrun/risk-config.json`
and are checked **by code, not by LLM**, before every order submission.
The Risk Officer persona's schema is just a *display* of what the code
already decided. **The LLM is never the last line of defense.**

**Enforced by**: `src/trading/risk.ts` (extended in M3) + a runtime
invariant: every order through `TradingEngine.openPosition()` re-reads
the config and re-evaluates caps. Property-tested.

---

## 6. Output non-determinism poisons downstream — strict schemas, enforced

**Evidence**:
- TradingAgents [#796](https://github.com/TauricResearch/TradingAgents/issues/796) — Sentiment Analyst output varies per run. Sometimes `🟢 BULLISH (7.2/10)`, sometimes `### Score: 6.5/10`, sometimes no number at all. Downstream parsers accrete *"a growing pile of fallback regexes."*

**Position**: Each persona has a Zod schema. The runtime validates and
**re-prompts on schema failure** (up to N retries, then escalates to a
stronger model). Never accept free-form output and hope. This extends
brcc's existing tool-call structured-output discipline to the persona
layer.

**Enforced by**: `src/personas/schemas/*.ts` (M2) + runtime validation
in the Task subagent dispatcher.

---

## 7. One canonical `PositionAccumulator`, property-tested once

**Evidence**:
- Hummingbot has fixed position-math bugs at least **4 times**:
  - [#2480](https://github.com/hummingbot/hummingbot/issues/2480) Bittrex
  - [#2541](https://github.com/hummingbot/hummingbot/issues/2541) Loopring history
  - [#8236](https://github.com/hummingbot/hummingbot/issues/8236) KuCoin decimal
  - [#8248](https://github.com/hummingbot/hummingbot/issues/8248) OKX position size
- AI-Trader [#186](https://github.com/HKUDS/AI-Trader/issues/186) — position averaging bug (multi-leg short merged quantities but only showed first price).

Each connector reimplements position math; each one fails differently.

**Position**: One immutable `PositionAccumulator` shared across every
connector. Fills append to an event log; position state is derived. The
accumulator is **property-tested with fast-check** — 1000+ randomized
fill sequences, invariants asserted (`total_cost_basis == sum(fills × prices)`,
`qty ≥ 0`, `realized_pnl + unrealized_pnl == total_pnl`). Each connector
just emits canonical `Fill` events.

**We pay this tax once. Hummingbot has paid it forever.**

See [ADR 0005](adr/0005-position-accumulator-property-tested.md).

**Enforced by**: `src/trading/portfolio.ts` rewrite (M1) +
`test/position-accumulator.property.mjs` (fast-check).

---

## 8. Kill switch ≠ stop loss — separate primitives, never merged

**Evidence**:
- Hummingbot [#7719](https://github.com/hummingbot/hummingbot/issues/7719) — kill switch config schema mismatch crashes startup. Users follow the docs, get `TypeError: unhashable type: 'dict'`, deploy **unguarded** because the safety mechanism failed silently.
- Users *mentally* conflate kill switch ("halt everything") with stop loss ("close this position") — Hummingbot docs reinforce the confusion.

**Position**: Two distinct subsystems with no shared code:
- `KillSwitch` — portfolio-wide, monitored in a separate watcher thread,
  triggers `marketCloseAll()` on cumulative-loss threshold breach.
  **Verified at startup with a test fire** (assertion: the kill path is
  callable; fail fast if config is broken).
- `StopLoss` — per-position, attached to each Executor.

Documentation **never** uses the terms interchangeably. The `risk.ts`
section in `PHILOSOPHY.md` calls this out explicitly.

**Enforced by**: `src/trading/kill-switch.ts` (separate from
`risk.ts`, M3) + startup verification + a regression test.

---

## 9. WebSocket ghost states — full state resync on silence

**Evidence**:
- Hummingbot [#8250](https://github.com/hummingbot/hummingbot/issues/8250) — after Hyperliquid WS disconnect+reconnect, bot logs "Subscribed to private channels" but **stops trading.** Live-in-logs, dead-in-practice.
- Hummingbot [#7590](https://github.com/hummingbot/hummingbot/issues/7590) — Binance perpetual: `user_stream_initialized` stays `false` after reconnect. Bot is **blind to fills and margin events** while believing it's connected.

**Position**: Every connector's WS layer implements:
1. Heartbeat with 30-second silence timeout.
2. On timeout: mark connector as `STALE`.
3. While `STALE`: refuse to submit orders.
4. Full state resync (positions + balances + subscriptions) before
   returning to `READY`.

Chaos-tested in `test/chaos/` — the test kills the WS mid-trade and
asserts the bot stops cleanly, then recovers cleanly.

**Enforced by**: A connector contract type
(`WsConnector<T>` interface, M4) + a chaos harness.

---

## 10. Asia data is a free moat — neither competitor owns it

**Evidence**:
- TradingAgents [#832](https://github.com/TauricResearch/TradingAgents/issues/832) — India support requested, unanswered.
- TradingAgents [#861](https://github.com/TauricResearch/TradingAgents/issues/861) — Tushare / AKShare A-share data requested, unanswered.
- TradingAgents [#628](https://github.com/TauricResearch/TradingAgents/issues/628) — hardcoded SPY benchmark breaks alpha for non-US tickers (mixes single-stock INR with USD index).
- AI-Trader [#169](https://github.com/HKUDS/AI-Trader/issues/169) — "什么时候支持A股?" (when will A-shares be supported?) — silenced.
- Vibe-Trading [#62](https://github.com/HKUDS/Vibe-Trading/issues/62) — Tushare integration **lacks fundamentals** (income statements, balance sheets, cashflow); pre-filter strategies impossible.

HKUDS is a *Hong Kong* lab and still under-serves Asia. TradingAgents
has PR #875 (A-shares) and #882 (Indian) in flight — they know it
matters and ship slowly. **We get there first.**

**Position**: Native data integration from M4 for: A-shares
(Tushare with **full** fundamentals — income, balance sheet, cashflow),
HKEX, Indian NSE/BSE. Region-appropriate benchmarks (Nifty 50 for `.NS`,
Nikkei 225 for `.T`, HSI for `.HK`).

See [ADR 0006](adr/0006-asia-data-integration-day-one.md).

---

## 11. Provider strategy — own 3 deeply, not 10 shallowly

**Evidence**:
TradingAgents has 8+ provider-specific failure issues:
- [#886](https://github.com/TauricResearch/TradingAgents/issues/886) DeepSeek connection errors
- [#851](https://github.com/TauricResearch/TradingAgents/issues/851) MiniMax timeout
- [#758](https://github.com/TauricResearch/TradingAgents/issues/758) Qwen auth
- [#843](https://github.com/TauricResearch/TradingAgents/issues/843) Ollama routing to OpenAI despite config
- [#831](https://github.com/TauricResearch/TradingAgents/issues/831) Anthropic `effort` param 400
- [#826](https://github.com/TauricResearch/TradingAgents/issues/826) Unsupported keyword arg

Each PR adds a new provider; each adds a new edge case; integration debt
compounds.

**Position**: We inherit Franklin's 55-model gateway routing for
*generic* tasks but pin **3 production-blessed providers for the
persona stack**:
- **Anthropic Claude Sonnet 4.6** — most personas
- **Anthropic Claude Opus 4.7** — Risk Officer + Compliance Officer (highest stakes)
- **DeepSeek V4 Pro** — analyst-level work (cost-sensitive)
- **Grok-4-fast-reasoning** — real-time signal persona

Persona system prompts are **regression-tested against these 4 models
in CI**. If a model breaks, we know within an hour. Other models are
still selectable via the router for ad-hoc requests, but **unsupported
for the persona stack** (warned at startup).

**Enforced by**: `src/personas/index.ts` + `test/persona-matrix.mjs`.

---

## 12. Cross-platform from day one — Windows is a free differentiator

**Evidence**:
- AI-Trader [#59](https://github.com/HKUDS/AI-Trader/issues/59) / [#94](https://github.com/HKUDS/AI-Trader/issues/94) / [#119](https://github.com/HKUDS/AI-Trader/issues/119) — committed log filenames contain `:` characters (e.g. `2025-10-01 15:00:00`). Windows git clone fails. **Three separate issues, none fixed.** Windows users abandon the project.

HKUDS structurally cannot fix this because they don't dogfood on Windows.

**Position**: CI matrix runs build + tests on macOS, Linux, **and
Windows** from M0. No colons, no leading dots, no symlinks in
committed paths. Even though the wallet-native target user is more
likely on macOS/Linux, the *enterprise pitch* requires a clean
Windows install.

**Cost**: one GitHub Actions matrix row. **Win**: an entire competitor's
blind spot.

**Enforced by**: `.github/workflows/ci.yml` matrix + a pre-commit hook
that rejects path components containing reserved Windows characters.

---

## How these convictions interact with the milestone plan

The convictions force four amendments to the original plan. See:

- [ADR 0004 — Strategy DSL as unified backtest/paper/live lifecycle](adr/0004-strategy-dsl-as-unified-lifecycle.md) — promotes the lifecycle from M5 to M1 (convictions 4 + 2).
- [ADR 0005 — `PositionAccumulator` as a property-tested primitive](adr/0005-position-accumulator-property-tested.md) — adds a M1 deliverable (conviction 7).
- [ADR 0006 — Asia data integration on day one](adr/0006-asia-data-integration-day-one.md) — extends M4 connectors (conviction 10).
- [ADR 0007 — Quarterly competitive benchmark report](adr/0007-quarterly-competitive-benchmark.md) — adds an M7 launch artifact (convictions 1 + 3).

---

*If a future PR weakens any of these convictions, the PR description must
explain why the underlying user pain has been solved upstream. "We changed
our mind" is not a valid reason. The convictions retire when the gaps that
created them close — not when we want to ship faster.*
