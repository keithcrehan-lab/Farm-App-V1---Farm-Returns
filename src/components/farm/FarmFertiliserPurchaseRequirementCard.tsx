"use client";

/**
 * Fertiliser Vertical V1, Checkpoint 3 (item D/E) — the farm-wide
 * Purchase Requirement, in tonnes: "how much of each real fertiliser
 * product does this farm still need to buy, across every field,
 * accounting for what's already planned and confirmed applied this
 * season". Fetched via `getFarmFertiliserDemandAction`
 * (`src/app/actions/fertiliser-plan.ts`), which itself only ever reuses
 * `getFarmFertiliserDemand`'s own real, already-audited kg aggregation
 * (`src/orchestration/fertiliser-plan/index.ts`) — this component
 * computes nothing itself and never re-derives a tonnage independently;
 * it only renders `purchaseRequirementTonnes`, a real, exact conversion
 * of those same kg totals (`toFarmFertiliserPurchaseRequirementTonnes`,
 * `src/domain/fertiliser-plan.ts`).
 *
 * Deliberately farm-wide, not field-scoped — unlike every other card on
 * the Nutrients screen, this one does not change when a different field
 * is selected; it always summarises the whole farm.
 */
import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatNumber } from "@/lib/format";
import { getFarmFertiliserDemandAction, type FarmFertiliserDemandActionResult } from "@/app/actions/fertiliser-plan";

function formatTonnes(value: number): string {
  return `${formatNumber(value, 2)} t`;
}

export function FarmFertiliserPurchaseRequirementCard({ canRecord }: { canRecord: boolean }) {
  const [result, setResult] = useState<FarmFertiliserDemandActionResult | undefined>(undefined);
  // Mirrors RemainingFertiliserRequirementCard's own tri-state discipline
  // (Codex audit LOW round 19 there): a genuine fetch failure must render
  // its own honest disclosure, never be indistinguishable from "nothing
  // to show" or "not yet fetched".
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a real canRecord change, not every render.
    setResult(undefined);
    setCheckFailed(false);
    if (!canRecord) return;
    let cancelled = false;
    getFarmFertiliserDemandAction().then(
      (value) => {
        if (!cancelled) setResult(value);
      },
      (error: unknown) => {
        console.error("[FarmFertiliserPurchaseRequirementCard] getFarmFertiliserDemandAction failed:", error);
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
            <IconChip icon={ShoppingCart} tone="good" />
            <CardTitle>Farm fertiliser requirement</CardTitle>
          </span>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">
          Farm Return couldn&apos;t check your farm-wide purchase requirement right now — try again shortly.
        </p>
      </Card>
    );
  }

  if (!result) return null;

  // Codex audit HIGH (round 1): this used to filter on
  // `remainingTotalTonnes` — the rounded DISPLAY figure. A real
  // farm-wide remainder below 5 kg rounds to "0.00 t" but is not
  // genuinely zero; filtering (or the "nothing left to buy" empty
  // state below) on the rounded value could silently drop a real,
  // small purchase requirement, or tell a farmer there is nothing left
  // to buy when `remainingTotalKg` says otherwise. Gates on the exact
  // `remainingTotalKg` instead — rounding only ever affects what's
  // displayed, never whether a line is included.
  const lines = result.purchaseRequirementTonnes.filter((line) => line.remainingTotalKg > 0);

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={ShoppingCart} tone="good" />
          <CardTitle>Farm fertiliser requirement</CardTitle>
        </span>
      </CardHeader>

      {lines.length === 0 ? (
        <p className="text-sm text-fr-ink-600">
          Nothing left to buy right now — every currently recommended product is already fully planned or applied this
          season.
        </p>
      ) : (
        <div className="flex flex-col">
          {lines.map((line) => (
            <div key={line.product} className="flex items-center justify-between border-t border-fr-border py-2 text-sm first:border-t-0">
              <span className="font-medium text-fr-ink-900">
                {line.product}
                <span className="ml-1.5 font-normal text-fr-ink-400">({line.npkAnalysis})</span>
              </span>
              <span className="text-fr-ink-600">
                {formatTonnes(line.recommendedTotalTonnes)} required
                <span className="ml-1.5 font-semibold text-fr-ink-900">· {formatTonnes(line.remainingTotalTonnes)} still to buy</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {result.applicationsWithUnknownComposition > 0 ? (
        <p className="mt-2 text-xs text-fr-attention">
          {result.applicationsWithUnknownComposition} confirmed application{result.applicationsWithUnknownComposition === 1 ? "" : "s"} farm-wide could
          not be included above — product, quantity or unit missing, unverified, or not in Farm Return&apos;s verified catalogue — so the figures above
          are real lower bounds on what&apos;s already applied, not exact.
        </p>
      ) : null}
      {result.fieldsWithBlockedEvidence > 0 ? (
        <p className="mt-2 text-xs text-fr-ink-400">
          {result.fieldsWithBlockedEvidence} field{result.fieldsWithBlockedEvidence === 1 ? "" : "s"} could not be included in the figures above — add
          the missing evidence (most commonly a recorded livestock group) to include{" "}
          {result.fieldsWithBlockedEvidence === 1 ? "it" : "them"}.
        </p>
      ) : null}
      {result.truncated ? (
        <p className="mt-2 text-xs text-fr-ink-400">This farm has more records than could be checked — figures above may be incomplete.</p>
      ) : null}
    </Card>
  );
}
