/**
 * Paper-trading Portfolio.
 *
 * Tracks cash, positions, and P&L as the agent executes trades. Pure in-memory
 * math — an Exchange (mock or real) produces Fill events; Portfolio applies
 * them. Persistence is handled separately in store.ts so tests don't touch disk.
 *
 * This is the execution substrate for Franklin's Trading Agent vertical —
 * the first place where "the AI agent with a wallet" actually makes autonomous
 * economic decisions and carries real P&L. No live-exchange integration here
 * yet; MockExchange (mock-exchange.ts) gives deterministic fills for testing,
 * and a real ExchangeClient adapter can be dropped in later against the same
 * Fill contract.
 */

import { QTY_EPSILON, assertNumber, isPositiveFinite } from './fees.js';

export type Side = 'buy' | 'sell';

export interface Fill {
  symbol: string;
  side: Side;
  qty: number;
  priceUsd: number;
  /** Fee actually charged by the venue, USD. Required: a missing fee is a bug, not $0. */
  feeUsd: number;
  /** Echo of the order's idempotency key when the adapter supports one. */
  clientOrderId?: string;
}

export interface PortfolioSnapshot {
  cashUsd: number;
  realizedPnlUsd: number;
  positions: Position[];
}

export interface Position {
  symbol: string;
  qty: number;
  avgPriceUsd: number;
}

export interface PortfolioOptions {
  startingCashUsd: number;
}

export interface MarketSnapshot {
  equityUsd: number;
  cashUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  positions: Array<Position & { markUsd: number; unrealizedPnlUsd: number }>;
}

export class Portfolio {
  cashUsd: number;
  realizedPnlUsd = 0;
  private positions = new Map<string, Position>();

  constructor(opts: PortfolioOptions) {
    assertNumber('starting cash', opts.startingCashUsd, 'nonNegative');
    this.cashUsd = opts.startingCashUsd;
  }

