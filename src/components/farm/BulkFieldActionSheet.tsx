"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import {
  carryForwardFieldCyclesAction,
  previewBulkProductionCyclesAction,
  setBulkFieldCropSystemAction,
  type BulkFieldOutcome,
  type BulkProductionCyclePreviewRow,
} from "@/app/actions/bulk-production-cycles";
import { countBulkOutcomes, type BulkOutcomeCounts, type CarryForwardEligibility } from "@/domain/bulk-production-cycle";
import { calculateActiveFarmAreaHa } from "@/domain/farm-stats";
import { CROP_SYSTEM_LABELS, P2_SUPPORTED_CROP_SYSTEMS, type CropSystem } from "@/domain/fertiliser-field-evidence";
import type { Field } from "@/domain/types";
import { CROP_SYSTEM_CONTEXT } from "@/lib/crop-system-context";
import { formatNumber } from "@/lib/format";
import { useFarmActions } from "@/store/farm-store";

export type BulkFieldAction = "set-crop" | "carry-forward";

const PRIMARY = "min-h-11 bg-fr-v2-forest-deep px-4 text-sm font-semibold text-white disabled:opacity-40";
const SECONDARY = "min-h-11 border border-fr-v2-cream-rule px-4 text-sm font-semibold text-fr-v2-muted";
const INPUT = "min-h-11 w-full border border-fr-v2-cream-rule bg-white px-3 text-sm font-normal text-fr-v2-graphite";
const LABEL = "flex flex-col gap-1.5 text-xs font-semibold text-fr-v2-graphite";

const cropOptions = Object.entries(CROP_SYSTEM_LABELS) as Array<[CropSystem, string]>;

function eligibilityLabel(eligibility: CarryForwardEligibility, target: string, current: string): string {
  switch (eligibility) {
    case "CAN_CARRY":
      return "Can be carried forward";
    case "HAS_TARGET_CYCLE":
      return `Already has a ${target} cycle · left as it is`;
    case "NO_CURRENT_CYCLE":
      return `No ${current} cycle to copy`;
  }
}

function fieldCount(count: number): string {
  return `${count} ${count === 1 ? "field" : "fields"}`;
}

function outcomeLabel(item: BulkFieldOutcome, season: string): string {
  switch (item.outcome) {
    case "saved":
      return item.gateStatus === "INCOMPLETE_EVIDENCE" ? "Saved · more evidence is needed for a recommendation" : item.gateStatus === "UNSUPPORTED_PATHWAY" ? "Saved · agronomy not enabled for this crop" : "Saved";
    case "unchanged":
      return "Already set · nothing changed";
    case "skipped_has_target":
      return `Already has a ${season} cycle · left as it is`;
    case "skipped_no_current":
      return "No current cycle to copy · not changed";
    case "failed":
      return "Not saved";
  }
}

function resultHeadline(counts: BulkOutcomeCounts): string {
  if (counts.failed > 0) return `${counts.saved} of ${fieldCount(counts.total)} saved. ${counts.failed} could not be saved.`;
  if (counts.saved === 0) return "No fields were changed.";
  if (counts.saved === counts.total) return `All ${fieldCount(counts.total)} saved.`;
  return `${counts.saved} of ${fieldCount(counts.total)} saved. The rest needed no change.`;
}

/**
 * The confirmation surface for Fields' "Select multiple" actions. Nothing is
 * written until the farmer confirms a summary built from the server's own
 * view of those fields, and the result is always reported field by field.
 */
export function BulkFieldActionSheet({ action, fields, onClose }: { action: BulkFieldAction | null; fields: Field[]; onClose: () => void }) {
  return (
    <Sheet open={action !== null} onClose={onClose} title={action === "carry-forward" ? "Carry settings forward" : "Set crop / use"}>
      {action ? <BulkFieldActionBody key={action} action={action} fields={fields} onClose={onClose} /> : null}
    </Sheet>
  );
}

