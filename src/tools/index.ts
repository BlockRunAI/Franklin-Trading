/**
 * Tool registry — exports all available capabilities for the agent.
 *
 * Franklin Trading variant: the hero surface is built around the wallet
 * actually trading. Content, image/video/music, social posting, phone, voice,
 * browser automation and Modal sandboxes have all been removed (see
 * brcc upstream for general-purpose Franklin). What remains is the trading,
 * research, on-chain execution and wallet read surface.
 */

import type { CapabilityHandler } from '../agent/types.js';

import os from 'node:os';
import path from 'node:path';

import { readCapability, clearSessionState as clearReadSessionState } from './read.js';
import { writeCapability } from './write.js';
import { editCapability } from './edit.js';
import { bashCapability, clearSessionState as clearBashSessionState } from './bash.js';
import { globCapability } from './glob.js';
import { grepCapability } from './grep.js';
import { webFetchCapability, clearSessionState as clearWebFetchSessionState } from './webfetch.js';
import { webSearchCapability } from './websearch.js';
import { taskCapability } from './task.js';
import { detachCapability } from './detach.js';
import { memoryRecallCapability } from './memory.js';
import { exaSearchCapability, exaAnswerCapability, exaReadUrlsCapability } from './exa.js';
import { askUserCapability } from './askuser.js';
import { tradingSignalCapability, tradingMarketCapability } from './trading.js';
import { moaCapability } from './moa.js';
import { webhookPostCapability } from './webhook.js';
import { walletCapability } from './wallet.js';
import { jupiterQuoteCapability, jupiterSwapCapability } from './jupiter.js';
import { base0xQuoteCapability, base0xSwapCapability } from './zerox-base.js';
import { base0xGaslessSwapCapability } from './zerox-gasless.js';
import {
  defiLlamaProtocolsCapability,
  defiLlamaProtocolCapability,
  defiLlamaChainsCapability,
  defiLlamaYieldsCapability,
  defiLlamaPriceCapability,
} from './defillama.js';
import { predictionMarketCapability } from './prediction.js';
import { blockrunCapability } from './blockrun.js';
import { surfCapabilities } from './surf.js';
import { createTradingCapabilities } from './trading-execute.js';
import { Portfolio } from '../trading/portfolio.js';
import { RiskEngine } from '../trading/risk.js';
import { LiveExchange } from '../trading/live-exchange.js';
import { TradingEngine } from '../trading/engine.js';
import { loadPortfolio, savePortfolio } from '../trading/store.js';
import { TradeLog } from '../trading/trade-log.js';
import { getPrice as cgGetPrice } from '../trading/data.js';

// ─── Default Trading Engine ────────────────────────────────────────────────
// Paper trading defaults: $1000 starting bankroll, $400 per-position cap
// (2.5 positions fully loaded), $900 total exposure cap (keep 10% cash buffer).
// Live prices from CoinGecko; simulated fills at 10 bps. Portfolio persists
// to ~/.blockrun/portfolio.json across sessions.
const DEFAULT_PORTFOLIO_PATH = path.join(os.homedir(), '.blockrun', 'portfolio.json');
const DEFAULT_TRADE_LOG_PATH = path.join(os.homedir(), '.blockrun', 'trades.jsonl');
const DEFAULT_STARTING_CASH_USD = 1_000;
const DEFAULT_RISK_CONFIG = { maxPositionUsd: 400, maxTotalExposureUsd: 900 };
const DEFAULT_FEE_BPS = 10;

function buildDefaultTradingCapabilities() {
  const portfolio =
    loadPortfolio(DEFAULT_PORTFOLIO_PATH) ??
    new Portfolio({ startingCashUsd: DEFAULT_STARTING_CASH_USD });
  const risk = new RiskEngine(DEFAULT_RISK_CONFIG);
  const exchange = new LiveExchange({
    pricing: { getPrice: cgGetPrice },
    feeBps: DEFAULT_FEE_BPS,
  });
  const engine = new TradingEngine({ portfolio, risk, exchange });
  const tradeLog = new TradeLog(DEFAULT_TRADE_LOG_PATH);
  return createTradingCapabilities({
    engine,
    riskConfig: DEFAULT_RISK_CONFIG,
    tradeLog,
    onStateChange: () => {
      try {
        savePortfolio(portfolio, DEFAULT_PORTFOLIO_PATH);
      } catch {
        // Persistence best-effort — never block a trade on disk failure.
      }
    },
  });
}

const defaultTradingCapabilities = buildDefaultTradingCapabilities();

/**
 * Reset module-level tool state that would otherwise leak between sessions
 * when the same process runs `interactiveSession()` more than once (library
 * callers, tests, planned daemon mode). Safe to call before every session.
 */
export function resetToolSessionState(): void {
  clearReadSessionState();
  clearWebFetchSessionState();
  clearBashSessionState();
}

/** All capabilities available to the Franklin Trading agent (excluding sub-agent, which needs config). */
export const allCapabilities: CapabilityHandler[] = [
  // Core file + shell + search — table stakes
  readCapability,
  writeCapability,
  editCapability,
  bashCapability,
  globCapability,
  grepCapability,
  // User interaction
  askUserCapability,
  // Generic research + memory
  webFetchCapability,
  webSearchCapability,
  exaSearchCapability,
  exaAnswerCapability,
  exaReadUrlsCapability,
  memoryRecallCapability,
  // Subagent dispatch + detached background tasks
  taskCapability,
  detachCapability,
  // Wallet read — Franklin Trading is the agent with a wallet
  walletCapability,
  // ─── Hero trading surface ────────────────────────────────────────────
  tradingSignalCapability,
  tradingMarketCapability,
  ...defaultTradingCapabilities, // TradingPortfolio, TradingOpenPosition, TradingClosePosition, TradingHistory
  // ─── On-chain execution ──────────────────────────────────────────────
  jupiterQuoteCapability,
  jupiterSwapCapability,
  base0xQuoteCapability,
  base0xSwapCapability,
  base0xGaslessSwapCapability,
  // ─── DeFi + prediction-market data ───────────────────────────────────
  defiLlamaProtocolsCapability,
  defiLlamaProtocolCapability,
  defiLlamaChainsCapability,
  defiLlamaYieldsCapability,
  defiLlamaPriceCapability,
  predictionMarketCapability, // Polymarket / Kalshi / matching / smart money via Predexon
  // ─── Generic x402-paid gateway primitive + typed Surf surface ────────
  blockrunCapability,            // Long-tail Surf paths + future partners
  ...surfCapabilities,           // SurfMarket / SurfChain / SurfSocial — endpoint-enum function tools (no path guessing, auto x402)
  // ─── Misc ────────────────────────────────────────────────────────────
  moaCapability,
  webhookPostCapability,
];

export {
  readCapability,
  writeCapability,
  editCapability,
  bashCapability,
  globCapability,
  grepCapability,
  webFetchCapability,
  webSearchCapability,
  taskCapability,
  detachCapability,
};

export { createSubAgentCapability } from './subagent.js';
