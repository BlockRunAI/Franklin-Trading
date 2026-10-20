# Changelog

All notable changes to Franklin Trading. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.3.4 — 2026-10-20

### Added
- **Gemini 4 Argon.** `google/gemini-4-argon`, Google's frontier reasoning model, is live on Base and Solana at $2/$10 per 1M (Google's rate through 2026-11-30; $4/$20 from 2026-12-01). Priced offline, sized at its 1M window, flagged vision-capable, listed in the picker, and pinnable as `argon`, `gemini-4` or `gemini-4-argon`. Nothing routes to it by default: bare `gemini` stays on 3.1 Pro and the router is unchanged.

## 0.3.3 — 2026-10-20

### Added
- **DeepSeek V4.1 Flash.** Bare `deepseek` now names `deepseek/deepseek-v4.1-flash`, the gateway's own id for the model `deepseek-chat` serves (same upstream, $0.14/$0.28). Base and Solana both list it. `deepseek-v4.1-flash`, `deepseek-v4.1` and `v4.1-flash` pin it explicitly; the free `deepseek-v4-flash` / `dsv4` names stay free.
- The offline price table gains the ten live ids it was missing (GPT-6.1 Sol, Gemini 3.8 Flash, DeepSeek V4 Flash Vision, Qwen 3.8 Max/Flash, Hy4 Preview, MiMo V2.5, Laguna S 2.1, Mistral Large 4, Muse Glimmer 30B), and the six vision-capable ones are flagged, so an image turn on `/model flash` is no longer swapped away.

### Changed
- `flash` / `gemini-flash` → `google/gemini-3.8-flash`, and `glm` / `glm5` → `zai/glm-5.3`, at the same prices as before. `qwen-max` stays on 3.7 Max.
- **Free models.** Ported Franklin's free-models module. About 15 call sites that hard-coded free ids the gateway retired (nemotron-nano-9b-v2, nemotron-nano-12b-v2-vl, mistral-nemotron, qwen3-coder-480b, llama-4-maverick) now use the live free default and chain. A free request never falls back to a paid model, and `nvidia/deepseek-v4-flash` / `-v4-pro` (both 400 at the gateway) are in no free set.
- **`@blockrun/router-core` 2cd5a10.** Since 0.3.2 this includes 0.3.0 (65a92c8): auto routing reads only the user turn for structured-output, stakes, latency and language cues, so the agent's own system prompt no longer lifts every request off the cheapest tier. CJK input is sized at about one token per character, keyword scoring matches whole words, a stale speed probe fades toward neutral, and a model with no catalog price no longer reports 100% savings. 2cd5a10 adds capability rows for V4.1 Flash, GPT-6.1 Sol and Mistral Large 4.

### Fixed
- Retired Grok slugs are priced at the grok-4.3 rate the gateway bills ($1.25/$2.50), and `nvidia/kimi-k2.5` at $0.60/$3.00.

## 0.3.2 — 2026-10-16

0.3.1 was published from a `dist/` built on 2026-08-29, so its code was
0.3.0's: it carried the router-core bump below but none of the source changes
since 0.3.0. 0.3.2 is built from the tagged source, and `npm publish` now
rebuilds first (`prepublishOnly`) so a stale build cannot ship again.

