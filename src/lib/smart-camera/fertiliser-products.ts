/** Exact product lookup. Vision/OCR guesses never become product identities. */
export interface VerifiedFertiliserProduct {
  barcode: string;
  productName: string;
  /** Manufacturer/supplier data source, recorded by the catalogue curator. */
  sourceName: string;
  sourceUrl: string;
  reviewedAt: string;
  /** Optional catalogue label, not an inferred nutrient composition. */
  declaredAnalysis?: string;
}

/** EAN-8, UPC-A, EAN-13, or GTIN-14 with verified GS1 check digit. */
export function normaliseGtin(input: string): string | null {
  const value = input.trim();
  if (!/^\d+$/.test(value) || ![8, 12, 13, 14].includes(value.length)) return null;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  let total = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    total += digits[i] * weight;
  }
  if ((10 - (total % 10)) % 10 !== check) return null;
  return value.padStart(14, '0');
}

export function exactProductMatch(code: string, catalogue: readonly VerifiedFertiliserProduct[]): VerifiedFertiliserProduct | null {
  const key = normaliseGtin(code);
  if (!key) return null;
  const matching = catalogue.filter((product) => normaliseGtin(product.barcode) === key);
  // Duplicated/conflicting catalogue rows are never silently resolved by first match.
  return matching.length === 1 ? matching[0] : null;
}

/** Pure preview only; NEVER writes stock or treats a quote as an accepted order. */
export interface ConfirmedPurchaseOrder {
  id: string;
  farmId: string;
  status: 'accepted' | 'requested' | 'quoted' | 'cancelled';
  productGtin: string;
  orderedKg: number;
  alreadyReceivedKg: number;
}
export interface ScannedDeliveryEvidence {
  farmId: string;
  orderId: string;
  productGtin: string;
  receivedKg: number;
}

export type DeliveryCheck =
  | { status: 'matched'; orderId: string; remainingAfterKg: number }
  | { status: 'blocked'; reason: 'no_order' | 'not_accepted' | 'farm_mismatch' | 'product_mismatch' | 'invalid_quantity' | 'over_delivery' };

/** Needs an actual accepted order and separately verified docket quantities. */
export function checkDeliveryAgainstAcceptedOrder(
  evidence: ScannedDeliveryEvidence,
  orders: readonly ConfirmedPurchaseOrder[],
): DeliveryCheck {
  const order = orders.find((candidate) => candidate.id === evidence.orderId);
  if (!order) return { status: 'blocked', reason: 'no_order' };
  if (order.farmId !== evidence.farmId) return { status: 'blocked', reason: 'farm_mismatch' };
  if (order.status !== 'accepted') return { status: 'blocked', reason: 'not_accepted' };
  const product = normaliseGtin(evidence.productGtin);
  if (!product || product !== normaliseGtin(order.productGtin)) {
    return { status: 'blocked', reason: 'product_mismatch' };
  }
  if (![evidence.receivedKg, order.orderedKg, order.alreadyReceivedKg].every(Number.isFinite)
    || evidence.receivedKg <= 0 || order.orderedKg <= 0 || order.alreadyReceivedKg < 0) {
    return { status: 'blocked', reason: 'invalid_quantity' };
  }
  const remaining = order.orderedKg - order.alreadyReceivedKg - evidence.receivedKg;
  if (remaining < 0) return { status: 'blocked', reason: 'over_delivery' };
  return { status: 'matched', orderId: order.id, remainingAfterKg: remaining };
}
