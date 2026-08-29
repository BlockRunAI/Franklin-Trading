/** Calculate a fee from order notional and basis points. */
export function bpsFee(order: { qty: number; priceUsd: number }, feeBps: number): number {
  if (!Number.isFinite(order.qty) || order.qty <= 0) {
    throw new RangeError(`Invalid order quantity: ${order.qty}`);
  }
  if (!Number.isFinite(order.priceUsd) || order.priceUsd <= 0) {
    throw new RangeError(`Invalid order price: ${order.priceUsd}`);
  }
  if (!Number.isFinite(feeBps) || feeBps < 0) {
    throw new RangeError(`Invalid fee rate: ${feeBps} bps`);
  }

  return (order.qty * order.priceUsd * feeBps) / 10_000;
}
