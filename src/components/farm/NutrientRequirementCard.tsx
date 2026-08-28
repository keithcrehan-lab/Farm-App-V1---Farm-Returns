import { HelpCircle, Leaf } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill, SourceBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import type { Field, NutrientPlan } from "@/domain/types";

const NUTRIENT_COLOR: Record<"n" | "p" | "k", string> = {
  n: "text-fr-info",
  p: "text-fr-attention",
  k: "text-fr-risk",
};

/**
 * Codex remediation Priority 1 (fail-closed nutrients) — `plan.requirement`
 * now carries `status: "unavailable"` (P/K zeroed, never shown) whenever
 * `plan.fertilityEvidence` is `BLOCKED_INSUFFICIENT_EVIDENCE` (no recorded
 * P/K Soil Index — Priority 2 removed the fabricated Index-2 default this
 * card used to always be able to show a number for). This card now says so
 * plainly instead of rendering a requirement computed from a guessed
 * index.
 */
export function NutrientRequirementCard({ plan, field }: { plan: NutrientPlan; field: Field }) {
  if (plan.fertilityEvidence.status !== "OK") {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-3">
            <IconChip icon={HelpCircle} tone="neutral" />
            <CardTitle>Nutrient requirement</CardTitle>
          </span>
          <Pill tone="neutral">Insufficient evidence</Pill>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">
          This field has no recorded P/K Soil Index, so a fertiliser requirement can&apos;t be calculated — a guessed
          index is never substituted. Add a lab soil test or your own estimate on the Soil screen to unlock this
          field&apos;s plan.
        </p>
        {plan.fertilityEvidence.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? (
          <ul className="mt-2 list-inside list-disc text-xs text-fr-ink-600">
            {plan.fertilityEvidence.missingInputs.map((missing) => (
              <li key={missing}>{missing}</li>
            ))}
          </ul>
        ) : null}
      </Card>
    );
  }

  const { n, p, k } = plan.requirement.value;
  const totalKg = (n + p + k) * field.areaHa;

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Leaf} tone="good" />
          <CardTitle>Nutrient requirement</CardTitle>
        </span>
        {/* Real Farm V1 Phase 8 — "every recommendation ... nutrient
         * source ... relevant provenance" (brief). This figure is
         * genuinely calculated (Teagasc Green Book, versioned engine),
         * not farmer-entered or a raw lab reading, so it carries the same
         * status/source badges the rest of the app already puts on every
         * other TrackedValue rather than being the one card that drops
         * provenance silently. */}
        <span
          className="flex shrink-0 items-center gap-1.5"
          title={`Calculation version: ${plan.requirement.calculationVersion ?? "unversioned"}`}
        >
          <StatusBadge status={plan.requirement.status} />
          <SourceBadge source={plan.requirement.source} />
        </span>
      </CardHeader>
      <div className="flex items-center gap-4">
        <div className="flex flex-1 gap-6">
          {(["n", "p", "k"] as const).map((key) => (
            <div key={key}>
              <p className={`text-sm font-bold ${NUTRIENT_COLOR[key]}`}>{key.toUpperCase()}</p>
              <p className="text-lg font-bold text-fr-ink-900">
                {formatNumber(plan.requirement.value[key], 0)}
              </p>
              <p className="text-xs text-fr-ink-400">kg/ha</p>
            </div>
          ))}
        </div>
        <div className="shrink-0 rounded-fr-control bg-fr-surface-alt px-4 py-3 text-right">
          <p className="text-xs text-fr-ink-600">Total for field</p>
          <p className="text-xs text-fr-ink-400">NPK</p>
          <p className="text-lg font-bold text-fr-ink-900">
            {formatNumber(totalKg, 0)} <span className="text-sm font-normal text-fr-ink-400">kg</span>
          </p>
        </div>
      </div>
    </Card>
  );
}
