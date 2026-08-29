/**
 * TradingEngine — composes Portfolio + RiskEngine + ExchangeClient into the
 * single surface the Franklin capabilities call into.
 *
 * Responsibilities:
 *  - Pre-trade risk check (refuse the order if it would breach caps).
 *  - Route the order to the Exchange (mock or real adapter).
 *  - Apply the resulting Fill to the Portfolio.
 *
 * The engine holds no state itself beyond the injected dependencies; that
 * keeps the class easy to unit-test and lets us swap the ExchangeClient for
 * a real adapter without touching capability plumbing.
 */

import type { ExchangeClient } from './mock-exchange.js';
import type { Fill, Portfolio } from './portfolio.js';
import type { RiskEngine } from './risk.js';

const FEE_COMPARISON_TOLERANCE_USD = 1e-9;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertAcceptableBuyFill(fill: Fill, symbol: string, estimatedFeeUsd: number): void {
  if (fill.symbol !== symbol || fill.side !== 'buy') {
    throw new Error(
      `Exchange returned mismatched fill: expected buy ${symbol}, received ${fill.side} ${fill.symbol}`,
    );
  }
  if (!Number.isFinite(fill.feeUsd) || fill.feeUsd < 0) {
    throw new Error(`Exchange returned invalid fill fee: ${fill.feeUsd}`);
  }
  if (fill.feeUsd > estimatedFeeUsd + FEE_COMPARISON_TOLERANCE_USD) {
    throw new Error(
      `Exchange fill fee $${fill.feeUsd} exceeds the approved estimate $${estimatedFeeUsd}`,
    );
  }
}

export interface OpenPositionRequest {
  symbol: string;
  qty: number;
  priceUsd: number;
}

export interface CloseRequest {
  symbol: string;
  qty?: number; // if omitted, closes the entire position
}

export type Outcome =
  | { status: 'filled'; fill: { symbol: string; qty: number; priceUsd: number; feeUsd: number } }
  | { status: 'blocked'; reason: string }
  | { status: 'noop'; reason: string };

export interface TradingEngineDeps {
  portfolio: Portfolio;
  risk: RiskEngine;
  exchange: ExchangeClient;
}

export class TradingEngine {
  constructor(private deps: TradingEngineDeps) {}

  async openPosition(req: OpenPositionRequest): Promise<Outcome> {
    const { portfolio, risk, exchange } = this.deps;
    const order = {
      symbol: req.symbol,
      side: 'buy' as const,
      qty: req.qty,
      priceUsd: req.priceUsd,
    };
    // Reject malformed or obviously over-limit orders before a future
    // adapter can spend money or rate-limit capacity on a fee quote.
    const localDecision = risk.check(portfolio, { ...order, feeUsd: 0 });
    if (!localDecision.allowed) {
      return { status: 'blocked', reason: localDecision.reason ?? 'blocked by risk engine' };
    }

    let feeUsd: number;
    try {
      feeUsd = await exchange.estimateFee(order);
    } catch (error) {
      return {
        status: 'blocked',
        reason: `Unable to estimate exchange fee: ${errorMessage(error)}`,
      };
    }
    const decision = risk.check(portfolio, {
      ...order,
      feeUsd,
    });
    if (!decision.allowed) {
      return { status: 'blocked', reason: decision.reason ?? 'blocked by risk engine' };
    }

    const fill = await exchange.placeOrder(order);
    assertAcceptableBuyFill(fill, order.symbol, feeUsd);

    // Re-evaluate the canonical fill before mutating accounting. This also
    // catches unexpected quantity/price changes that would breach cash or
    // exposure limits even when the fee stayed below its ceiling.
    const fillDecision = risk.check(portfolio, {
      symbol: fill.symbol,
      side: 'buy',
      qty: fill.qty,
      priceUsd: fill.priceUsd,
      feeUsd: fill.feeUsd,
    });
    if (!fillDecision.allowed) {
      throw new Error(
        `Exchange fill violates pre-trade risk: ${fillDecision.reason ?? 'blocked by risk engine'}`,
      );
    }

    portfolio.applyFill(fill);
    return {
      status: 'filled',
      fill: {
        symbol: fill.symbol,
        qty: fill.qty,
        priceUsd: fill.priceUsd,
        feeUsd: fill.feeUsd,
      },
    };
  }

  async closePosition(req: CloseRequest): Promise<Outcome> {
    const { portfolio, exchange } = this.deps;
    const existing = portfolio.getPosition(req.symbol);
    if (!existing) {
      return { status: 'noop', reason: `No open ${req.symbol} position` };
    }
    const qty = req.qty ?? existing.qty;
    const price = (await exchange.getPrice(req.symbol));
    if (price == null) {
      return { status: 'blocked', reason: `Exchange returned no price for ${req.symbol}` };
    }
    const fill = await exchange.placeOrder({
      symbol: req.symbol,
      side: 'sell',
      qty,
      priceUsd: price,
    });
    portfolio.applyFill(fill);
    return {
      status: 'filled',
      fill: {
        symbol: fill.symbol,
        qty: fill.qty,
        priceUsd: fill.priceUsd,
        feeUsd: fill.feeUsd,
      },
    };
  }
}
