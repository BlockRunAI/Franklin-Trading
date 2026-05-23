# 0007 — Quarterly competitive benchmark report as a launch artifact

**Status:** accepted (extends the M7 launch deliverables)

## Decision

Every quarter, Franklin Trading auto-generates and publishes a
side-by-side benchmark report comparing itself to the four reference
projects on a fixed universe and a fixed scoring rubric. The first
report lands at the **M7 v1.0.0 launch** and is regenerated on every
release tag thereafter.

Output path in the repo:

```
docs/benchmark/<YYYY>-Q<N>/
├── README.md           # the report itself
├── universe.json       # the fixed test universe (locked at quarter start)
├── methodology.md      # how each metric is computed; what was excluded; what was tied
├── franklin-trading/   # raw output + equity curves
├── tradingagents/      # raw output
├── ai-trader/          # raw output
├── vibe-trading/       # raw output
└── charts/             # auto-generated comparison PNGs
```

## Metrics published

For each project + each universe slice:

| Metric | What it measures | Sourced from |
|---|---|---|
| Walk-forward Sharpe (1Y rolling window) | Risk-adjusted return out-of-sample | Backtest harness |
| Sortino, Calmar, max drawdown | Downside + tail risk | Backtest harness |
| **Cost per decision (USD)** | LLM + data + gas per persona-debate cycle | Cost log |
| **Prompt-cache hit rate** | % of input tokens served from cache | Gateway response headers |
| **Hallucination rate** | % of persona outputs that fail the deterministic fact-checker on a curated 50-ticker ambiguity set (includes TOTDY repro from TradingAgents [#814](https://github.com/TauricResearch/TradingAgents/issues/814)) | Fact-check log |
| **Live-mode median latency** | Signal → order submission p50 latency | Gateway timing |
| Backtest-vs-live divergence | Realised P&L delta vs backtest expectation | Trade log + backtest re-run |
| Regime-broken-down Sharpe | Performance separately tagged for trend/chop/risk-off | Regime detector |

## Universes

Three fixed universes, locked at the start of each quarter:

1. **Crypto-12** — BTC, ETH, SOL, BNB, XRP + 7 majors on Hyperliquid + Jupiter.
2. **A-share-30** — top 30 by market cap on the Shanghai + Shenzhen 300, via Tushare.
3. **US-equity-50** — the 50 most-liquid S&P 500 names.

These specifically match the universes our competitors *could* run, so
the comparison is fair. We don't get to pick a universe we win on.

## Why this matters

Two pieces of competitor evidence force the conviction:

1. **AI-Trader [#207](https://github.com/HKUDS/AI-Trader/issues/207)** —
   a quant trader publicly demanded equity curves, Sharpe, walk-forward
   validation, transaction-cost modeling. Maintainer response: silence.
   *That silence is the smoking gun.* AI-Trader is structurally unfit
   for institutional adoption until it answers. **We answer in our
   docs every 90 days, automated.**
2. **TradingAgents [#838](https://github.com/TauricResearch/TradingAgents/issues/838)** —
   user pointing at AlphArena.io as a *verified P&L leaderboard*,
   signaling distrust of paper backtest claims industry-wide.

A self-published quarterly report won't satisfy the most adversarial
critic, but it makes the comparison **public, reproducible, and
embarrassing-if-fake**. It turns our biggest pitch ("we close the gaps
the others miss") from a marketing claim into a documented metric.

## Considered alternatives

- **One-shot launch comparison, no quarterly cadence (rejected).** A
  single snapshot ages fast. Without ongoing maintenance the launch
  comparison becomes a stale brag the next year.
- **Compare ourselves only (rejected).** Self-comparison hides
  regression but skips the competitive moat. Users care about
  better-than-X claims they can verify.
- **External / third-party benchmark only (rejected for v1).** Would
  be more credible but requires partner coordination we don't have at
  launch. The self-published version is a stepping stone; we can
  graduate to a third-party verifier (à la AlphArena) once our numbers
  are stable.
- **Cherry-picked universe (rejected).** Tempting but corrosive.
  Locking universes at quarter-start removes the temptation to pick
  the easy fight.

## Consequences

- `scripts/benchmark.mjs` — orchestrates the cross-project run. Each
  competitor runs in a Docker container with their published configs;
  ours runs natively. Outputs are normalised into the schema above.
- A **CI job triggered on every minor-version tag** regenerates the
  current-quarter report.
- The **TOTDY repro test** lives in
  `test/fixtures/ambiguous-tickers.json` and feeds both the
  hallucination-rate metric and the regression test for our own
  fact-checker.
- If any of our metrics regresses against the prior quarter, the
  release-notes workflow surfaces it (no silent regressions).
- The methodology doc is committed *before* the first report, so the
  rubric isn't reverse-engineered to make us look good.

## Test contract

A dry-run of `scripts/benchmark.mjs` against a 1-day universe and a
single ticker must complete on M3 exit, before any of the moat layers
land. This is the smoke test that the report is *runnable*; full-fidelity
quarterly runs land at M7.

If the script can't run, the convictions can't be defended. The
benchmark is the canary on every claim in [CONVICTIONS.md](../CONVICTIONS.md).
