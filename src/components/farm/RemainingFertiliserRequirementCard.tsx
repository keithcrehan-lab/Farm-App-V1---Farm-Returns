"use client";

/**
 * Fertiliser Vertical campaign, item 14 — "one of the most important
 * outputs": the real remaining requirement, once real confirmed
 * fertiliser Actuals exist for this field. Fetched via
 * `getFieldFertiliserStatusAction` (`src/app/actions/fertiliser-plan.ts`),
 * which itself only ever reuses `calculateNutrientPlan`'s own real
 * recommendation plus real confirmed `job_actuals` — this component
 * computes nothing itself, it only renders the real, already-derived
 * figures honestly, one state at a time (never a single collapsed
 * number that hides which real state produced it).
 */
import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatNumber } from "@/lib/format";
import { getFieldFertiliserStatusAction, type FieldFertiliserStatusResult } from "@/app/actions/fertiliser-plan";

function NutrientRow({ label, requirement, confirmed, remaining }: { label: string; requirement: number; confirmed?: number; remaining?: number }) {
  return (
    <div className="flex items-center justify-between border-t border-fr-border py-2 text-sm first:border-t-0">
      <span className="font-medium text-fr-ink-900">{label}</span>
      <span className="text-fr-ink-600">
        {formatNumber(requirement, 1)} kg/ha required
        {confirmed !== undefined ? ` · ${formatNumber(confirmed, 1)} kg/ha applied` : ""}
        {remaining !== undefined ? (
          <span className="ml-1.5 font-semibold text-fr-ink-900">· {formatNumber(remaining, 1)} kg/ha still required</span>
        ) : (
          ""
        )}
      </span>
    </div>
  );
}

export function RemainingFertiliserRequirementCard({ fieldId, canRecord }: { fieldId: string; canRecord: boolean }) {
  const [result, setResult] = useState<FieldFertiliserStatusResult | undefined>(undefined);

  useEffect(() => {
    if (!canRecord) {
      // Resets for a real, external trigger — real mode turning off —
      // not on every render; same sanctioned pattern as
      // `FieldAwarenessCard.tsx`'s own field-change reset.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a real isRealMode/fieldId change, not every render.
      setResult(undefined);
      return;
    }
    let cancelled = false;
    getFieldFertiliserStatusAction(fieldId).then(
      (value) => {
        if (!cancelled) setResult(value);
      },
      (error: unknown) => {
        console.error("[RemainingFertiliserRequirementCard] getFieldFertiliserStatusAction failed:", error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fieldId, canRecord]);

  if (!canRecord || !result || result.status === "not_applicable") return null;

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Sprout} tone="good" />
          <CardTitle>Remaining requirement</CardTitle>
        </span>
      </CardHeader>

      {result.status === "blocked" ? (
        <p className="text-sm text-fr-ink-600">Not yet calculable — {result.reasonCode.replaceAll("_", " ").toLowerCase()}.</p>
      ) : result.remainingKgHa && result.confirmedAppliedKgHa ? (
        <div className="flex flex-col">
          <NutrientRow label="Nitrogen (N)" requirement={result.requirementKgHa.n} confirmed={result.confirmedAppliedKgHa.n} remaining={result.remainingKgHa.n} />
          <NutrientRow label="Phosphorus (P)" requirement={result.requirementKgHa.p} confirmed={result.confirmedAppliedKgHa.p} remaining={result.remainingKgHa.p} />
          <NutrientRow label="Potassium (K)" requirement={result.requirementKgHa.k} confirmed={result.confirmedAppliedKgHa.k} remaining={result.remainingKgHa.k} />
          {result.confirmedApplications === 0 ? (
            <p className="mt-2 text-xs text-fr-ink-400">No confirmed applications yet — the full recommendation still remains.</p>
          ) : result.applicationsWithUnknownComposition > 0 ? (
            <p className="mt-2 text-xs text-fr-ink-400">
              {result.applicationsWithUnknownComposition} confirmed application{result.applicationsWithUnknownComposition === 1 ? "" : "s"} could not be
              included above — product not in Farm Return&apos;s verified catalogue.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-fr-ink-600">Not yet calculable — {result.blockedReasonCode?.replaceAll("_", " ").toLowerCase() ?? "missing field area"}.</p>
      )}
    </Card>
  );
}
