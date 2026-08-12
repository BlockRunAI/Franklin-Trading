/**
 * MockExchange — deterministic in-memory exchange used by tests and dev mode.
 *
 * Implements the same `ExchangeClient` contract a real adapter would, so the
 * agent flow can be verified end-to-end without hitting a network or placing
 * real orders. Fills land at the requested price (no slippage) with a
 * configured taker fee in basis points; no latency is simulated.
 *
 * When a real Coinbase/Kraken adapter lands (follow-up PR), it replaces
 * MockExchange at the ExchangeClient seam — no Portfolio or RiskEngine
 * changes required.
 */

import type { Fill, Side } from './portfolio.js';
import { bpsFee } from './fees.js';

export interface ExchangeOrder {
  symbol: string;
  side: Side;
  qty: number;
  priceUsd: number;
}

export interface ExchangeClient {
  // Return a conservative fee ceiling before an order reaches the venue.
  // A fill must never charge more than the estimate returned for its order.
  estimateFee(order: ExchangeOrder): number | Promise<number>;
  placeOrder(order: ExchangeOrder): Promise<Fill>;
  // Live mark-price for portfolio valuation. Real adapters hit the ticker
  // endpoint; MockExchange reads from its config.
  getPrice(symbol: string): Promise<number | null>;
}

export interface MockExchangeOptions {
  prices: Record<string, number>;
  feeBps: number; // basis points; 10 = 0.10%
}

export class MockExchange implements ExchangeClient {
  private prices: Record<string, number>;
  private feeBps: number;

  constructor(opts: MockExchangeOptions) {
    this.prices = { ...opts.prices };
    this.feeBps = opts.feeBps;
  }

  /** Update the synthetic price book (e.g. to simulate a move in tests). */
  setPrice(symbol: string, priceUsd: number): void {
    this.prices[symbol] = priceUsd;
  }

  estimateFee(order: ExchangeOrder): number {
    return bpsFee(order, this.feeBps);
  }

  async placeOrder(order: ExchangeOrder): Promise<Fill> {
    if (!(order.symbol in this.prices)) {
      throw new Error(`MockExchange has no quote for ${order.symbol}`);
    }
    return {
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      priceUsd: order.priceUsd,
      feeUsd: this.estimateFee(order),
    };
  }

  async getPrice(symbol: string): Promise<number | null> {
    return this.prices[symbol] ?? null;
  }
}
