import { CalendarCheck, Droplet, Warehouse } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import type { Housing } from "@/domain/types";

function housingDays(period: Housing["housingPeriod"]): number {
  const ms = new Date(period.end).getTime() - new Date(period.start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatDateRange(period: Housing["housingPeriod"]): string {
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short" });
  return `${fmt(period.start)} – ${fmt(period.end)}`;
}

export function ShedCard({ housing }: { housing: Housing }) {
  const fillCurrentM3 = Math.round((housing.storageFillPct / 100) * housing.storageCapacityM3);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-title text-fr-ink-900">{housing.shedName}</h2>
          <p className="text-sm text-fr-ink-600 capitalize">{housing.shedType} shed</p>
          <Pill tone="good" className="mt-2">
            <span className="size-1.5 rounded-full bg-fr-good" />
            Active
          </Pill>
        </div>
        <span className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-fr-surface-alt">
          <Warehouse className="size-9 text-fr-ink-400" />
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-fr-border pt-4 text-sm">
        <div>
          <Droplet className="mb-1 size-4 text-fr-info" />
          <p className="text-xs text-fr-ink-600">Est. slurry volume</p>
          <p className="text-base font-bold text-fr-ink-900">
            {formatNumber(housing.slurryEstimate.volumeM3.value, 0)} m³
          </p>
          <p className="text-xs text-fr-ink-400">This housing period</p>
        </div>
        <div>
          <div className="mb-1 size-4 rounded-full border-2 border-fr-info" />
          <p className="text-xs text-fr-ink-600">Storage fill level</p>
          <p className="text-base font-bold text-fr-ink-900">{housing.storageFillPct}%</p>
          <p className="text-xs text-fr-ink-400">
            {formatNumber(fillCurrentM3, 0)} / {formatNumber(housing.storageCapacityM3, 0)} m³
          </p>
        </div>
        <div>
          <CalendarCheck className="mb-1 size-4 text-fr-green-700" />
          <p className="text-xs text-fr-ink-600">Housing period</p>
          <p className="text-base font-bold text-fr-ink-900">{formatDateRange(housing.housingPeriod)}</p>
          <p className="text-xs text-fr-ink-400">{housingDays(housing.housingPeriod)} days</p>
        </div>
      </div>
    </Card>
  );
}
