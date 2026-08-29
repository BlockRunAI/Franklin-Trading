/**
 * TradingEngine — composes Portfolio + RiskEngine + ExchangeClient into the
 * single surface the Franklin capabilities call into.
 *
 * Order flow for a buy (sells mirror it):
 *  1. Fee-less local risk pass — malformed or obviously over-limit orders are
 *     refused before a future adapter spends money or rate-limit capacity on
 *     a fee quote.
 *  2. `exchange.estimateFee()` — a quote failure is a `blocked` outcome of
 *     kind `fee-quote`, never a thrown error.
 *  3. Fee-aware risk pass — `notional + fee` must fit cash and the caps.
 *  4. `exchange.placeOrder()` — a throw here means "not executed" (see the
 *     ExchangeClient contract) and is a `blocked` outcome of kind `venue`.
 *  5. Record-then-flag. Once `placeOrder` resolves, the venue has executed:
 *     the fill is ALWAYS booked into the Portfolio. Anything that disagrees
 *     with what the risk check approved — a fee above the ceiling, a
 *     quantity or price that drifted, a cap the canonical fill now breaches,
 *     a negative cash balance — is reported in `warnings` and journaled, not
 *     used to discard the fill. A post-execution rejection would leave real
 *     money at the venue that the local book does not know about, and the
 *     resulting tool error invites the model to buy again.
 *
 * The one post-execution throw left is an UNBOOKABLE fill — a side that is
 * not buy/sell, a symbol for another market, a NaN quantity. Nothing sane
 * can be recorded from that; the error names the clientOrderId to reconcile.
 *
 * `openPosition` and `closePosition` are serialised per engine: two calls in
 * flight against the same Portfolio would both pass risk on the same cash
 * snapshot and both settle.
 *
 * The engine holds no state itself beyond the injected dependencies and the
 * serialisation queue; that keeps the class easy to unit-test and lets us
 * swap the ExchangeClient for a real adapter without touching capability
 * plumbing.
 */

import { randomUUID } from 'node:crypto';

import type { ExchangeClient, ExchangeOrder } from './exchange.js';
import type { Fill, Portfolio } from './portfolio.js';
import type { RiskEngine } from './risk.js';
import { CASH_EPSILON_USD, FEE_TOLERANCE_USD, QTY_EPSILON, isNonNegativeFinite, isPositiveFinite } from './fees.js';
import { logger } from '../logger.js';

export interface OpenPositionRequest {
  symbol: string;
  qty: number;
  priceUsd: number;
}

export interface CloseRequest {
  symbol: string;
  qty?: number; // if omitted, closes the entire position
}

/**
 * Why an order did not reach the venue. The tool layer chooses its advice
 * to the model from this — "try a smaller qty" is right for `risk` and wrong
 * for everything else.
 */
export type BlockKind =
  | 'risk'       // the deterministic risk engine refused it
  | 'fee-quote'  // the adapter could not quote a fee (transient, not a sizing problem)
  | 'price'      // no usable mark price (closes only)
  | 'venue';     // the adapter rejected the submission before executing

export interface FilledOutcome {
  status: 'filled';
  fill: { symbol: string; qty: number; priceUsd: number; feeUsd: number; clientOrderId: string };
  /** Post-execution disagreements with what risk approved. Empty when the venue delivered exactly. */
  warnings: string[];
}

export type Outcome =
  | FilledOutcome
  | { status: 'blocked'; kind: BlockKind; reason: string }
  | { status: 'noop'; reason: string };

export interface TradingEngineDeps {
  portfolio: Portfolio;
  risk: RiskEngine;
  exchange: ExchangeClient;
}

type BlockedOutcome = Extract<Outcome, { status: 'blocked' }>;
const blocked = (kind: BlockKind, reason: string): BlockedOutcome => ({ status: 'blocked', kind, reason });

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Reasons a fill cannot be recorded at all. Returns `null` for a bookable
 * fill. Symbol comparison is case/whitespace-insensitive so a venue that
 * echoes `btc` for `BTC` is not treated as a different market.
 */
