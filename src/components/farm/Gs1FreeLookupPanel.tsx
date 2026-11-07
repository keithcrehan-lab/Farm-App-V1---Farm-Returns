'use client';

import { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { prepareGs1FreeLookup } from '@/lib/smart-camera/gs1-free-lookup';

/** The free GS1 product search is a manual, external website lookup.
 * We do not fetch or capture results, because the free service is not an API
 * and its terms restrict query results to internal use.
 */
export function Gs1FreeLookupPanel({ code }: { code: string }) {
  const lookup = prepareGs1FreeLookup(code);
  const [copyState, setCopyState] = useState('');
  if (lookup.status !== 'ready_for_manual_lookup') return null;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code.trim());
      setCopyState('Barcode copied. Paste it into GS1’s product search.');
    } catch {
      setCopyState('Automatic copying was unavailable. Select the barcode number below to copy it.');
    }
  }

  return (
    <section aria-label="GS1 free barcode verification" className="space-y-3 rounded-xl border border-fr-border bg-fr-surface-alt p-3 text-fr-ink-900">
      <div>
        <h3 className="text-sm font-semibold">Free GS1 barcode lookup</h3>
        <p className="mt-1 text-xs text-fr-ink-600">30 manual searches per 24 hours. This is not an automatic GS1 API integration.</p>
      </div>
      <div className="rounded-lg bg-white px-3 py-2">
        <p className="text-xs text-fr-ink-600">Barcode to enter on GS1</p>
        <p data-testid="gs1-free-gtin" className="select-all break-all font-mono text-lg font-semibold">{lookup.gtin}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyCode()} className="inline-flex items-center gap-2 rounded-fr-control border border-fr-border bg-white px-3 py-2 text-sm font-semibold">
          <Copy className="size-4" />Copy barcode
        </button>
        <a href={lookup.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-fr-control bg-fr-green-700 px-3 py-2 text-sm font-semibold text-white">
          <ExternalLink className="size-4" />Open Verified by GS1
        </a>
      </div>
      {copyState ? <p role="status" className="text-xs text-fr-ink-600">{copyState}</p> : null}
      <p className="text-xs text-fr-ink-600">Select Verify Product on GS1, paste the number, and inspect the result. A valid barcode check digit does not prove the product exists in GS1. Company information alone does not verify the exact fertiliser product. Results stay on GS1 and are not stored in Farm Return.</p>
    </section>
  );
}
