/**
 * Experimental, read-only barcode lookup across public product-data APIs.
 * A product suggestion is NOT manufacturer verification and never grants
 * permission to create stock/order/medicine records or infer NPK content.
 * Data remains transient and providers are attributed individually.
 */
import { normaliseGtin } from './fertiliser-products';

export const PUBLIC_PRODUCT_SOURCES = ['upcitemdb', 'open_facts', 'productguru'] as const;
export type PublicProductSource = (typeof PUBLIC_PRODUCT_SOURCES)[number];
export interface PublicProductSuggestion {
  source: PublicProductSource;
  name: string;
  brand?: string;
  size?: string;
  category?: string;
  description?: string;
  /** These are fixed provider attribution links, not URL data from an API. */
  attributionUrl: string;
  attributionName: string;
  disclosure: string;
}
export type PublicProviderResult =
  | { status: 'matched'; source: PublicProductSource; suggestion: PublicProductSuggestion }
  | { status: 'not_found' | 'unavailable' | 'rate_limited'; source: PublicProductSource };
export type PublicBarcodeLookupResult =
  | { status: 'invalid' | 'not_signed_in' }
  | { status: 'results'; gtin: string; providers: PublicProviderResult[] };

const ATTRIBUTION = {
  upcitemdb: { attributionName: 'UPCitemdb', attributionUrl: 'https://www.upcitemdb.com/api/', disclosure: 'Third-party product listing; accuracy is not guaranteed.' },
  open_facts: { attributionName: 'Open Food Facts / Open Products Facts', attributionUrl: 'https://world.openfoodfacts.org/', disclosure: 'Community-maintained open data (ODbL); attribution and share-alike rules apply to reuse.' },
  productguru: { attributionName: 'ProductGuru', attributionUrl: 'https://myproduct.guru/data', disclosure: 'Aggregated listing; may contain AI-estimated information. Data: ProductGuru (CC BY 4.0 where stated).' },
} satisfies Record<PublicProductSource, { attributionName: string; attributionUrl: string; disclosure: string }>;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function str(value: unknown, max = 200): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}
function matched(source: PublicProductSource, name?: string, brand?: string, size?: string, category?: string, description?: string): PublicProviderResult {
  if (!name) return { source, status: 'not_found' };
  return { source, status: 'matched', suggestion: { source, name, ...(brand ? { brand } : {}), ...(size ? { size } : {}), ...(category ? { category } : {}), ...(description ? { description } : {}), ...ATTRIBUTION[source] } };
}
/** Reject even a plausible product title unless the response identifies the requested exact GTIN. */
function equalGtin(actual: unknown, input: string): boolean {
  return typeof actual === 'string' && normaliseGtin(actual) !== null && normaliseGtin(actual) === normaliseGtin(input);
}
export function parseUpcitemdb(body: unknown, input: string): PublicProviderResult {
  const root = object(body);
  if (!root || root.code !== 'OK' || !Array.isArray(root.items)) return { status: 'not_found', source: 'upcitemdb' };
  const item = root.items.map(object).find((row) => row && [row.gtin, row.ean, row.upc].some((code) => equalGtin(code, input)));
  if (!item) return { status: 'not_found', source: 'upcitemdb' };
  return matched('upcitemdb', str(item.title), str(item.brand), str(item.size), str(item.category), str(item.description, 350));
}
export function parseOpenFacts(body: unknown, input: string): PublicProviderResult {
  const root = object(body);
  const product = object(root?.product);
  if (!root || !product || !equalGtin(product.code ?? root.code, input)) return { status: 'not_found', source: 'open_facts' };
  if (root.status === 'failure' || root.status === 0 || object(root.result)?.id === 'product_not_found') return { status: 'not_found', source: 'open_facts' };
  return matched('open_facts', str(product.product_name) ?? str(product.product_name_en), str(product.brands), str(product.quantity), str(product.categories));
}
export function parseProductGuru(body: unknown, input: string): PublicProviderResult {
  const root = object(body);
  if (!root || !equalGtin(root.ean, input)) return { status: 'not_found', source: 'productguru' };
  // The provider's own `verified` flag is not equivalent to manufacturer verification.
  return matched('productguru', str(root.name), str(root.brand), str(root.quantity), str(root.category_name));
}

const sources: Record<PublicProductSource, { endpoint(code: string): string; parse: (body: unknown, code: string) => PublicProviderResult; headers?: Record<string,string> }> = {
  upcitemdb: { endpoint: (code) => `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, parse: parseUpcitemdb },
  open_facts: { endpoint: (code) => `https://world.openfoodfacts.org/api/v3/product/${code}?product_type=all&fields=code%2Cproduct_name%2Cproduct_name_en%2Cbrands%2Cquantity%2Ccategories`, parse: parseOpenFacts,
    headers: { 'User-Agent': 'FarmReturnPrototype/0.1 (https://farmreturn.ie)' } },
  productguru: { endpoint: (code) => `https://myproduct.guru/lookup/${code}.json`, parse: parseProductGuru },
};

/**
 * Only per-process throttle, not global multi-instance quota accounting.
 * Provider 429 is respected; testing must remain low-volume and explicit.
 */
const lastAttempt = new Map<PublicProductSource, number>();
const minGapMs: Record<PublicProductSource, number> = { upcitemdb: 10000, open_facts: 5000, productguru: 2000 };
const nextAllowedAfter429 = new Map<PublicProductSource, number>();

export async function queryPublicProvider(
  source: PublicProductSource,
  code: string,
  options: { fetcher?: typeof fetch; now?: () => number; throttle?: boolean } = {},
): Promise<PublicProviderResult> {
  if (!normaliseGtin(code)) return { status: 'unavailable', source };
  const fetcher = options.fetcher ?? fetch;
  const now = options.now?.() ?? Date.now();
  if (options.throttle !== false) {
    if (now < (nextAllowedAfter429.get(source) ?? 0) || now - (lastAttempt.get(source) ?? -Infinity) < minGapMs[source]) {
      return { source, status: 'rate_limited' };
    }
    lastAttempt.set(source, now);
  }
  const config = sources[source];
  try {
    const response = await fetcher(config.endpoint(code), {
      headers: { Accept: 'application/json', ...config.headers },
      cache: 'no-store', signal: AbortSignal.timeout(6000), redirect: 'follow',
    });
    if (response.status === 429) {
      nextAllowedAfter429.set(source, now + 60000);
      return { source, status: 'rate_limited' };
    }
    if (response.status === 404) return { source, status: 'not_found' };
    if (!response.ok) return { source, status: 'unavailable' };
    const text = await response.text();
    if (text.length > 100000) return { source, status: 'unavailable' };
    return config.parse(JSON.parse(text) as unknown, code);
  } catch {
    return { source, status: 'unavailable' };
  }
}

export async function lookupAcrossFreeProviders(
  code: string,
  options: { fetcher?: typeof fetch; now?: () => number; throttle?: boolean } = {},
): Promise<PublicBarcodeLookupResult> {
  if (!normaliseGtin(code)) return { status: 'invalid' };
  const providers = await Promise.all(PUBLIC_PRODUCT_SOURCES.map((source) => queryPublicProvider(source, code.trim(), options)));
  return { status: 'results', gtin: code.trim(), providers };
}
