import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatNumber } from "@/lib/format";
import type { SlurryEstimate } from "@/domain/types";

const NUTRIENTS: { key: "availableN" | "availableP" | "availableK"; label: string; badge: string; bg: string }[] = [
  { key: "availableN", label: "N", badge: "bg-fr-good text-white", bg: "" },
  { key: "availableP", label: "P", badge: "bg-fr-attention text-white", bg: "" },
  { key: "availableK", label: "K", badge: "bg-fr-info text-white", bg: "" },
];

/** N/P/K available from slurry — spec §6 organic-manure conversion output. */
export function NutrientValueRow({ slurry, subtitle = "Total" }: { slurry: SlurryEstimate; subtitle?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Estimated nutrient value <span className="font-normal text-fr-ink-400">(from slurry)</span>
        </CardTitle>
      </CardHeader>
      <div className="grid grid-cols-3 gap-3">
        {NUTRIENTS.map((n) => (
          <div key={n.key} className="rounded-fr-control border border-fr-border p-3">
            <span className={`mb-2 flex size-7 items-center justify-center rounded-full text-sm font-bold ${n.badge}`}>
              {n.label}
            </span>
            <p className="text-xs text-fr-ink-600">Available {n.label}</p>
            <p className="text-lg font-bold text-fr-ink-900">{formatNumber(slurry[n.key].value, 0)} kg</p>
            <p className="text-xs text-fr-ink-400">{subtitle}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
