import { HelpCircle, Leaf } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill, SourceBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import { requirementCardPresentation, type RequirementCardPresentation } from "@/lib/nutrient-card-presentation";
import type { Field, NutrientPlan } from "@/domain/types";

const NUTRIENT_COLOR: Record<"n" | "p" | "k", string> = {
  n: "text-fr-info",
  p: "text-fr-attention",
  k: "text-fr-risk",
};

// The shared CardHeader is a non-wrapping row; on a ~390 px viewport the
// status + source badges overflowed the card's right edge. Wrapping locally
// drops the badges under the title only when they don't fit, so the desktop
// header is unchanged.
const HEADER_WRAP = "flex-wrap";
const BADGE_GROUP = "flex min-w-0 flex-wrap items-center gap-1.5";

/**
 * Codex remediation Priority 1 (fail-closed nutrients) — `plan.requirement`
 * now carries `status: "unavailable"` (P/K zeroed, never shown) whenever
 * `plan.fertilityEvidence` is `BLOCKED_INSUFFICIENT_EVIDENCE` (no recorded
 * P/K Soil Index — Priority 2 removed the fabricated Index-2 default this
 * card used to always be able to show a number for). This card now says so
 * plainly instead of rendering a requirement computed from a guessed
 * index.
 *
 * Codex audit CRITICAL (round 27): previously gated on `fertilityEvidence`
 * alone, so a field blocked for round 26's new silage-evidence reason (a
 * real silage-cut field with no real cut/yield plan) had
 * `fertilityEvidence.status === "OK"` but `requirement.status ===
 * "unavailable"`, rendering N/P/K as "0" and "Total for field 0 kg" as
 * if genuinely nothing were needed. Fixed by gating on
 * `requirement.status` instead — `calculateNutrientPlan` already forces
 * it `"unavailable"` for either real blocking reason, with
 * `requirement.source` carrying the correct, reason-specific message —
 * the same fix `PurchasedFertiliserCard.tsx` already received.
 */
export function NutrientRequirementCard({ plan, field }: { plan: NutrientPlan; field: Field }) {
  const presentation = requirementCardPresentation(plan);
  if (presentation.kind === "mixed") return <MixedRequirementCard presentation={presentation} plan={plan} />;

  if (plan.requirement.status !== "estimated") {
    return (
      <Card>
        <CardHeader className={HEADER_WRAP}>
          <span className="flex items-center gap-3">
            <IconChip icon={HelpCircle} tone="neutral" />
            <CardTitle>Nutrient requirement</CardTitle>
          </span>
          <Pill tone="neutral">Insufficient evidence</Pill>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">{plan.requirement.source}</p>
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
      <CardHeader className={HEADER_WRAP}>
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
          className={BADGE_GROUP}
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
      {/* Slurry Timing Evidence Patch V1, brief §6 — real slurry is
          allocated to this field but its nutrient contribution could not
          be assessed for the real captured method/timing/DM%
          combination, so this gross requirement (and the net requirement/
          purchased-product blend derived from it) is not yet a fully
          resolved scientific recommendation. Computed once in
          `calculateNutrientPlan`, never re-derived here. */}
      {plan.requirementProvisional.isProvisional ? (
        <p className="mt-3 rounded-fr-control bg-fr-attention-bg px-3 py-2 text-xs font-medium text-fr-attention">
          {plan.requirementProvisional.headline ?? "Provisional"}
          {plan.requirementProvisional.detail ? ` — ${plan.requirementProvisional.detail}` : ""}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Per-nutrient P/K Increment 5a (D3) — exactly one soil index recorded: N
 * and the known nutrient from `requirementByNutrient`, the unknown one "—"
 * (never 0) and no NPK total, since an unknown must not be summed as 0.
 * Selection lives in `requirementCardPresentation`; nothing is computed here.
 */
function MixedRequirementCard({
  presentation,
  plan,
}: {
  presentation: Extract<RequirementCardPresentation, { kind: "mixed" }>;
  plan: NutrientPlan;
}) {
  return (
    <Card>
      <CardHeader className={HEADER_WRAP}>
        <span className="flex items-center gap-3">
          <IconChip icon={Leaf} tone="good" />
          <CardTitle>Nutrient requirement</CardTitle>
        </span>
        <span
          className={BADGE_GROUP}
          title={`Calculation version: ${presentation.calculationVersion ?? "unversioned"}`}
        >
          <StatusBadge status={presentation.status} />
          <SourceBadge source={presentation.source} />
        </span>
      </CardHeader>
      <div className="flex gap-6">
        {(["n", "p", "k"] as const).map((key) => {
          const value = presentation.values[key];
          return (
            <div key={key}>
              <p className={`text-sm font-bold ${NUTRIENT_COLOR[key]}`}>{key.toUpperCase()}</p>
              <p className="text-lg font-bold text-fr-ink-900">{value === null ? "—" : formatNumber(value, 0)}</p>
              <p className="text-xs text-fr-ink-400">kg/ha</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col items-start gap-1.5 border-t border-fr-border pt-3">
        <Pill tone="attention">{presentation.pill}</Pill>
        <p className="text-xs text-fr-ink-600">{presentation.line}</p>
      </div>
      {presentation.showProvisional ? (
        <p className="mt-3 rounded-fr-control bg-fr-attention-bg px-3 py-2 text-xs font-medium text-fr-attention">
          {plan.requirementProvisional.headline ?? "Provisional"}
          {plan.requirementProvisional.detail ? ` — ${plan.requirementProvisional.detail}` : ""}
        </p>
      ) : null}
    </Card>
  );
}
