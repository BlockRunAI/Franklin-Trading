/**
 * MockExchange — deterministic in-memory exchange used by tests and dev mode.
 *
 * Implements the same `ExchangeClient` contract (src/trading/exchange.ts) a
 * real adapter would, so the agent flow can be verified end-to-end without
 * hitting a network or placing real orders. Fills land at the requested
 * price (no slippage) with a configured taker fee in basis points; no
 * latency is simulated.
 *
 * The fee it CHARGES is the exact bps fee; the fee it ESTIMATES is that
 * number rounded up to the cent — the same ceiling/actual split a real venue
 * exhibits, so the engine's fill-fee invariant is exercised honestly here.
 */

import type { Fill } from './portfolio.js';
import type { ExchangeClient, ExchangeOrder } from './exchange.js';
import { bpsFee, bpsFeeCeiling } from './fees.js';

// Back-compat: the contract used to be declared here.
export type { ExchangeClient, ExchangeOrder } from './exchange.js';

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
    return bpsFeeCeiling(order, this.feeBps);
  }

  async placeOrder(order: ExchangeOrder): Promise<Fill> {
    if (!(order.symbol in this.prices)) {
      throw new Error(`MockExchange has no quote for ${order.symbol}`);
    }
    return paperFill(order, bpsFee(order, this.feeBps));
  }

  async getPrice(symbol: string): Promise<number | null> {
    const p = this.prices[symbol];
    return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
  }
}

/** Fill construction shared by the paper adapters: echo the order, attach the fee. */
export function paperFill(order: ExchangeOrder, feeUsd: number): Fill {
  return {
    symbol: order.symbol,
    side: order.side,
    qty: order.qty,
    priceUsd: order.priceUsd,
    feeUsd,
    ...(order.clientOrderId ? { clientOrderId: order.clientOrderId } : {}),
  };
}
