import { Beef } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { StatusBadge, SourceBadge, Pill } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import { promptStatusTone } from "@/lib/status";
import type { NutrientPlan } from "@/domain/types";
import type { EngineOutcome } from "@/domain/evidence";

const NUTRIENT_COLOR: Record<"offsetN" | "offsetP" | "offsetK", string> = {
  offsetN: "text-fr-info",
  offsetP: "text-fr-attention",
  offsetK: "text-fr-risk",
};

const APPLICATION_METHOD_LABEL: Record<"LESS" | "splashplate" | "incorporate_24h" | "other", string> = {
  LESS: "Low Emission Slurry Spreading (LESS)",
  splashplate: "Splashplate",
  incorporate_24h: "Incorporated within 24 hours",
  other: "Other",
};

/** Slurry Timing Evidence Patch V1 — farmer-facing labels for
 * `timingCategory` (Teagasc Farm Carbon Navigator periods). */
const TIMING_CATEGORY_LABEL: Record<"SPRING" | "SUMMER" | "LATE_SUMMER" | "UNSUPPORTED", string> = {
  SPRING: "Spring (Jan-Apr)",
  SUMMER: "Summer (May-Jun)",
  LATE_SUMMER: "Late summer (Jul-Oct)",
  UNSUPPORTED: "Outside the Carbon Navigator's published periods",
};

/** CC-B2 audit F004 — which soil index is missing, in plain words. */
function missingSoilIndexDetail(missingInputs: readonly string[]): string {
  const p = missingInputs.includes("fertility.pIndex");
  const k = missingInputs.includes("fertility.kIndex");
  const missing = p && k ? "soil P and K indices are" : p ? "soil P index is" : k ? "soil K index is" : "soil P/K index is";
  return `This field's ${missing} missing, so the phosphorus and potassium credit from slurry isn't counted. Record the field's soil test to assess it.`;
}

/**
 * Slurry Application Context V1 — the farmer-facing disclosure of
 * `organic.availableNutrientAssessment` (`resolveAvailableSlurryNutrients`,
 * `src/domain/nutrients.ts`): which real Teagasc rule (if any) produced
 * the N/P/K figures above, distinguishing a real evidenced result — and
 * whether it's a confirmed captured method or this app's disclosed
 * ASSUMED spring/splashplate default — from an honest NOT_ASSESSED/
 * UNSUPPORTED state. Never renders a fabricated nutrient value for an
 * unsupported context (brief §6/§8) — `offsetN/P/K` above are already 0
 * in that case; this block only ever adds words, never numbers.
 */
