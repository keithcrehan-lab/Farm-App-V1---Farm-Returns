"use client";

/**
 * Real Mode Completion Phase 20 — a farmer's own real supplier quotes,
 * the second tier of the price hierarchy (`src/domain/price-resolution.ts`)
 * after a directly farmer-entered price. Real-mode only (not part of
 * `farm-store.tsx`'s shared mock-mode state), same reasoning as
 * `FinancialAssumptionsCard`.
 */
import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatEur } from "@/lib/format";
import type { SupplierQuote } from "@/lib/farm-data/supplier-quotes";
import { addSupplierQuoteAction } from "@/app/actions/farm";

export function SupplierQuotesCard({ farmId, quotes: initialQuotes }: { farmId: string; quotes: SupplierQuote[] }) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [addOpen, setAddOpen] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [product, setProduct] = useState("");
  const [unit, setUnit] = useState("€/t");
  const [priceEur, setPriceEur] = useState("");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={FileText} tone="good" />
          <div>
            <CardTitle>Supplier quotes</CardTitle>
            <p className="text-xs text-fr-ink-600">Your own real quotes — used ahead of reference prices</p>
          </div>
        </span>
      </CardHeader>

      {quotes.length > 0 ? (
        <ul className="mb-3 flex flex-col divide-y divide-fr-border rounded-fr-control border border-fr-border text-sm">
          {quotes.map((q) => (
            <li key={q.id} className="flex items-center justify-between px-3 py-2">
              <span className="text-fr-ink-900">
                {q.supplierName} — {q.product}
                {q.validUntil ? <span className="text-fr-ink-600"> (valid to {q.validUntil})</span> : null}
              </span>
              <span className="font-semibold text-fr-ink-900">
                {formatEur(q.priceEur, true)} {q.unit}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-fr-ink-600">No supplier quotes recorded yet.</p>
      )}

      {addOpen ? (
        <div className="flex flex-col gap-2 rounded-fr-control border border-fr-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Supplier name"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
            />
            <input
              placeholder="Product (e.g. 18-6-12)"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
            />
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="Price"
              value={priceEur}
              onChange={(e) => setPriceEur(e.target.value)}
              className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
            />
            <input
              placeholder="Unit (e.g. €/t)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
            />
            <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
              Quote date
              <input
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
              Valid until (optional)
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className="text-xs font-medium text-fr-ink-600">
              Cancel
            </button>
            <button
              type="button"
              disabled={!supplierName.trim() || !product.trim() || !(Number(priceEur) > 0) || !unit.trim()}
              className="rounded-fr-control bg-fr-green-700 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-fr-green-700/40"
              onClick={async () => {
                const quote = await addSupplierQuoteAction(farmId, {
                  supplierName: supplierName.trim(),
                  product: product.trim(),
                  unit: unit.trim(),
                  priceEur: Number(priceEur),
                  deliveryIncluded: false,
                  quoteDate,
                  ...(validUntil ? { validUntil } : {}),
                });
                setQuotes((q) => [quote, ...q]);
                setSupplierName("");
                setProduct("");
                setPriceEur("");
                setValidUntil("");
                setAddOpen(false);
              }}
            >
              Save quote
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center justify-center gap-2 rounded-fr-control border border-dashed border-fr-border py-2 text-sm font-medium text-fr-green-700 hover:border-fr-green-700"
        >
          <Plus className="size-4" />
          Add a supplier quote
        </button>
      )}
    </Card>
  );
}
