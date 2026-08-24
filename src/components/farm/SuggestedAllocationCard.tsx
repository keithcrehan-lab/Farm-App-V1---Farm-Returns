"use client";

import { Info } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useFields } from "@/store/farm-store";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { SlurryAllocation } from "@/domain/types";

const PRIORITY_STYLE: Record<SlurryAllocation["priority"], { badge: string; bar: string; label: string; text: string }> = {
  high: { badge: "border-fr-good text-fr-good", bar: "bg-fr-good", label: "High priority", text: "text-fr-good" },
  medium: { badge: "border-fr-attention text-fr-attention", bar: "bg-fr-attention", label: "Medium priority", text: "text-fr-attention" },
  not_suitable: { badge: "border-fr-risk text-fr-risk", bar: "bg-fr-risk", label: "Not suitable", text: "text-fr-risk" },
};

/** Ranked slurry-to-field allocation — spec §6 "allocate slurry to fields". */
export function SuggestedAllocationCard({ allocations }: { allocations: SlurryAllocation[] }) {
  const fields = useFields();
  const ranked = [...allocations].sort((a, b) => b.score - a.score);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Suggested allocation
          <Info className="size-4 text-fr-ink-400" />
        </CardTitle>
      </CardHeader>
      <ul className="flex flex-col gap-3">
        {ranked.map((allocation, i) => {
          const field = fields.find((f) => f.id === allocation.fieldId);
          const style = PRIORITY_STYLE[allocation.priority];
          return (
            <li key={allocation.fieldId} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md border text-sm font-bold",
                  style.badge,
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold text-fr-ink-900">{field?.name ?? allocation.fieldId}</span>
                  <span className={cn("text-xs font-medium", style.text)}>{style.label}</span>
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-fr-surface-alt">
                  <div
                    className={cn("h-full rounded-full", style.bar)}
                    style={{ width: `${Math.max(allocation.score, 3)}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right text-sm">
                <p className={cn("font-bold", style.text)}>{allocation.score}</p>
                <p className="text-xs text-fr-ink-400">{formatNumber(allocation.volumeM3, 0)} m³</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
