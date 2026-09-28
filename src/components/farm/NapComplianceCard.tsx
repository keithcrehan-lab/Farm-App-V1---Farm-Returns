import { HelpCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { EngineOutcome } from "@/domain/evidence";
import type { NapComplianceCheck } from "@/domain/types";

/**
 * Checks this field's planned total N/P application against the statutory
 * NAP ceiling — src/domain/nutrients.ts's `checkNapCompliance`, built from
 * a real S.I. 588/2025 extract (grazing land) or the still-unverified
 * Green Book cut-only tables. The `regulatory` distinction is shown
 * explicitly (a "Statutory ceiling" pill vs "Unconfirmed") rather than
 * presenting both with the same visual weight — the whole reason this
 * data was worth re-verifying in the first place (CLAUDE.md: "regulatory
 * status (planning advice vs. compliance value)" is required metadata on
 * every material recommendation).
 *
 * V3 fix (`SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` conflict #1) —
 * `compliance` is now an `EngineOutcome<NapComplianceCheck>`: the real
 * statutory Grassland Stocking Rate cannot always be determined (this
 * farm's real herd today has no captured age/sex data), and when it
 * can't, this card must say so plainly rather than showing a ceiling
 * computed from the wrong figure — a real `INSUFFICIENT_EVIDENCE` result
 * (spec Section 4), not a UI failure state to work around.
 */
export function NapComplianceCard({ compliance }: { compliance: EngineOutcome<NapComplianceCheck> }) {
  if (compliance.status !== "OK") {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-3">
            <IconChip icon={HelpCircle} tone="neutral" />
            <CardTitle>NAP compliance</CardTitle>
          </span>
          <Pill tone="neutral">Insufficient evidence</Pill>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">{blockedExplanation(compliance.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? compliance.reasonCode : undefined)}</p>
      </Card>
    );
  }

  return <NapComplianceCardOk compliance={compliance.value} />;
}

/** Campaign B (B4.4) — plain language per blocking reason; internal
 * reason codes and input identifiers are never shown to the farmer. */
function blockedExplanation(reasonCode: string | undefined): string {
  switch (reasonCode) {
    case "MISSING_SOIL_FERTILITY_INDEX":
      return "This field's P and K Soil Index have not been recorded yet, so a compliance ceiling cannot be shown.";
    case "MISSING_SILAGE_PLAN_DATA":
      return "This field is recorded as a silage cut but has no cut and yield plan yet, so a compliance ceiling cannot be shown.";
    case "SLURRY_COMPOSITION_SOURCES_UNRESOLVED":
      return "This field's planned slurry comes from more than one tank with separate test results, so the total applied cannot be worked out yet.";
    case "REGULATORY_NEAT_SLURRY_VOLUME_UNKNOWN":
      return "Farm Return knows how much slurry is planned for this field, but not how much of it is neat cattle slurry for regulatory calculations, so the N/P total cannot be checked yet. You can record each tank's neat cattle slurry on the Housing & Slurry screen.";
    case "COMPLIANCE_P_INDEX_NOT_LABORATORY":
      return "This field's P Index is not from a laboratory soil test, so the statutory value of the planned slurry cannot be worked out yet.";
    case "PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED":
      return "Slurry from your own grazing stock and imported slurry count differently towards this field's N/P limits, and Farm Return doesn't know which this is, so the check is not shown. You can record where it came from on your slurry plan.";
    case "HOME_GRAZING_MANURE_WITHOUT_GRAZING_LIVESTOCK":
      return "This slurry is recorded as coming from your own grazing stock, but your herd record has no grazing stock, so the check is not shown.";
    case "P_INDEX_4_HOME_MANURE_SURPLUS_UNRESOLVED":
      return "This field is P Index 4. Your own stock's slurry can only go on it if there is some left over after all your Index 1–3 fields' P needs are met, and that can't be worked out from this field alone.";
    case "REGULATORY_EVIDENCE_STALE":
      return "Farm Return couldn't reload your latest slurry plan and evidence after a change, so the check is not shown until it reloads.";
    default:
      return "The statutory stocking rate that sets this field's NAP N/P ceiling could not be determined for this farm's current herd, so a compliance ceiling cannot be shown.";
  }
}

