import { describe, expect, it } from 'vitest';
import { GS1_FREE_LOOKUP_URL, prepareGs1FreeLookup } from './gs1-free-lookup';

describe('GS1 free manual validation', () => {
  it('gives the original barcode and canonical official GS1 page without claiming an automatic match', () => {
    expect(prepareGs1FreeLookup(' 4006381333931 ')).toEqual({
      status: 'ready_for_manual_lookup',
      gtin: '4006381333931',
      url: GS1_FREE_LOOKUP_URL,
    });
  });
  it('never treats checksum validity as proof that a registered product exists', () => {
    const result = prepareGs1FreeLookup('00000000000000');
    expect(result.status).toBe('ready_for_manual_lookup');
    expect(result).not.toHaveProperty('productName');
    expect(result).not.toHaveProperty('gs1Verified');
  });
  it('rejects non-GTIN text and invalid checksums', () => {
    expect(prepareGs1FreeLookup('18-6-12')).toEqual({ status: 'invalid_gtin' });
    expect(prepareGs1FreeLookup('4006381333932')).toEqual({ status: 'invalid_gtin' });
  });
});
