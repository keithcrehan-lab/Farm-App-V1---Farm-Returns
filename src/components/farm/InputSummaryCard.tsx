"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockInputRequirements, mockSilagePlans } from "@/data/mock-farm";
import { useFields, useIsRealMode, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import {
  calculateFarmConcentrateFeedRequirement,
  calculateFarmFertiliserRequirement,
  withRealInputRequirements,
} from "@/domain/finance";
import { formatEur, formatNumber } from "@/lib/format";

/**
 * Dashboard rollup of the same rows `/input-planner` shows — shares
 * `withRealInputRequirements` rather than its own copy of `mockInputRequirements`
 * so the two screens can never disagree on the real Fertiliser/Feed figures.
 *
 * Codex remediation Priority 3 — a real signed-in farm account only ever
 * sees the Fertiliser/Feed rows this app has a real model for
 * (`withRealInputRequirements`'s `includeUnmodelledRows: false`); Lime,
 * Minerals, Silage inputs, Contractor and Other no longer show the demo
 * farm's fabricated quantity/cost.
 */
export function InputSummaryCard() {
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const isRealMode = useIsRealMode();

  const fertiliserRequirement = calculateFarmFertiliserRequirement({
    fields,
    livestockGroups,
    slurryAllocations,
    silagePlans: isRealMode ? [] : mockSilagePlans,
  });
  const concentrateFeedRequirement = calculateFarmConcentrateFeedRequirement(livestockGroups);
  const inputRequirements = withRealInputRequirements(
    mockInputRequirements,
    fertiliserRequirement,
    concentrateFeedRequirement,
    !isRealMode,
  );
  const forecastSpendEur = inputRequirements.reduce((sum, r) => sum + r.estCost.value, 0);
  const { fieldsWithBlockedEvidence } = fertiliserRequirement;

  if (inputRequirements.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Input Summary</CardTitle>
        </CardHeader>
        {/* Codex audit HIGH (round 25): an empty `inputRequirements` list
            used to render an unconditional "nothing to show yet" message
            even when a real field's evidence was blocked — the same
            "complete-looking empty result" failure this vertical's own
            disclosure discipline exists to prevent. */}
        {fieldsWithBlockedEvidence > 0 ? (
          <p className="text-sm text-fr-attention">
            {fieldsWithBlockedEvidence} field{fieldsWithBlockedEvidence === 1 ? "" : "s"} excluded from the
            Fertiliser forecast — missing livestock or soil evidence — this is not a genuine &ldquo;nothing
            needed&rdquo; farm.
          </p>
        ) : (
          <p className="text-sm text-fr-ink-600">
            No real input requirement to show yet — add fields/livestock and a slurry allocation to see a real
            fertiliser or feed forecast here.
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Input Summary</CardTitle>
        <span className="text-xs text-fr-ink-400">2026 Requirements</span>
      </CardHeader>
      <ul className="flex flex-col gap-2 text-sm">
        {inputRequirements.map((input) => (
          <li key={input.id} className="flex items-center justify-between">
            <span className="text-fr-ink-600">{input.label}</span>
            <span className="flex items-baseline gap-3">
              <span className="text-fr-ink-400">
                {formatNumber(input.requiredQty.value, 1)} {input.unit}
              </span>
              <span className="w-16 text-right font-semibold text-fr-ink-900">
                {formatEur(input.estCost.value)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-fr-border pt-3 text-sm font-semibold text-fr-ink-900">
        <span>Total</span>
        <span>{formatEur(forecastSpendEur)}</span>
      </div>
      {fieldsWithBlockedEvidence > 0 ? (
        <p className="mt-1 text-xs text-fr-attention">
          {fieldsWithBlockedEvidence} field{fieldsWithBlockedEvidence === 1 ? "" : "s"} excluded — missing livestock or soil evidence — this total
          understates the real requirement.
        </p>
      ) : null}
      <Link href="/input-planner" className="mt-4 inline-block text-sm font-medium text-fr-green-700">
        View input planner →
      </Link>
    </Card>
  );
}
