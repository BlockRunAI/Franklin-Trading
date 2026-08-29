/**
 * RiskEngine — pre-trade guardrails the agent must clear before an order
 * touches the exchange. Pure function style: the engine holds only config;
 * Portfolio state is passed in per call so the same engine is reusable.
 *
 * Guardrails enforced:
 *  - Input validation: qty, price and notional must be finite and positive;
 *    a buy's estimated fee must be finite and non-negative. Fails CLOSED —
 *    NaN can never pass a `>` comparison and slip through a cap.
 *  - Cash sufficiency for buys: notional + estimated exchange fee must fit
 *    the cash balance (compared at CASH_EPSILON_USD precision).
 *  - Per-position cap (USD notional any single symbol may hold)
 *  - Total exposure cap (sum of all open positions' notional)
 *  - Sells: the position must exist and the sale must not exceed it; an
 *    estimated fee, when supplied, must not consume the whole proceeds.
 *
 * Exit orders (sells of existing positions) bypass exposure caps — a paranoid
 * cap could otherwise trap the agent in a losing position it wants to exit.
 *
 * This is the documented last line of defense (docs/CONVICTIONS.md #5): the
 * LLM-facing tool validates too, but every order through TradingEngine —
 * buys AND sells — is re-evaluated here by code.
 */

import type { Portfolio } from './portfolio.js';
import type { ExchangeOrder } from './exchange.js';
import { CASH_EPSILON_USD, QTY_EPSILON, invalidNumberReason, isNonNegativeFinite } from './fees.js';

export interface RiskConfig {
  maxPositionUsd: number;
  maxTotalExposureUsd: number;
}

/**
 * A buy MUST carry the estimated fee — omitting it is a type error, not a
 * silent fee-blind check. A sell MAY carry one (the engine quotes it) so the
 * "fee eats the whole sale" case is caught before the order is placed.
 */
export type OrderRequest =
  | (Omit<ExchangeOrder, 'side'> & { side: 'buy'; feeUsd: number })
  | (Omit<ExchangeOrder, 'side'> & { side: 'sell'; feeUsd?: number });

export interface RiskDecision {
  allowed: boolean;
  reason?: string;
}

const block = (reason: string): RiskDecision => ({ allowed: false, reason });

export class RiskEngine {
  constructor(private config: RiskConfig) {}

  check(portfolio: Portfolio, order: OrderRequest): RiskDecision {
    const qtyReason = invalidNumberReason('order quantity', order.qty, 'positive');
    if (qtyReason) return block(qtyReason);
    const priceReason = invalidNumberReason('order price', order.priceUsd, 'positive');
    if (priceReason) return block(priceReason);
    const notional = order.qty * order.priceUsd;
    const notionalReason = invalidNumberReason('order notional', notional, 'positive');
    if (notionalReason) return block(notionalReason);

    if (order.side === 'sell') return this.checkSell(portfolio, order, notional);
    return this.checkBuy(portfolio, order, notional);
  }

  private checkSell(
    portfolio: Portfolio,
    order: Extract<OrderRequest, { side: 'sell' }>,
    notional: number,
  ): RiskDecision {
    const pos = portfolio.getPosition(order.symbol);
    if (!pos) return block(`No open ${order.symbol} position to sell`);
    if (order.qty > pos.qty + QTY_EPSILON) {
      return block(`Cannot sell ${order.qty} ${order.symbol}: only ${pos.qty} held`);
    }
    if (order.feeUsd !== undefined) {
      if (!isNonNegativeFinite(order.feeUsd)) return block(`Invalid estimated fee: ${order.feeUsd}`);
      if (order.feeUsd >= notional) {
        return block(
          `Estimated fee $${order.feeUsd.toFixed(2)} would consume the whole $${notional.toFixed(2)} sale — close a larger quantity or none`,
        );
      }
    }
    return { allowed: true };
  }

  private checkBuy(
    portfolio: Portfolio,
    order: Extract<OrderRequest, { side: 'buy' }>,
    notional: number,
  ): RiskDecision {
    const feeUsd = order.feeUsd;
    if (!isNonNegativeFinite(feeUsd)) return block(`Invalid estimated fee: ${feeUsd}`);
    const cashRequired = notional + feeUsd;

    if (cashRequired > portfolio.cashUsd + CASH_EPSILON_USD) {
      // The engine runs a fee-less pass before quoting the venue. Don't tell
      // the agent the fee is $0.00 on that pass — it would size the next
      // attempt to the cent and be blocked again by the real fee.
      const feeClause = feeUsd > 0
        ? ` including $${feeUsd.toFixed(2)} estimated fee`
        : ' before exchange fees';
      return block(
        `Insufficient cash: order needs $${cashRequired.toFixed(2)}${feeClause} but only $${portfolio.cashUsd.toFixed(2)} available`,
      );
    }

    // Projected position value after fill.
    const existing = portfolio.getPosition(order.symbol);
    const projectedPositionUsd = (existing ? existing.qty * order.priceUsd : 0) + notional;
    if (!Number.isFinite(projectedPositionUsd)) {
      return block(`Cannot evaluate ${order.symbol} exposure: portfolio state is not finite`);
    }
    if (projectedPositionUsd > this.config.maxPositionUsd) {
      return block(
        `Exceeds per-position cap: projected $${projectedPositionUsd.toFixed(2)} > cap $${this.config.maxPositionUsd.toFixed(2)}`,
      );
    }

    // Projected total exposure after fill. Marks all other positions at
    // their avg price (live marks would be nicer, but the engine is
    // intentionally pure and doesn't fetch).
    let otherExposure = 0;
    for (const p of portfolio.listPositions()) {
      if (p.symbol !== order.symbol) otherExposure += p.qty * p.avgPriceUsd;
    }
    const projectedTotalUsd = otherExposure + projectedPositionUsd;
    if (!Number.isFinite(projectedTotalUsd)) {
      return block('Cannot evaluate total exposure: portfolio state is not finite');
    }
    if (projectedTotalUsd > this.config.maxTotalExposureUsd) {
      return block(
        `Exceeds total exposure cap: projected $${projectedTotalUsd.toFixed(2)} > cap $${this.config.maxTotalExposureUsd.toFixed(2)}`,
      );
    }

    return { allowed: true };
  }
}
