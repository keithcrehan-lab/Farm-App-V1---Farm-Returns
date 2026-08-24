import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
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
 */
export function NapComplianceCard({ compliance }: { compliance: NapComplianceCheck }) {
  const isCompliant = compliance.nWithinCeiling && compliance.pWithinCeiling;
  const isConfirmed = compliance.regulatory === "compliance_value";

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={isCompliant ? ShieldCheck : ShieldAlert} tone={isCompliant ? "good" : "risk"} />
          <CardTitle>NAP compliance</CardTitle>
        </span>
        <Pill tone={isConfirmed ? "info" : "neutral"}>
          {isConfirmed ? "Statutory ceiling" : "Unconfirmed"}
        </Pill>
      </CardHeader>

      <div className="flex flex-wrap gap-6">
        <div>
          <p className="text-xs text-fr-ink-600">N planned vs ceiling</p>
          <p className={cn("text-lg font-bold", compliance.nWithinCeiling ? "text-fr-ink-900" : "text-fr-risk")}>
            {formatNumber(compliance.nRequiredKgHa, 0)}
            <span className="text-sm font-normal text-fr-ink-400"> / {formatNumber(compliance.nCeilingKgHa, 0)} kg/ha</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">P planned vs ceiling</p>
          <p className={cn("text-lg font-bold", compliance.pWithinCeiling ? "text-fr-ink-900" : "text-fr-risk")}>
            {formatNumber(compliance.pRequiredKgHa, 0)}
            <span className="text-sm font-normal text-fr-ink-400"> / {formatNumber(compliance.pCeilingKgHa, 0)} kg/ha</span>
          </p>
        </div>
      </div>

      {!isCompliant ? (
        <p className="mt-3 rounded-fr-control bg-fr-risk-bg px-3 py-2 text-xs font-medium text-fr-risk">
          Planned application exceeds the {compliance.landUse === "grazing" ? "grazing" : "cut-only"} ceiling for
          this field&apos;s stocking rate{compliance.landUse === "cut_only" ? "" : " and P Index"} — reduce the
          nutrient plan or review the field&apos;s stocking allocation.
        </p>
      ) : null}

      <p className="mt-3 text-xs text-fr-ink-400">
        {compliance.landUse === "grazing" ? "Grazing land" : "Cut-only grassland"} · organic-N stocking rate{" "}
        {formatNumber(compliance.orgNStockingRateKgHa, 0)} kg/ha · {compliance.legislation}
      </p>
    </Card>
  );
}
