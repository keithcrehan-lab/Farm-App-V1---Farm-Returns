"use client";

/**
 * Fertiliser Vertical V1, Checkpoint 4 — the Scientific Evidence Report.
 * The last link in `SOIL_SAMPLING_ARCHITECTURE.md`'s frozen chain:
 *
 *   ... -> CompositeSample -> LabResult -> SoilInterpretation
 *     -> NutrientRequirement -> ProductAllocation -> FertiliserPlan
 *       -> Actual -> ScientificEvidenceReport (this screen)
 *
 * Every figure rendered here is fetched, never recomputed — this
 * component composes nothing itself. `getScientificEvidenceReportAction`
 * (`src/app/actions/scientific-evidence-report.ts`) already assembled
 * the real chain from the same, already-audited sources every other
 * screen reads (`buildScientificEvidenceReport`,
 * `src/orchestration/scientific-evidence-report/index.ts`).
 *
 * Printable (browser "Print" / "Save as PDF" — `AppShell`'s own
 * `print:hidden` chrome, added for this screen, keeps the sidebar/nav
 * out of the printed page) and exports a "machine-reproducible manifest"
 * — the exact JSON this screen renders, for independent verification.
 */
import { useEffect, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatEur, formatNumber } from "@/lib/format";
import {
  getScientificEvidenceReportAction,
  type ScientificEvidenceReport,
  type ScientificEvidenceReportError,
} from "@/app/actions/scientific-evidence-report";
import type { EngineOutcome } from "@/domain/evidence";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 break-inside-avoid rounded-fr-card border border-fr-border bg-fr-surface p-5 print:border-fr-ink-400 print:p-0 print:pb-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fr-ink-600">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-fr-border py-1.5 text-sm first:border-t-0">
      <span className="text-fr-ink-600">{label}</span>
      <span className="text-right font-medium text-fr-ink-900">{value}</span>
    </div>
  );
}

/** A single, honest one-line label for any real `EngineOutcome` — never
 * a bare "OK"/"BLOCKED" code, and never fabricates a compliant-sounding
 * label for a status this engine genuinely could not resolve. */
function outcomeLabel(outcome: EngineOutcome<unknown> | undefined, okLabel: (value: unknown) => string): string {
  if (!outcome) return "Not assessed";
  switch (outcome.status) {
    case "OK":
      return okLabel(outcome.value);
    case "NOT_APPLICABLE":
      return "Not applicable";
    case "LEGAL_PROHIBITION":
      return `Prohibited — ${outcome.consequence}`;
    case "BLOCKED_INSUFFICIENT_EVIDENCE":
      return `Cannot determine — ${outcome.reasonCode.replaceAll("_", " ").toLowerCase()}`;
    case "AMBIGUOUS":
      return `Ambiguous — ${outcome.detail}`;
    case "UNKNOWN":
      return `Unknown — ${outcome.reasonCode.replaceAll("_", " ").toLowerCase()}`;
  }
}

function isError(result: ScientificEvidenceReport | ScientificEvidenceReportError): result is ScientificEvidenceReportError {
  return "reasonCode" in result;
}

