"use client";

import { ChevronRight, Euro, ScaleIcon, Target, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatEur, formatNumber } from "@/lib/format";
import { useIsMounted } from "@/lib/use-mounted";
import type { LivestockEconomics, LivestockGroup } from "@/domain/types";

export function EconomicsStatRow({ group, economics }: { group: LivestockGroup; economics: LivestockEconomics }) {
  // economics.targetDate is derived from the wall clock at the moment it
  // was computed (calculateFinishingBudget's `today`), which can genuinely
  // differ between the server's render and the client's — not shown until
  // the client has mounted, so SSR and the client's first paint always
  // render the same "—" rather than risking a hydration mismatch (or,
  // worse, momentarily showing a date computed from the wrong clock).
  const mounted = useIsMounted();
  const targetDate = mounted
    ? new Date(economics.targetDate).toLocaleDateString("en-IE", { day: "numeric", month: "short" })
    : "—";

  return (
    <Card>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <ScaleIcon className="mb-1 size-4 text-fr-ink-400" />
          <p className="text-xs text-fr-ink-600">Avg. liveweight</p>
          <p className="text-lg font-bold text-fr-ink-900">
            {group.avgWeightKg ? formatNumber(group.avgWeightKg.value, 0) : "—"}
            <span className="text-sm font-normal text-fr-ink-400"> kg</span>
          </p>
        </div>
        <div>
          <Target className="mb-1 size-4 text-fr-ink-400" />
          <p className="text-xs text-fr-ink-600">Target weight</p>
          <p className="text-lg font-bold text-fr-ink-900">
            {formatNumber(economics.targetWeightKg, 0)}
            <span className="text-sm font-normal text-fr-ink-400"> kg</span>
          </p>
        </div>
        <div>
          <CalendarDays className="mb-1 size-4 text-fr-ink-400" />
          <p className="text-xs text-fr-ink-600">Target date</p>
          <p className="text-lg font-bold text-fr-ink-900">{targetDate}</p>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <Euro className="mb-1 size-4 text-fr-ink-400" />
            <p className="text-xs text-fr-ink-600">Est. current value</p>
            <p className="text-lg font-bold text-fr-ink-900">{formatEur(economics.currentValueEur.value)}</p>
          </div>
          <ChevronRight className="mt-4 size-4 shrink-0 text-fr-ink-400" />
        </div>
      </div>
    </Card>
  );
}
