# 0006 — Asia data integration on day one (Tushare full, HKEX, Indian NSE/BSE)

**Status:** accepted (extends the M4 connectors milestone)

## Decision

The M4 connector milestone ships native data integration for Asia
markets alongside the original crypto-first set:

| Market | Provider | What we ship |
|---|---|---|
| A-shares (mainland China) | Tushare + AKShare fallback | OHLCV + **full fundamentals** (income statement, balance sheet, cashflow), top-of-book, basic news |
| HKEX | HKEX official + Yahoo HK | OHLCV + listing data, HSI as the default benchmark |
| Indian NSE/BSE | NSE official + Yahoo IN | OHLCV + fundamentals, **Nifty 50 as the default benchmark** for `.NS` tickers |

Region-appropriate benchmarks are first-class — no hardcoded SPY. The
benchmark for a ticker is derived from its suffix (`.SS` / `.SZ` →
CSI 300, `.HK` → HSI, `.NS` → Nifty 50, `.T` → Nikkei 225, default
→ SPY).

## Why this matters

Asia data is a **free competitive moat** because every comparable
project under-serves it, despite consistent user demand:

- **TradingAgents [#832](https://github.com/TauricResearch/TradingAgents/issues/832)** — "Non US stocks" / Indian market request, unanswered.
- **TradingAgents [#861](https://github.com/TauricResearch/TradingAgents/issues/861)** — "how can i use tushare or akshare" — unanswered.
- **TradingAgents [#628](https://github.com/TauricResearch/TradingAgents/issues/628)** — benchmark hardcoded to SPY breaks alpha for non-US tickers (a single-stock INR return is meaninglessly compared against a USD index).
- **AI-Trader [#169](https://github.com/HKUDS/AI-Trader/issues/169)** — user asking (in Mandarin) when A-shares will be supported — silenced.
- **Vibe-Trading [#62](https://github.com/HKUDS/Vibe-Trading/issues/62)** — has Tushare integration but **fundamental data is insufficient for pre-filter strategies**. Users have built around Vibe-Trading using their own data, not within it.

HKUDS — a *Hong Kong* lab — still under-serves Asia, in part because
their flagship Tushare integration omits fundamentals. TradingAgents
has PRs in flight (#875 A-shares, #882 Indian) but ships slowly. **We
land first, with full fundamentals.**

This is not a "nice-to-have" — it's the segment lever for the entire
mainland-China + India developer audience.

## Considered alternatives

- **Defer Asia data to v2 (rejected).** Original plan. Competitors will
  close their gaps in the same timeframe; we lose the asymmetry.
- **Ship A-shares only, leave HKEX + NSE for v2 (rejected).** A-shares
  alone leaves the HK developer audience (HKUDS's own base) and the
  fast-growing Indian quant community on the table. Marginal cost of
  the other two is low once the data abstraction layer exists.
- **Use only paid providers (rejected).** Tushare is free at the basic
  tier; NSE has public endpoints; Yahoo Finance covers fallback. We
  default to free + add paid (Alpha Vantage, Polygon) as opt-in for
  users who want lower latency.

## Consequences

- `src/trading/providers/tushare/` — fundamentals + OHLCV (M4)
- `src/trading/providers/akshare/` — fallback + crypto-of-A-share (M4)
- `src/trading/providers/hkex/` — official endpoints (M4)
- `src/trading/providers/nse/` — NSE/BSE OHLCV + fundamentals (M4)
- `src/trading/benchmarks.ts` — region-aware default benchmark
  resolver (M1, since it's referenced by the backtest engine before M4
  ships).
- Documentation: README, PHILOSOPHY, and CONVICTIONS all reference
  Asia as a first-class market. The 60-second demo GIF in the M7
  launch artifact includes at least one A-share or NSE example.
- The competitive-benchmark report (ADR 0007) explicitly includes
  CSI 300 and Nifty 50 universes alongside crypto.

## Test contract

`test/providers.mjs` adds smoke tests for each Asia provider:
- Fetch one OHLCV row for a well-known ticker (`600519.SS` Moutai,
  `RELIANCE.NS`, `0700.HK`).
- Fetch fundamentals for the same ticker; assert non-null income +
  balance + cashflow.
- Resolve the default benchmark and verify the suffix routing.

Failures are CI-blocking. If Tushare's API surface changes, we know
within a day, not when a user reports it.
