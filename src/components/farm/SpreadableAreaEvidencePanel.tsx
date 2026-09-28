"use client";

/**
 * Campaign B minimal evidence UX — a field's spreadable area, on the field's
 * own Constraints tab beside its other spreading constraints (commonage,
 * water buffers).
 *
 * The field's gross (mapped or typed) size is shown as its own, separately
 * labelled fact and never prefills or stands in for the spreadable area.
 * What is shown comes from the canonical context
 * (`useSlurryRegulatoryEvidence` → `spreadableAreaEvidenceView`). Saving
 * appends a new record through `recordSpreadableAreaDeclaration`; an area
 * above the field's size is refused, never clamped, and nothing is shown
 * until it persisted.
 */
import { useId, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Pill } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import { dublinDate } from "@/domain/slurry-allocation-lifecycle";
import type { Field } from "@/domain/types";
import { useFarmActions, useSlurryRegulatoryEvidence } from "@/store/farm-store";
import {
  EVIDENCE_STALE_COPY,
  EVIDENCE_STALE_PILL,
  EVIDENCE_STATE_PILL,
  EVIDENCE_UNEXPECTED_ERROR_COPY,
  EvidenceRetryButton,
  declarationFailureCopy,
  formatEvidenceDate,
} from "./NeatSlurryEvidenceCard";

const PRIMARY_BUTTON = "min-h-11 rounded-fr-control bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-fr-green-700/40";
const SECONDARY_BUTTON = "min-h-11 rounded-fr-control border border-fr-border bg-fr-surface px-4 py-2.5 text-sm font-semibold text-fr-ink-900 disabled:opacity-50";
const INPUT = "w-full rounded-fr-control border border-fr-border bg-fr-surface px-3 py-2 text-sm text-fr-ink-900";

function ha(value: number): string {
  return `${formatNumber(value, 2)} ha`;
}

export function SpreadableAreaEvidencePanel({ field }: { field: Field }) {
  const { context, freshness, spreadableAreaByField } = useSlurryRegulatoryEvidence();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const evidence = context.spreadableArea.find((a) => a.fieldId === field.id);
  const view = spreadableAreaByField.get(field.id);
  // Archived fields are not in the planning context; nothing to show.
  if (!evidence || !view) return null;
  const stale = freshness === "stale";
  const pill = stale ? EVIDENCE_STALE_PILL : EVIDENCE_STATE_PILL[view.state];
  const gross = evidence.grossMappedAreaHa;

  return (
    <section aria-label="Spreadable area" className="flex flex-col gap-2 rounded-fr-control border border-fr-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-fr-ink-900">Spreadable area</p>
        <Pill tone={pill.tone} className="shrink-0 whitespace-nowrap">{pill.label}</Pill>
      </div>
      <p className="text-xs text-fr-ink-600">
        The part of this field you can actually spread slurry on — leaving out buffer strips, farmyards and other areas you can&apos;t spread.
      </p>
      <dl className="grid grid-cols-2 gap-2">
        <div className="min-w-0 break-words rounded-fr-control bg-fr-surface-alt p-2.5">
          <dt className="text-xs text-fr-ink-600">Spreadable area you recorded</dt>
          <dd className="text-base font-bold text-fr-ink-900">{view.record ? ha(view.record.spreadableAreaHa) : "Not confirmed"}</dd>
          {view.record ? (
            <dd className="text-xs text-fr-ink-600">
              True as of {formatEvidenceDate(view.record.effectiveDate)} · saved {formatEvidenceDate(view.record.recordedAt)}
            </dd>
          ) : null}
        </div>
        <div className="min-w-0 break-words rounded-fr-control border border-fr-border p-2.5">
          <dt className="text-xs text-fr-ink-600">Whole field size (a different figure)</dt>
          <dd className="text-base font-bold text-fr-ink-900">{gross.state === "known" ? ha(gross.value) : "Not recorded"}</dd>
          <dd className="text-xs text-fr-ink-600">{field.polygon ? "From the mapped boundary" : "As entered"}</dd>
        </div>
      </dl>
      <p role="status" className="text-sm text-fr-ink-900">
        {stale ? EVIDENCE_STALE_COPY : view.message}
      </p>
      {stale ? <EvidenceRetryButton /> : null}
      {notice && !stale ? <p className="text-xs text-fr-ink-600">{notice}</p> : null}
      <button
        type="button"
        className="min-h-11 self-start text-sm font-semibold text-fr-green-700"
        onClick={() => {
          setNotice(null);
          setOpen(true);
        }}
      >
        {view.record || view.state === "conflicting" ? "Update spreadable area" : "Confirm spreadable area"}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Spreadable area of ${field.name}`}>
        {open ? (
          <SpreadableAreaDeclarationForm
            field={field}
            grossAreaHa={gross.state === "known" ? gross.value : undefined}
            onClose={() => setOpen(false)}
            onSaved={() => {
              setOpen(false);
              setNotice("Saved. Earlier areas stay on record.");
            }}
          />
        ) : null}
      </Sheet>
    </section>
  );
}

function SpreadableAreaDeclarationForm({
  field,
  grossAreaHa,
  onClose,
  onSaved,
}: {
  field: Field;
  grossAreaHa: number | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { recordSpreadableAreaDeclaration } = useFarmActions();
  // Never prefilled — least of all from the field's gross size.
  const [area, setArea] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => dublinDate(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function save() {
    if (saving) return;
    const spreadableAreaHa = area.trim() === "" ? Number.NaN : Number(area);
    if (!(Number.isFinite(spreadableAreaHa) && spreadableAreaHa >= 0)) return setError("Enter zero or a positive area.");
    setSaving(true);
    setError(null);
    try {
      const result = await recordSpreadableAreaDeclaration({ fieldId: field.id, spreadableAreaHa, effectiveDate, ...(note.trim() ? { note: note.trim() } : {}) });
      const failure = declarationFailureCopy(result);
      if (failure === null) return onSaved();
      setError(failure);
    } catch (e: unknown) {
      console.error("[SpreadableAreaEvidencePanel] save failed:", e);
      setError(EVIDENCE_UNEXPECTED_ERROR_COPY);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-sm text-fr-ink-600">
        {grossAreaHa !== undefined
          ? `The whole field is ${ha(grossAreaHa)}. Enter only the part you can spread on — it can't be more than the whole field.`
          : "Enter only the part of the field you can spread on."}{" "}
        Enter 0 if none of it can be spread.
      </p>
      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">Spreadable area (ha)</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          aria-describedby={error ? errorId : undefined}
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">True as of</span>
        <input type="date" required value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={INPUT} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">How you worked this out (optional)</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
      </label>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-fr-risk">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className={PRIMARY_BUTTON} disabled={saving}>
          {saving ? "Saving…" : "Save area"}
        </button>
      </div>
    </form>
  );
}
