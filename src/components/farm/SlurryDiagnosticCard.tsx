import { ClipboardCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { formatNonNegative, formatNumber } from "@/lib/format";
import {
  SLURRY_DIAGNOSTIC_SCOPE_LINE,
  slurryDiagnosticPresentation,
  type DiagnosticValue,
  type SlurryDiagnosticRow,
} from "@/lib/slurry-diagnostic-presentation";
import type { SlurryRateAllocation } from "@/domain/slurry-rate-allocation";

const NUTRIENT_COLOR: Record<"N" | "P" | "K", string> = {
  N: "text-fr-info",
  P: "text-fr-attention",
  K: "text-fr-risk",
};

function Value({ value, emptyKnownZero }: { value: DiagnosticValue; emptyKnownZero?: string }) {
  if (value.kind === "known") {
    if (emptyKnownZero !== undefined && value.kgHa === 0) return <span className="text-sm text-fr-ink-600">{emptyKnownZero}</span>;
    return (
      <span className="text-sm font-semibold text-fr-ink-900">
        {formatNonNegative(value.kgHa, 0)} <span className="text-xs font-normal text-fr-ink-400">kg/ha</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col">
      <span className="text-sm font-semibold text-fr-ink-600">{value.kind === "unknown" ? "Unknown" : "Not evaluated"}</span>
      <span className="text-xs text-fr-ink-400">{value.reason}</span>
    </span>
  );
}

/** The canonical requirement's source, evidence state and limitations,
 * and the remaining requirement's evidence state, for one nutrient. */
function Provenance({ row }: { row: SlurryDiagnosticRow }) {
  const requirement = row.requirement.kind === "known" ? row.requirement.evidence : undefined;
  const remaining = row.remaining.kind === "known" ? row.remaining.evidence : undefined;
  if (!requirement && !remaining) return null;
  return (
    <li className="flex flex-col gap-1 text-xs text-fr-ink-600" data-testid={`slurry-diagnostic-provenance-${row.nutrient}`}>
      {requirement ? (
        <span>
          <span className={`font-bold ${NUTRIENT_COLOR[row.nutrient]}`}>{row.nutrient}</span> requirement: {requirement.source}
          {requirement.ruleRefs && requirement.ruleRefs.length > 0 ? ` (${requirement.ruleRefs.join(", ")})` : ""} · {requirement.evidenceLabel}
        </span>
      ) : null}
      {remaining ? (
        <span>
          <span className={`font-bold ${NUTRIENT_COLOR[row.nutrient]}`}>{row.nutrient}</span> remaining requirement: {remaining.evidenceLabel}
        </span>
      ) : null}
      {requirement?.limitations && requirement.limitations.length > 0 ? (
        <span className="flex flex-wrap gap-1.5">
          {requirement.limitations.map((limitation) => (
            <Pill key={limitation.code} tone="attention">
              {limitation.label}
            </Pill>
          ))}
        </span>
      ) : null}
    </li>
  );
}

/**
 * Fertiliser Vertical Completion, Increment 2d — the read-only per-field
 * slurry diagnostic. Renders `slurryDiagnosticPresentation` over the
 * caller's `buildSlurryRateAllocation` result; every figure comes from the
 * canonical requirement / slurry contribution / remaining requirement /
 * excess outputs. It evaluates the farmer's planned slurry and never
 * shows a slurry rate of its own.
 */
export function SlurryDiagnosticCard({ allocation }: { allocation: SlurryRateAllocation }) {
  const { planned, evaluation, calculationVersion, upstreamCalculationVersion } = slurryDiagnosticPresentation(allocation);
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={ClipboardCheck} tone="good" />
          <CardTitle>Planned slurry evaluation</CardTitle>
        </span>
      </CardHeader>
      <p className="text-xs text-fr-ink-600">{SLURRY_DIAGNOSTIC_SCOPE_LINE}</p>

      {planned.kind === "none" ? (
        <p className="mt-3 text-sm font-medium text-fr-ink-900">{planned.line}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1">
          <p className="text-xs text-fr-ink-600">Planned slurry</p>
          <p className="text-lg font-bold text-fr-ink-900">
            {formatNumber(planned.rateM3ha, 1)} <span className="text-sm font-normal text-fr-ink-400">m³/ha</span>
          </p>
          <p className="text-xs font-medium text-fr-good">Total for this field: {formatNumber(planned.totalM3, 0)} m³</p>
          {planned.basis ? (
            <>
              <p className="text-xs text-fr-ink-400">
                Slurry contribution basis: {formatNumber(planned.basis.dmPct, 1)}% dry matter · {planned.basis.source}
              </p>
              {planned.basis.assumptions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {planned.basis.assumptions.map((assumption) => (
                    <Pill key={assumption} tone="attention">
                      {assumption}
                    </Pill>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      {evaluation.kind === "not_evaluated" ? (
        <div className="mt-3 flex flex-col items-start gap-1.5 border-t border-fr-border pt-3">
          <Pill tone="neutral">Not evaluated</Pill>
          <p className="text-xs text-fr-ink-600">{evaluation.line}</p>
        </div>
      ) : null}

      {evaluation.kind === "evaluated" ? (
        <div className="mt-3 border-t border-fr-border pt-3">
          {evaluation.excessNutrients.length > 0 ? (
            <div className="mb-3 flex flex-col items-start gap-1.5">
              <Pill tone="attention">Nutrient excess: {evaluation.excessNutrients.join(", ")}</Pill>
              <p className="text-xs text-fr-ink-600">
                At the planned rate, slurry supplies more {evaluation.excessNutrients.join(" and ")} than this field&apos;s requirement.
              </p>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-fr-ink-600">
                  <th className="pb-2 pr-3 font-medium">Nutrient</th>
                  <th className="pb-2 pr-3 font-medium">Slurry contribution</th>
                  <th className="pb-2 pr-3 font-medium">Field requirement</th>
                  <th className="pb-2 pr-3 font-medium">Remaining requirement</th>
                  <th className="pb-2 font-medium">Nutrient excess</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.rows.map((row) => (
                  <tr key={row.nutrient} data-testid={`slurry-diagnostic-${row.nutrient}`} className="border-t border-fr-border align-top">
                    <td className={`py-2 pr-3 text-xs font-bold ${NUTRIENT_COLOR[row.nutrient]}`}>{row.nutrient}</td>
                    <td className="py-2 pr-3">
                      <Value value={row.contribution} />
                    </td>
                    <td className="py-2 pr-3">
                      <Value value={row.requirement} />
                    </td>
                    <td className="py-2 pr-3">
                      <Value value={row.remaining} />
                    </td>
                    <td className="py-2">
                      <Value value={row.excess} emptyKnownZero="None" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5" data-testid="slurry-diagnostic-provenance">
            {evaluation.rows.map((row) => (
              <Provenance key={row.nutrient} row={row} />
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-fr-ink-400" data-testid="slurry-diagnostic-versions">
        Calculation: {calculationVersion} · {upstreamCalculationVersion}
      </p>
    </Card>
  );
}
