<div align="center">

# Franklin Trading

**The AI trading agent with a wallet.**

Researches, debates, backtests, paper-trades and live-trades autonomously.
Every decision is a multi-persona debate. Every fill has an on-chain x402 USDC receipt.
Fund the wallet. Set a budget. Walk away — and come back to a book.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![npm](https://img.shields.io/npm/v/@blockrun/franklin-trading)](https://www.npmjs.com/package/@blockrun/franklin-trading)
[![Docs](https://img.shields.io/badge/docs-trading.franklin.run-1a8ad7)](https://trading.franklin.run)

</div>

> Franklin Trading is a fork of [Franklin](https://github.com/BlockRunAI/Franklin) — the
> general-purpose Autonomous Economic Agent — specialized as a wallet-native trading
> agent. It inherits Franklin's economic substrate (x402 micropayments, USDC settlement,
> learned-weight model router across 55+ models, removable-by-design harness components)
> and adds a multi-role persona debate, a unified Backtest → Paper → Live strategy
> lifecycle, multi-venue on-chain execution, and four moat layers nobody else ships.

## Why Franklin Trading

The open-source trading-agent landscape splits into halves nobody has joined:

| Project | Strength | What it can't do |
|---|---|---|
| [TradingAgents](https://github.com/TauricResearch/TradingAgents) (78.8k★) | Multi-role agent debate, academic rigor | No live execution; 0% prompt-cache hit rate ([#750](https://github.com/TauricResearch/TradingAgents/issues/750)); ticker hallucination ([#814](https://github.com/TauricResearch/TradingAgents/issues/814)) |
| [AI-Trader](https://github.com/HKUDS/AI-Trader) (18.5k★) | Federated agents, Polymarket live data, copy-trading | Stale price data ([#188](https://github.com/HKUDS/AI-Trader/issues/188)); position-averaging bug ([#186](https://github.com/HKUDS/AI-Trader/issues/186)); no published backtests ([#207](https://github.com/HKUDS/AI-Trader/issues/207)) |
| [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) (8.4k★) | LLM-driven research, persistent memory, Alpha Zoo (452 factors), Shadow Account | Zero exchange connectors ([#100](https://github.com/HKUDS/Vibe-Trading/issues/100)) |
| [Hummingbot](https://github.com/hummingbot/hummingbot) (18.6k★, $34B+ volume) | 50+ CEX/DEX connectors, V2 framework, institutional-grade risk controls | No LLM brain; no narrative awareness |

Franklin Trading is **the synthesis**: Vibe-Trading-style natural-language research and
persistent memory, TradingAgents-style hierarchical persona debate, Hummingbot-style
multi-venue execution rigor — wrapped in Franklin's wallet-native economic substrate
and four new moat layers (regime detection, prompt-cache optimization, slippage
realism, hallucination guards).

## The four moats nobody else ships

Each is a removable harness component per [ADR 0003](docs/adr/0003-harness-as-removable-components.md):
toggle off with an env flag when the model catches up.

| Layer | What it does | Env opt-out |
|---|---|---|
| **Regime detector** | Lightweight HMM on rolling vol + correlation; tags every decision; swaps Trader persona prompt between trend / chop / risk-off | `FRANKLIN_NO_REGIME=1` |
| **Prompt-cache optimizer** | Separates static persona prompts from volatile context; targets ≥40% cache hit rate from turn 2 | `FRANKLIN_NO_PROMPTCACHE=1` |
| **Slippage model** | Per-venue impact (linear+sqrt) calibrated from observed fills; applied consistently in backtest, paper, live | `FRANKLIN_NO_SLIPPAGE=1` |
| **Fact-checker** | Deterministic ticker → entity resolver via on-chain registries + CoinGecko; blocks TOTDY-style hallucinations | `FRANKLIN_NO_FACTCHECK=1` |

## Quick start

```bash
npm install -g @blockrun/franklin-trading

# Create a USDC wallet on Base (or solana)
franklin-trading setup base

# Fund it with $20+ USDC — print address with:
franklin-trading balance

# Start with a budget — Franklin Trading stops when the wallet runs dry
franklin-trading --max-spend 5

# Or run a strategy directly
franklin-trading run btc-funding-basis --mode paper
```

## A 60-second tour

```bash
# Research mode — natural language, multi-persona debate
> "Is the BTC perp funding rate on Hyperliquid right now wide enough
   to support a 1% NAV basis trade against spot on Jupiter?"

  [fundamentals-analyst]  thesis + citations
  [sentiment-analyst]     X chatter score, drivers
  [technical-analyst]     funding curve, term structure
  [bull-researcher]       carry thesis, target P&L
  [bear-researcher]       margin call risk, slippage risk
  [trader]                action: arb-long-spot-short-perp, size 0.2
  [risk-officer]          ✓ approved (within $400 position cap)
  [compliance-officer]    ✓ approved (audit_id: a1b2c3d4)

  → Estimated round-trip cost: $0.07 (LLM) + $0.83 (gas/fees)
  → Confirm? [y/N]
```

Every persona output, every model call, every gas fee, every fill is
written to `~/.blockrun/sessions/<uuid>.jsonl`. Resume any session, search
across all of them, audit every trade.

## Authoring a strategy

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

One artifact runs three modes:

```bash
franklin-trading run btc-funding-basis --mode backtest --from 2024-01-01
franklin-trading run btc-funding-basis --mode paper      # live data, simulated fills
franklin-trading run btc-funding-basis --mode live       # real on-chain orders
```

## Architecture

```
                Franklin Trading CLI / TUI / Telegram
                              │
                      Agent loop (inherited from brcc)
              plan · execute · compact · evaluate · verify · polish
                       (each removable via FRANKLIN_NO_*)
                              │
            ┌─────────────┬───┴──────┬──────────────┐
       Smart Router    Brain +     Session +    NEW: Trading
       (learned,     Learnings +   Cost +       Harness Layers
        55 models)   Shadow Acct   JSONL        (4 moats)
                              │
   Role personas (NEW): Analyst → Bull / Bear → Trader → Risk → Compliance
                              │
   Strategy lifecycle (NEW): same artifact, 3 modes (backtest/paper/live)
                              │
   Execution: Hyperliquid · Jupiter · 0x · Polymarket · Binance (read-only)
                              │
   Economic substrate (inherited): USDC wallet on Base + Solana, x402 micropayments
```

See [`PHILOSOPHY.md`](PHILOSOPHY.md) for the design principles,
[`docs/CONVICTIONS.md`](docs/CONVICTIONS.md) for the 12 design stances
formed from analyzing 60+ open issues across the four reference projects,
and [`docs/adr/`](docs/adr/) for individual architecture decisions.

### Base MCP — onchain actions

Franklin connects to the official **[Base MCP](https://docs.base.org/ai-agents)** server
(`https://mcp.base.org`) for onchain Base actions — balances, transactions, swaps, and
x402 payments — authorized via your Base Account (OAuth, per-write approval). One command:

```bash
franklin mcp add base      # browser login, then `franklin start` — tools as mcp__base__*
```

The HTTP+OAuth transport is generic: `franklin mcp add <name> --url <url>` connects any
hosted MCP server that supports Dynamic Client Registration + PKCE. See
[`docs/base-mcp.md`](docs/base-mcp.md).

## Roadmap

| Status | Milestone |
|---|---|
| ✅ | **M0** — Fork from brcc, prune non-trading verticals, rebrand |
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

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The brcc rule applies: every fix
needs a receipt (session id, log line, gateway response) showing the bug
actually happened. We don't accept "looks broken" fixes.

## License

Apache-2.0 — see [`LICENSE`](LICENSE). Inherits the upstream Franklin
license. Strategy contributions in `strategies/community/` follow the same
license unless explicitly marked otherwise.

## Acknowledgements

Franklin Trading stands on the shoulders of these open-source projects:

- [Franklin (brcc)](https://github.com/BlockRunAI/Franklin) — wallet, x402, router, harness, plugin SDK
- [TradingAgents](https://github.com/TauricResearch/TradingAgents) — multi-role debate architecture
- [AI-Trader](https://github.com/HKUDS/AI-Trader) — federated-agent + Polymarket integration ideas
- [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) — Alpha Zoo, persistent research memory, Shadow Account
- [Hummingbot](https://github.com/hummingbot/hummingbot) — Executor/Controller framework, multi-venue connector abstraction, governance model

If we did our job right, this is the agent each of them wanted to be.
