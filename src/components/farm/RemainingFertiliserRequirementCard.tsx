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

function NutrientRow({
  label,
  requirement,
  confirmed,
  remaining,
  isUncertain,
}: {
  label: string;
  requirement: number;
  confirmed?: number;
  remaining?: number;
  /** Codex audit CRITICAL (round 1) — true whenever at least one real
   * confirmed application this season could not be included in
   * `confirmed`/`remaining` (an unrecognised product/quantity/unit).
   * That excluded application's own real contribution is unknown, not
   * zero — so `remaining` is only a real upper bound (it can never be
   * lower than the true figure), never presented as an exact number in
   * that case. */
  isUncertain?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t border-fr-border py-2 text-sm first:border-t-0">
      <span className="font-medium text-fr-ink-900">{label}</span>
      <span className="text-fr-ink-600">
        {formatNumber(requirement, 1)} kg/ha required
        {confirmed !== undefined ? ` · ${isUncertain ? "at least " : ""}${formatNumber(confirmed, 1)} kg/ha applied` : ""}
        {remaining !== undefined ? (
          <span className="ml-1.5 font-semibold text-fr-ink-900">
            · {isUncertain ? "at most " : ""}
            {formatNumber(remaining, 1)} kg/ha still required
          </span>
        ) : (
          ""
        )}
      </span>
    </div>
  );
}

export function RemainingFertiliserRequirementCard({ fieldId, canRecord }: { fieldId: string; canRecord: boolean }) {
  const [result, setResult] = useState<FieldFertiliserStatusResult | undefined>(undefined);
  // Codex audit LOW (round 19): a genuine fetch failure left `result`
  // `undefined` — indistinguishable from "not yet fetched" or a real
  // NOT_APPLICABLE field, both of which also render nothing (line
  // below). A farmer revisiting this screen during a network/database
  // failure, right after recording a real confirmed application, saw
  // the whole card silently vanish rather than an honest "couldn't
  // check" disclosure. Tracked separately so a real failure renders its
  // own real, distinct state instead of being folded into "nothing to
  // show here".
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    // Codex audit HIGH (round 15): this previously reset `result` only
    // when `canRecord` turned off, never on a plain `fieldId` change —
    // switching the selected field on the Nutrients screen started a
    // new fetch but left the PREVIOUS field's requirement/applied/
    // remaining figures rendered under the new field's heading until
    // the new fetch resolved, and indefinitely if it ever rejected (the
    // rejection handler only logged). Resetting unconditionally here,
    // for either real external trigger, closes both: nothing is shown
    // (`!result` renders null) rather than a stale, wrong field's real
    // numbers — the exact "never let one field's identity pair with
    // another field's evidence" discipline this vertical already
    // applies to `Prompt`/`Decision` identity, now applied to this
    // card's own local render state too.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a real isRealMode/fieldId change, not every render.
    setResult(undefined);
    setCheckFailed(false);
    if (!canRecord) return;
    let cancelled = false;
    getFieldFertiliserStatusAction(fieldId).then(
      (value) => {
        if (!cancelled) setResult(value);
      },
      (error: unknown) => {
        console.error("[RemainingFertiliserRequirementCard] getFieldFertiliserStatusAction failed:", error);
        if (!cancelled) setCheckFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fieldId, canRecord]);

  if (!canRecord) return null;

  if (checkFailed) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-3">
            <IconChip icon={Sprout} tone="good" />
            <CardTitle>Remaining requirement</CardTitle>
          </span>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">
          Farm Return couldn&apos;t check this field&apos;s remaining requirement right now — try again shortly.
        </p>
      </Card>
    );
  }

  if (!result || result.status === "not_applicable") return null;

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
          {result.applicationsWithUnknownComposition > 0 ? (
            <p className="mb-2 text-xs text-fr-attention">
              {result.applicationsWithUnknownComposition} confirmed application{result.applicationsWithUnknownComposition === 1 ? "" : "s"} could not be
              included above — product not in Farm Return&apos;s verified catalogue — so the figures below are real lower/upper bounds, not exact.
            </p>
          ) : null}
          <NutrientRow
            label="Nitrogen (N)"
            requirement={result.requirementKgHa.n}
            confirmed={result.confirmedAppliedKgHa.n}
            remaining={result.remainingKgHa.n}
            isUncertain={result.applicationsWithUnknownComposition > 0}
          />
          <NutrientRow
            label="Phosphorus (P)"
            requirement={result.requirementKgHa.p}
            confirmed={result.confirmedAppliedKgHa.p}
            remaining={result.remainingKgHa.p}
            isUncertain={result.applicationsWithUnknownComposition > 0}
          />
          <NutrientRow
            label="Potassium (K)"
            requirement={result.requirementKgHa.k}
            confirmed={result.confirmedAppliedKgHa.k}
            remaining={result.remainingKgHa.k}
            isUncertain={result.applicationsWithUnknownComposition > 0}
          />
          {result.confirmedApplications === 0 ? (
            <p className="mt-2 text-xs text-fr-ink-400">No confirmed applications yet — the full recommendation still remains.</p>
          ) : null}
          {result.applicationsExcludedMultiField > 0 ? (
            <p className="mt-2 text-xs text-fr-ink-400">
              {result.applicationsExcludedMultiField} confirmed application{result.applicationsExcludedMultiField === 1 ? "" : "s"} covered more than
              one field and could not be attributed to this field alone — not included above.
            </p>
          ) : null}
          {result.truncated ? (
            <p className="mt-2 text-xs text-fr-ink-400">This farm has more confirmed records than could be checked — figures above may be incomplete.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-fr-ink-600">Not yet calculable — {result.blockedReasonCode?.replaceAll("_", " ").toLowerCase() ?? "missing field area"}.</p>
      )}
    </Card>
  );
}
