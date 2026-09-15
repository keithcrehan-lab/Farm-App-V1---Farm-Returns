"use client";

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
 * F5) — the farm-wide lime requirement, field tonnes and farm tonnes,
 * built only from each field's own already-saved laboratory
 * `limeRequirement` (t/ha). Fetched via `getFarmLimeRequirementAction`,
 * which itself only ever reuses `aggregateFarmLimeRequirement`'s own
 * pure conversion (`src/domain/fertiliser-plan.ts`) — this component
 * computes nothing itself. Never a parallel lime engine and never a
 * rate derived from pH alone; a field with no real laboratory lime
 * figure is disclosed as missing evidence, never silently treated as
 * needing none.
 *
 * Deliberately farm-wide, not field-scoped — matches
 * `FarmFertiliserPurchaseRequirementCard`'s own established pattern.
 */
import { useEffect, useState } from "react";
import { Mountain } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatNumber } from "@/lib/format";
import { getFarmLimeRequirementAction } from "@/app/actions/fertiliser-plan";
import type { FarmLimeRequirement } from "@/domain/fertiliser-plan";

function formatTonnes(value: number): string {
  return `${formatNumber(value, 2)} t`;
}

export function FarmLimeRequirementCard({ canRecord }: { canRecord: boolean }) {
  const [result, setResult] = useState<FarmLimeRequirement | undefined>(undefined);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a real canRecord change, not every render.
    setResult(undefined);
    setCheckFailed(false);
    if (!canRecord) return;
    let cancelled = false;
    getFarmLimeRequirementAction().then(
      (value) => {
        if (!cancelled) setResult(value);
      },
      (error: unknown) => {
        console.error("[FarmLimeRequirementCard] getFarmLimeRequirementAction failed:", error);
        if (!cancelled) setCheckFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [canRecord]);

  if (!canRecord) return null;

  if (checkFailed) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-3">
            <IconChip icon={Mountain} tone="good" />
            <CardTitle>Farm lime requirement</CardTitle>
          </span>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">Farm Return couldn&apos;t check your farm-wide lime requirement right now — try again shortly.</p>
      </Card>
    );
  }

  if (!result) return null;

  const fieldsWithLime = result.fields.filter((f) => f.fieldTonnes !== undefined && f.fieldTonnes > 0);

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Mountain} tone="good" />
          <CardTitle>Farm lime requirement</CardTitle>
        </span>
      </CardHeader>

      {fieldsWithLime.length === 0 ? (
        <p className="text-sm text-fr-ink-600">
          {result.fieldsWithoutLimeEvidence > 0
            ? "No real laboratory lime figures on file yet — add a soil test with a lime requirement to see this farm's real total."
            : "No lime required right now, based on real laboratory results on file."}
        </p>
      ) : (
        <>
          <div className="flex flex-col">
            {fieldsWithLime.map((line) => (
              <div key={line.fieldId} className="flex items-center justify-between border-t border-fr-border py-2 text-sm first:border-t-0">
                <span className="min-w-0 flex-1 truncate text-fr-ink-900">{line.fieldName}</span>
                <span className="shrink-0 pl-3 text-fr-ink-600">{formatNumber(line.rateTHa!, 2)} t/ha</span>
                <span className="shrink-0 pl-3 font-semibold text-fr-ink-900">{formatTonnes(line.fieldTonnes!)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-fr-control bg-fr-good-bg px-4 py-2.5">
            <span className="text-sm font-medium text-fr-good">Farm total</span>
            <span className="text-base font-bold text-fr-good">{formatTonnes(result.farmTotalTonnes)}</span>
          </div>
        </>
      )}

      {/* Never labels a partial total as the complete farm requirement
          (audit finding F5's own explicit instruction) — a field with
          no real laboratory lime figure is disclosed by count, not
          silently folded into the total as if it needed none. */}
      {result.fieldsWithoutLimeEvidence > 0 ? (
        <p className="mt-2 text-xs text-fr-attention">
          {result.fieldsWithoutLimeEvidence} field{result.fieldsWithoutLimeEvidence === 1 ? "" : "s"} {result.fieldsWithoutLimeEvidence === 1 ? "has" : "have"} no real
          laboratory lime figure on file — the total above is real but partial, not this farm&apos;s complete lime requirement.
        </p>
      ) : null}
    </Card>
  );
}