function BulkFieldActionBody({ action, fields, onClose }: { action: BulkFieldAction; fields: Field[]; onClose: () => void }) {
  const thisSeason = String(new Date().getFullYear());
  const nextSeason = String(Number(thisSeason) + 1);
  const carrying = action === "carry-forward";

  const { applySavedProductionCycle } = useFarmActions();
  const [season, setSeason] = useState(carrying ? nextSeason : thisSeason);
  const [cropSystem, setCropSystem] = useState<CropSystem | "">("");
  const [step, setStep] = useState<"choose" | "confirm" | "result">(carrying ? "confirm" : "choose");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<BulkFieldOutcome[]>([]);

  const fieldIds = useMemo(() => fields.map((field) => field.id), [fields]);
  const previewKey = `${season}:${fieldIds.join(",")}`;
  const [preview, setPreview] = useState<{ key: string; rows?: BulkProductionCyclePreviewRow[]; currentSeason?: string; error?: string } | null>(null);
  const loadedPreview = preview?.key === previewKey ? preview : null;

  useEffect(() => {
    let cancelled = false;
    void previewBulkProductionCyclesAction({ fieldIds, targetSeason: season })
      .then((result) => {
        if (cancelled) return;
        setPreview(result.status === "ok" ? { key: previewKey, rows: result.rows, currentSeason: result.currentSeason } : { key: previewKey, error: result.message });
      })
      .catch((error: unknown) => {
        console.error("[BulkFieldActionSheet] preview failed", error);
        if (!cancelled) setPreview({ key: previewKey, error: "These fields' production cycles could not be loaded. Nothing has been changed." });
      });
    return () => {
      cancelled = true;
    };
  }, [fieldIds, previewKey, season]);

  const areaHa = calculateActiveFarmAreaHa(fields);
  const rows = loadedPreview?.rows ?? [];
  const carryable = rows.filter((row) => row.carryForward === "CAN_CARRY");
  const cropChanges = rows.filter((row) => row.targetCropSystem !== cropSystem);
  const writeCount = carrying ? carryable.length : cropChanges.length;

  async function save(ids: string[]) {
    setSaving(true);
    setSaveError(null);
    try {
      const result = carrying
        ? await carryForwardFieldCyclesAction({ fieldIds: ids, targetSeason: season })
        : await setBulkFieldCropSystemAction({ fieldIds: ids, season, cropSystem: cropSystem as CropSystem });
      if (result.status === "rejected") {
        setSaveError(result.message);
        return;
      }
      // Codex audit F010: each saved cycle updates the farm store's grazing
      // sward at once (the store ignores seasons other than the current one).
      for (const outcome of result.outcomes) {
        if (outcome.outcome === "saved" && outcome.savedCycle) applySavedProductionCycle(outcome.fieldId, result.season, outcome.savedCycle);
      }
      // A retry replaces only the fields it was asked to retry.
      setOutcomes((previous) => [...previous.filter((item) => !ids.includes(item.fieldId)), ...result.outcomes]);
      setStep("result");
    } catch (error) {
      console.error("[BulkFieldActionSheet] save failed", error);
      setSaveError("The connection failed before Farm Return could confirm what was saved. Check the fields before trying again.");
    } finally {
      setSaving(false);
    }
  }

  const summary = (
    <p className="font-mono text-[12px] tabular-nums text-fr-v2-muted" data-bulk-summary>
      {fieldCount(fields.length)}
      {areaHa !== null ? ` · ${formatNumber(areaHa, 2)} ha` : ""} · {season} season
    </p>
  );

  if (step === "result") {
    const counts = countBulkOutcomes(outcomes);
    const failedIds = outcomes.filter((item) => item.outcome === "failed").map((item) => item.fieldId);
    return (
      <div className="flex flex-col gap-4" data-bulk-result>
        {summary}
        <p role={counts.failed > 0 ? "alert" : "status"} className="text-base font-semibold text-fr-v2-graphite">
          {resultHeadline(counts)}
        </p>
        {saveError ? <p role="alert" className="text-sm font-semibold text-fr-red-700">{saveError}</p> : null}
        <ul className="flex flex-col border-t border-fr-v2-cream-rule text-sm">
          {outcomes.map((item) => (
            <li key={item.fieldId} data-bulk-outcome={item.outcome} className="border-b border-fr-v2-cream-rule py-2">
              <span className="block font-semibold text-fr-v2-graphite">{item.fieldName}</span>
              <span className={item.outcome === "failed" ? "text-xs font-semibold text-fr-red-700" : "text-xs text-fr-v2-muted"}>{outcomeLabel(item, season)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {failedIds.length > 0 ? (
            <button type="button" disabled={saving} onClick={() => void save(failedIds)} className={PRIMARY}>
              {saving ? "Saving…" : `Try ${fieldCount(failedIds.length)} again`}
            </button>
          ) : null}
          <button type="button" onClick={onClose} className={SECONDARY}>
            Done
          </button>
        </div>
      </div>
    );
  }

  if (step === "choose") {
    return (
      <div className="flex flex-col gap-4" data-bulk-choose>
        {summary}
        <label className={LABEL}>
          Season
          <select className={INPUT} value={season} onChange={(event) => setSeason(event.target.value)}>
            <option value={thisSeason}>{thisSeason} (this season)</option>
            <option value={nextSeason}>{nextSeason} (next season)</option>
          </select>
        </label>
        <label className={LABEL}>
          Crop / use
          <select className={INPUT} value={cropSystem} onChange={(event) => setCropSystem(event.target.value as CropSystem | "")}>
            <option value="">Choose crop / use</option>
            {cropOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
                {P2_SUPPORTED_CROP_SYSTEMS.includes(value) ? "" : " — not enabled yet"}
              </option>
            ))}
          </select>
        </label>
        {cropSystem ? <p className="-mt-2 text-xs leading-relaxed text-fr-v2-muted">{CROP_SYSTEM_CONTEXT[cropSystem]}</p> : null}
        <p className="text-xs leading-relaxed text-fr-v2-muted">Only the crop / use changes. Targets, fertiliser records and other evidence already on these fields are kept.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!cropSystem} onClick={() => setStep("confirm")} className={PRIMARY}>
            Review changes
          </button>
          <button type="button" onClick={onClose} className={SECONDARY}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-bulk-confirm>
      {summary}
      {carrying ? (
        <p className="text-sm leading-relaxed text-fr-v2-charcoal">
          Copy each field&apos;s current crop / use, production target, clover content and any grazing exception to {season}. {thisSeason} stays as it is. Fertiliser already applied and reseed dates are not copied, and nothing missing is filled in.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-fr-v2-charcoal">
          Set these fields to <strong>{cropSystem ? CROP_SYSTEM_LABELS[cropSystem] : ""}</strong> for {season}. Nothing else on them changes.
        </p>
      )}

      {!loadedPreview ? <p className="text-sm text-fr-v2-muted">Checking these fields…</p> : null}
      {loadedPreview?.error ? <p role="alert" className="text-sm font-semibold text-fr-red-700">{loadedPreview.error}</p> : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col border-t border-fr-v2-cream-rule text-sm">
          {rows.map((row) => (
            <li key={row.fieldId} data-bulk-row={row.fieldId} className="border-b border-fr-v2-cream-rule py-2">
              <span className="block font-semibold text-fr-v2-graphite">{row.fieldName}</span>
              <span className="text-xs text-fr-v2-muted">
                {carrying
                  ? `${eligibilityLabel(row.carryForward, season, loadedPreview?.currentSeason ?? thisSeason)}${row.carryForward === "CAN_CARRY" && row.currentCropSystem ? ` · ${CROP_SYSTEM_LABELS[row.currentCropSystem]}` : ""}`
                  : row.targetCropSystem === cropSystem
                    ? "Already set · no change"
                    : `${row.targetCropSystem ? CROP_SYSTEM_LABELS[row.targetCropSystem] : "Not recorded"} → ${cropSystem ? CROP_SYSTEM_LABELS[cropSystem] : ""}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {saveError ? <p role="alert" className="text-sm font-semibold text-fr-red-700">{saveError}</p> : null}
      {loadedPreview?.rows && writeCount === 0 ? <p className="text-sm text-fr-v2-muted">None of these fields would change.</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving || !loadedPreview?.rows || writeCount === 0} onClick={() => void save(fieldIds)} className={PRIMARY}>
          {saving ? "Saving…" : carrying ? `Carry ${fieldCount(writeCount)} forward to ${season}` : `Save ${fieldCount(writeCount)} for ${season}`}
        </button>
        <button type="button" disabled={saving} onClick={carrying ? onClose : () => setStep("choose")} className={SECONDARY}>
          {carrying ? "Cancel" : "Back"}
        </button>
      </div>
    </div>
  );
}