function AvailableNutrientAssessment({
  assessment,
  offsetN,
}: {
  assessment: NutrientPlan["organicApplication"]["availableNutrientAssessment"];
  offsetN: number;
}) {
  if (assessment.status === "NOT_APPLICABLE") return null; // no slurry applied this run — nothing to disclose

  if (assessment.status !== "OK") {
    const nRetained =
      assessment.status === "BLOCKED_INSUFFICIENT_EVIDENCE" && assessment.reasonCode === "MISSING_SOIL_FERTILITY_INDEX" && offsetN > 0;
    const detail =
      assessment.status === "AMBIGUOUS"
        ? "This field's contributing slurry allocations report different, conflicting application methods — record a single, reconciled method to unlock an evidenced figure."
        : assessment.status === "BLOCKED_INSUFFICIENT_EVIDENCE" && assessment.reasonCode === "SLURRY_APPLICATION_CONTEXT_UNSUPPORTED_METHOD"
          ? "Farm Return has no Teagasc-evidenced available-nutrient table for the recorded application method yet."
          : // Slurry Timing Evidence Patch V1 — a real timing category was
            // resolved (from the recorded application date, or the
            // pre-existing spring assumption), but Farm Return has no
            // evidenced available-nutrient rule for that method/timing
            // combination — e.g. a genuine late-summer/September date, or
            // splashplate outside spring. Never silently treated as spring
            // or summer (brief §5).
            assessment.status === "BLOCKED_INSUFFICIENT_EVIDENCE" && assessment.reasonCode === "SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED"
            ? "Farm Return has no Teagasc-evidenced available-nutrient table for the recorded application timing — this is not the same as a zero contribution, it is genuinely not yet assessed."
            : // CC-B2 audit F004 — the slurry's P/K credit depends on the
              // field's soil P/K Index, and that index is missing; the
              // dry matter % itself is supported.
              assessment.status === "BLOCKED_INSUFFICIENT_EVIDENCE" && assessment.reasonCode === "MISSING_SOIL_FERTILITY_INDEX"
              ? missingSoilIndexDetail(assessment.missingInputs)
              : assessment.status === "BLOCKED_INSUFFICIENT_EVIDENCE"
              ? "The recorded slurry dry matter % has no exact match in the published table for this method/timing (no interpolation without validated evidence)."
              : undefined;
    return (
      <div className="mt-3 flex flex-col gap-1.5 border-t border-fr-border pt-3">
        {/* CC-FU-A — a missing soil P/K index withholds only the P and K
            credit; the engine keeps the evidenced slurry N (`offsetN`,
            CC-B2 F003 / CC-B4A), so this must not read as nothing assessed. */}
        {nRetained ? (
          <>
            <Pill tone="attention">N credit included</Pill>
            <p className="text-xs text-fr-ink-600">Slurry N credit is included. P and K credit isn&apos;t counted yet.</p>
          </>
        ) : (
          <>
            <Pill tone="neutral">Not yet assessed</Pill>
            <p className="text-xs text-fr-ink-600">Available nutrient contribution not yet assessed for this application context.</p>
          </>
        )}
        {detail ? <p className="text-xs text-fr-ink-400">{detail}</p> : null}
      </div>
    );
  }

  const { value } = assessment;
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-fr-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-fr-ink-600">
          Application method:{" "}
          <span className="font-semibold text-fr-ink-900">
            {value.applicationMethod ? APPLICATION_METHOD_LABEL[value.applicationMethod] : "Not yet recorded (assumed splashplate)"}
          </span>
        </span>
        {value.assumedDefault ? <Pill tone="attention">Assumed default</Pill> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-fr-ink-600">
          Timing: <span className="font-semibold text-fr-ink-900">{TIMING_CATEGORY_LABEL[value.timingCategory]}</span>
        </span>
        {value.timingAssumed ? <Pill tone="attention">Assumed (no date recorded)</Pill> : null}
      </div>
      {value.applicationDate ? (
        <span className="text-xs text-fr-ink-600">
          Application date: <span className="font-semibold text-fr-ink-900">{value.applicationDate}</span>
        </span>
      ) : null}
      <p className="text-xs text-fr-ink-400">Scientific basis: Teagasc-backed available nutrient estimate ({value.source}).</p>
      {value.assumedDefault ? (
        <p className="text-xs text-fr-ink-400">Record this allocation&apos;s real application method to replace this assumption with an evidenced figure.</p>
      ) : null}
      {value.timingAssumed ? (
        <p className="text-xs text-fr-ink-400">Record this allocation&apos;s real application date to replace the spring assumption with an evidenced timing.</p>
      ) : null}
    </div>
  );
}

/**
 * Slurry Closed-Period Wiring V1 — the real, distinct statutory
 * closed-period status for slurry's own real legal category
 * (`organic_fertiliser_other_than_FYM`, S.I. 588/2025), evaluated against
 * this field's real farm county and its real application date when one
 * has been captured on the contributing `SlurryAllocation`, else today's
 * real date. The caller (`NutrientsPageClient.tsx`) builds this from
 * `promptForSpreadingWindow`/`checkSpreadingWindowGate` directly — the
 * same real gate the pre-existing chemical-fertiliser "Plan this
 * application" timing disclosure already uses — never a duplicated or
 * hand-rolled date comparison inside this component. Genuinely separate
 * from `AvailableNutrientAssessment` above: that block is about how much
 * nutrient credit slurry contributes (Teagasc Farm Carbon Navigator
 * timing science); this block is about whether spreading slurry on this
 * field is currently legally permitted at all (S.I. 588/2025) — two real,
 * independent facts that happen to both concern "when."
 */
