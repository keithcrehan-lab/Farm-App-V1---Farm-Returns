"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { getFertiliserPlanOverviewAction, type FertiliserPlanOverview } from "@/app/actions/fertiliser-plan-overview";
import {
  getFieldFertiliserStatusAction,
  type FieldFertiliserStatusResult,
  type OrganicCreditBasis,
  type TrackedEvidence,
} from "@/app/actions/fertiliser-plan";
import type { PlanningSlurrySource } from "@/domain/slurry-forecast-adoption";
import { CROP_SYSTEM_LABELS, type CropSystem } from "@/domain/fertiliser-field-evidence";
import type { GrassRuleTrace } from "@/domain/grass-fertiliser-engine-v2";

type AuditRow = {
  fieldId: string;
  fieldName: string;
  areaHa: number;
  status: "loading" | "ready" | "error";
  result?: FieldFertiliserStatusResult;
};

function npk(value: { n: number; p: number; k: number }): string {
  return `N ${value.n.toFixed(2)} · P ${value.p.toFixed(2)} · K ${value.k.toFixed(2)} kg/ha`;
}

function inputLabel(key: string): string {
  const labels: Record<string, string> = {
    annualOrganicNStockingRateKgHa: "Annual organic-N stocking rate",
    lowerOrganicN: "Lower published organic-N row",
    upperOrganicN: "Upper published organic-N row",
    interpolationFraction: "Interpolation fraction",
    pIndex: "P Index",
    kIndex: "K Index",
    buildUpKgHa: "P build-up",
    maintenanceKgHa: "P maintenance",
    baselineOrganicN: "K-table baseline organic N",
    productionTargetTDMHa: "Production target",
  };
  return labels[key] ?? key;
}

function inputValue(key: string, value: string | number | boolean | null): string {
  if (value === null) return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value !== "number") return String(value);
  if (key.toLowerCase().includes("fraction")) return value.toFixed(4);
  if (key.toLowerCase().includes("index")) return String(value);
  if (key === "productionTargetTDMHa") return `${value} t DM/ha`;
  if (key.toLowerCase().includes("organicn") || key.toLowerCase().includes("kgha") || key.toLowerCase().includes("maintenance") || key.toLowerCase().includes("buildup")) {
    return `${value.toFixed(2)} kg/ha`;
  }
  return String(value);
}

