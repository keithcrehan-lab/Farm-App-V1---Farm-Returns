import { Beef, FlaskConical, Package, Sprout, Wheat } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { formatEur, formatNumber } from "@/lib/format";
import type { InputCategory, InputRequirement } from "@/domain/types";

const CATEGORY_ICON: Record<InputCategory, React.ComponentType<{ className?: string }>> = {
  fertiliser: FlaskConical,
  feed: Beef,
  lime: Sprout,
  minerals: FlaskConical,
  silage_inputs: Wheat,
  contractor: Package,
  other: Package,
};

const DEMAND_STATE_LABEL: Record<InputRequirement["demandState"], string> = {
  forecast: "Forecast",
  farmer_confirmed: "Confirmed",
  committed: "Committed",
  purchased: "Purchased",
};

function windowLabel(window: InputRequirement["requiredByWindow"]): string {
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-IE", { month: "short" });
  return `${fmt(window.start)} – ${fmt(window.end)}`;
}

/** One Input Planner row — design-system.md's InputRequirementRow. */
export function InputRequirementRow({ input }: { input: InputRequirement }) {
  const Icon = CATEGORY_ICON[input.category];

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3 sm:w-40 sm:shrink-0">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fr-green-100">
          <Icon className="size-4 text-fr-green-700" />
        </span>
        <span className="text-sm font-semibold text-fr-ink-900">{input.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:flex sm:flex-1 sm:gap-6">
        <div>
          <p className="text-xs text-fr-ink-600">Requirement</p>
          <p className="font-semibold text-fr-ink-900">
            {formatNumber(input.requiredQty.value, 1)} {input.unit}
          </p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Est. cost</p>
          <p className="font-semibold text-fr-ink-900">{formatEur(input.estCost.value)}</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Timing</p>
          <p className="font-semibold text-fr-ink-900">{windowLabel(input.requiredByWindow)}</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Confidence</p>
          <p className="font-semibold text-fr-ink-900">{input.confidencePct}%</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 sm:w-40 sm:shrink-0 sm:justify-end">
        <Pill tone={input.demandState === "forecast" ? "neutral" : "good"}>
          {DEMAND_STATE_LABEL[input.demandState]}
        </Pill>
        <button
          type="button"
          disabled
          title="Buying groups arrive with Phase 6"
          className="rounded-full border border-fr-green-700/40 px-3 py-1 text-xs font-medium text-fr-green-700/70"
        >
          Join Group
        </button>
      </div>
    </Card>
  );
}
