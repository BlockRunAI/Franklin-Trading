import chalk from 'chalk';
import type { StrategyMode } from '../strategies/index.js';

const VALID_MODES: readonly StrategyMode[] = ['backtest', 'paper', 'live'];

export interface StrategyRunOptions {
  mode?: string;
  from?: string;
  to?: string;
}

function isStrategyMode(mode: string): mode is StrategyMode {
  return VALID_MODES.includes(mode as StrategyMode);
}

export function strategyRunCommand(strategyName: string, options: StrategyRunOptions): void {
  const mode = options.mode ?? 'backtest';
  if (!isStrategyMode(mode)) {
    console.error(chalk.red(`Unknown strategy mode: ${mode}`));
    console.error(`Valid modes: ${VALID_MODES.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.error(chalk.yellow('Strategy runner is M1 roadmap work and is not available yet.'));
  console.error(
    `Received strategy "${strategyName}" in ${mode} mode` +
      `${options.from ? ` from ${options.from}` : ''}` +
      `${options.to ? ` to ${options.to}` : ''}.`,
  );
  console.error(
    'Today, author artifacts with @blockrun/franklin-trading/strategy and use the interactive paper-trading tools from franklin-trading.',
  );
  process.exitCode = 1;
}
