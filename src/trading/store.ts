/**
 * Portfolio persistence. Stored as JSON alongside the rest of Franklin's
 * per-user state under `~/.blockrun/portfolio.json` by default. Read/write
 * errors never throw — a missing or corrupt file just returns `null` so the
 * agent can fall back to a fresh portfolio rather than refusing to start.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { Portfolio } from './portfolio.js';
import { logger } from '../logger.js';

export function savePortfolio(pf: Portfolio, filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(pf.snapshot(), null, 2), 'utf-8');
}

export function loadPortfolio(filePath: string): Portfolio | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    // `typeof === 'number'` is not enough: JSON.parse('1e999') is Infinity,
    // and an Infinity cash balance or a NaN position quantity silently passes
    // every RiskEngine cap. The file is writable by the agent's own tools, so
    // it is untrusted input.
    const problem = Portfolio.validateSnapshot(raw);
    if (problem) {
      logger.warn(`[franklin] ignoring ${filePath}: ${problem} — starting from a fresh portfolio`);
      return null;
    }
    const pf = new Portfolio({ startingCashUsd: 0 });
    pf.restore(raw);
    return pf;
  } catch (err) {
    // Corrupt JSON — start fresh rather than crash, but say so.
    logger.warn(`[franklin] ignoring ${filePath}: ${err instanceof Error ? err.message : String(err)} — starting from a fresh portfolio`);
    return null;
  }
}
