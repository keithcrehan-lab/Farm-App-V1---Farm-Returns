import { Beef, CalendarRange, Coins, Sprout } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatNumber } from "@/lib/format";
import type { Field, SilagePlan } from "@/domain/types";

const INTENDED_USE_LABEL: Record<SilagePlan["intendedUse"], string> = {
  own_livestock: "Own livestock",
  sale: "Sale",
  both: "Own livestock + sale",
};

export function SilagePlanCard({ plan, field }: { plan: SilagePlan; field: Field }) {
  const cutLabel = ["First", "Second", "Third"][plan.cutNumber - 1] ?? `${plan.cutNumber}th`;
  const window = plan.targetCutWindow.value;
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short" });
  const days = Math.round(
    (new Date(window.end).getTime() - new Date(window.start).getTime()) / (1000 * 60 * 60 * 24),
  );

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Sprout} tone="good" />
          <CardTitle>Silage plan</CardTitle>
        </span>
      </CardHeader>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <Sprout className="mb-1 size-4 text-fr-ink-400" />
          <p className="text-xs text-fr-ink-600">Expected DM yield</p>
          <p className="text-base font-bold text-fr-ink-900">
            {formatNumber(plan.expectedYieldTDMha.value, 1)} t DM/ha
          </p>
          <p className="text-xs text-fr-good">
            ≈ {formatNumber(plan.expectedYieldTDMha.value * field.areaHa, 1)} t DM total
          </p>
        </div>
        <div>
          <Coins className="mb-1 size-4 text-fr-ink-400" />
          <p className="text-xs text-fr-ink-600">Expected bales</p>
          <p className="text-base font-bold text-fr-ink-900">
            {plan.expectedBales ? `≈ ${formatNumber(plan.expectedBales, 0)} bales` : "—"}
          </p>
        </div>
        <div>
          <CalendarRange className="mb-1 size-4 text-fr-ink-400" />
          <p className="text-xs text-fr-ink-600">Cutting window</p>
          <p className="text-base font-bold text-fr-ink-900">
            {fmt(window.start)} – {fmt(window.end)}
          </p>
          <p className="text-xs text-fr-ink-400">{days}-day window</p>
        </div>
        <div>
          <Beef className="mb-1 size-4 text-fr-ink-400" />
          <p className="text-xs text-fr-ink-600">Intended use</p>
          <p className="text-base font-bold text-fr-ink-900">{INTENDED_USE_LABEL[plan.intendedUse]}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-fr-ink-400">{cutLabel} cut · {plan.harvestSystem}</p>
    </Card>
  );
}
