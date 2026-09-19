import { HelpCircle, Package } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { formatEur, formatNumber } from "@/lib/format";
import { reconcileDeliveredSupply } from "@/domain/nutrients";
import type { NutrientPlan } from "@/domain/types";

/**
 * Codex remediation Priority 1 (fail-closed nutrients) — whenever a
 * field's real requirement can't be calculated, `products` is already
 * forced to `[]` and `estimatedFieldCostEur` to `0`
 * (`calculateNutrientPlan`), but rendering an empty table with "€0" would
 * itself look like a real "no fertiliser needed" plan. This card shows
 * the real reason instead.
 *
 * Codex audit CRITICAL (round 26): previously gated on `fertilityEvidence`
 * alone, so a field blocked for the *new* silage-evidence reason (a real
 * silage-cut field with no real cut/yield plan — `calculateNutrientPlan`'s
 * own `MISSING_SILAGE_PLAN_DATA` gate) had `fertilityEvidence.status ===
 * "OK"` but `products: []`, rendering an empty table with "Estimated
 * field cost €0" — the exact "blocked evidence looks like a genuine
 * zero" failure this card exists to prevent, just for a reason it didn't
 * yet know about. Fixed by gating on `requirement.status` instead —
 * `calculateNutrientPlan` already forces it `"unavailable"` for EITHER
 * real blocking reason, with `requirement.source` carrying the correct,
 * specific human-readable explanation for whichever one applies — so
 * this card no longer needs to know the reason itself, only whether one
 * exists.
 */
export function PurchasedFertiliserCard({
  products,
  estimatedFieldCostEur,
  requirement,
  netRequirement,
  deliveredKgHa,
  requirementProvisional,
}: {
  products: NutrientPlan["purchasedProducts"];
  estimatedFieldCostEur: number;
  requirement: NutrientPlan["requirement"];
  /** Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
   * F1) — the real net kg/ha need this blend was sized against, and the
   * real total kg/ha it actually delivers, so any real
   * shortfall/excess (a fixed-analysis blend's own byproduct, e.g.
   * 18-6-12's real K) is visible here rather than an apparently
   * complete total that silently omits it. Optional only so an
   * existing caller mid-migration doesn't break — every real caller
   * should pass both. */
  netRequirement?: NutrientPlan["netRequirement"];
  deliveredKgHa?: NutrientPlan["deliveredKgHa"];
  /** Slurry Timing Evidence Patch V1, brief §6 — when real slurry is
   * allocated to this field but its available-nutrient contribution
   * could not be assessed, this figure is not a fully resolved
   * scientific recommendation even though the table/cost below still
   * render (brief §6: "the rest of the fertiliser plan remains
   * actionable"). Computed once in `calculateNutrientPlan`, never
   * re-derived here. Optional only so an existing caller mid-migration
   * doesn't break — every real caller should pass it. */
  requirementProvisional?: NutrientPlan["requirementProvisional"];
}) {
  if (requirement.status !== "estimated") {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-3">
            <IconChip icon={HelpCircle} tone="neutral" />
            <CardTitle>Purchased fertiliser</CardTitle>
          </span>
          <Pill tone="neutral">Insufficient evidence</Pill>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">{requirement.source}</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Package} tone="good" />
          <CardTitle>Purchased fertiliser</CardTitle>
        </span>
      </CardHeader>

      {/* Sized to fit all 5 columns down to a 360px viewport without its
          own scroll — a 3-row table hiding the cost column behind a swipe
          would bury the number farmers care about most. */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-xs sm:text-sm">
          <thead>
            <tr className="text-left text-fr-ink-600">
              <th className="w-[32%] pb-2 pr-1 font-medium">Product</th>
              <th className="w-[17%] pb-2 pr-1 font-medium">N-P-K</th>
              {/* Grassland Fertiliser Pilot Completion, Checkpoint A
                  (audit finding F7/F9) — this column genuinely is the
                  real kg/ha rate (`product.rateKgHa`); the next column
                  is the real whole-field total (`product.totalKg`) and
                  was previously mislabelled "kg/ha" too, showing a
                  field-total number under a per-hectare heading. */}
              <th className="w-[13%] pb-2 pr-1 text-right font-medium">kg/ha</th>
              <th className="w-[19%] pb-2 pr-1 text-right font-medium">kg/field</th>
              <th className="w-[19%] pb-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.name} className="border-t border-fr-border">
                <td className="py-2 pr-1 font-medium leading-tight text-fr-ink-900">{product.name}</td>
                <td className="py-2 pr-1 text-fr-ink-600">{product.npkAnalysis}</td>
                <td className="py-2 pr-1 text-right text-fr-ink-600">{product.rateKgHa}</td>
                <td className="py-2 pr-1 text-right text-fr-ink-600">{formatNumber(product.totalKg, 1)}</td>
                <td className="py-2 text-right font-semibold text-fr-ink-900">{formatEur(product.costEur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {netRequirement && deliveredKgHa ? (
        <div className="mt-3 rounded-fr-control border border-fr-border p-3 text-xs">
          <p className="mb-1.5 font-medium text-fr-ink-600">Real supply vs net requirement (kg/ha)</p>
          <div className="flex gap-5">
            {/* Grassland Fertiliser Pilot Completion, Checkpoint A
                (audit finding F1; Codex audit round 3 HIGH) — the real
                reconciliation arithmetic itself lives in
                `reconcileDeliveredSupply` (`src/domain/nutrients.ts`),
                never in this component: a real, sourced byproduct (e.g.
                18-6-12's own 12% K) delivering more than the net
                requirement is a genuine, expected consequence of this
                app's fixed 3-product catalogue, never automatically a
                compliance breach (K has no NAP ceiling; N/P are
                separately checked against the real statutory ceiling in
                the NAP compliance card above) — rendered here as plain
                agronomic fact, not a warning. */}
            {reconcileDeliveredSupply(netRequirement.value, deliveredKgHa).map((line) => (
              <div key={line.nutrient}>
                <p className="font-bold uppercase text-fr-ink-900">{line.nutrient}</p>
                <p className="text-fr-ink-600">
                  {formatNumber(line.deliveredKgHa, 1)} <span className="text-fr-ink-400">/ {formatNumber(line.needKgHa, 1)} needed</span>
                </p>
                {line.material ? (
                  <p className={line.varianceKgHa > 0 ? "text-fr-attention" : "text-fr-risk"}>
                    {line.varianceKgHa > 0 ? "+" : ""}
                    {formatNumber(line.varianceKgHa, 1)} {line.direction}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Slurry Timing Evidence Patch V1, brief §6 — real slurry is
          allocated to this field but its nutrient contribution could not
          be assessed for the real captured method/timing/DM%
          combination; the figures above still render (a genuine 0
          organic credit was used for calculation safety), but that 0 is
          not a resolved scientific answer, so this is disclosed rather
          than left implicit. */}
      {requirementProvisional?.isProvisional ? (
        <div className="mt-3 flex flex-col gap-1 rounded-fr-control bg-fr-attention-bg px-3 py-2.5">
          <span className="text-xs font-semibold text-fr-attention">{requirementProvisional.headline ?? "Provisional"}</span>
          {requirementProvisional.detail ? <p className="text-xs text-fr-attention">{requirementProvisional.detail}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between rounded-fr-control bg-fr-good-bg px-4 py-2.5">
        <span className="text-sm font-medium text-fr-good">Estimated field cost</span>
        <span className="text-base font-bold text-fr-good">{formatEur(estimatedFieldCostEur)}</span>
      </div>
    </Card>
  );
}
