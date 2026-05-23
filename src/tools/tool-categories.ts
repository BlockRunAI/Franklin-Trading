/**
 * Tool visibility categories — Franklin Trading.
 *
 * Franklin Trading exposes ~22 capabilities. The hero surface (always-on)
 * stays focused on the trading identity: trading market data, prediction
 * markets, research, the wallet, and the portfolio. Everything else
 * (webhook, MoA, etc.) is gated behind the `ActivateTool` meta-tool the
 * agent pulls on demand so the default inventory is small enough that
 * weak models don't hallucinate tool names.
 *
 * Inherited rule from brcc (see ADR 0003 in docs/adr/): the hero surface is
 * specifically the tools that define what Franklin Trading IS — "an AI that
 * spends USDC to trade." Trading and wallet primitives are first-class in
 * core so the default experience shows the wallet actually at work.
 */

export const CORE_TOOL_NAMES: ReadonlySet<string> = new Set([
  // File operations — nothing else works without these.
  'Read',
  'Write',
  'Edit',
  // Shell execution — needed for running tests, builds, scripts.
  'Bash',
  // Detached background execution — bash-adjacent: spawns a long-running
  // command that survives Franklin exiting. Belongs in core so the agent
  // can offload >20-item iteration (e.g. a multi-day paper-trade run)
  // without first activating a meta-tool.
  'Detach',
  // Search — code exploration is table stakes.
  'Grep',
  'Glob',
  // User dialogue — the agent must be able to ask for clarification
  // (e.g. confirm a live trade before submitting).
  'AskUser',
  // Sub-agent delegation — the role personas (Analyst, Bull, Bear, Trader,
  // Risk, Compliance) dispatch through Task. Each subagent has its own
  // tool resolution, so keeping this in core doesn't leak the full
  // inventory into the parent.
  'Task',
  // The meta-tool itself — must always be callable so the agent can
  // discover and activate anything not in this core set.
  'ActivateTool',
  // ── Hero surface: Franklin Trading's reason to exist ─────────────────
  // Trading market data — crypto, FX, commodity, stocks (via x402).
  // "Is BTC up?" / "What's funding on Hyperliquid?" must never fall back
  // to training-data guessing.
  'TradingMarket',
  'TradingSignal',
  // Portfolio read — Franklin Trading is the agent with a book. The
  // current positions, P&L and cash must be a one-call answer rather
  // than a Bash shell-out against ~/.blockrun/portfolio.json.
  'TradingPortfolio',
  // Prediction market data — Polymarket, Kalshi, cross-platform matching,
  // smart money. The "what are the odds of X" / "Polymarket on Y"
  // category. Cross-platform pair lookup is unique to the gateway and
  // is the kind of data a non-wallet agent fundamentally cannot reach.
  'PredictionMarket',
  // Research — synthesized answers with real citations, semantic web
  // search, and clean URL fetching. Any factual current-events question
  // ("why did SOL drop?") should route here rather than the model's
  // prior.
  'ExaAnswer',
  'ExaSearch',
  'ExaReadUrls',
  // Plain web fetch — specific URL → readable text. Cheap and obvious
  // enough that every model tends to pick it correctly.
  'WebFetch',
  'WebSearch',
  // Wallet read — Franklin Trading is the agent with a wallet, so
  // balance + chain + address must be a one-call answer rather than a
  // Bash shell-out.
  'Wallet',
]);

/** True if this tool is always available without activation. */
export function isCoreTool(name: string): boolean {
  return CORE_TOOL_NAMES.has(name);
}

/**
 * Env opt-out: setting `FRANKLIN_DYNAMIC_TOOLS=0` disables the core/on-demand
 * split and exposes every registered tool on every turn (pre-3.8.9 behavior).
 * Kept as a safety valve for users whose workflows depend on the full surface.
 */
export function dynamicToolsEnabled(): boolean {
  return process.env.FRANKLIN_DYNAMIC_TOOLS !== '0';
}
