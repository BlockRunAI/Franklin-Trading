# Changelog

All notable changes to Franklin Trading. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