function RuleTrace({ nutrient, trace }: { nutrient: "N" | "P" | "K"; trace?: GrassRuleTrace }) {
  if (!trace) return null;
  return (
    <div className="border-t border-fr-v2-rule pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-fr-v2-graphite">{nutrient} rule</p>
        <p className="font-mono text-[10px] text-fr-v2-muted">{trace.ruleId}</p>
      </div>
      <p className="mt-1 text-xs text-fr-v2-muted">{trace.source} · {trace.sourceVersion}</p>
      <p className="mt-2 text-sm text-fr-v2-graphite">{trace.method}</p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {Object.entries(trace.inputs).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3 text-xs">
            <span className="text-fr-v2-muted">{inputLabel(key)}</span>
            <span className="text-right font-medium text-fr-v2-graphite">{inputValue(key, value)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm font-semibold text-fr-v2-graphite">Result: {trace.resultKgHa.toFixed(2)} kg {nutrient}/ha</p>
    </div>
  );
}

export function FertiliserCalculationAuditClient({
  fieldId,
  planningSeason,
}: {
  fieldId?: string;
  planningSeason?: string;
}) {
  const [overview, setOverview] = useState<FertiliserPlanOverview | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const nextOverview = await getFertiliserPlanOverviewAction(planningSeason);
        if (cancelled) return;
        setOverview(nextOverview);
        const selected = fieldId
          ? nextOverview.fieldBreakdown.filter((row) => row.fieldId === fieldId)
          : nextOverview.fieldBreakdown;
        setRows(selected.map((row) => ({ fieldId: row.fieldId, fieldName: row.fieldName, areaHa: row.areaHa, status: "loading" })));

        const nextRows = await Promise.all(
          selected.map(async (row): Promise<AuditRow> => {
            try {
              const result = await getFieldFertiliserStatusAction(
                row.fieldId,
                planningSeason,
              );
              return { fieldId: row.fieldId, fieldName: row.fieldName, areaHa: row.areaHa, status: "ready", result };
            } catch {
              return { fieldId: row.fieldId, fieldName: row.fieldName, areaHa: row.areaHa, status: "error" };
            }
          }),
        );
        if (!cancelled) setRows(nextRows);
      } catch (error) {
        console.error("[FertiliserCalculationAuditClient] load failed:", error);
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [fieldId, planningSeason]);

  const readyCount = useMemo(() => rows.filter((row) => row.result?.status === "ok").length, [rows]);

  if (failed) {
    return <Card><p className="text-sm text-fr-ink-600">Farm Return could not load the fertiliser calculation audit.</p></Card>;
  }

  return (
    <div className="mx-auto max-w-5xl pb-12">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <Link href="/fertiliser-plan" className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-fr-green-700">
            <ArrowLeft className="size-4" /> Fertiliser Plan
          </Link>
          <PageHeader
            title="Fertiliser Calculation Audit"
            subtitle={fieldId ? "Reverse-engineer the current P3 recommendation for this field." : "Every P3 field calculation behind the current farm fertiliser recommendation."}
          />
        </div>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white">
          <Printer className="size-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="mb-5 hidden print:block">
        <h1 className="text-xl font-semibold text-fr-ink-900">Fertiliser Calculation Audit</h1>
        <p className="text-sm text-fr-ink-600">{overview?.farmName ?? "Farm Return"} · {overview?.seasonLabel ?? ""}</p>
      </div>

      {!overview || rows.some((row) => row.status === "loading") ? (
        <p className="py-8 text-center text-sm text-fr-ink-600">Loading P3 fertiliser calculations…</p>
      ) : (
        <>
          {!fieldId ? (
            <section className="mb-6 border-y border-fr-v2-rule py-4">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-muted">Farm reconciliation</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-fr-v2-muted">Fields in audit</p>
                  <p className="font-display text-2xl text-fr-v2-graphite">{rows.length}</p>
                </div>
                <div>
                  <p className="text-xs text-fr-v2-muted">P3-ready fields</p>
                  <p className="font-display text-2xl text-fr-v2-graphite">{readyCount}</p>
                </div>
                <div>
                  <p className="text-xs text-fr-v2-muted">Farm gross nutrient requirement</p>
                  <p className="text-sm font-semibold text-fr-v2-graphite">
                    N {overview.nutrientRequirementKg.n.toFixed(2)} · P {overview.nutrientRequirementKg.p.toFixed(2)} · K {overview.nutrientRequirementKg.k.toFixed(2)} kg
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-fr-v2-muted">
                This page does not recalculate recommendations. It renders the same P3 field-status contract used by the live Fertiliser Plan and the procurement basket.
              </p>
            </section>
          ) : null}

          <div className="flex flex-col gap-8">
            {rows.map((row) => {
              if (row.status === "error") {
                return (
                  <section key={row.fieldId} className="border-t border-fr-v2-rule pt-5">
                    <h2 className="font-display text-xl text-fr-v2-graphite">{row.fieldName}</h2>
                    <p className="mt-2 text-sm text-fr-attention">Calculation could not be loaded.</p>
                  </section>
                );
              }
              const result = row.result;
              if (!result || result.status !== "ok") {
                const reason = result?.reasonCode ?? "UNKNOWN";
                const prohibited = result?.status === "prohibited";
                return (
                  <section key={row.fieldId} className="break-inside-avoid border-t border-fr-v2-rule pt-5">
                    <h2 className="font-display text-xl text-fr-v2-graphite">{row.fieldName}</h2>
                    <p className="mt-1 text-sm text-fr-v2-muted">{row.areaHa.toFixed(2)} ha</p>
                    <p className="mt-3 text-sm text-fr-attention">
                      {prohibited
                        ? `Chemical fertiliser legally prohibited: ${reason}. No fertiliser is recommended for this field.`
                        : `Recommendation withheld: ${reason}. No fertiliser quantity is inferred.`}
                    </p>
                  </section>
                );
              }

              const organic = result.organicCreditsKgHa;
              const chemical = result.confirmedAppliedKgHa ?? { n: 0, p: 0, k: 0 };
              const remaining = result.remainingKgHa ?? { n: 0, p: 0, k: 0 };
              const cropLabel = CROP_SYSTEM_LABELS[result.cropSystem as CropSystem] ?? result.cropSystem;

              return (
                <section key={row.fieldId} className="break-inside-avoid border-t border-fr-v2-rule pt-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h2 className="font-display text-2xl text-fr-v2-graphite">{row.fieldName}</h2>
                      <p className="text-sm text-fr-v2-muted">{row.areaHa.toFixed(2)} ha · {cropLabel}</p>
                    </div>
                    <span className="font-mono text-[10px] text-fr-v2-muted">{result.engineVersion}</span>
                  </div>

                  <div className="mt-4 grid gap-5">
                    <AuditBlock title="1. Gross agronomic requirement">
                      <AuditLine label="Engine output" value={npk(result.requirementKgHa)} />
                      <AuditLine label="Interpretation" value="Requirement before slurry/organic credit and before chemical fertiliser already applied this season." />
                    </AuditBlock>

                    <AuditBlock title="2. Rule-by-rule maths and source">
                      <RuleTrace nutrient="N" trace={result.ruleTraces.n} />
                      <RuleTrace nutrient="P" trace={result.ruleTraces.p} />
                      <RuleTrace nutrient="K" trace={result.ruleTraces.k} />
                    </AuditBlock>

                    <AuditBlock title="3. Credits already accounted for">
                      <AuditLine label="Organic / slurry credit" value={npk(organic)} />
                      {result.organicCreditBasis ? <OrganicCreditBasisLines basis={result.organicCreditBasis} /> : null}
                      <AuditLine label="Chemical fertiliser already applied" value={npk(chemical)} />
                      <AuditLine label="Evidence rule" value="Blank evidence is never treated as zero; these credits exist only where the P3 evidence contract resolved them." />
                    </AuditBlock>

                    <AuditBlock title="4. Remaining nutrient requirement">
                      <AuditLine label="N" value={`${result.requirementKgHa.n.toFixed(2)} − ${organic.n.toFixed(2)} − ${chemical.n.toFixed(2)} = ${remaining.n.toFixed(2)} kg N/ha`} />
                      <AuditLine label="P" value={`${result.requirementKgHa.p.toFixed(2)} − ${organic.p.toFixed(2)} − ${chemical.p.toFixed(2)} = ${remaining.p.toFixed(2)} kg P/ha`} />
                      <AuditLine label="K" value={`${result.requirementKgHa.k.toFixed(2)} − ${organic.k.toFixed(2)} − ${chemical.k.toFixed(2)} = ${remaining.k.toFixed(2)} kg K/ha`} />
                    </AuditBlock>

                    <AuditBlock title="5. Product allocation sent to procurement">
                      {result.waterStrip ? (
                        <AuditLine
                          label="Chemical-fertiliser area"
                          value={`${row.areaHa.toFixed(2)} ha − ${result.waterStrip.excludedStripHa.toFixed(2)} ha within 3 m of surface water = ${result.waterStrip.chemicalAreaHa.toFixed(2)} ha (${result.waterStrip.source}; ${result.waterStrip.ruleId})`}
                        />
                      ) : null}
                      {result.recommendedProducts.length === 0 ? (
                        <AuditLine label="Products" value="No purchased fertiliser product currently required." />
                      ) : (
                        result.recommendedProducts.map((product) => (
                          <div key={product.name} className="border-b border-fr-v2-rule py-2 last:border-b-0">
                            <p className="text-sm font-semibold text-fr-v2-graphite">{product.name} · {product.npkAnalysis}</p>
                            <p className="mt-1 text-xs text-fr-v2-muted">
                              {product.rateKgHa.toFixed(2)} kg/ha × {(result.waterStrip?.chemicalAreaHa ?? row.areaHa).toFixed(2)} ha = {product.totalKg.toFixed(2)} kg
                            </p>
                          </div>
                        ))
                      )}
                    </AuditBlock>

                    <AuditBlock title="6. Limitations and modelling disclosures">
                      {result.limitations.length === 0 ? (
                        <AuditLine label="Limitations" value="No additional P3 limitation recorded for this pathway." />
                      ) : (
                        result.limitations.map((limitation, index) => <AuditLine key={limitation} label={`L${index + 1}`} value={limitation} />)
                      )}
                    </AuditBlock>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function trackedLine(evidence: TrackedEvidence<string>): string {
  const own = `${evidence.value} · ${evidence.status} · ${evidence.source}${evidence.sourceDate ? ` (${evidence.sourceDate})` : ""}`;
  return evidence.history.length === 0
    ? own
    : `${own} · replaced ${evidence.history.map((h) => `${h.value} (${h.status}, ${h.source})`).join("; ")}`;
}

function slurrySourceLine(source: PlanningSlurrySource): string {
  switch (source.kind) {
    case "PHYSICAL_RESERVATION":
      return `planned allocation ${source.allocationId ?? "(no id)"}${source.planRevision !== undefined ? ` rev ${source.planRevision}` : ""}`;
    case "FORECAST_INTENT":
      return `adopted forecast ${source.adoptionId} (${source.forecastSource === "FARMER_FORECAST" ? "farmer forecast" : "livestock/store forecast"} of ${source.expectedAvailableM3.toFixed(0)} m³ for ${source.planningDate}, adopted ${source.adoptedAt.slice(0, 10)}; ${source.scenarioVersion}; ${source.adoptionVersion})`;
    case "PREVIEW_SCENARIO":
      return `preview scenario for ${source.planningDate} (${source.scenarioVersion})`;
    case "AUTOMATIC_CANDIDATE":
      return `automatic planning candidate for ${source.planningDate}`;
  }
}

function OrganicCreditBasisLines({ basis }: { basis: OrganicCreditBasis }) {
  const area = basis.spreadableArea;
  const less = basis.lessTrigger;
  return (
    <>
      <AuditLine
        label="Slurry allocation"
        value={`${basis.allocation.volumeM3.toFixed(1)} m³ from store ${basis.allocation.housingId}`}
      />
      {basis.allocation.contributing.map((allocation, index) => (
        <AuditLine
          key={`${allocation.housingId}-${index}`}
          label={`Allocation ${index + 1} identity`}
          value={`${allocation.volumeM3.toFixed(1)} m³ from ${allocation.housingId} · ${slurrySourceLine(allocation.source)}${allocation.compositionRecordId ? ` · composition record ${allocation.compositionRecordId}` : " · no composition record"}`}
        />
      ))}
      <AuditLine label="Application method" value={trackedLine(basis.applicationMethod)} />
      <AuditLine label="Application date" value={trackedLine(basis.applicationDate)} />
      <AuditLine
        label="LESS requirement basis"
        value={
          less.status === "RESOLVED"
            ? `${less.referenceYear} grassland stocking rate ${less.gsrKgNHa} kg N/ha (${less.evidenceStatus}, ${less.source}; record ${less.recordId}) · ${less.version}`
            : `${less.referenceYear ?? "Preceding-year"} grassland stocking rate not established (${less.reasonCode}) — only LESS is accepted · ${less.version}`
        }
      />
      <AuditLine
        label="Spreading area"
        value={
          area.basis === "SPREADABLE_AREA_DECLARATION"
            ? `${area.areaHa.toFixed(2)} ha of ${area.grossAreaHa.toFixed(2)} ha after mapped no-spread areas (${area.source}, ${area.effectiveDate ?? "undated"}; record ${area.recordId}) · ${area.version}`
            : `${area.areaHa.toFixed(2)} ha — the whole mapped field; no no-spread areas declared · ${area.version}`
        }
      />
      <AuditLine label="Application rate" value={`${basis.applicationRateM3ha.toFixed(2)} m³/ha on the spreading area`} />
      <AuditLine
        label="Dry matter"
        value={`${basis.dryMatter.dmPct}% DM · ${basis.dryMatter.status} · ${basis.dryMatter.source}${basis.dryMatter.sourceDate ? ` (${basis.dryMatter.sourceDate})` : ""}${basis.dryMatter.compositionRecordId ? ` · record ${basis.dryMatter.compositionRecordId}` : ""} · ${basis.dryMatter.compositionVersion}`}
      />
      <AuditLine
        label="Availability rule"
        value={`${basis.rule.ruleId} · ${basis.rule.source} · ${basis.rule.timingCategory.toLowerCase()} timing${basis.rule.timingAssumed ? " (assumed)" : ""}${basis.rule.soilIndexAdjustmentApplied.p || basis.rule.soilIndexAdjustmentApplied.k ? " · low soil-index availability adjustment applied" : ""} · evidence ${basis.evidenceState}`}
      />
      <AuditLine label="Slurry calculation" value={basis.calculationVersion} />
      <AuditLine
        label="Credit"
        value={`${npk(basis.creditOnSpreadAreaKgHa)} on the spreading area = ${npk(basis.fieldAverageCreditKgHa)} across the field`}
      />
    </>
  );
}

function AuditBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <h3 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-muted">{title}</h3>
      <div className="border-y border-fr-v2-rule py-2">{children}</div>
    </div>
  );
}

function AuditLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-fr-v2-rule py-2 last:border-b-0 sm:grid-cols-[180px_1fr]">
      <p className="text-xs font-semibold text-fr-v2-muted">{label}</p>
      <p className="text-sm leading-relaxed text-fr-v2-graphite">{value}</p>
    </div>
  );
}
