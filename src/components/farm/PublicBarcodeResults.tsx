'use client';

import { useState } from 'react';
import { Globe2, Search, AlertCircle } from 'lucide-react';
import { lookupFreeBarcodeSourcesAction } from '@/app/actions/smart-camera';
import type { PublicBarcodeLookupResult, PublicProviderResult } from '@/lib/smart-camera/public-product-lookup';
import { normaliseGtin } from '@/lib/smart-camera/fertiliser-products';

const PROVIDER_NAMES = { upcitemdb: 'UPCitemdb', open_facts: 'Open Facts', productguru: 'ProductGuru' } as const;

function ProviderResult({ result }: { result: PublicProviderResult }) {
  const source = PROVIDER_NAMES[result.source];
  return (
    <div className="space-y-1 rounded-xl border border-fr-border bg-white p-3" data-testid={`public-${result.source}`}>
      <p className="text-sm font-semibold text-fr-ink-900">{source}</p>
      {result.status === 'matched' ? (
        <>
          <p className="text-sm font-medium text-fr-ink-900">{result.suggestion.name}</p>
          {result.suggestion.brand ? <p className="text-xs text-fr-ink-600">Brand: {result.suggestion.brand}</p> : null}
          {result.suggestion.size ? <p className="text-xs text-fr-ink-600">Size: {result.suggestion.size}</p> : null}
          {result.suggestion.category ? <p className="text-xs text-fr-ink-600">Category: {result.suggestion.category}</p> : null}
          {result.suggestion.description ? <p className="text-xs text-fr-ink-600">{result.suggestion.description}</p> : null}
          <p className="text-xs text-fr-attention">Suggested identification only — not manufacturer-verified.</p>
          <p className="text-xs text-fr-ink-600">{result.suggestion.disclosure}</p>
          <a className="text-xs font-medium text-fr-green-700 underline" href={result.suggestion.attributionUrl} target="_blank" rel="noopener noreferrer">Data: {result.suggestion.attributionName}</a>
        </>
      ) : (
        <p className="text-xs text-fr-ink-600">
          {result.status === 'not_found' ? 'No product listed.' : result.status === 'rate_limited' ? 'Free API rate limit reached. Try again later.' : 'Lookup unavailable or provider returned an error.'}
        </p>
      )}
    </div>
  );
}

export function PublicBarcodeResults({ code, signedIn }: { code: string; signedIn: boolean }) {
  const [result, setResult] = useState<PublicBarcodeLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lookedUpCode, setLookedUpCode] = useState('');
  const valid = normaliseGtin(code) !== null;
  // Never show stale results for a newly scanned or manually changed code.
  const current = lookedUpCode === code ? result : null;

  async function runLookup() {
    if (!valid || !signedIn || loading) return;
    setError(''); setResult(null); setLookedUpCode(code); setLoading(true);
    try {
      setResult(await lookupFreeBarcodeSourcesAction(code));
    } catch {
      setError('The product services could not be contacted. No information was saved.');
    } finally {
      setLoading(false);
    }
  }

  if (!valid) return null;
  return (
    <section className="space-y-3 rounded-xl border border-fr-border bg-fr-surface-alt p-3" aria-label="Free product search">
      <div className="flex items-start gap-2">
        <Globe2 className="mt-0.5 size-5 shrink-0 text-fr-green-700" />
        <div>
          <p className="text-sm font-semibold text-fr-ink-900">Find product details for free</p>
          <p className="text-xs text-fr-ink-600">Search UPCitemdb, Open Facts and ProductGuru. Returns are suggestions, not verified agricultural or medical specifications.</p>
        </div>
      </div>
      <button className="flex w-full items-center justify-center gap-2 rounded-fr-control bg-fr-green-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" type="button" disabled={loading || !signedIn} onClick={() => void runLookup()}>
        <Search className="size-4" />{loading ? 'Searching three databases…' : 'Identify barcode using free databases'}
      </button>
      {!signedIn ? <p className="text-xs text-fr-ink-600">Sign in to test the free barcode lookup.</p> : null}
      {error ? <p role="alert" className="flex gap-2 text-xs text-fr-attention"><AlertCircle className="size-4 shrink-0" />{error}</p> : null}
      {current?.status === 'results' ? (
        <div className="space-y-2" role="status">
          <p className="text-xs font-semibold text-fr-ink-900">{current.providers.filter((p) => p.status === 'matched').length} of 3 sources found a product listing</p>
          {current.providers.map((provider) => <ProviderResult key={provider.source} result={provider} />)}
          <p className="text-xs text-fr-ink-600">No product information is saved or used to prefill fertiliser, veterinary, stock or financial records. Provider limits apply and their results may disagree.</p>
        </div>
      ) : current ? <p role="status" className="text-xs text-fr-attention">{current.status === 'invalid' ? 'Invalid barcode.' : 'Sign-in required.'}</p> : null}
    </section>
  );
}
