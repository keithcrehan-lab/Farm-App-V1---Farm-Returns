"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { getFertiliserPlanOverviewAction, type FertiliserPlanOverview } from "@/app/actions/fertiliser-plan-overview";
import {
  getScientificEvidenceReportForFieldAction,
  type ScientificEvidenceReport,
  type ScientificEvidenceReportError,
} from "@/app/actions/scientific-evidence-report";

type AuditRow = {
  fieldId: string;
  fieldName: string;
  areaHa: number;
  status: "loading" | "ready" | "error";
  report?: ScientificEvidenceReport;
  error?: ScientificEvidenceReportError;
};

function isError(
  value: ScientificEvidenceReport | ScientificEvidenceReportError,
): value is ScientificEvidenceReportError {
  return "status" in value && (value.status === "not_found" || value.status === "not_a_soil_sample" || value.status === "not_confirmed");
}

function npk(value: { n: number; p: number; k: number }): string {
  return `N ${value.n} · P ${value.p} · K ${value.k} kg/ha`;
}

function outcomeLabel<T>(
  outcome: { status: string; value?: T; reasonCode?: string },
  format: (value: T) => string,
): string {
  if (outcome.status === "OK" && outcome.value !== undefined) return format(outcome.value);
  return outcome.reasonCode ?? outcome.status;
}

