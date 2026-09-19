"use client";

/**
 * Slurry Evidence & Composition V1 — records ONE dated slurry composition
 * result for a shed/tank (`useFarmActions().addSlurryComposition`,
 * `src/store/farm-store.tsx`). Mirrors `AddFertiliserStockRecordSheet.tsx`'s
 * own real, established shape (the sibling evidence-record sheet this
 * repo already ships): a farmer states one dated result, and Farm Return
 * keeps every past one rather than overwriting it
 * (`src/domain/slurry-composition.ts`'s own header) — never presented as
 * a live-tracked/editable figure.
 *
 * Deliberately asks "how do you know this?" first (farmer estimate vs.
 * laboratory result) — the record's own `status` (`farmer_adjusted` /
 * `verified`), never inferred from which fields happen to be filled in.
 * N/P/K are always optional and, per this campaign's own disclosed
 * scope limit, are recorded for the farmer's evidence but not yet
 * consumed by the nutrient engine — only dry matter % is — so the copy
 * here says that plainly rather than implying otherwise.
 */
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useFarmActions } from "@/store/farm-store";
import type { SlurryCompositionStatus, SlurryType } from "@/domain/slurry-composition";

const inputClass = "w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900";

export function AddSlurryCompositionSheet({
  open,
  onClose,
  onSaved,
  housingId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  housingId: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add slurry result">
      {open ? <AddSlurryCompositionSheetBody onClose={onClose} onSaved={onSaved} housingId={housingId} /> : null}
    </Sheet>
  );
}

function AddSlurryCompositionSheetBody({
  onClose,
  onSaved,
  housingId,
}: {
  onClose: () => void;
  onSaved: () => void;
  housingId: string;
}) {
  const { addSlurryComposition } = useFarmActions();
  const [status, setStatus] = useState<SlurryCompositionStatus>("farmer_adjusted");
  const slurryType: SlurryType = "cattle_slurry";
  const [dmPct, setDmPct] = useState("");
  const [nPerM3, setNPerM3] = useState("");
  const [pPerM3, setPPerM3] = useState("");
  const [kPerM3, setKPerM3] = useState("");
  const [sampleDate, setSampleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("");
  const [laboratory, setLaboratory] = useState("");
  const [sampleRef, setSampleRef] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);

  const dmValid = Number.isFinite(Number(dmPct)) && Number(dmPct) > 0 && Number(dmPct) <= 100;
  const sourceValid = source.trim().length > 0;
  const labValid = status !== "verified" || laboratory.trim().length > 0;
  const canSubmit = dmValid && sourceValid && labValid && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitFailed(false);
    try {
      await addSlurryComposition({
        housingId,
        slurryType,
        status,
        dmPct: Number(dmPct),
        ...(nPerM3.trim() ? { nPerM3: Number(nPerM3) } : {}),
        ...(pPerM3.trim() ? { pPerM3: Number(pPerM3) } : {}),
        ...(kPerM3.trim() ? { kPerM3: Number(kPerM3) } : {}),
        sampleDate,
        source: source.trim(),
        ...(laboratory.trim() ? { laboratory: laboratory.trim() } : {}),
        ...(sampleRef.trim() ? { sampleRef: sampleRef.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onSaved();
    } catch (error: unknown) {
      console.error("[AddSlurryCompositionSheet] addSlurryComposition failed:", error);
      setSubmitFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs text-fr-ink-600">
        This records a dated result — Farm Return keeps every past result you record rather than overwriting it, so
        you can correct a mistaken figure by saving a new one.
      </p>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs text-fr-ink-600">How do you know this?</legend>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStatus("farmer_adjusted")}
            className={`flex-1 rounded-fr-control border px-3 py-2 text-sm font-medium ${
              status === "farmer_adjusted" ? "border-fr-green-700 text-fr-green-700" : "border-fr-border text-fr-ink-600"
            }`}
          >
            My own estimate
          </button>
          <button
            type="button"
            onClick={() => setStatus("verified")}
            className={`flex-1 rounded-fr-control border px-3 py-2 text-sm font-medium ${
              status === "verified" ? "border-fr-green-700 text-fr-green-700" : "border-fr-border text-fr-ink-600"
            }`}
          >
            Laboratory result
          </button>
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">Dry matter (%)</span>
        <input type="number" min="0" max="100" step="any" required value={dmPct} onChange={(e) => setDmPct(e.target.value)} className={inputClass} />
        {!dmValid && dmPct ? <p className="mt-1 text-xs text-fr-risk">Enter a dry matter % between 0 and 100</p> : null}
      </label>

      <div>
        <p className="mb-1.5 text-xs text-fr-ink-600">
          Nutrient content (kg/m³) — optional. Recorded for your records; Farm Return&apos;s nutrient plan currently
          uses dry matter % only (see &quot;Why this matters&quot; on the composition card).
        </p>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">N</span>
            <input type="number" min="0" step="any" value={nPerM3} onChange={(e) => setNPerM3(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">P</span>
            <input type="number" min="0" step="any" value={pPerM3} onChange={(e) => setPPerM3(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">K</span>
            <input type="number" min="0" step="any" value={kPerM3} onChange={(e) => setKPerM3(e.target.value)} className={inputClass} />
          </label>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">Sample/result date</span>
        <input type="date" value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} className={inputClass} />
      </label>

      {status === "verified" ? (
        <>
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">Laboratory / provider</span>
            <input type="text" value={laboratory} onChange={(e) => setLaboratory(e.target.value)} className={inputClass} />
            {!labValid ? <p className="mt-1 text-xs text-fr-risk">Enter the laboratory/provider name</p> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">Sample/report reference (optional)</span>
            <input type="text" value={sampleRef} onChange={(e) => setSampleRef(e.target.value)} className={inputClass} />
          </label>
        </>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">Source</span>
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={status === "verified" ? "e.g. Southern Agri Labs report" : "e.g. Farmer estimate"}
          className={inputClass}
        />
        {!sourceValid && source ? null : null}
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
        <button type="submit" disabled={!canSubmit} className="flex-1 rounded-fr-control bg-fr-green-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
