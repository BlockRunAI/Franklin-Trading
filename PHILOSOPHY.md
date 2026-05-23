# Franklin Trading Philosophy

## One sentence

**Franklin Trading lets you give your AI a budget and walk away — with a book.**

Every other design decision in this repo falls out of that one sentence.

## Why a wallet (not an API key)

Autonomous trading requires accountability. A trading agent that can act on
its own behalf needs something it can spend, run out of, and stop at — not
because we asked it to, but because it physically cannot continue.

A subscription breaks this. Flat fees decouple agent actions from their cost,
which means:

- destructive actions have no upper bound
- token bloat is invisible to both the user and the agent
- single-vendor lock-in is automatic
- billing becomes a separate, opaque system
- agent misbehavior has no economic consequence

A brokerage API key with a margin account is *worse*, not better: now the
agent's upper bound is your entire margin line, the model never sees the
price of its own actions, and a hallucinated ticker becomes a real loss.

Fix the economic substrate and four of those five problems go away at the
same time. That substrate — for us — is a user-held USDC wallet paying
per-call via the x402 HTTP-402 micropayment protocol, plus a non-custodial
on-chain execution layer (Hyperliquid, Jupiter, 0x, Polymarket) that draws
from the same wallet.

The wallet isn't a feature. The wallet is the mechanism that makes every
other promise of autonomous trading actually hold.

## What we are not

**Franklin Trading is not a Bloomberg Terminal alternative.** The
comparison misses the category. Terminals assume a human is watching. We
are about *what the trading agent does when nobody is watching* — and the
thing that makes it safe to look away is the budget.

**Franklin Trading is not "ChatGPT-for-stocks."** A chat that suggests a
trade is research; an agent that places one is execution. Conflating them
is how "AI trading bots" lose money. We keep the line bright: every
persona's output is structured, every order has a justification, every
fill has an on-chain receipt.

**Franklin Trading is not a copy-trading platform.** Following someone
else's signals can be a fine income product. It is not what we are
building. We build agents that *reason* about markets, debate among
themselves, and bear the cost of being wrong in actual USDC, on actual
chains.

**Franklin Trading is not "TradingAgents with a wallet bolted on."** The
wallet isn't aesthetic. Remove it and you cannot deliver budget-bounded
autonomous trading at all. The payment layer isn't a grace note; it's the
instrument.

## What we are

Franklin Trading is the reference implementation of an **Economic Trading
Agent** — an AI agent that:

1. holds a wallet you funded,
2. researches, debates, and decides via role personas (Analyst, Bull,
   Bear, Trader, Risk, Compliance),
3. prices every action *and every trade* before taking it,
4. signs a USDC micropayment for every paid call and a real on-chain
   transaction for every fill,
5. stops — structurally, not politely — when the wallet is empty.

That shape unlocks things general-purpose trading bots cannot do:

- *A fully autonomous overnight session*, because the worst-case spend is
  the wallet balance.
- *A multi-model debate*, because no subscription locks you in — the
  wallet doesn't care which model answered.
- *A per-trade receipt*, because every payment has an on-chain signature.
- *Access without a brokerage account*, because the only identity you
  need is a public address.
- *No tier, no limit, no overdraft*, because the balance itself is the
  only rate limiter.

## What "good" looks like

If we are doing this right, a user can:

1. Fund a wallet with $200.
2. Ask Franklin Trading to manage a basis trade between BTC perp funding on
   Hyperliquid and BTC spot on Jupiter, with a 5% NAV kill switch.
3. Walk away.
4. Come back to either a working book — every fill receipted on-chain,
   every debate transcript persisted, every cost itemised — or an empty
   wallet with a complete audit trail. In both cases, know exactly what
   happened and what it cost.

Every feature we ship is tested against that path. If it makes that path
more certain, more transparent, or more trustable, it belongs. If it's a
research-tool feature that makes Franklin Trading a better chart-watching
assistant but doesn't touch step 2–4, it's a distraction.

## The four moats we don't compromise on

Every harness layer we add encodes a specific model-capability gap. Each
must justify itself on the current model generation, not the one it was
added against (see [ADR 0003](docs/adr/0003-harness-as-removable-components.md)
inherited from upstream brcc). The four trading-specific moats:

1. **Regime detection.** A bull-tuned agent in a bear market bleeds. We
   tag every decision with a regime label (HMM on vol/correlation) and
   swap the Trader persona prompt accordingly. *Disable with
   `FRANKLIN_NO_REGIME=1` when models are good enough to detect regime
   from raw price.*

2. **Prompt-cache discipline.** Multi-persona debate destroys cache hit
   rate unless you separate static (persona prompt) from volatile
   (date/ticker/portfolio) context. We do, and we measure. Target ≥40%
   hit rate from turn 2. *Disable with `FRANKLIN_NO_PROMPTCACHE=1`.*

3. **Slippage realism.** Backtests that assume zero slippage are lies
   that print money on paper and lose it live. We calibrate a per-venue
   impact model from observed fills and apply it consistently in
   backtest, paper, and live. *Disable with `FRANKLIN_NO_SLIPPAGE=1`.*

4. **Hallucination guards.** A persona that confidently misidentifies a
   ticker — and they do — is more dangerous than one that admits it
   doesn't know. Every persona output passes through a deterministic
   entity resolver. *Disable with `FRANKLIN_NO_FACTCHECK=1`.*

## The test we never stop running

For every decision — what to build, what to deprecate, how to write
marketing, what to tell users — we ask:

> *Does this move Franklin Trading toward "you can trust it with money
> and walk away" — or toward "it's a nicer chart"?*

The first is the thing. The second is table stakes. We don't compete on
table stakes.

## Who this is for

Franklin Trading is built for people who:

- are tired of paying for trading bots that don't tell them what they
  cost per decision,
- have tried autonomous trading and been burned by hallucinated tickers
  or unmodelled slippage,
- hold crypto and want their trading capital to be the same wallet that
  pays their AI,
- want every trade to have a receipt — model debate, risk decision,
  on-chain fill, USDC settlement — auditable forever.

We are not trying to be everyone's first trading bot. We are trying to be
the first trading agent anyone trusts with autonomy.

## On reliability

The current generation of models is not reliable enough to "hire" as a
human portfolio manager. We know this. Our users will tell us so (and
they already have). Our answer is not to hide the unreliability — it's
to make unreliable AI *safe to trade* by giving the user a hard economic
ceiling underneath it and a per-decision audit trail above it.

A model that fails 30% of the time on a subscription = wasted month.
A model that fails 30% of the time on a $200 wallet with a 5% kill switch
= $10 of lessons and a full set of receipts showing where it went wrong.

That's the asymmetry we're betting on: **the economic layer makes
imperfect AI usable today, while the model layer catches up to the
autonomy promise over time.** When the model catches up, we delete
harness components, not add new ones (ADR 0003).

Subscriptions and prop-firm trading desks bet on the model (or the
trader) being perfect. We bet on the money being honest.

---

*Franklin Trading is open-source (Apache-2.0) at
[`github.com/BlockRunAI/Franklin-Trading`](https://github.com/BlockRunAI/Franklin-Trading).
Docs live at [trading.franklin.run](https://trading.franklin.run).
Upstream general-purpose agent is [Franklin](https://github.com/BlockRunAI/Franklin).*
