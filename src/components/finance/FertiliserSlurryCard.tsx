"use client";

import { ChevronRight, FlaskConical } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mockSilagePlans } from "@/data/mock-farm";
import { useFields, useIsRealMode, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import { calculateFarmFertiliserCostEur, calculateFarmSlurryNutrientValueEur } from "@/domain/finance";
import { formatEur } from "@/lib/format";

export function FertiliserSlurryCard() {
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const isRealMode = useIsRealMode();
  // Codex remediation Priority 3 — see FeedCostOverviewCard's identical
  // comment: mockSilagePlans never matches a real farm's real field ids,
  // so `[]` for a real account is the honest way to say "no real
  // silage-plan feature yet" rather than relying on an id mismatch.
  const fertiliserInput = { fields, livestockGroups, slurryAllocations, silagePlans: isRealMode ? [] : mockSilagePlans };
  const fertiliserCost = calculateFarmFertiliserCostEur(fertiliserInput);
  const slurryValue = calculateFarmSlurryNutrientValueEur(fertiliserInput);
  const pctOfSpend = fertiliserCost.value.value > 0 ? Math.round((slurryValue.value.value / fertiliserCost.value.value) * 100) : 0;
  // Codex audit HIGH (round 22), extended round 23: `calculateFarmFertiliserCostEur`'s
  // own `estimated` TrackedValue status is about that number's
  // PROVENANCE (a real nutrient-engine calculation), never about
  // whether every real field's own evidence was actually complete — a
  // grazing field with no recorded livestock, OR one with recorded
  // livestock but no recorded P/K Soil Index, is silently excluded, and
  // this total would otherwise show "€0" identically to a genuinely
  // complete "no fertiliser needed" farm.
  // Codex audit HIGH (round 25): `calculateFarmFertiliserCostEur` now
  // carries this count itself — reading it directly, rather than calling
  // `calculateFarmFertiliserRequirement` a second time just to recover
  // it.
  const { fieldsWithBlockedEvidence } = fertiliserCost;

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={FlaskConical} tone="good" />
          <CardTitle>Fertiliser & slurry</CardTitle>
        </span>
        <ChevronRight className="size-4 text-fr-ink-400" />
      </CardHeader>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-fr-ink-600">Estimated fertiliser spend</p>
          <p className="text-metric font-bold text-fr-ink-900">{formatEur(fertiliserCost.value.value)}</p>
          <StatusBadge status={fertiliserCost.value.status} className="mt-1" />
          {fieldsWithBlockedEvidence > 0 ? (
            <p className="mt-1 text-xs text-fr-attention">
              {fieldsWithBlockedEvidence} field{fieldsWithBlockedEvidence === 1 ? "" : "s"} excluded — missing livestock or soil evidence — this
              total understates the real requirement.
            </p>
          ) : null}
        </div>
        <div className="border-t border-fr-border pt-3">
          <p className="text-xs text-fr-ink-600">Slurry nutrient value</p>
          <p className="text-lg font-bold text-fr-ink-900">{formatEur(slurryValue.value.value)}</p>
          <StatusBadge status={slurryValue.value.status} className="mt-1" />
          <p className="mt-1 text-xs text-fr-ink-400">{pctOfSpend}% of fertiliser spend</p>
          {/* Codex audit HIGH (round 24): the slurry-value comparison has
              the identical blocked-evidence exclusion as the fertiliser
              spend total above, but never disclosed it — a field excluded
              here left this total complete-looking at €0. */}
          {slurryValue.fieldsWithBlockedEvidence > 0 ? (
            <p className="mt-1 text-xs text-fr-attention">
              {slurryValue.fieldsWithBlockedEvidence} field{slurryValue.fieldsWithBlockedEvidence === 1 ? "" : "s"} excluded — missing livestock
              or soil evidence — this total understates the real value.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
