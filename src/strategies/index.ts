export type StrategyMode = 'backtest' | 'paper' | 'live';

export interface StrategyMarketContext {
  price(instrument: string): Promise<number>;
  fundingRate(instrument: string): Promise<number>;
  ohlcv?(instrument: string, days?: number): Promise<readonly number[]>;
}

export interface StrategySignalContext {
  mode: StrategyMode;
  now: Date;
  market: StrategyMarketContext;
}

export interface StrategyRisk {
  maxNotionalUsd?: number;
  maxDrawdownPct?: number;
  killSwitch?: boolean;
  [key: string]: unknown;
}

export interface StrategySchedule {
  every: string;
  [key: string]: unknown;
}

export interface StrategyDefinition<
  TSignal = unknown,
  TContext extends StrategySignalContext = StrategySignalContext,
> {
  name: string;
  universe: readonly string[];
  signal(ctx: TContext): TSignal | null | Promise<TSignal | null>;
  risk?: StrategyRisk;
  schedule?: StrategySchedule;
  metadata?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (value == null) {
    throw new Error(`Strategy ${field} is required.`);
  }
  if (typeof value !== 'string') {
    throw new Error(`Strategy ${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Strategy ${field} is required.`);
  }
  return trimmed;
}

function assertPositiveNumber(value: unknown, field: string): void {
  if (value == null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Strategy ${field} must be a positive finite number.`);
  }
}

/**
 * defineStrategy is the stable author-facing DSL entry point. The runtime is
 * still evolving, but package consumers can already import this helper to
 * validate and type a strategy artifact consistently.
 */
export function defineStrategy<
  TSignal = unknown,
  TContext extends StrategySignalContext = StrategySignalContext,
>(
  strategy: StrategyDefinition<TSignal, TContext>,
): Readonly<StrategyDefinition<TSignal, TContext>> {
  if (!isRecord(strategy)) {
    throw new Error('Strategy definition is required.');
  }

  const name = normalizeRequiredString(strategy.name, 'name');

  if (!Array.isArray(strategy.universe) || strategy.universe.length === 0) {
    throw new Error('Strategy universe must include at least one instrument.');
  }
  const seen = new Set<string>();
  const universe = strategy.universe.map((instrument, index) => {
    if (typeof instrument !== 'string') {
      throw new Error(`Strategy universe[${index}] must be a string.`);
    }
    const trimmed = instrument.trim();
    if (!trimmed) {
      throw new Error('Strategy universe cannot include empty instruments.');
    }
    if (seen.has(trimmed)) {
      throw new Error(`Strategy universe cannot include duplicate instrument: ${trimmed}.`);
    }
    seen.add(trimmed);
    return trimmed;
  });

  if (typeof strategy.signal !== 'function') {
    throw new Error('Strategy signal must be a function.');
  }

  let risk: Readonly<StrategyRisk> | undefined;
  if (strategy.risk !== undefined) {
    if (!isRecord(strategy.risk)) {
      throw new Error('Strategy risk must be an object.');
    }
    assertPositiveNumber(strategy.risk.maxNotionalUsd, 'risk.maxNotionalUsd');
    assertPositiveNumber(strategy.risk.maxDrawdownPct, 'risk.maxDrawdownPct');
    if (strategy.risk.killSwitch != null && typeof strategy.risk.killSwitch !== 'boolean') {
      throw new Error('Strategy risk.killSwitch must be a boolean when provided.');
    }
    risk = Object.freeze({ ...strategy.risk });
  }

  let schedule: Readonly<StrategySchedule> | undefined;
  if (strategy.schedule !== undefined) {
    if (!isRecord(strategy.schedule)) {
      throw new Error('Strategy schedule must be an object.');
    }
    const every = normalizeRequiredString(strategy.schedule.every, 'schedule.every');
    schedule = Object.freeze({ ...strategy.schedule, every });
  }

  let metadata: Readonly<Record<string, unknown>> | undefined;
  if (strategy.metadata !== undefined) {
    if (!isRecord(strategy.metadata)) {
      throw new Error('Strategy metadata must be an object.');
    }
    metadata = Object.freeze({ ...strategy.metadata });
  }

  return Object.freeze({
    ...strategy,
    name,
    universe: Object.freeze(universe),
    ...(risk ? { risk } : {}),
    ...(schedule ? { schedule } : {}),
    ...(metadata ? { metadata } : {}),
  });
}