export function FertiliserCalculationAuditClient({ fieldId }: { fieldId?: string }) {
  const [overview, setOverview] = useState<FertiliserPlanOverview | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const nextOverview = await getFertiliserPlanOverviewAction();
        if (cancelled) return;
        setOverview(nextOverview);

        const selected = fieldId
          ? nextOverview.fieldBreakdown.filter((row) => row.fieldId === fieldId)
          : nextOverview.fieldBreakdown;

        setRows(
          selected.map((row) => ({
            fieldId: row.fieldId,
            fieldName: row.fieldName,
            areaHa: row.areaHa,
            status: "loading",
          })),
        );

        const reports = await Promise.all(
          selected.map(async (row) => {
            const result = await getScientificEvidenceReportForFieldAction(row.fieldId);
            return { row, result };
          }),
        );
        if (cancelled) return;

        setRows(
          reports.map(({ row, result }) =>
            isError(result)
              ? {
                  fieldId: row.fieldId,
                  fieldName: row.fieldName,
                  areaHa: row.areaHa,
                  status: "error" as const,
                  error: result,
                }
              : {
                  fieldId: row.fieldId,
                  fieldName: row.fieldName,
                  areaHa: row.areaHa,
                  status: "ready" as const,
                  report: result,
                },
          ),
        );
      } catch (error) {
        console.error("[FertiliserCalculationAuditClient] load failed:", error);
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fieldId]);

  const readyRows = useMemo(() => rows.filter((row) => row.status === "ready" && row.report), [rows]);

  if (failed) {
    return (
      <Card>
        <p className="text-sm text-fr-ink-600">Farm Return could not load the fertiliser calculation audit.</p>
      </Card>
    );
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
            subtitle={
              fieldId
                ? "Reverse-engineer the current recommendation for this field."
                : "Every field calculation behind the current farm fertiliser recommendation."
            }
          />
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Printer className="size-4" />
          Print / Save as PDF
        </button>
      </div>

      <div className="mb-5 hidden print:block">
        <h1 className="text-xl font-semibold text-fr-ink-900">Fertiliser Calculation Audit</h1>
        <p className="text-sm text-fr-ink-600">{overview?.farmName ?? "Farm Return"} · {overview?.seasonLabel ?? ""}</p>
      </div>

      {!overview || rows.some((row) => row.status === "loading") ? (
        <p className="py-8 text-center text-sm text-fr-ink-600">Loading canonical fertiliser calculations…</p>
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
                  <p className="text-xs text-fr-v2-muted">Fields with full calculation</p>
                  <p className="font-display text-2xl text-fr-v2-graphite">{readyRows.length}</p>
                </div>
                <div>
                  <p className="text-xs text-fr-v2-muted">Farm nutrient requirement</p>
                  <p className="text-sm font-semibold text-fr-v2-graphite">
                    N {overview.nutrientRequirementKg.n} · P {overview.nutrientRequirementKg.p} · K {overview.nutrientRequirementKg.k} kg
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-fr-v2-muted">
                This page does not recalculate recommendations. It renders the same canonical NutrientPlan outputs already used by the Fertiliser Plan.
              </p>
            </section>
          ) : null}

          <div className="flex flex-col gap-8">
            {rows.map((row) => {
              if (row.status === "error" || !row.report) {
                return (
                  <section key={row.fieldId} className="break-inside-avoid border-t border-fr-v2-rule pt-5">
                    <h2 className="font-display text-xl text-fr-v2-graphite">{row.fieldName}</h2>
                    <p className="mt-1 text-sm text-fr-v2-muted">{row.areaHa.toFixed(2)} ha</p>
                    <p className="mt-3 text-sm text-fr-attention">
                      Calculation report unavailable: {row.error?.reasonCode ?? "missing required evidence"}.
                    </p>
                  </section>
                );
              }

              const report = row.report;
              const plan = report.nutrientPlan;

              return (
                <section key={row.fieldId} className="break-inside-avoid border-t border-fr-v2-rule pt-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h2 className="font-display text-2xl text-fr-v2-graphite">{report.field.name}</h2>
                      <p className="text-sm text-fr-v2-muted">{report.field.areaHa.toFixed(2)} ha</p>
                    </div>
                    <Link
                      href={`/evidence-report/field/${report.field.id}`}
                      className="text-xs font-semibold text-fr-v2-forest print:hidden"
                    >
                      Open full scientific evidence →
                    </Link>
                  </div>

                  {!plan ? (
                    <p className="mt-4 text-sm text-fr-attention">
                      {report.nutrientPlanUnavailableReason ?? "No current nutrient plan is calculable for this field."}
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-5">
                      <AuditBlock title="1. Inputs and evidence">
                        <AuditLine label="Field area" value={`${report.field.areaHa.toFixed(2)} ha`} />
                        <AuditLine
                          label="P Index"
                          value={outcomeLabel(plan.fertilityEvidenceByNutrient.p, (v) => `Index ${(v as { index: number }).index}`)}
                        />
                        <AuditLine
                          label="K Index"
                          value={outcomeLabel(plan.fertilityEvidenceByNutrient.k, (v) => `Index ${(v as { index: number }).index}`)}
                        />
                        <AuditLine label="Calculation version" value={plan.calculationVersion} />
                      </AuditBlock>

                      <AuditBlock title="2. Gross nutrient requirement">
                        <AuditLine label="Engine output" value={npk(plan.requirement.value)} />
                        {plan.calculationTrace?.basis === "grazing" && plan.calculationTrace.grazing ? (() => {
                          const trace = plan.calculationTrace.grazing;
                          const n = trace.n;
                          const nMath =
                            n.lowerRow.stockingRateLUHa === n.upperRow.stockingRateLUHa
                              ? `Table 12-3 row ${n.lowerRow.stockingRateLUHa.toFixed(2)} LU/ha → ${n.resultKgHa.toFixed(2)} kg N/ha`
                              : `${n.lowerRow.totalNKgHa} + ((${trace.stockingRateLUHa.toFixed(4)} − ${n.lowerRow.stockingRateLUHa}) ÷ (${n.upperRow.stockingRateLUHa} − ${n.lowerRow.stockingRateLUHa})) × (${n.upperRow.totalNKgHa} − ${n.lowerRow.totalNKgHa}) = ${n.resultKgHa.toFixed(2)} kg N/ha`;
                          const pBand = trace.p.maintenanceBandMaxOrgNKgHa === null ? "> 210" : `≤ ${trace.p.maintenanceBandMaxOrgNKgHa}`;
                          return (
                            <>
                              <AuditLine
                                label="Stocking rate"
                                value={`${trace.totalLivestockUnits.toFixed(3)} LU ÷ ${trace.farmGrasslandAreaHa.toFixed(3)} ha = ${trace.stockingRateLUHa.toFixed(4)} LU/ha`}
                              />
                              <AuditLine label="N maths — Table 12-3" value={nMath} />
                              <AuditLine
                                label="P maths — Tables 13-2 + 13-3"
                                value={`Index ${trace.p.soilIndex}: ${trace.p.buildUpKgHa.toFixed(2)} build-up + ${trace.p.maintenanceKgHa.toFixed(2)} maintenance (band ${pBand}) = ${trace.p.resultKgHa.toFixed(2)} kg P/ha`}
                              />
                              <AuditLine
                                label="K maths — Table 14-1"
                                value={`Index ${trace.k.soilIndex}: ${trace.k.baseAt170KgOrgNHa.toFixed(2)} + ((${trace.k.stockingRateKgNHa.toFixed(2)} − 170) ÷ 40 × 5) = ${trace.k.resultKgHa.toFixed(2)} kg K/ha`}
                              />
                            </>
                          );
                        })() : null}
                        <AuditLine
                          label="Interpretation"
                          value="Canonical agronomic requirement before organic nutrient credit."
                        />
                      </AuditBlock>

                      <AuditBlock title="3. Organic nutrient credit">
                        <AuditLine label="Slurry application rate" value={`${plan.organicApplication.rateM3ha} m³/ha`} />
                        <AuditLine label="Slurry total" value={`${plan.organicApplication.totalM3} m³`} />
                        <AuditLine label="Dry matter used" value={`${plan.organicApplication.dmPct}%`} />
                        <AuditLine label="DM evidence source" value={plan.organicApplication.dmPctEvidence.source} />
                        <AuditLine
                          label="Availability rule"
                          value={outcomeLabel(plan.organicApplication.availableNutrientBasis, (v) => {
                            const basis = v as { ruleId: string; source: string; timingCategory: string; applicationMethod?: string };
                            return `${basis.ruleId} · ${basis.applicationMethod ?? "assumed/default method"} · ${basis.timingCategory} · ${basis.source}`;
                          })}
                        />
                        <AuditLine
                          label="Available N / P / K credit"
                          value={`N ${plan.organicApplication.offsetN} · P ${plan.organicApplication.offsetP} · K ${plan.organicApplication.offsetK} kg/ha`}
                        />
                      </AuditBlock>

                      <AuditBlock title="4. Net chemical requirement">
                        <AuditLine
                          label="Equation"
                          value={`gross requirement − organic credit, floored at zero`}
                        />
                        <AuditLine
                          label="N"
                          value={`${plan.requirement.value.n} − ${plan.organicApplication.offsetN} = ${plan.netRequirement.value.n} kg/ha`}
                        />
                        <AuditLine
                          label="P"
                          value={`${plan.requirement.value.p} − ${plan.organicApplication.offsetP} = ${plan.netRequirement.value.p} kg/ha`}
                        />
                        <AuditLine
                          label="K"
                          value={`${plan.requirement.value.k} − ${plan.organicApplication.offsetK} = ${plan.netRequirement.value.k} kg/ha`}
                        />
                      </AuditBlock>

                      <AuditBlock title="5. Recommended product allocation">
                        <AuditLine label="Purchase status" value={plan.purchaseStatus.status} />
                        {plan.purchasedProducts.length === 0 ? (
                          <AuditLine label="Products" value="No purchased fertiliser product currently recommended." />
                        ) : (
                          plan.purchasedProducts.map((product) => (
                            <div key={`${row.fieldId}-${product.name}`} className="border-b border-fr-v2-rule py-2 last:border-b-0">
                              <p className="text-sm font-semibold text-fr-v2-graphite">{product.name} · {product.npkAnalysis}</p>
                              <p className="mt-1 text-xs text-fr-v2-muted">
                                {product.rateKgHa} kg/ha × {report.field.areaHa.toFixed(2)} ha = {product.totalKg} kg total
                              </p>
                            </div>
                          ))
                        )}
                      </AuditBlock>

                      <AuditBlock title="6. Reconciliation">
                        <AuditLine label="Net requirement" value={npk(plan.netRequirement.value)} />
                        <AuditLine label="Delivered by recommended blend" value={npk(plan.deliveredKgHa)} />
                        <AuditLine
                          label="Check"
                          value="Compare delivered N/P/K with net N/P/K above. Any deliberate excess or shortfall is visible here rather than hidden."
                        />
                      </AuditBlock>

                      {plan.requirementProvisional.isProvisional ? (
                        <p className="border-l-2 border-fr-v2-straw pl-3 text-xs leading-relaxed text-fr-attention">
                          {plan.requirementProvisional.headline} — {plan.requirementProvisional.detail}
                        </p>
                      ) : null}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function AuditBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-fr-v2-graphite">{title}</h3>
      <div className="mt-2 border-y border-fr-v2-rule">{children}</div>
    </div>
  );
}

function AuditLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] gap-3 border-b border-fr-v2-rule py-2 text-sm last:border-b-0">
      <span className="text-fr-v2-muted">{label}</span>
      <span className="font-medium text-fr-v2-graphite">{value}</span>
    </div>
  );
}
