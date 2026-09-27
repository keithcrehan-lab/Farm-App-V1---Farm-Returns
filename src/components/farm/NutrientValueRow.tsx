import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatNumber } from "@/lib/format";
import type { SlurryEstimate } from "@/domain/types";
import { slurryEstimateNutrientEvidence } from "@/domain/slurry-evidence-context";

const NUTRIENTS: { key: "availableN" | "availableP" | "availableK"; label: string; badge: string; bg: string }[] = [
  { key: "availableN", label: "N", badge: "bg-fr-good text-white", bg: "" },
  { key: "availableP", label: "P", badge: "bg-fr-attention text-white", bg: "" },
  { key: "availableK", label: "K", badge: "bg-fr-info text-white", bg: "" },
];

/** N/P/K available from slurry — spec §6 organic-manure conversion output.
 * Campaign A (A1.3): a nutrient nobody has calculated reads "Unknown",
 * never "0 kg" (`slurryEstimateNutrientEvidence`). */
export function NutrientValueRow({ slurry, subtitle = "Total" }: { slurry: SlurryEstimate; subtitle?: string }) {
  const evidence = slurryEstimateNutrientEvidence(slurry);
  const byKey = { availableN: evidence.n, availableP: evidence.p, availableK: evidence.k };
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
            {byKey[n.key].state === "known" ? (
              <>
                <p className="text-lg font-bold text-fr-ink-900">{formatNumber(slurry[n.key].value, 0)} kg</p>
                <p className="text-xs text-fr-ink-400">{subtitle}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-fr-ink-400">Unknown</p>
                <p className="text-xs text-fr-ink-400">Not yet calculated</p>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
