/**
 * RiskEngine — pre-trade guardrails the agent must clear before an order
 * touches the exchange. Pure function style: the engine holds only config;
 * Portfolio state is passed in per call so the same engine is reusable.
 *
 * Guardrails enforced (MVP):
 *  - Per-position cap (USD notional any single symbol may hold)
 *  - Total exposure cap (sum of all open positions' notional)
 *  - Cash sufficiency (can't buy what you can't pay for)
 *  - Sell integrity handled by Portfolio itself (no open position → throws)
 *
 * Exit orders (sells of existing positions) bypass exposure caps — a paranoid
 * cap could otherwise trap the agent in a losing position it wants to exit.
 */

import type { Portfolio } from './portfolio.js';

export interface RiskConfig {
  maxPositionUsd: number;
  maxTotalExposureUsd: number;
}

interface BaseOrderRequest {
  symbol: string;
  qty: number;
  priceUsd: number;
}

export type OrderRequest =
  | (BaseOrderRequest & { side: 'buy'; feeUsd: number })
  | (BaseOrderRequest & { side: 'sell'; feeUsd?: never });

export interface RiskDecision {
  allowed: boolean;
  reason?: string;
}

export class RiskEngine {
  constructor(private config: RiskConfig) {}

  check(portfolio: Portfolio, order: OrderRequest): RiskDecision {
    if (!Number.isFinite(order.qty) || order.qty <= 0) {
      return { allowed: false, reason: `Invalid order quantity: ${order.qty}` };
    }
    if (!Number.isFinite(order.priceUsd) || order.priceUsd <= 0) {
      return { allowed: false, reason: `Invalid order price: ${order.priceUsd}` };
    }
    const notional = order.qty * order.priceUsd;
    if (!Number.isFinite(notional) || notional <= 0) {
      return { allowed: false, reason: `Invalid order notional: ${notional}` };
    }

    // Sells of existing positions are always permitted; exposure caps are
    // entry-side only, and Portfolio.applyFill enforces that we don't sell
    // more than we hold.
    if (order.side === 'sell') {
      const pos = portfolio.getPosition(order.symbol);
      if (!pos) {
        return { allowed: false, reason: `No open ${order.symbol} position to sell` };
      }
      return { allowed: true };
    }

    const feeUsd = order.feeUsd;
    if (!Number.isFinite(feeUsd) || feeUsd < 0) {
      return {
        allowed: false,
        reason: `Invalid estimated fee: ${feeUsd}`,
      };
    }
    const cashRequired = notional + feeUsd;

    if (cashRequired > portfolio.cashUsd) {
      return {
        allowed: false,
        reason: `Insufficient cash: order needs $${cashRequired.toFixed(2)} including $${feeUsd.toFixed(2)} estimated fee but only $${portfolio.cashUsd.toFixed(2)} available`,
      };
    }

    // Projected position value after fill.
    const existing = portfolio.getPosition(order.symbol);
    const projectedPositionUsd = (existing ? existing.qty * order.priceUsd : 0) + notional;
    if (projectedPositionUsd > this.config.maxPositionUsd) {
      return {
        allowed: false,
        reason: `Exceeds per-position cap: projected $${projectedPositionUsd.toFixed(2)} > cap $${this.config.maxPositionUsd.toFixed(2)}`,
      };
    }

    // Projected total exposure after fill. Marks all other positions at
    // their avg price (live marks would be nicer, but the engine is
    // intentionally pure and doesn't fetch).
    let otherExposure = 0;
    for (const p of portfolio.listPositions()) {
      if (p.symbol !== order.symbol) otherExposure += p.qty * p.avgPriceUsd;
    }
    const projectedTotalUsd = otherExposure + projectedPositionUsd;
    if (projectedTotalUsd > this.config.maxTotalExposureUsd) {
      return {
        allowed: false,
        reason: `Exceeds total exposure cap: projected $${projectedTotalUsd.toFixed(2)} > cap $${this.config.maxTotalExposureUsd.toFixed(2)}`,
      };
    }

    return { allowed: true };
  }
}
