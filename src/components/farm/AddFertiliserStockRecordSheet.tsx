"use client";

/**
 * Fertiliser Overview and Stock Visuals campaign — records ONE dated
 * manual stock observation (`addFertiliserStockRecordAction`,
 * `src/app/actions/fertiliser-plan-overview.ts`). Deliberately NOT an
 * inventory/order-management form: no delivery/application picker, no
 * running-balance adjustment — a farmer simply states "as of this date, I
 * have X kg/t of this product", and Farm Return keeps every past
 * statement (`src/domain/fertiliser-stock.ts`'s own header) rather than
 * overwriting one. The disclosure text below says exactly this, so the
 * farmer never mistakes this for a continuously-tracked balance.
 */
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { addFertiliserStockRecordAction } from "@/app/actions/fertiliser-plan-overview";
import { FERTILISER_STOCK_UNITS, normaliseFertiliserProductKey, type FertiliserStockUnit } from "@/domain/fertiliser-stock";

const inputClass = "w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900";
const MANUAL_OPTION = "__manual__";

export function AddFertiliserStockRecordSheet({
  open,
  onClose,
  onSaved,
  products,
  defaultProduct,
  defaultSource,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  products: string[];
  defaultProduct?: string;
  defaultSource: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Update stock">
      {open ? <AddFertiliserStockRecordSheetBody onClose={onClose} onSaved={onSaved} products={products} defaultProduct={defaultProduct} defaultSource={defaultSource} /> : null}
    </Sheet>
  );
}

function AddFertiliserStockRecordSheetBody({
  onClose,
  onSaved,
  products,
  defaultProduct,
  defaultSource,
}: {
  onClose: () => void;
  onSaved: () => void;
  products: string[];
  defaultProduct?: string;
  defaultSource: string;
}) {
  // Codex audit HIGH (round 1): a plain `.includes()` compared the
  // clicked column's own product string byte-for-byte against the
  // dropdown's canonical spellings — a real stock record's own
  // differently-cased/spaced product (matched by
  // `normaliseFertiliserProductKey` everywhere else in this campaign)
  // would silently fail this check and fall through to the free-text
  // "Other product…" path, prefilled with that same mismatched spelling
  // instead of the canonical one — letting the farmer's next save
  // perpetuate the exact split-balance bug this key exists to prevent.
  const matchedOption = defaultProduct ? products.find((p) => normaliseFertiliserProductKey(p) === normaliseFertiliserProductKey(defaultProduct)) : undefined;
  const initialOption = matchedOption ?? (products[0] ?? MANUAL_OPTION);
  const [selectedOption, setSelectedOption] = useState(initialOption);
  const [manualProduct, setManualProduct] = useState(defaultProduct && !matchedOption ? defaultProduct : "");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<FertiliserStockUnit>("kg");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState(defaultSource);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Codex audit MEDIUM (round 1): a real network/server-action failure
  // (as opposed to a real, field-level validation rejection) previously
  // had no handler at all — an unhandled rejection left `submitting`
  // stuck `true` forever (the Save button permanently disabled) with no
  // visible explanation or way to retry.
  const [submitFailed, setSubmitFailed] = useState(false);

  const product = selectedOption === MANUAL_OPTION ? manualProduct.trim() : selectedOption;
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setSubmitFailed(false);
    try {
      const result = await addFertiliserStockRecordAction({
        product,
        quantity: Number(quantity),
        unit,
        effectiveDate,
        source: source.trim(),
        note: note.trim() ? note.trim() : undefined,
      });
      if (result.status === "validation_error") {
        setErrors(result.errors ?? []);
        return;
      }
      onSaved();
    } catch (error: unknown) {
      console.error("[AddFertiliserStockRecordSheet] addFertiliserStockRecordAction failed:", error);
      setSubmitFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs text-fr-ink-600">
        This records a dated observation, not a live-tracked balance — Farm Return keeps every past figure you record rather than overwriting it, so
        you can correct a mistaken count by saving a new one.
      </p>

      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">Product</span>
        <select value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)} className={inputClass}>
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value={MANUAL_OPTION}>Other product…</option>
        </select>
        {selectedOption === MANUAL_OPTION ? (
          <input
            type="text"
            value={manualProduct}
            onChange={(e) => setManualProduct(e.target.value)}
            placeholder="Product name"
            className={`${inputClass} mt-2`}
          />
        ) : null}
        {errorFor("product") ? <p className="mt-1 text-xs text-fr-risk">{errorFor("product")}</p> : null}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-fr-ink-600">Quantity in store</span>
          <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
          {errorFor("quantity") ? <p className="mt-1 text-xs text-fr-risk">{errorFor("quantity")}</p> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-fr-ink-600">Unit</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as FertiliserStockUnit)} className={inputClass}>
            {FERTILISER_STOCK_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">As of date</span>
        <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputClass} />
        {errorFor("effectiveDate") ? <p className="mt-1 text-xs text-fr-risk">{errorFor("effectiveDate")}</p> : null}
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">Source</span>
        <input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Farmer count, Delivery docket" className={inputClass} />
        {errorFor("source") ? <p className="mt-1 text-xs text-fr-risk">{errorFor("source")}</p> : null}
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">Note (optional)</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </label>

      {submitFailed ? (
        <p className="text-xs text-fr-risk">Farm Return couldn&apos;t save this right now — check your connection and try again.</p>
      ) : null}

      <div className="mt-1 flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 rounded-fr-control border border-fr-border py-2.5 text-sm font-semibold text-fr-ink-900">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="flex-1 rounded-fr-control bg-fr-green-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
