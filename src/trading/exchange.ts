/**
 * ExchangeClient — the seam every venue adapter implements.
 *
 * This contract lives in its own module because production code (the
 * TradingEngine, LiveExchange) depends on it; it is not a property of the
 * mock. MockExchange and LiveExchange are two implementations; a real
 * Coinbase / Kraken / Hyperliquid adapter is a third and touches nothing
 * else.
 *
 * The one behavioural rule adapter authors must honour:
 *
 *   `estimateFee()` returns a CEILING, not an expectation.
 *
 * The engine approves an order against `notional + estimateFee()`. A fill
 * that charges more than the ceiling is still booked (the venue already
 * executed it — see TradingEngine for why a post-execution rejection is
 * never safe), but it is surfaced as a `warnings` entry on the outcome and
 * written to the trade journal. Return a rounded-up, margin-inclusive number
 * so that never happens in normal operation.
 */

import type { Fill, Side } from './portfolio.js';

export interface ExchangeOrder {
  symbol: string;
  side: Side;
  qty: number;
  priceUsd: number;
  /**
   * Caller-generated idempotency key. Adapters that talk to a real venue
   * MUST forward it as the venue's client order id so a retried submission
   * after a timeout cannot fill twice. Paper adapters echo it on the fill.
   */
  clientOrderId?: string;
}

export interface ExchangeClient {
  /**
   * Conservative fee ceiling for `order`, in USD, quoted BEFORE the order
   * reaches the venue. May be sync or async (a real adapter will usually
   * hit a fee-tier endpoint). Must never return less than the fee the venue
   * will actually charge for this order shape.
   */
  estimateFee(order: ExchangeOrder): number | Promise<number>;
  /**
   * Execute the order and return the canonical fill. `fill.feeUsd` is the
   * fee actually charged. A thrown error is interpreted by the engine as
   * "submission failed before execution"; an adapter that cannot tell
   * whether the venue executed (timeout after submit) must NOT throw — it
   * must resolve the order state via `clientOrderId` first.
   */
  placeOrder(order: ExchangeOrder): Promise<Fill>;
  /**
   * Live mark price for `symbol`, or `null` when no usable quote exists.
   * A usable quote is a finite number > 0; adapters must not return 0 for
   * delisted or stale markets.
   */
  getPrice(symbol: string): Promise<number | null>;
}
