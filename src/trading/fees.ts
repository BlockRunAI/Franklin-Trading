/**
 * Fee math and the numeric guards shared by the trading layer.
 *
 * Every place that touches money (RiskEngine, Portfolio, the engine's fill
 * validation, the paper adapters) validates its inputs with the SAME
 * predicates so the rule cannot drift between call sites.
 */

/** Smallest quantity difference the portfolio treats as "the same". */
export const QTY_EPSILON = 1e-12;

/**
 * Cash comparisons happen at sub-cent precision. Every rendered surface
 * rounds to cents, and a cash balance that has drifted to 699.6999999999999
 * after three fills must still accept an order sized to the displayed
 * $699.70 — otherwise the agent is refused with a reason that reads
 * "needs $699.70 but only $699.70 available".
 */
export const CASH_EPSILON_USD = 1e-6;

/**
 * A fill's fee may exceed the approved estimate by at most this much before
 * it is flagged. Half a cent: enough to absorb a venue that rounds the fee
 * to the cent when the estimate did not, small enough that a real overcharge
 * is still caught.
 */
export const FEE_TOLERANCE_USD = 0.005;

export function isPositiveFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

export function isNonNegativeFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

/**
 * Return `null` when `value` is a finite number satisfying `min`, else the
 * reason string every caller renders. Callers that throw wrap it in a
 * RangeError; callers that return a decision put it in `reason`.
 */
export function invalidNumberReason(
  label: string,
  value: unknown,
  min: 'positive' | 'nonNegative',
): string | null {
  const ok = min === 'positive' ? isPositiveFinite(value) : isNonNegativeFinite(value);
  return ok ? null : `Invalid ${label}: ${String(value)}`;
}

export function assertNumber(label: string, value: unknown, min: 'positive' | 'nonNegative'): void {
  const reason = invalidNumberReason(label, value, min);
  if (reason) throw new RangeError(reason);
}

/** Exact fee from order notional and basis points. */
export function bpsFee(order: { qty: number; priceUsd: number }, feeBps: number): number {
  assertNumber('order quantity', order.qty, 'positive');
  assertNumber('order price', order.priceUsd, 'positive');
  assertNumber('fee rate', feeBps, 'nonNegative');
  return (order.qty * order.priceUsd * feeBps) / 10_000;
}

/**
 * Fee CEILING for `estimateFee()`: the exact bps fee rounded UP to the cent.
 * A venue that rounds its fee to the cent (up or to nearest), or computes it
 * on a cent-rounded notional, still lands at or below this number, so the
 * engine's fill-fee check is a real invariant rather than a float lottery.
 */
export function bpsFeeCeiling(order: { qty: number; priceUsd: number }, feeBps: number): number {
  return roundUpToCent(bpsFee(order, feeBps));
}

export function roundUpToCent(usd: number): number {
  // Nudge by a ULP-scale amount first so 6.4300000000000006 (a float
  // artefact of an exact 6.43) does not round up to 6.44.
  const cents = Math.ceil(usd * 100 - 1e-9);
  return cents <= 0 ? 0 : cents / 100; // `<= 0` also normalises -0 away
}