function NapComplianceCardOk({ compliance }: { compliance: NapComplianceCheck }) {
  const isCompliant = compliance.nWithinCeiling && compliance.pWithinCeiling;
  const isConfirmed = compliance.regulatory === "compliance_value";
  // Codex audit HIGH (round 29): the "Unconfirmed" pill was already
  // correct, but the icon tone, the red N/P figures, and the exceedance
  // paragraph below all rendered with the same "risk"/red styling as a
  // real, confirmed statutory violation regardless of `isConfirmed` — a
  // field whose classification is only `"planning_advice"` (round 28's
  // own new unresolved-plannedUse reason, or a disregarded soil test)
  // visually screamed "confirmed breach" for a figure the engine itself
  // says isn't one. `"attention"` (this app's real intermediate tone,
  // already used for the soil-test-disregarded/sale-evidence blocks
  // just below) replaces `"risk"` throughout whenever unconfirmed.
  const exceedanceTone = !isCompliant && isConfirmed ? "risk" : !isCompliant ? "attention" : "good";

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={isCompliant ? ShieldCheck : ShieldAlert} tone={exceedanceTone} />
          <CardTitle>NAP compliance</CardTitle>
        </span>
        <Pill tone={isConfirmed ? "info" : "neutral"}>
          {isConfirmed ? "Statutory ceiling" : "Unconfirmed"}
        </Pill>
      </CardHeader>

      <div className="flex flex-wrap gap-6">
        <div>
          <p className="text-xs text-fr-ink-600">N planned vs ceiling</p>
          <p className={cn("text-lg font-bold", compliance.nWithinCeiling ? "text-fr-ink-900" : isConfirmed ? "text-fr-risk" : "text-fr-attention")}>
            {formatNumber(compliance.nRequiredKgHa, 0)}
            <span className="text-sm font-normal text-fr-ink-400"> / {formatNumber(compliance.nCeilingKgHa, 0)} kg/ha</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">P planned vs ceiling</p>
          <p className={cn("text-lg font-bold", compliance.pWithinCeiling ? "text-fr-ink-900" : isConfirmed ? "text-fr-risk" : "text-fr-attention")}>
            {formatNumber(compliance.pRequiredKgHa, 0)}
            <span className="text-sm font-normal text-fr-ink-400"> / {formatNumber(compliance.pCeilingKgHa, 0)} kg/ha</span>
          </p>
        </div>
      </div>

      {!isCompliant ? (
        <p className={cn("mt-3 rounded-fr-control px-3 py-2 text-xs font-medium", isConfirmed ? "bg-fr-risk-bg text-fr-risk" : "bg-fr-attention-bg text-fr-attention")}>
          {isConfirmed ? "Planned" : "Based on an unconfirmed classification, planned"} application
          {isConfirmed ? "" : " may"} exceed{isConfirmed ? "s" : ""} the {compliance.landUse === "grazing" ? "grazing" : "cut-only"} ceiling for
          this field&apos;s stocking rate{compliance.landUse === "cut_only" ? "" : " and P Index"} — reduce the
          nutrient plan or review the field&apos;s stocking allocation{isConfirmed ? "" : " once the classification is confirmed"}.
        </p>
      ) : null}

      {compliance.saleEvidenceRequired && !compliance.saleEvidenceConfirmed ? (
        <p className="mt-3 rounded-fr-control bg-fr-surface-alt px-3 py-2 text-xs font-medium text-fr-ink-600">
          This cut is marked for sale but has no confirmed written evidence of sale on file — the higher sale-route
          ceiling (Tables 16 &amp; 17) cannot be used until it is; the ordinary grassland ceiling above applies
          instead.
        </p>
      ) : null}

      {compliance.soilTestDisregardedReason ? (
        <p className="mt-3 rounded-fr-control bg-fr-attention-bg px-3 py-2 text-xs font-medium text-fr-attention">
          {compliance.soilTestDisregardedReason}
        </p>
      ) : null}

      {/* Codex audit CRITICAL (round 28): a field whose plannedUse was
          never recorded got a confidently-classified NAP ceiling
          assuming grazing, with no disclosure that this was an
          assumption — the identical disclosure mechanism this card
          already has for a disregarded soil test. */}
      {compliance.plannedUseUnresolvedReason ? (
        <p className="mt-3 rounded-fr-control bg-fr-attention-bg px-3 py-2 text-xs font-medium text-fr-attention">
          {compliance.plannedUseUnresolvedReason}
        </p>
      ) : null}

      {compliance.pIndexNotLaboratoryReason ? (
        <p className="mt-3 rounded-fr-control bg-fr-attention-bg px-3 py-2 text-xs font-medium text-fr-attention">
          {compliance.pIndexNotLaboratoryReason}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-fr-ink-400">
        {compliance.landUse === "grazing" ? "Grazing land" : "Cut-only grassland"} · organic-N stocking rate{" "}
        {formatNumber(compliance.orgNStockingRateKgHa, 0)} kg/ha · {compliance.legislation}
      </p>
    </Card>
  );
}