function unbookableFillProblem(fill: Fill, order: ExchangeOrder): string | null {
  if (!fill || typeof fill !== 'object') return 'fill is not an object';
  if (fill.side !== order.side) return `side is ${String(fill.side)}, expected ${order.side}`;
  if (typeof fill.symbol !== 'string' || normalizeSymbol(fill.symbol) !== normalizeSymbol(order.symbol)) {
    return `symbol is ${String(fill.symbol)}, expected ${order.symbol}`;
  }
  if (!isPositiveFinite(fill.qty)) return `quantity is ${String(fill.qty)}`;
  if (!isPositiveFinite(fill.priceUsd)) return `price is ${String(fill.priceUsd)}`;
  if (!isNonNegativeFinite(fill.feeUsd)) return `fee is ${String(fill.feeUsd)}`;
  return null;
}

/** Disagreements between the approved order and the delivered fill that are still bookable. */
function fillDeviationWarnings(fill: Fill, order: ExchangeOrder, feeCeilingUsd: number): string[] {
  const warnings: string[] = [];
  if (fill.feeUsd > feeCeilingUsd + FEE_TOLERANCE_USD) {
    warnings.push(
      `Exchange charged $${fill.feeUsd.toFixed(4)} in fees, above the approved estimate of $${feeCeilingUsd.toFixed(4)}`,
    );
  }
  if (Math.abs(fill.qty - order.qty) > QTY_EPSILON) {
    warnings.push(`Exchange filled ${fill.qty} ${order.symbol}, order was for ${order.qty}`);
  }
  if (Math.abs(fill.priceUsd - order.priceUsd) > CASH_EPSILON_USD) {
    warnings.push(`Exchange filled at $${fill.priceUsd}, order was priced at $${order.priceUsd}`);
  }
  return warnings;
}