### Added
- **BlockRun account API keys** are supported ([#13](https://github.com/BlockRunAI/Franklin-Trading/pull/13)).
- **The nine 2026-10 gateway models are priced, sized and pinned:** GPT-6 Astra / Sol / Luna, GPT-5.1, Claude Fable 5.1 / Opus 5.5 / Sonnet 5.5 and Grok 4.6 / 4.7 (prices, context windows, vision allowlist, explicit version shortcuts). GPT-5.6 Sol / Sol Pro are priced at $4/$20.

### Fixed
- **Chat pricing is provider cost + $0.001;** the 5% markup applies to media only. Prices synced to the live catalog (2026-10-02): Sonnet 5 $2/$10, DeepSeek V4 Pro $1.32/$3.96, GPT-5.6 Terra Pro $2/$12, GPT-5.6 Luna Pro $0.2/$1.2, Gemini 3.6 Flash $0.75/$3.75.
- **Grok rates match xAI's published list** ([#12](https://github.com/BlockRunAI/Franklin-Trading/pull/12)): Grok 4.3 $1.25/$2.50, Grok 4.5 $2.00/$6.00, Grok Build 0.1 $1.00/$2.00.
- **The free shortcuts point at Nemotron 3 Nano Omni**, and the retired free rows are gone from the picker.

## 0.3.1 — 2026-10-16

### Changed
- **`@blockrun/router-core` moves from d7bc10c to 0.2.0 (27125a3).** Eleven newly tool-verified models (Claude Fable 5.1 / Opus 5.5 / Sonnet 5.5, Gemini 3.8 Flash, GPT-5.1, GPT-6 Astra / Luna / Sol, Grok 4.6 / 4.7, MiMo 2.5) become availability fallbacks for tool-required turns. Primary selection is unchanged; outside Premium the cheapest fallback is tried first. Also carries router-core's V3.5 catalog-only routing, the eco free-rung retargets and the 2026-10 catalog sync.

## 0.3.0 — 2026-08-29

The first sync back to upstream Franklin since the fork, plus the fee-aware
risk hardening from [#4](https://github.com/BlockRunAI/Franklin-Trading/pull/4)
(thanks [@ECD5A](https://github.com/ECD5A)) finished the way a real venue needs it.

### Changed — trading engine (breaking for out-of-tree `ExchangeClient` implementers)
- **`ExchangeClient` gains `estimateFee(order)` and moves to `src/trading/exchange.ts`.** The estimate is a fee *ceiling* (paper adapters return the exact bps fee rounded up to the cent), `Fill.feeUsd` is required, and `ExchangeOrder` carries a `clientOrderId` idempotency key the engine generates per order. `mock-exchange.ts` re-exports the types for one release.
- **Buys are checked against `notional + estimated fee`**, not notional alone, so an order that fits cash but not cash-plus-fee is refused before the venue sees it. Inputs are validated at every layer that touches money (`RiskEngine.check`, `Portfolio.applyFill`, `bpsFee`) with one shared set of predicates; a NaN can no longer slip past a cap because `NaN > cap` is false.
- **Record-then-flag after execution.** Once `placeOrder()` resolves the fill is always booked. A fee above the approved estimate, a quantity or price that drifted from the order, a cap the canonical fill breaches, or a negative cash balance is reported in `warnings` on the outcome, rendered above the fill in the tool output, and written to the trade journal — never used to discard a fill the venue already executed (which would leave real money at the venue unknown to the local book and invite the model to buy again). The one post-execution throw left is an unbookable fill (wrong market, wrong side, NaN quantity); it names the `clientOrderId` to reconcile.
- **Sells are hardened like buys.** `closePosition` refuses an oversell and a non-positive quantity before the venue is asked for anything, blocks on a zero/absent mark, quotes the sell fee and refuses a dust close the fee would consume, runs `RiskEngine.check` for the sale, and validates the returned fill's symbol/side/quantity/fee.
- **Blocked outcomes carry a `kind`** (`risk` / `fee-quote` / `price` / `venue`) and the tool advice follows it: "try a smaller qty" is only said for a risk refusal — a fee-quote outage or a venue rejection is not a sizing problem. A fee-less pre-check no longer tells the agent the fee is `$0.00`.
- `openPosition` / `closePosition` are serialised per engine so two in-flight orders cannot both spend the same cash. Cash sufficiency is compared at sub-cent precision so float drift (`699.6999999999999` rendered as `$699.70`) cannot refuse an order sized to the displayed balance.
- `loadPortfolio` validates the snapshot (finite cash, positive finite position quantities and prices, string symbols, no duplicates) — `JSON.parse('1e999')` is `Infinity` and `typeof` calls it a number — and logs why a file was ignored instead of silently starting fresh. `LiveExchange.getPrice` returns `null` for a `0`/negative mark (CoinGecko reports 0 for delisted coins) instead of making the position unclosable.

### Changed — router and model catalog (sync to Franklin 3.42.1)
- **Auto routing runs on `@blockrun/router-core`** (pinned to commit `d7bc10c`, the same engine as Franklin, ClawRouter and `@blockrun/llm`): a local, deterministic, constraint-first decision with no classifier round-trip, Franklin's vision allowlist and pricing layered on top. The former keyword router stays reachable with `FRANKLIN_ROUTER_STRATEGY=legacy`.
- **Dead-rung kill-switch.** A model the gateway rejects outright (`400 Unknown model`, 404, 410) is marked unavailable and the same turn is re-routed (bounded to three re-routes); the shared Router removes it from every chain before its next selection. `nvidia/step-3.7-flash` is quarantined (it answers as a different model and leaks thinking prose). A 529-overloaded streak now switches models the same way a 5xx streak does.
- **Catalog refreshed to the 2026-08-29 gateway.** Added: Claude Fable 5 / Opus 5 / Sonnet 5 (Opus 5 is the default Opus and the savings baseline), GPT-5.6 Sol / Terra / Luna (+ Pro tiers), GPT-5.4 mini/nano, Gemini 3.1 Flash-Lite / 3.5 Flash / 3.5 Flash-Lite / 3.6 Flash, Grok 4.5 (`grok` follows it; 4.3 stays pinned for 1M context), Kimi K3, GLM-5.2 / 5.3 / 5.3-Flash, Qwen 3.7 Max / Plus / Flash (Flash is the cheapest paid model on the gateway), Tencent HY3, Xiaomi MiMo. DeepSeek's 2026-08-07 price cut mirrored. Ids hidden from `/v1/models` but still served (Opus 4.6, the Grok 3/4-fast family, K2.x) stay priced and pinnable.
- **Free tier no longer points at retired models.** `nvidia/qwen3-coder-480b`, `llama-4-maverick` and `deepseek-v4-flash` — every free chain, the `free` shortcut, the classifier, MoA and the learnings extractor — are replaced by `nvidia/nemotron-nano-9b-v2` (the one free model that verifiably serves itself on the streaming path), Nemotron 3 Nano Omni, and `mistral-nemotron`. Retired aliases resolve to the current free default so muscle memory keeps working; no free alias ever falls back to a paid model.
- `@blockrun/llm` 2.13 → 3.13.1 (the router is loaded lazily inside `smartChat()`, closing the fresh-install startup crash from a broken transitive bundle). Carried over from upstream at the same time: SSRF guard on `WebFetch`, untrusted-content framing on paid data tools, sensitive-path guard on Read/Write/Edit, x402 reservation hold on ambiguous settlement.

### Fixed
- `VERSION` (0.1.0) and `package.json` (0.2.5) disagreed; both are 0.3.0.

### Tests
- 386 local tests (was 321): the 19 stale catalog assertions replaced with upstream's, 9 kill-switch / catalog-sync tests, and 14 new trading-engine tests covering the guards, the fill-fee ceiling and tolerance boundary, unbookable fills, record-then-flag warnings, the serialised queue, sell-side validation, snapshot validation and block-kind advice.

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

## 0.1.0 — 2026-05-23

### Added
- Initial fork from upstream [Franklin (brcc) 3.21.9](https://github.com/BlockRunAI/Franklin/tree/v3.21.9).
- New CLI binary name `franklin-trading`, new npm package name `@blockrun/franklin-trading`.
- Trading-focused README, PHILOSOPHY, and tool surface.

### Inherited from upstream Franklin (no behavioural change)
- Agent loop (`src/agent/loop.ts`), planner, compactor, groundedness evaluator,
  code verifier, polish round, bash risk classifier — each removable via a
  `FRANKLIN_NO_*` env flag (see ADR 0003).
- Learned-weight smart router across 55+ models with payment-aware fallback chains (replaced by `@blockrun/router-core` in 0.3.0).
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
