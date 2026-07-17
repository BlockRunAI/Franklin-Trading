# Changelog

All notable changes to Franklin Trading. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.5 — 2026-07-17

### Fixed
- **Flaky free-model gateway 403s no longer kill the session** ([#3](https://github.com/BlockRunAI/Franklin-Trading/pull/3), thanks [@anicca-earn](https://github.com/anicca-earn) for the root-cause analysis and fix). The SOL-chain gateway's upstream (NVIDIA NIM) intermittently rejects ~1 in 3 calls with `403 Forbidden Authorization failed` even though the same request succeeds on retry; `classifyAgentError()` had no 403 branch, so these fell to non-retryable `unknown` and the agent gave up. Now classified as transient `server` — anchored on the observed `authorization failed` + 403/forbidden signature and capped at `maxRetries: 2`, so permanent 403 denials (revoked model access, geo/WAF blocks) don't trigger paid retries. Placed below the rate-limit branch so `403 ... quota exceeded` keeps its tighter `rate_limit` handling.
- Server-error streak-guard notice no longer claims a model "keeps 5xx'ing" now that transient 403s also feed the streak (`src/agent/loop.ts`).

## 0.2.1 — 2026-06-06

### Changed
- **GLM flat pricing fully retired** (backend d840de7): `zai/glm-5` $0.60/$1.92 and `zai/glm-5-turbo` $1.20/$4.00 per-token since 2026-06-06 (glm-5.1 stays $1.40/$4.40). Pricing rows updated; the picker's flat-rate category is removed (nothing qualifies) and GLM-5 moves into Budget. Mirrors upstream Franklin 3.26.1.

## 0.2.0 — 2026-06-06

### Changed
- **Catalog sync with the BlockRun gateway (2026-06-04/05 drops).** `xai/grok-4.3` ($1.50/$4.00, 1M ctx, reasoning + vision) and `xai/grok-build-0.1` ($1.50/$3.00, 256K, agentic coding) added to pricing; bare `grok` shortcut promoted grok-3 → grok-4.3; picker's Premium row swaps the hidden (and mispriced) grok-4-0709 for Grok 4.3, with its pricing corrected $0.2/$1.5 → $3/$15. grok-4.3 / grok-build-0.1 join the vision whitelist — `pickVisionSibling` for text-only xAI picks now lands on the cheaper public flagship instead of the hidden 4-0709.
- **GLM-5.1 launch promo ended (2026-06-05)** — per-token $1.40/$4.40 now; the picker's flat-rate section leads with `zai/glm-5` (permanent $0.001/call, not a promo; new `glm-5` shortcut).
- **DeepSeek V4 Pro at its permanent list price** $0.435/$0.87 (the 75% launch promo became standing after 2026-05-31); picker label de-promo'd, router comments refreshed. Routing unchanged.

## Unreleased

### Added
- Initial fork from upstream [Franklin (brcc) 3.21.9](https://github.com/BlockRunAI/Franklin/tree/v3.21.9).
- New CLI binary name `franklin-trading`, new npm package name `@blockrun/franklin-trading`.
- Trading-focused README, PHILOSOPHY, and tool surface.

### Inherited from upstream Franklin (no behavioural change)
- Agent loop (`src/agent/loop.ts`), planner, compactor, groundedness evaluator,
  code verifier, polish round, bash risk classifier — each removable via a
  `FRANKLIN_NO_*` env flag (see ADR 0003).
- Learned-weight smart router across 55+ models with payment-aware fallback chains.
- x402 HTTP-402 micropayment substrate; non-custodial USDC wallet on Base + Solana.
- Plugin SDK, MCP auto-discovery, session JSONL persistence + full-text search,
  brain entity graph, learnings store, stats / insights / cost tracker, payment
  proxy, Ink TUI, Telegram channel.
- Trading scaffolding: `Portfolio`, basic `RiskEngine` (per-position cap, total
  exposure cap, cash sufficiency, sell integrity), `TradingEngine`,
  `LiveExchange`, `MockExchange`, `TradeLog`, journal-quality grader.
- Hero trading + research tools: `TradingMarket`, `TradingSignal`,
  `TradingPortfolio`, `PredictionMarket`, `ExaAnswer`, `ExaSearch`,
  `ExaReadUrls`, `WebFetch`, `WebSearch`, `Wallet`.
- On-chain execution tools: Jupiter (quote + swap), 0x (Base quote + swap +
  gasless swap), DeFiLlama (protocols, chains, yields, prices), BlockRun
  primitive (generic x402-paid gateway).

### Removed in fork (re-sharpens identity vs upstream Franklin)
- Image / video / music generation tools and the `src/content/` library
  they wrote into.
- Social tools: `PostToX`, `SearchX`, X bot (`src/social/`), narrative state.
- Phone & Voice tools and `src/phone/` subsystem.
- Browser automation (`browsex.ts`) and the `playwright-core` dependency.
- Modal GPU sandbox tools.
- Web dashboard (`src/panel/`) and its CLI command — v2 work.

### Planned (see README "Roadmap" and `docs/plans/` once added)
- **M1** Strategy DSL (`defineStrategy`) + walk-forward backtest engine.
- **M2** Role personas: Analyst, Bull, Bear, Trader, Risk, Compliance — dispatched
  via Franklin's existing `Task` subagent tool.
- **M3** Four trading-specific moat layers, each a removable harness component:
  `src/agent/regime.ts` (`FRANKLIN_NO_REGIME`),
  `src/agent/prompt-cache.ts` (`FRANKLIN_NO_PROMPTCACHE`),
  `src/trading/slippage.ts` (`FRANKLIN_NO_SLIPPAGE`),
  `src/agent/fact-check.ts` (`FRANKLIN_NO_FACTCHECK`).
- **M4–M5** Connectors: Hyperliquid (perps), Jupiter (Solana DEX), 0x (EVM DEX),
  Polymarket (prediction), Binance (read-only data).
- **M6** Alpha Zoo (40 factors v1) + Shadow Account (broker CSV import).
- **M7** Public docs, demo, benchmark page, v1.0.0 tag.

[Unreleased]: https://github.com/BlockRunAI/Franklin-Trading/commits/main
