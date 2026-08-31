<div align="center">

# Franklin Trading

**The AI trading agent with a wallet.**

Researches, debates, paper-trades against real prices, and settles every paid call in USDC.
Risk limits live in code, not in the prompt. Every fill has a receipt.
Fund the wallet. Set a budget. Walk away — and come back to a book.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![npm](https://img.shields.io/npm/v/@blockrun/franklin-trading)](https://www.npmjs.com/package/@blockrun/franklin-trading)
[![Docs](https://img.shields.io/badge/docs-trading.franklin.run-1a8ad7)](https://trading.franklin.run)

</div>

> Franklin Trading is a fork of [Franklin](https://github.com/BlockRunAI/Franklin) — the
> general-purpose Autonomous Economic Agent — specialized as a wallet-native trading
> agent. It inherits Franklin's economic substrate (x402 micropayments, USDC settlement,
> the shared [Router Core](https://github.com/BlockRunAI/router-core) engine across
> <!-- br:models.chatVisible -->76<!-- /br:models.chatVisible --> models, removable-by-design harness components)
> and adds a deterministic fee-aware risk engine, a wallet-bound trade journal, a
> multi-role persona debate, and a Backtest → Paper → Live strategy lifecycle.

## What works today

This section is the honest one. Everything in it ships in `@blockrun/franklin-trading` 0.3.0
and is covered by the local test suite (386 tests, no network).

| Capability | Status | Where |
|---|---|---|
| USDC wallet on Base or Solana, x402 pay-per-call to every model and paid API | ✅ shipped | `src/wallet/`, `@blockrun/llm` |
| Auto model routing on the shared Router Core engine, <!-- br:models.chatVisible -->76<!-- /br:models.chatVisible --> models, dead-model kill-switch | ✅ shipped | `src/router/` |
| Paper trading against **live** CoinGecko marks (real P&L, simulated fills) | ✅ shipped | `src/trading/live-exchange.ts` |
| Deterministic risk engine: cash **including exchange fee**, per-position cap, total exposure cap, sell integrity | ✅ shipped | `src/trading/risk.ts` |
| Record-then-flag execution: a fill the venue executed is always booked; deviations are warnings, never silent drops | ✅ shipped | `src/trading/engine.ts` |
| Persistent trade journal with rationale scoring, cross-session `TradingHistory` | ✅ shipped | `src/trading/trade-log.ts` |
| Market data, Exa research, prediction markets, DeFiLlama, Jupiter / 0x quotes, multi-chain RPC (paid per call) | ✅ shipped | `src/tools/` |
| Base MCP (onchain balances / swaps / x402 via your Base Account) | ✅ shipped | `docs/base-mcp.md` |
| Strategy DSL (`defineStrategy`) | 🟡 author-facing helper only | `src/strategies/` |
| Unified backtest / paper / live runner (`franklin-trading run`) | 🚧 M1 | roadmap |
| Role personas, regime detector, prompt-cache optimizer, slippage model, fact-checker | 🚧 M2–M3 | roadmap |
| Real venue adapters (Hyperliquid, Jupiter, 0x, Polymarket, Binance) | 🚧 M4–M5 | roadmap |

## Why Franklin Trading

The open-source trading-agent landscape splits into halves nobody has joined:

| Project | Strength | What it can't do |
|---|---|---|
| [TradingAgents](https://github.com/TauricResearch/TradingAgents) (78.8k★) | Multi-role agent debate, academic rigor | No live execution; 0% prompt-cache hit rate ([#750](https://github.com/TauricResearch/TradingAgents/issues/750)); ticker hallucination ([#814](https://github.com/TauricResearch/TradingAgents/issues/814)); risk limits silently drop out of context ([#479](https://github.com/TauricResearch/TradingAgents/issues/479)) |
| [AI-Trader](https://github.com/HKUDS/AI-Trader) (18.5k★) | Federated agents, Polymarket live data, copy-trading | Stale price data ([#188](https://github.com/HKUDS/AI-Trader/issues/188)); position-averaging bug ([#186](https://github.com/HKUDS/AI-Trader/issues/186)); no published backtests ([#207](https://github.com/HKUDS/AI-Trader/issues/207)) |
| [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) (8.4k★) | LLM-driven research, persistent memory, Alpha Zoo (452 factors), Shadow Account | Zero exchange connectors ([#100](https://github.com/HKUDS/Vibe-Trading/issues/100)) |
| [Hummingbot](https://github.com/hummingbot/hummingbot) (18.6k★, $34B+ volume) | 50+ CEX/DEX connectors, V2 framework, institutional-grade risk controls | No LLM brain; no narrative awareness |

Franklin Trading is **the synthesis**: Vibe-Trading-style natural-language research and
persistent memory, TradingAgents-style hierarchical persona debate, Hummingbot-style
execution rigor — wrapped in Franklin's wallet-native economic substrate, with the one
thing none of them do: **the money is real from day one**, so the guardrails had to be too.

## Risk lives outside the model

[Conviction #5](docs/CONVICTIONS.md): the LLM is never the last line of defense. Every
order — buys **and** sells — goes through `RiskEngine.check` in code before it reaches a
venue, and the delivered fill is checked again after.

```text
openPosition(BTC, 0.001 @ $100,000)

  1. local pass        qty / price / notional finite and > 0; caps         → blocked? kind=risk
  2. estimateFee()     venue quotes a fee CEILING ($0.10)                    → blocked? kind=fee-quote
  3. fee-aware pass    $100.00 + $0.10 must fit cash + caps                  → blocked? kind=risk
  4. placeOrder()      a throw here means "not executed"                      → blocked? kind=venue
  5. record-then-flag  the fill is ALWAYS booked; anything the venue changed
                       (fee above ceiling, qty/price drift, cap breached,
                       cash negative) → warnings[] on the outcome + journal
```

Step 5 is the part most agents get wrong. A post-execution *rejection* leaves real money at
the venue that the local book does not know about, and the resulting tool error tells the
model to try again — a double buy. Franklin books the fill and shouts about it instead.

Same shape for `closePosition`: an oversell, a non-positive quantity, a zero mark, or a
dust close the fee would consume is refused *before* the venue is asked. Orders are
serialised per engine; cash is compared at sub-cent precision; the persisted portfolio is
validated on load (an `Infinity` balance would otherwise disarm every cap).

## Quick start

> Requires Node.js 20.19+ (Node 22 LTS recommended). Check with `node -v`.

```bash
npm install -g @blockrun/franklin-trading

# 1. Run — free out of the box (nvidia/nemotron-nano-9b-v2, no wallet needed)
franklin-trading

# 2. Create a USDC wallet on Base (or solana) to unlock every paid model + API
franklin-trading setup base

# 3. Fund it with $5+ USDC — print the address with:
franklin-trading balance

# 4. Start with a budget — Franklin Trading stops when the cap is hit
franklin-trading --max-spend 5
```

Zero signup, zero API keys, zero card. The wallet is the identity.

## A 60-second tour

```text
> open a 0.001 BTC position at the current price

  Auto → deepseek/deepseek-v4-pro

  ## Order filled
  - Bought 0.001 BTC @ $100,000.00 (fee $0.10)
  - Position now: 0.001 BTC @ avg $100,000.00
  - Cash remaining: $899.90

> what's my P&L this week?

  ## Trade history (7d)
  - 7d P&L (realized): +$12.40
  - Trades: 6 (3 opens, 3 closes)
  ...

> sell 0.002 BTC

  ## Close blocked
  - Symbol: BTC
  - Attempted: sell 0.002
  - Reason: Cannot sell 0.002 BTC: only 0.001 held

  Try a smaller qty, or close other positions first to free up exposure headroom.
```

Every model call, every paid tool call, every fill is written to
`~/.blockrun/sessions/<uuid>.jsonl`; the trade journal lives in `~/.blockrun/trades.jsonl`
and the portfolio in `~/.blockrun/portfolio.json`. Resume any session, search across all
of them, audit every trade.

## Models

You don't pick models. `Auto` (the default) runs the shared
[Router Core](https://github.com/BlockRunAI/router-core) engine locally — the same decision
Franklin, ClawRouter and `@blockrun/llm` make — classifying the request across 15 dimensions,
dropping every model that cannot satisfy it (tools, vision, context, output length), and
ranking the survivors on fit, cost, speed and reliability. Sub-millisecond, no network on the
hot path, <!-- br:savings.autoVsBaselinePct -->84<!-- /br:savings.autoVsBaselinePct -->% cheaper than pinning Claude Opus 5 for everything.

A model the gateway stops serving is removed from every chain on the next request (the
dead-rung kill-switch), so a retired id never strands a turn.

Pin one with `/model <shortcut>` when you want to:

| Tier | Shortcut | Model | Price (in / out per 1M) |
|---|---|---|---|
| Frontier | `opus` | Claude Opus 5 | $5 / $25 |
| | `fable` | Claude Fable 5 | $10 / $50 |
| | `sonnet` | Claude Sonnet 5 | $3 / $15 |
| | `gpt` | GPT-5.6 Sol | $5 / $30 |
| | `qwen-max` | Qwen3.7 Max | $1.475 / $4.425 |
| | `gemini` | Gemini 3.1 Pro | $2 / $12 |
| | `grok` | Grok 4.5 | $2.5 / $9 |
| | `kimi` | Kimi K3 | $3 / $15 |
| Reasoning | `o3` | O3 | $2 / $8 |
| | `codex` | GPT-5.3 Codex | $1.75 / $14 |
| | `deepseek-v4-pro` | DeepSeek V4 Pro | $0.435 / $0.87 |
| | `terra-pro` | GPT-5.6 Terra Pro | $1 / $6 |
| | `glm-5.3` | GLM-5.3 | $1.4 / $4.4 |
| Budget | `haiku` | Claude Haiku 4.5 | $1 / $5 |
| | `mini` | GPT-5 Mini | $0.25 / $2 |
| | `glm-flash` | GLM-5.3 Flash (1M ctx, vision) | $0.15 / $0.5 |
| | `deepseek` | DeepSeek V4 Flash | $0.14 / $0.28 |
| | `qwen-flash` | Qwen3.7 Flash (1M ctx) | $0.03 / $0.13 |
| Free | `free` | Nemotron Nano 9B | $0 |
| | `omni` | Nemotron 3 Nano Omni (text + image + audio) | $0 |
| | `nano-vl` | Nemotron Nano VL | $0 |

The full catalog — <!-- br:models.totalVisible -->100<!-- /br:models.totalVisible --> visible models including image, video, music and speech — is at
[blockrun.ai/models](https://blockrun.ai/models). Pricing is provider cost + 5%, settled per
call in USDC. No free alias ever falls back to a paid model.

## Architecture

```
                Franklin Trading CLI / TUI / Telegram
                              │
                      Agent loop (inherited from Franklin)
              plan · execute · compact · evaluate · verify · polish
                       (each removable via FRANKLIN_NO_*)
                              │
            ┌─────────────┬───┴──────┬──────────────┐
       Router Core     Brain +     Session +    Trading harness
       (shared,      Learnings +   Cost +       layers (M3: 4 moats)
        72 models)   Shadow Acct   JSONL
                              │
   TradingEngine: local risk → fee quote → fee-aware risk → place → record-then-flag
                              │
   Role personas (M2): Analyst → Bull / Bear → Trader → Risk → Compliance
                              │
   Strategy surface (M1): defineStrategy now; unified runner roadmap
                              │
   Execution: LiveExchange (paper, live marks) today · Hyperliquid · Jupiter · 0x · Polymarket (M4–M5)
                              │
   Economic substrate (inherited): USDC wallet on Base + Solana, x402 micropayments
```

See [`PHILOSOPHY.md`](PHILOSOPHY.md) for the design principles,
[`docs/CONVICTIONS.md`](docs/CONVICTIONS.md) for the 12 design stances
formed from analyzing 60+ open issues across the four reference projects,
and [`docs/adr/`](docs/adr/) for individual architecture decisions.

### Writing a venue adapter

Real execution plugs in at one seam: [`src/trading/exchange.ts`](src/trading/exchange.ts).

```ts
import type { ExchangeClient, ExchangeOrder } from '@blockrun/franklin-trading/trading/exchange';

export class MyVenue implements ExchangeClient {
  // A CEILING, not an expectation: round up, include your margin. The engine
  // approves the order against notional + this number.
  async estimateFee(order: ExchangeOrder): Promise<number> { /* fee-tier endpoint */ }
  // Forward order.clientOrderId as the venue's client order id — a retried
  // submission after a timeout must not fill twice. Throw ONLY if the venue
  // rejected the order before executing; resolve the order state first otherwise.
  async placeOrder(order: ExchangeOrder) { /* ... returns Fill with feeUsd actually charged */ }
  // A usable quote is a finite number > 0. Return null, never 0, for a stale market.
  async getPrice(symbol: string): Promise<number | null> { /* ticker */ }
}
```

`MockExchange` and `LiveExchange` are the reference implementations; the contract's invariants
are pinned by the tests in `test/local.mjs` (search for `ExchangeClient`).

### Base MCP — onchain actions

Franklin connects to the official **[Base MCP](https://docs.base.org/ai-agents)** server
(`https://mcp.base.org`) for onchain Base actions — balances, transactions, swaps, and
x402 payments — authorized via your Base Account (OAuth, per-write approval). One command:

```bash
franklin-trading mcp add base   # browser login, then start — tools appear as mcp__base__*
```

The HTTP+OAuth transport is generic: `franklin-trading mcp add <name> --url <url>` connects any
hosted MCP server that supports Dynamic Client Registration + PKCE. See
[`docs/base-mcp.md`](docs/base-mcp.md).

## The four moats (M3)

Each is a removable harness component per [ADR 0003](docs/adr/0003-harness-as-removable-components.md):
toggle off with an env flag when the model catches up.

| Layer | What it does | Env opt-out |
|---|---|---|
| **Regime detector** | Lightweight HMM on rolling vol + correlation; tags every decision; swaps Trader persona prompt between trend / chop / risk-off | `FRANKLIN_NO_REGIME=1` |
| **Prompt-cache optimizer** | Separates static persona prompts from volatile context; targets ≥40% cache hit rate from turn 2 | `FRANKLIN_NO_PROMPTCACHE=1` |
| **Slippage model** | Per-venue impact (linear+sqrt) calibrated from observed fills; applied consistently in backtest, paper, live | `FRANKLIN_NO_SLIPPAGE=1` |
| **Fact-checker** | Deterministic ticker → entity resolver via on-chain registries + CoinGecko; blocks TOTDY-style hallucinations | `FRANKLIN_NO_FACTCHECK=1` |

## Planned Strategy DSL (M1)

The author-facing strategy helper is available for early artifacts, while the
`franklin-trading run <strategy>` command and unified backtest/paper/live runtime
are still M1 roadmap work.

```ts
// src/strategies/btc-funding-basis.strategy.ts
import { defineStrategy } from '@blockrun/franklin-trading/strategy';

export default defineStrategy({
  name: 'btc-funding-basis',
  universe: ['BTC-PERP@hyperliquid', 'BTC@jupiter'],
  signal: async (ctx) => {
    const fr = await ctx.market.fundingRate('BTC-PERP@hyperliquid');
    return fr > 0.0001
      ? { action: 'arb-long-spot-short-perp', size: 0.2 }
      : null;
  },
  risk: { maxNotionalUsd: 1000, maxDrawdownPct: 5, killSwitch: true },
  schedule: { every: '1m' },
});
```

Once the M1 runner lands, one artifact will run three modes:

```bash
franklin-trading run btc-funding-basis --mode backtest --from 2024-01-01
franklin-trading run btc-funding-basis --mode paper      # live data, simulated fills
franklin-trading run btc-funding-basis --mode live       # real on-chain orders
```

## Roadmap

| Status | Milestone |
|---|---|
| ✅ | **M0** — Fork from Franklin, prune non-trading verticals, rebrand |
| ✅ | **M0.5** — Fee-aware risk engine with record-then-flag execution; Router Core + 2026-08 catalog sync (0.3.0) |
| 🚧 | **M1** — Strategy DSL + walk-forward backtest engine |
| 🚧 | **M2** — Role personas (Analyst, Bull, Bear, Trader, Risk, Compliance) wired via `Task` dispatch |
| 🚧 | **M3** — Four moats (`regime.ts`, `prompt-cache.ts`, `slippage.ts`, `fact-check.ts`) |
| 🚧 | **M4** — Connectors (read): Hyperliquid, Jupiter, 0x, Polymarket, Binance |
| 🚧 | **M5** — Connectors (write) + 24h-clean paper trade |
| 🚧 | **M6** — Alpha Zoo (40 factors v1) + Shadow Account (broker CSV import) |
| 🚧 | **M7** — Polish, docs, demo GIF, benchmark page, v1.0.0 launch |

## Out of scope (deliberate cuts)

- Equities (IB / Alpaca / retail brokers) — v2; crypto-first proves the loop
- Options Greeks / vol-surface fitting — v2
- Hosted SaaS — never; Franklin Trading's whole point is non-custodial
- Token model / liquidity-mining rewards — v2 at earliest; institutional approach in v1
- LangGraph or any other agent-graph runtime — we use Franklin's `Task` tool dispatch
- Web dashboard — v2; CLI + TUI + Telegram is sufficient for v1
- Full-orderbook market-making — Hummingbot already excels here; we differentiate on LLM-driven research + execution

## Development

```bash
npm install
npm run build        # tsc + copy bundled skills
npm test             # 386 local tests, no network, no wallet
npm run test:e2e     # hits real models — needs a funded wallet
```

Upstream sync: model catalog, router and pricing changes land in
[Franklin](https://github.com/BlockRunAI/Franklin) first and are ported here; the Router
Core dependency is pinned to a commit SHA in `package.json` so a routing change can never
arrive unnoticed. Marketing numbers regenerate from `brand-numbers.json`
(`node scripts/sync-brand-numbers.mjs --refresh`) and CI fails when they drift.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The Franklin rule applies: every fix
needs a receipt (session id, log line, gateway response) showing the bug
actually happened. We don't accept "looks broken" fixes.

## License

Apache-2.0 — see [`LICENSE`](LICENSE). Inherits the upstream Franklin
license. Strategy contributions in `strategies/community/` follow the same
license unless explicitly marked otherwise.

## Acknowledgements

Franklin Trading stands on the shoulders of these open-source projects:

- [Franklin](https://github.com/BlockRunAI/Franklin) — wallet, x402, Router Core, harness, plugin SDK
- [TradingAgents](https://github.com/TauricResearch/TradingAgents) — multi-role debate architecture
- [AI-Trader](https://github.com/HKUDS/AI-Trader) — federated-agent + Polymarket integration ideas
- [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) — Alpha Zoo, persistent research memory, Shadow Account
- [Hummingbot](https://github.com/hummingbot/hummingbot) — Executor/Controller framework, multi-venue connector abstraction, governance model

If we did our job right, this is the agent each of them wanted to be.
