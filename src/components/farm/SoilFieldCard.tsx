"use client";

import { CheckCircle2, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { IndexSelector } from "@/components/ui/IndexSelector";
import { FieldThumbnail } from "@/components/farm/FieldThumbnail";
import { useFarm, useFarmActions } from "@/store/farm-store";
import type { Field } from "@/domain/types";

/**
 * The field soil row from mobile-soil-overview.png: thumbnail, mapped
 * soil/drainage, provenance badge, and P/K index selectors. Tapping a P/K
 * index farmer-adjusts that assumption (Phase 2 — see
 * src/domain/provenance.ts's farmerAdjust, which chains the prior value
 * rather than overwriting it); uploading a verified test is still a
 * Phase 3+ flow (no lab-report ingestion yet).
 */
export function SoilFieldCard({ field }: { field: Field }) {
  const { fertility, mappedSoil } = field;
  const badgeStatus = fertility.verifiedTest ? "verified" : fertility.pIndex.status;
  const farm = useFarm();
  const { updateFieldIndex } = useFarmActions();

  return (
    <Card className="flex gap-4 p-4">
      <FieldThumbnail field={field} className="h-auto w-24" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex justify-end">
          <StatusBadge status={badgeStatus} className="shrink-0" />
        </div>
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="shrink-0 text-xs text-fr-ink-600">Mapped soil</span>
            <span className="text-right font-semibold leading-tight text-fr-ink-900">
              {mappedSoil.dominantSeries}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <span className="shrink-0 text-xs text-fr-ink-600">Drainage</span>
            <span className="text-right font-semibold capitalize leading-tight text-fr-ink-900">
              {mappedSoil.drainage.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <IndexSelector
            label="P Index (assumption)"
            value={fertility.pIndex.value}
            tone={fertility.pIndex.status === "farmer_adjusted" ? "attention" : "good"}
            onSelect={(v) => updateFieldIndex(field.id, "pIndex", v, farm.ownerName)}
          />
          <IndexSelector
            label="K Index (assumption)"
            value={fertility.kIndex.value}
            tone={fertility.kIndex.status === "farmer_adjusted" ? "attention" : "good"}
            onSelect={(v) => updateFieldIndex(field.id, "kIndex", v, farm.ownerName)}
          />
        </div>

        {fertility.verifiedTest ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-fr-good">
              <CheckCircle2 className="size-4" />
              Verified test on{" "}
              {new Date(fertility.verifiedTest.sampleDate).toLocaleDateString("en-IE", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <button type="button" disabled className="font-medium text-fr-ink-400" title="Test report viewer arrives with Phase 2">
              View test →
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              disabled
              title="Test upload arrives with the Phase 2 data model"
              className="flex items-center gap-1 font-medium text-fr-green-700/70"
            >
              <Plus className="size-4" />
              Add soil test
            </button>
            <button type="button" disabled className="font-medium text-fr-info/70" title="Editing arrives with the Phase 2 data model">
              Edit assumptions →
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
