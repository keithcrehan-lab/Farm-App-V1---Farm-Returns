import { describe, expect, it, vi } from 'vitest';
import {
  parseUpcitemdb, parseOpenFacts, parseProductGuru,
  lookupAcrossFreeProviders, queryPublicProvider,
} from './public-product-lookup';

const code = '3017620422003';

describe('read-only public barcode identity suggestions', () => {
  it('retains provider attribution, not automatic verification', () => {
    const result = parseProductGuru({ ean: code, name: 'Nutella', brand: 'Nutella', verified: true, certainty: 85 }, code);
    expect(result.status).toBe('matched');
    if (result.status !== 'matched') throw new Error('Expected fixture match');
    expect(result.suggestion.name).toBe('Nutella');
    expect(result.suggestion.attributionName).toBe('ProductGuru');
    expect(result.suggestion).not.toHaveProperty('verified');
    expect(result.suggestion).not.toHaveProperty('npk');
    expect(result.suggestion).not.toHaveProperty('confidence');
  });
  it('rejects records for a different GTIN even when product title looks convincing', () => {
    expect(parseUpcitemdb({ code: 'OK', items: [{ ean: '4006381333931', title: 'Nutella' }] }, code).status).toBe('not_found');
    expect(parseOpenFacts({ status: 'success', product: { code: '4006381333931', product_name: 'Nutella' } }, code).status).toBe('not_found');
    expect(parseProductGuru({ ean: '4006381333931', name: 'Nutella' }, code).status).toBe('not_found');
  });
  it('accepts exact UPC/EAN equivalence and Open Facts v3 product', () => {
    const upc = parseUpcitemdb({ code: 'OK', items: [{ ean: code, title: 'Item', brand: 'Brand' }] }, code);
    expect(upc.status).toBe('matched');
    const off = parseOpenFacts({ status: 'success', result: { id: 'product_found' }, product: { code, product_name: 'Nutella', brands: 'Ferrero' } }, code);
    expect(off.status).toBe('matched');
  });
  it('returns three independent source outcomes and does not call APIs for invalid GTINs', async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      const text = String(url);
      const data = text.includes('upcitemdb')
        ? { code: 'OK', items: [{ ean: code, title: 'Nutella' }] }
        : text.includes('openfoodfacts')
          ? { status: 'success', product: { code, product_name: 'Nutella' } }
          : { ean: code, name: 'Nutella' };
      return new Response(JSON.stringify(data), { status: 200 });
    });
    const success = await lookupAcrossFreeProviders(code, { fetcher: fetcher as typeof fetch, throttle: false });
    expect(success.status).toBe('results');
    if (success.status === 'results') expect(success.providers.map((p) => p.status)).toEqual(['matched', 'matched', 'matched']);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await lookupAcrossFreeProviders('invalid', { fetcher: fetcher as typeof fetch, throttle: false })).toEqual({ status: 'invalid' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('survives a provider outage or rate limit without guessing a match', async () => {
    const unavailable = await queryPublicProvider('upcitemdb', code, { fetcher: vi.fn(async () => { throw new Error('offline'); }), throttle: false });
    expect(unavailable).toEqual({ source: 'upcitemdb', status: 'unavailable' });
    const limited = await queryPublicProvider('open_facts', code, { fetcher: vi.fn(async () => new Response(null, { status: 429 })), throttle: false });
    expect(limited).toEqual({ source: 'open_facts', status: 'rate_limited' });
  });
  it('does not accept an unrelated search result or missing product name', () => {
    expect(parseUpcitemdb({ code: 'OK', items: [{ ean: code, title: '' }] }, code).status).toBe('not_found');
    expect(parseOpenFacts({ status: 'failure', product: { code, product_name: 'False' } }, code).status).toBe('not_found');
    expect(parseProductGuru({ ean: code, brand: 'Unknown' }, code).status).toBe('not_found');
  });
});