function SlurryClosedPeriodDisclosure({ closedPeriod }: { closedPeriod: { title: string; description: string; status: EngineOutcome<unknown>["status"] } }) {
  const label =
    closedPeriod.status === "OK"
      ? "Slurry spreading open"
      : closedPeriod.status === "LEGAL_PROHIBITION"
        ? "Slurry spreading closed"
        : "Slurry spreading status needs review";
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-fr-border pt-3">
      <div className="flex items-center gap-2">
        <Pill tone={promptStatusTone(closedPeriod.status)}>{label}</Pill>
      </div>
      <p className="text-xs text-fr-ink-600">{closedPeriod.title}</p>
      <p className="text-xs text-fr-ink-400">{closedPeriod.description}</p>
    </div>
  );
}

export function OrganicNutrientsCard({
  organic,
  closedPeriod,
}: {
  organic: NutrientPlan["organicApplication"];
  /** See `SlurryClosedPeriodDisclosure`'s own doc comment. Optional so
   * every existing caller/test that doesn't pass it keeps compiling and
   * rendering unchanged — absent, this block simply doesn't render
   * rather than showing a stale or fabricated status. */
  closedPeriod?: { title: string; description: string; status: EngineOutcome<unknown>["status"] };
}) {
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Beef} tone="good" />
          <CardTitle>Organic nutrients</CardTitle>
        </span>
      </CardHeader>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div>
          <p className="text-xs text-fr-ink-600">Planned slurry application</p>
          <p className="text-lg font-bold text-fr-ink-900">
            {formatNumber(organic.rateM3ha, 0)} <span className="text-sm font-normal text-fr-ink-400">m³/ha</span>
          </p>
          <p className="text-xs font-medium text-fr-good">Total: {formatNumber(organic.totalM3, 0)} m³</p>
        </div>
        <div>
          <p className="mb-1.5 text-xs text-fr-ink-600">Nutrient offset from slurry</p>
          <div className="flex gap-5">
            {(["offsetN", "offsetP", "offsetK"] as const).map((key) => (
              <div key={key}>
                <p className={`text-xs font-bold ${NUTRIENT_COLOR[key]}`}>{key.replace("offset", "")}</p>
                <p className="text-base font-bold text-fr-ink-900">{formatNumber(organic[key], 0)}</p>
                <p className="text-xs text-fr-ink-400">kg/ha</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Slurry Evidence & Composition V1 — item 7 (explainability): which
          dry matter % this calculation actually used, and whether it's the
          Teagasc national-average assumption or a real measured/farmer-
          provided figure for this field's own contributing shed/tank. See
          `resolveEffectiveSlurryComposition` (`src/domain/nutrients.ts`). */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-fr-border pt-3">
        <span className="text-xs text-fr-ink-600">
          Dry matter used:{" "}
          <span className="font-semibold text-fr-ink-900">
            {organic.dmPctEvidence.status === "unavailable" ? "Not resolved" : `${formatNumber(organic.dmPct, 1)}%`}
          </span>
        </span>
        <StatusBadge status={organic.dmPctEvidence.status} />
        <SourceBadge source={organic.dmPctEvidence.source} />
      </div>
      <AvailableNutrientAssessment assessment={organic.availableNutrientAssessment} offsetN={organic.offsetN} />
      {closedPeriod ? <SlurryClosedPeriodDisclosure closedPeriod={closedPeriod} /> : null}
    </Card>
  );
}
