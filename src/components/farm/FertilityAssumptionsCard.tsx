"use client";

import { ChevronRight, FlaskConical } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { IndexSelector } from "@/components/ui/IndexSelector";
import { phStatusLabel } from "@/lib/status";
import { useFarm, useFarmActions } from "@/store/farm-store";
import type { SoilFertility } from "@/domain/types";

/**
 * Same fertility assumptions the Soil screen shows for this field, kept in
 * sync via the shared farm store (enter-once): tapping a P/K index here
 * farmer-adjusts the same TrackedValue the Soil page reads, so the change
 * is visible in both places immediately.
 */
export function FertilityAssumptionsCard({ fieldId, fertility }: { fieldId: string; fertility: SoilFertility }) {
  const farm = useFarm();
  const { updateFieldIndex } = useFarmActions();
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={FlaskConical} tone="good" />
          <CardTitle>Fertility assumptions</CardTitle>
        </span>
        <ChevronRight className="size-4 text-fr-ink-400" />
      </CardHeader>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <IndexSelector
          label="P Index"
          value={fertility.pIndex.value}
          tone={fertility.pIndex.status === "farmer_adjusted" ? "attention" : "good"}
          onSelect={(v) => updateFieldIndex(fieldId, "pIndex", v, farm.ownerName)}
        />
        <IndexSelector
          label="K Index"
          value={fertility.kIndex.value}
          tone={fertility.kIndex.status === "farmer_adjusted" ? "attention" : "good"}
          onSelect={(v) => updateFieldIndex(fieldId, "kIndex", v, farm.ownerName)}
        />
        {fertility.pH ? (
          <div>
            <p className="mb-1.5 text-xs text-fr-ink-600">pH status</p>
            <p className="text-sm font-semibold text-fr-ink-900">
              {phStatusLabel(fertility.pH.value)}
              <span className="font-normal text-fr-ink-400"> ({fertility.pH.value})</span>
            </p>
          </div>
        ) : null}
        <button
          type="button"
          disabled
          title="Test upload arrives with the Phase 2 data model"
          className="ml-auto self-center rounded-full border border-fr-green-700/40 px-3.5 py-1.5 text-sm font-medium text-fr-green-700/70"
        >
          Add soil test
        </button>
      </div>
    </Card>
  );
}
