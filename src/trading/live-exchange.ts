/**
 * LiveExchange — ExchangeClient backed by a real pricing source (CoinGecko
 * by default) but with *simulated* fills. This is the default adapter the
 * agent uses out of the box: it sees real market prices when valuing
 * positions (so P&L tracks reality) but trades are paper — no real assets
 * are moved, no real USDC is spent on exchange fees.
 *
 * A future commit will add a `RealExchange` that actually routes orders
 * through Coinbase/Kraken; it plugs into the same ExchangeClient contract
 * (src/trading/exchange.ts). Keep this seam clean: the agent loop, risk
 * engine, and portfolio math never need to know whether they're in paper or
 * live mode.
 *
 * Pricing is injected (not imported directly from `./data.js`) so tests
 * can validate behavior without hitting CoinGecko.
 */

import type { ExchangeClient, ExchangeOrder } from './exchange.js';
import type { Fill } from './portfolio.js';
import { bpsFee, bpsFeeCeiling } from './fees.js';
import { paperFill } from './mock-exchange.js';

/** Subset of src/trading/data.ts's PriceData that we actually consume. */
export interface PricingClientResponse {
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
}

export interface PricingClient {
  /** Returns live price data on success, a string error on failure — matches data.ts. */
  getPrice(ticker: string): Promise<PricingClientResponse | string>;
}

export interface LiveExchangeOptions {
  pricing: PricingClient;
  feeBps: number;
}

export class LiveExchange implements ExchangeClient {
  constructor(private opts: LiveExchangeOptions) {}

  async getPrice(symbol: string): Promise<number | null> {
    try {
      const resp = await this.opts.pricing.getPrice(symbol.toUpperCase());
      if (typeof resp === 'string') return null;
      // CoinGecko reports 0 for delisted / stale coins. A zero mark is not a
      // price: returning it would make the position unclosable (the fee math
      // rejects a zero notional) and surface as a raw error instead of a
      // clean "no price" block.
      if (typeof resp.price !== 'number' || !Number.isFinite(resp.price) || resp.price <= 0) return null;
      return resp.price;
    } catch {
      // Network errors, DNS failures, etc — treat as "price unknown" rather
      // than throwing, so the agent gets a clean "can't close, no price"
      // signal from TradingClosePosition instead of an uncaught exception.
      return null;
    }
  }

  estimateFee(order: ExchangeOrder): number {
    return bpsFeeCeiling(order, this.opts.feeBps);
  }

  async placeOrder(order: ExchangeOrder): Promise<Fill> {
    // Paper fill: the exact bps fee is charged, which is at or below the
    // cent-rounded ceiling estimateFee() quoted for the same order.
    return paperFill(order, bpsFee(order, this.opts.feeBps));
  }
}
