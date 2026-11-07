import { describe, expect, it } from 'vitest';
import { checkDeliveryAgainstAcceptedOrder, exactProductMatch, normaliseGtin, type VerifiedFertiliserProduct } from './fertiliser-products';

const sample: VerifiedFertiliserProduct = { barcode: '4006381333931', productName: 'Test product only', sourceName: 'Example manufacturer', sourceUrl: 'https://example.com/technical-sheet', reviewedAt: '2026-11-07' };

describe('verified fertiliser code matching', () => {
  it('validates a real EAN check digit', () => {
    expect(normaliseGtin('4006381333931')).toBe('04006381333931');
    expect(normaliseGtin('4006381333932')).toBeNull();
    expect(normaliseGtin('NPK 18-6-12')).toBeNull();
  });
  it('requires an exact verified catalogue hit, never a fuzzy match', () => {
    expect(exactProductMatch('4006381333931', [sample])).toEqual(sample);
    expect(exactProductMatch('4006381333931', [])).toBeNull();
    expect(exactProductMatch('4006381333932', [sample])).toBeNull();
  });
  it('rejects duplicate catalogue rows rather than choosing arbitrarily', () => {
    expect(exactProductMatch('4006381333931', [sample, sample])).toBeNull();
  });
  it('does not equate a quote with a confirmed purchase order', () => {
    const order = { id: 'order-1', farmId: 'farm-a', productGtin: sample.barcode, orderedKg: 2000, alreadyReceivedKg: 500 } as const;
    const docket = { farmId: 'farm-a', orderId: order.id, productGtin: sample.barcode, receivedKg: 1000 };
    expect(checkDeliveryAgainstAcceptedOrder(docket, [])).toEqual({ status: 'blocked', reason: 'no_order' });
    expect(checkDeliveryAgainstAcceptedOrder(docket, [{ ...order, status: 'quoted' }])).toEqual({ status: 'blocked', reason: 'not_accepted' });
    expect(checkDeliveryAgainstAcceptedOrder(docket, [{ ...order, status: 'accepted' }])).toEqual({ status: 'matched', orderId: 'order-1', remainingAfterKg: 500 });
  });
  it('blocks cross-farm, wrong product, and over-delivery evidence', () => {
    const order = { id: 'o', farmId: 'one', status: 'accepted' as const, productGtin: sample.barcode, orderedKg: 1000, alreadyReceivedKg: 700 };
    const scanned = { farmId: 'one', orderId: 'o', productGtin: sample.barcode, receivedKg: 400 };
    expect(checkDeliveryAgainstAcceptedOrder(scanned, [order])).toEqual({ status: 'blocked', reason: 'over_delivery' });
    expect(checkDeliveryAgainstAcceptedOrder({ ...scanned, farmId: 'two' }, [order])).toEqual({ status: 'blocked', reason: 'farm_mismatch' });
    expect(checkDeliveryAgainstAcceptedOrder({ ...scanned, productGtin: '00000000000000' }, [order])).toEqual({ status: 'blocked', reason: 'product_mismatch' });
    expect(checkDeliveryAgainstAcceptedOrder({ ...scanned, receivedKg: NaN }, [order])).toEqual({ status: 'blocked', reason: 'invalid_quantity' });
  });
});