export function EvidenceReportPageClient({ jobSessionId }: { jobSessionId: string }) {
  const [result, setResult] = useState<ScientificEvidenceReport | ScientificEvidenceReportError | undefined>(undefined);
  const [checkFailed, setCheckFailed] = useState(false);
  const [showManifest, setShowManifest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getScientificEvidenceReportAction(jobSessionId).then(
      (value) => {
        if (!cancelled) setResult(value);
      },
      (error: unknown) => {
        console.error("[EvidenceReportPageClient] getScientificEvidenceReportAction failed:", error);
        if (!cancelled) setCheckFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [jobSessionId]);

  if (checkFailed) {
    return (
      <>
        <MobileDetailHeader title="Evidence report" backHref="/fields" />
        <PageHeader title="Scientific Evidence Report" subtitle="Couldn't load this report" />
        <p className="text-sm text-fr-ink-600">Farm Return couldn&apos;t check this report right now — try again shortly.</p>
      </>
    );
  }

  if (!result) return null;

  if (isError(result)) {
    const message: Record<ScientificEvidenceReportError["status"], string> = {
      not_found: "This sample could not be found on your farm.",
      not_a_soil_sample: "This job session is not a soil sample.",
      not_confirmed: "This soil sample has not been confirmed yet — a report is only available once sampling is confirmed.",
    };
    return (
      <>
        <MobileDetailHeader title="Evidence report" backHref="/fields" />
        <PageHeader title="Scientific Evidence Report" subtitle="Not available" />
        <p className="text-sm text-fr-ink-600">{message[result.status]}</p>
      </>
    );
  }

  const r = result;
  const plan = r.nutrientPlan;

  return (
    <>
      <MobileDetailHeader title="Evidence report" backHref={`/soil-sample/${r.field.id}`} />

      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 print:hidden">
          <PageHeader
            title="Scientific Evidence Report"
            subtitle={`${r.compositeSample.sampleId} — ${r.field.name}, ${r.farm.name}`}
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Printer className="size-4" /> Print / Save as PDF
          </button>
        </div>

        {/* Print-only header — PageHeader's own root is not itself hidden
            in print (only the button above is), so this stays a compact,
            unambiguous title for the printed page. */}
        <div className="mb-4 hidden print:block">
          <h1 className="text-xl font-semibold text-fr-ink-900">Scientific Evidence Report</h1>
          <p className="text-sm text-fr-ink-600">
            {r.compositeSample.sampleId} — {r.field.name}, {r.farm.name}
          </p>
        </div>

        <Section title="Field">
          <Row label="Field" value={r.field.name} />
          <Row label="Area" value={`${formatNumber(r.field.areaHa, 2)} ha`} />
          <Row label="LPIS reference" value={r.field.lpisRef ?? "Not recorded"} />
          <Row label="Centroid" value={`${r.field.centroid[1].toFixed(5)}, ${r.field.centroid[0].toFixed(5)}`} />
        </Section>

        <Section title="Composite sample">
          <Row label="Sample ID" value={r.compositeSample.sampleId} />
          <Row label="Sample date" value={new Date(r.compositeSample.sampleDate).toLocaleDateString("en-IE")} />
          <Row label="Cores" value={r.compositeSample.coreCount} />
          <Row label="Represented area" value={r.compositeSample.representedAreaHa !== undefined ? `${formatNumber(r.compositeSample.representedAreaHa, 2)} ha` : "Not recorded"} />
          <Row label="Methodology" value={`Standard representative sampling (${r.compositeSample.methodologyVersion})`} />
          <Row label="Status" value={r.compositeSample.status === "lab_result_received" ? "Lab result received" : "Awaiting lab result"} />
        </Section>

        <Section title="Laboratory result">
          {r.labStatus.labResult ? (
            <>
              <Row label="Laboratory" value={r.labStatus.labResult.laboratory} />
              <Row label="Report reference" value={r.labStatus.labResult.labReportRef} />
              <Row label="Analysis date" value={new Date(r.labStatus.labResult.analysisDate).toLocaleDateString("en-IE")} />
              <Row label="pH" value={formatNumber(r.labStatus.labResult.ph, 1)} />
              <Row label="Phosphorus (P)" value={`${formatNumber(r.labStatus.labResult.pMgL, 1)} mg/l`} />
              <Row label="Potassium (K)" value={`${formatNumber(r.labStatus.labResult.kMgL, 1)} mg/l`} />
              {r.labStatus.labResult.mgMgL !== undefined ? <Row label="Magnesium (Mg)" value={`${formatNumber(r.labStatus.labResult.mgMgL, 1)} mg/l`} /> : null}
              {r.labStatus.labResult.organicMatterPct !== undefined ? <Row label="Organic matter" value={`${formatNumber(r.labStatus.labResult.organicMatterPct, 1)}%`} /> : null}
              {r.labStatus.labResult.limeRequirementTHa !== undefined ? <Row label="Lime requirement" value={`${formatNumber(r.labStatus.labResult.limeRequirementTHa, 2)} t/ha`} /> : null}
            </>
          ) : (
            <p className="text-sm text-fr-ink-600">No real laboratory result has been recorded for this sample yet.</p>
          )}
        </Section>

        {r.labStatus.interpretation ? (
          <Section title="Soil interpretation">
            <Row label="P Index" value={outcomeLabel(r.labStatus.interpretation.pIndexOutcome, (v) => `Index ${v}`)} />
            {r.labStatus.interpretation.pIndexConservativeTreatment ? (
              <p className="mt-1 text-xs text-fr-attention">
                This P value falls in a real statutory boundary gap — treated conservatively as the higher-requirement Index
                {" "}{r.labStatus.interpretation.pIndex} rather than resolved definitively.
              </p>
            ) : null}
            <Row label="K Index" value={`Index ${r.labStatus.interpretation.kIndex}`} />
            <Row label="Crop group" value={r.labStatus.interpretation.cropGroup === "grassland" ? "Grassland" : "Other crop"} />
            <Row label="Soil material" value={r.labStatus.interpretation.soilMaterial === "mineral" ? "Mineral" : r.labStatus.interpretation.soilMaterial === "peat" ? "Peat" : "High organic"} />
            <Row label="Methodology" value={r.labStatus.interpretation.methodologyVersion} />
            {r.fertilityBasisStatus === "current" ? (
              <p className="mt-2 text-xs text-fr-ink-400">This sample is this field&apos;s current, active fertility evidence.</p>
            ) : r.fertilityBasisStatus === "superseded_by_newer_test" ? (
              <p className="mt-2 text-xs text-fr-attention">
                A real, later-dated soil test has since superseded this sample — the Nutrient Requirement below reflects the
                field&apos;s current fertility evidence, not necessarily this specific sample.
              </p>
            ) : (
              // Codex audit HIGH (round 2): "unknown" covers more than
              // one real underlying reason (no active evidence at all;
              // a real active test whose own date doesn't establish it
              // as later) — this copy must stay neutral about which,
              // never assert a specific reason (e.g. "no dated evidence
              // to compare") that isn't true for every real case this
              // status can mean.
              <p className="mt-2 text-xs text-fr-ink-400">
                The real available provenance does not establish whether this sample remains the field&apos;s active
                fertility evidence — the Nutrient Requirement below reflects the field&apos;s current fertility evidence,
                which may or may not derive from this sample.
              </p>
            )}
          </Section>
        ) : null}

        <Section title="Nutrient requirement">
          {plan ? (
            <>
              <p className="mb-2 text-xs text-fr-ink-400">Grazing basis (Teagasc Green Book, 5th Ed., 2020) — kg/ha.</p>
              <Row label="Gross N / P / K" value={`${plan.requirement.value.n} / ${plan.requirement.value.p} / ${plan.requirement.value.k}`} />
              <Row label="Organic offset (N / P / K)" value={`${plan.organicApplication.offsetN} / ${plan.organicApplication.offsetP} / ${plan.organicApplication.offsetK}`} />
              <Row label="Net requirement (N / P / K)" value={`${plan.netRequirement.value.n} / ${plan.netRequirement.value.p} / ${plan.netRequirement.value.k}`} />
            </>
          ) : (
            <p className="text-sm text-fr-ink-600">{r.nutrientPlanUnavailableReason ?? "Not yet calculable for this field."}</p>
          )}
        </Section>

        {plan ? (
          <Section title="Regulatory constraints">
            <Row label="NAP compliance" value={outcomeLabel(plan.napCompliance, (v) => {
              const c = v as { nWithinCeiling: boolean; pWithinCeiling: boolean; regulatory: string };
              const within = c.nWithinCeiling && c.pWithinCeiling;
              return `${within ? "Within" : "Exceeds"} statutory ceiling${c.regulatory !== "compliance_value" ? " (unconfirmed)" : ""}`;
            })} />
            <Row label="Commonage gate" value={outcomeLabel(plan.commonageFertiliserGate, () => "Not commonage")} />
            <Row label="LESS spreading method" value={outcomeLabel(plan.lessMethodCompliance, () => "Compliant")} />
            <Row label="Local water buffer" value={outcomeLabel(plan.localBufferOverrideStatus, () => "National baseline applies")} />
            <Row label="National water buffer distance" value={outcomeLabel(plan.nationalBufferDistanceStatus, () => "Boundary met")} />
          </Section>
        ) : null}

        {plan ? (
          <Section title="Product allocation">
            {plan.purchasedProducts.length === 0 ? (
              <p className="text-sm text-fr-ink-600">No real product recommended.</p>
            ) : (
              <div className="flex flex-col">
                {plan.purchasedProducts.map((p) => (
                  <div key={p.name} className="border-t border-fr-border py-2 text-sm first:border-t-0">
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium text-fr-ink-900">
                        {p.name} <span className="font-normal text-fr-ink-400">({p.npkAnalysis})</span>
                      </span>
                      <span className="text-fr-ink-600">{formatEur(p.costEur)}</span>
                    </div>
                    <div className="text-xs text-fr-ink-600">
                      {formatNumber(p.rateKgHa, 1)} kg/ha · {formatNumber(p.totalKg, 1)} kg for this {formatNumber(r.field.areaHa, 2)} ha field
                    </div>
                  </div>
                ))}
                <Row label="Estimated field cost" value={formatEur(plan.estimatedFieldCostEur)} />
              </div>
            )}
          </Section>
        ) : null}

        <Section title="Application plan &amp; actual">
          <Row
            label="Real accepted plans on record"
            value={r.acceptedPlans.length === 0 ? "None" : r.acceptedPlans.length}
          />
          {r.acceptedPlansTruncated ? (
            <p className="mt-1 text-xs text-fr-ink-400">This farm has more decisions than could be checked — the count above may understate the truth.</p>
          ) : null}
          {r.fieldFertiliserStatus.status === "ok" ? (
            <>
              <Row
                label="Requirement (N / P / K, kg/ha)"
                value={`${r.fieldFertiliserStatus.requirementKgHa.n} / ${r.fieldFertiliserStatus.requirementKgHa.p} / ${r.fieldFertiliserStatus.requirementKgHa.k}`}
              />
              {r.fieldFertiliserStatus.confirmedAppliedKgHa ? (
                <Row
                  label="Confirmed applied (N / P / K, kg/ha)"
                  value={`${r.fieldFertiliserStatus.confirmedAppliedKgHa.n} / ${r.fieldFertiliserStatus.confirmedAppliedKgHa.p} / ${r.fieldFertiliserStatus.confirmedAppliedKgHa.k}`}
                />
              ) : null}
              {r.fieldFertiliserStatus.remainingKgHa ? (
                <Row
                  label="Remaining (N / P / K, kg/ha)"
                  value={`${r.fieldFertiliserStatus.remainingKgHa.n} / ${r.fieldFertiliserStatus.remainingKgHa.p} / ${r.fieldFertiliserStatus.remainingKgHa.k}`}
                />
              ) : null}
              <Row label="Confirmed applications this season" value={r.fieldFertiliserStatus.confirmedApplications} />
              {r.fieldFertiliserStatus.applicationsWithUnknownComposition > 0 ? (
                <p className="mt-1 text-xs text-fr-attention">
                  {r.fieldFertiliserStatus.applicationsWithUnknownComposition} confirmed application(s) could not be
                  included above — figures are real lower/upper bounds, not exact.
                </p>
              ) : null}
            </>
          ) : r.fieldFertiliserStatus.status === "blocked" ? (
            <p className="text-sm text-fr-ink-600">Not yet calculable — {r.fieldFertiliserStatus.reasonCode.replaceAll("_", " ").toLowerCase()}.</p>
          ) : (
            <p className="text-sm text-fr-ink-600">Not applicable to this field.</p>
          )}
        </Section>

        <Section title="Report identity">
          <Row label="Report version" value={r.reportVersion} />
          <Row label="Generated at" value={new Date(r.generatedAt).toLocaleString("en-IE")} />
        </Section>

        <div className="mb-10 print:hidden">
          <button
            type="button"
            onClick={() => setShowManifest((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-fr-ink-600"
          >
            <FileText className="size-4" /> {showManifest ? "Hide" : "Show"} machine-reproducible manifest (raw JSON)
          </button>
          {showManifest ? (
            <pre className="mt-3 max-h-96 overflow-auto rounded-fr-card border border-fr-border bg-fr-surface-alt p-4 text-xs text-fr-ink-900">
              {JSON.stringify(r, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </>
  );
}