  /**
   * Validate an untrusted snapshot (a JSON file the agent's own Write tool
   * can edit) before it is allowed to become portfolio state. Returns the
   * first problem found, or `null` when the shape is sound. NaN / Infinity
   * anywhere here would silently disarm every RiskEngine cap, because a
   * non-finite projected exposure can never exceed a cap.
   */
  static validateSnapshot(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return 'snapshot is not an object';
    const snap = raw as Record<string, unknown>;
    // Cash may legitimately be negative (a fill the venue delivered above the
    // approved estimate is still booked — see TradingEngine); what it may
    // not be is NaN or ±Infinity.
    if (typeof snap.cashUsd !== 'number' || !Number.isFinite(snap.cashUsd)) {
      return `Invalid cashUsd: ${String(snap.cashUsd)}`;
    }
    if (typeof snap.realizedPnlUsd !== 'number' || !Number.isFinite(snap.realizedPnlUsd)) {
      return `Invalid realizedPnlUsd: ${String(snap.realizedPnlUsd)}`;
    }
    if (!Array.isArray(snap.positions)) return 'positions is not an array';
    const seen = new Set<string>();
    for (const p of snap.positions as unknown[]) {
      if (!p || typeof p !== 'object') return 'position entry is not an object';
      const pos = p as Record<string, unknown>;
      if (typeof pos.symbol !== 'string' || !pos.symbol.trim()) return `Invalid position symbol: ${String(pos.symbol)}`;
      if (seen.has(pos.symbol)) return `Duplicate position: ${pos.symbol}`;
      seen.add(pos.symbol);
      if (!isPositiveFinite(pos.qty)) return `Invalid ${pos.symbol} qty: ${String(pos.qty)}`;
      if (!isPositiveFinite(pos.avgPriceUsd)) return `Invalid ${pos.symbol} avgPriceUsd: ${String(pos.avgPriceUsd)}`;
    }
    return null;
  }

  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }

  listPositions(): Position[] {
    return [...this.positions.values()];
  }

  /** Serializable snapshot for persistence; paired with `restore()`. */
  snapshot(): PortfolioSnapshot {
    return {
      cashUsd: this.cashUsd,
      realizedPnlUsd: this.realizedPnlUsd,
      positions: this.listPositions().map((p) => ({ ...p })),
    };
  }

  /** Rehydrate state from a prior snapshot; overwrites all current fields. */
  restore(snap: PortfolioSnapshot): void {
    const problem = Portfolio.validateSnapshot(snap);
    if (problem) throw new RangeError(`Refusing to restore portfolio: ${problem}`);
    this.cashUsd = snap.cashUsd;
    this.realizedPnlUsd = snap.realizedPnlUsd;
    this.positions.clear();
    for (const p of snap.positions) this.positions.set(p.symbol, { ...p });
  }

  applyFill(fill: Fill): void {
    // Fills arrive from adapters as runtime data, not TypeScript — validate
    // the shape, including `side`, so a malformed fill can neither open a
    // phantom position nor be booked as a sale by falling into an `else`.
    if (fill.side !== 'buy' && fill.side !== 'sell') {
      throw new RangeError(`Invalid fill side: ${String(fill.side)}`);
    }
    if (typeof fill.symbol !== 'string' || !fill.symbol.trim()) {
      throw new RangeError(`Invalid fill symbol: ${String(fill.symbol)}`);
    }
    assertNumber('fill quantity', fill.qty, 'positive');
    assertNumber('fill price', fill.priceUsd, 'positive');
    assertNumber('fill fee', fill.feeUsd, 'nonNegative');

    const fee = fill.feeUsd;
    const notional = fill.qty * fill.priceUsd;

    if (fill.side === 'buy') {
      const existing = this.positions.get(fill.symbol);
      if (!existing) {
        this.positions.set(fill.symbol, {
          symbol: fill.symbol,
          qty: fill.qty,
          avgPriceUsd: fill.priceUsd,
        });
      } else {
        // Weighted-average price update.
        const totalQty = existing.qty + fill.qty;
        const totalCost = existing.qty * existing.avgPriceUsd + notional;
        existing.qty = totalQty;
        existing.avgPriceUsd = totalCost / totalQty;
      }
      this.cashUsd -= notional + fee;
    } else {
      // sell: close or reduce existing position, realize P&L against avg price
      const existing = this.positions.get(fill.symbol);
      if (!existing) {
        throw new Error(`Cannot sell ${fill.symbol}: no open position`);
      }
      if (fill.qty > existing.qty + QTY_EPSILON) {
        throw new Error(
          `Cannot sell ${fill.qty} ${fill.symbol}: only ${existing.qty} held`,
        );
      }
      const realized = fill.qty * (fill.priceUsd - existing.avgPriceUsd) - fee;
      this.realizedPnlUsd += realized;
      existing.qty -= fill.qty;
      this.cashUsd += notional - fee;
      if (existing.qty <= QTY_EPSILON) {
        this.positions.delete(fill.symbol);
      }
    }
  }

  /**
   * Value the portfolio against a live price table. Callers supply the marks
   * (e.g. from TradingSignal or a live feed) so this stays pure and testable.
   * Symbols with no mark are valued at avgPriceUsd (zero unrealized P&L).
   */
  markToMarket(priceTable: Record<string, number>): MarketSnapshot {
    let unrealized = 0;
    let marketValue = 0;
    const positions = this.listPositions().map((p) => {
      const mark = priceTable[p.symbol] ?? p.avgPriceUsd;
      const pnl = p.qty * (mark - p.avgPriceUsd);
      unrealized += pnl;
      marketValue += p.qty * mark;
      return { ...p, markUsd: mark, unrealizedPnlUsd: pnl };
    });
    return {
      equityUsd: this.cashUsd + marketValue,
      cashUsd: this.cashUsd,
      unrealizedPnlUsd: unrealized,
      realizedPnlUsd: this.realizedPnlUsd,
      positions,
    };
  }
}