export class TradingEngine {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private deps: TradingEngineDeps) {}

  /** Run `fn` after every previously queued order has settled. */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    // Keep the chain alive whether or not `run` rejects.
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async openPosition(req: OpenPositionRequest): Promise<Outcome> {
    return this.serialize(() => this.openPositionNow(req));
  }

  async closePosition(req: CloseRequest): Promise<Outcome> {
    return this.serialize(() => this.closePositionNow(req));
  }

  private async openPositionNow(req: OpenPositionRequest): Promise<Outcome> {
    const { portfolio, risk, exchange } = this.deps;
    const order: ExchangeOrder & { side: 'buy' } = {
      symbol: normalizeSymbol(String(req.symbol ?? '')),
      side: 'buy',
      qty: req.qty,
      priceUsd: req.priceUsd,
      clientOrderId: randomUUID(),
    };
    if (!order.symbol) return blocked('risk', 'Order symbol is empty');

    // 1. Reject malformed or obviously over-limit orders before a future
    //    adapter can spend money or rate-limit capacity on a fee quote.
    const localDecision = risk.check(portfolio, { ...order, feeUsd: 0 });
    if (!localDecision.allowed) {
      return blocked('risk', localDecision.reason ?? 'blocked by risk engine');
    }

    // 2. Fee ceiling from the venue.
    const quote = await this.quoteFee(order);
    if (quote.status === 'blocked') return quote;
    const feeUsd = quote.feeUsd;

    // 3. Fee-aware risk pass.
    const decision = risk.check(portfolio, { ...order, feeUsd });
    if (!decision.allowed) {
      return blocked('risk', decision.reason ?? 'blocked by risk engine');
    }

    // 4. Execute.
    const placed = await this.place(order);
    if (placed.status === 'blocked') return placed;
    const fill = placed.fill;

    // 5. Record-then-flag.
    this.assertBookable(fill, order);
    const warnings = fillDeviationWarnings(fill, order, feeUsd);
    const fillDecision = risk.check(portfolio, {
      symbol: fill.symbol,
      side: 'buy',
      qty: fill.qty,
      priceUsd: fill.priceUsd,
      feeUsd: fill.feeUsd,
    });
    if (!fillDecision.allowed) {
      warnings.push(`Fill breached pre-trade risk as delivered: ${fillDecision.reason ?? 'blocked by risk engine'}`);
    }
    return this.book(fill, order, warnings);
  }

  private async closePositionNow(req: CloseRequest): Promise<Outcome> {
    const { portfolio, risk, exchange } = this.deps;
    const symbol = normalizeSymbol(String(req.symbol ?? ''));
    const existing = symbol ? portfolio.getPosition(symbol) : undefined;
    if (!existing) {
      return { status: 'noop', reason: `No open ${symbol || req.symbol} position` };
    }
    const qty = req.qty ?? existing.qty;

    // Everything that can be decided locally is decided BEFORE the venue is
    // asked for a price or a fee: an oversell must never reach placeOrder.
    if (!isPositiveFinite(qty)) return blocked('risk', `Invalid order quantity: ${String(qty)}`);
    if (qty > existing.qty + QTY_EPSILON) {
      return blocked('risk', `Cannot sell ${qty} ${symbol}: only ${existing.qty} held`);
    }

    const price = await exchange.getPrice(symbol);
    if (price == null || !isPositiveFinite(price)) {
      return blocked('price', `Exchange returned no usable price for ${symbol}`);
    }

    const order: ExchangeOrder & { side: 'sell' } = {
      symbol,
      side: 'sell',
      qty,
      priceUsd: price,
      clientOrderId: randomUUID(),
    };

    const quote = await this.quoteFee(order);
    if (quote.status === 'blocked') return quote;
    const feeUsd = quote.feeUsd;

    const decision = risk.check(portfolio, { ...order, feeUsd });
    if (!decision.allowed) {
      return blocked('risk', decision.reason ?? 'blocked by risk engine');
    }

    const placed = await this.place(order);
    if (placed.status === 'blocked') return placed;
    const fill = placed.fill;

    this.assertBookable(fill, order);
    if (fill.qty > existing.qty + QTY_EPSILON) {
      // Not bookable either: the portfolio would refuse to sell more than it
      // holds. Same reconcile-by-id path as any other unbookable fill.
      this.unbookable(fill, order, `quantity ${fill.qty} exceeds the ${existing.qty} held`);
    }
    const warnings = fillDeviationWarnings(fill, order, feeUsd);
    return this.book(fill, order, warnings);
  }

  private async quoteFee(order: ExchangeOrder): Promise<{ status: 'ok'; feeUsd: number } | BlockedOutcome> {
    let feeUsd: unknown;
    try {
      feeUsd = await this.deps.exchange.estimateFee(order);
    } catch (error) {
      return blocked('fee-quote', `Unable to estimate exchange fee: ${errorMessage(error)}`);
    }
    if (!isNonNegativeFinite(feeUsd)) {
      return blocked('fee-quote', `Exchange returned an invalid fee estimate: ${String(feeUsd)}`);
    }
    return { status: 'ok', feeUsd };
  }

  private async place(order: ExchangeOrder): Promise<{ status: 'ok'; fill: Fill } | BlockedOutcome> {
    try {
      return { status: 'ok', fill: await this.deps.exchange.placeOrder(order) };
    } catch (error) {
      // Per the ExchangeClient contract a throw means the submission failed
      // BEFORE execution. Nothing was filled or charged.
      return blocked('venue', `Exchange rejected the order before executing: ${errorMessage(error)}`);
    }
  }

  private assertBookable(fill: Fill, order: ExchangeOrder): void {
    const problem = unbookableFillProblem(fill, order);
    if (problem) this.unbookable(fill, order, problem);
  }

  private unbookable(fill: Fill, order: ExchangeOrder, problem: string): never {
    // Leave an audit line that names the id, so the fill can be found at the
    // venue and reconciled by hand. This is the one place the engine gives up
    // after execution, and it must not be silent.
    logger.error(
      `[franklin] UNBOOKABLE FILL for ${order.side} ${order.qty} ${order.symbol} (clientOrderId ${order.clientOrderId}): ${problem}. ` +
      `Raw fill: ${JSON.stringify(fill)}. The venue may have executed this order — reconcile before trading again.`,
    );
    throw new Error(
      `Exchange returned an unbookable fill (${problem}). The venue may have executed this order — ` +
      `reconcile clientOrderId ${order.clientOrderId} before trading again. Do NOT retry blindly.`,
    );
  }

  private book(fill: Fill, order: ExchangeOrder, warnings: string[]): FilledOutcome {
    const { portfolio } = this.deps;
    portfolio.applyFill(fill);
    if (portfolio.cashUsd < -CASH_EPSILON_USD) {
      warnings.push(`Cash balance is negative after this fill: $${portfolio.cashUsd.toFixed(2)}`);
    }
    for (const w of warnings) {
      logger.warn(`[franklin] ${order.side} ${order.symbol} (clientOrderId ${order.clientOrderId}): ${w}`);
    }
    return {
      status: 'filled',
      fill: {
        symbol: fill.symbol,
        qty: fill.qty,
        priceUsd: fill.priceUsd,
        feeUsd: fill.feeUsd,
        clientOrderId: order.clientOrderId as string,
      },
      warnings,
    };
  }
}
