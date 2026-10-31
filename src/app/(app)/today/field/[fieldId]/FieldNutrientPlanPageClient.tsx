"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useFields } from "@/store/farm-store";
import { useFieldNutrientPlan } from "@/lib/use-field-nutrient-plan";
import { farmSpatialReturnHref } from "@/lib/farm-spatial-field-lens";
import {
  EVIDENCE_STATE_LABEL,
  NUTRIENT_KEYS,
  fieldNutrientPlanView,
  nutrientCellText,
  type FieldNutrientPlanView,
  type NutrientKey,
  type NutrientRow,
} from "@/lib/field-nutrient-plan-presentation";
import { NapComplianceCard } from "@/components/farm/NapComplianceCard";
import type { NutrientPlan } from "@/domain/types";
import type { FieldNutrientPlanResult } from "@/orchestration/fertiliser-plan/field-nutrient-plan";
import { getAutomaticSlurryPlanAction, type AutomaticSlurryFieldRecommendation } from "@/app/actions/fertiliser-plan";

/**
 * Farm Spatial V2 Phase 4 — one field's nutrient plan in the approved
 * order: requirement → organic contribution → remaining → fertiliser
 * solution → evidence (`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §6.3).
 * Every figure is the canonical `NutrientPlan` from the shared
 * `buildFieldNutrientPlan` assembly (the same plan the Nutrients screen
 * shows), resolved by `fieldNutrientPlanView`. This component derives
 * nothing; unknown values stay "Unknown", never 0.
 */
export function FieldNutrientPlanPageClient({ fieldId }: { fieldId: string }) {
  const fields = useFields();
  const field = fields.find((f) => f.id === fieldId);
  const result = useFieldNutrientPlan(field);
  const view = useMemo(() => (result && field ? fieldNutrientPlanView(result, field) : undefined), [result, field]);
  const [slurryRecommendation, setSlurryRecommendation] = useState<AutomaticSlurryFieldRecommendation | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getAutomaticSlurryPlanAction().then((plan) => {
      if (cancelled) return;
      setSlurryRecommendation(plan.status === "ready" ? plan.recommendations.find((r) => r.fieldId === fieldId) ?? null : null);
    }).catch(() => { if (!cancelled) setSlurryRecommendation(null); });
    return () => { cancelled = true; };
  }, [fieldId]);

  if (!field || !result || !view) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <Link href="/today" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fr-v2-graphite">
          <ArrowLeft className="size-4" /> Farm map
        </Link>
        <p className="text-sm text-fr-v2-muted">This field isn&apos;t on your farm, or it has been archived.</p>
      </div>
    );
  }

  const backHref = farmSpatialReturnHref(field.id);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 text-fr-v2-graphite lg:px-0" data-field-nutrient-plan>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-fr-v2-graphite hover:underline">
            <ArrowLeft className="size-4" /> {field.name} on the farm map
          </Link>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-harvest-ink">Nutrient plan</p>
          <h1 className="font-display text-3xl leading-tight">What {field.name} needs</h1>
          <p className="mt-1 text-sm tabular-nums text-fr-v2-muted">{identityLine(field.areaHa, result.plan)}</p>
        </div>
        <MachineNote view={view} plan={result.plan} soilTestDate={field.fertility.verifiedTest?.sampleDate} />
      </header>

      <FieldNutrientPlanBody view={view} result={result} fieldId={field.id} slurryRecommendation={slurryRecommendation} />

      <nav aria-label="Field nutrient plan actions" className="flex flex-wrap items-center gap-3 border-t border-fr-v2-rule pt-4">
        <Link href={backHref} className="rounded-[6px] border border-fr-v2-rule px-4 py-2.5 text-sm font-semibold">
          Farm map
        </Link>
        <Link href={`/fields?field=${encodeURIComponent(field.id)}&chapter=nutrients`} className="rounded-[6px] border border-fr-v2-rule px-4 py-2.5 text-sm font-semibold">
          Back to recommendation setup
        </Link>
        <Link href="/fertiliser-plan" className="ml-auto rounded-[6px] bg-fr-v2-graphite px-4 py-2.5 text-sm font-semibold text-white">
          Whole-farm nutrient plan →
        </Link>
      </nav>
    </div>
  );
}

/**
 * The plan itself, in the approved decision order — shared by this page and
 * the field workspace's Nutrients chapter so both render the one canonical
 * view. Derives nothing.
 */
export function FieldNutrientPlanBody({ view, result, fieldId, hideSupportingDisclosures = false, slurryRecommendation }: { view: FieldNutrientPlanView; result: FieldNutrientPlanResult; fieldId: string; hideSupportingDisclosures?: boolean; slurryRecommendation?: AutomaticSlurryFieldRecommendation | null }) {
  if (view.status === "unavailable") {
    return <p className="border-l-[3px] border-fr-v2-harvest bg-fr-v2-harvest-tint px-4 py-3 text-sm">{view.message}</p>;
  }

  const legalState = legalStatusSummary(view.legalGates);
  const evidenceState = evidenceStatusSummary(view);

  return (
    <div className="flex flex-col gap-4">
      <NutrientPosition view={view} />

      <OrganicBand organic={view.organic} recommendation={slurryRecommendation} />

      <SolutionBand solution={view.solution} />

      {hideSupportingDisclosures ? null : (
        <>
          <CompactDisclosure
            label="Legal status"
            status={legalState.label}
            statusTone={legalState.tone}
            hint={legalState.hint}
            ariaLabel="Legal status"
          >
            <div className="flex flex-col gap-3">
              <NapComplianceCard compliance={result.displayedNapCompliance} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {view.legalGates.map((gate) => (
                  <div key={gate.id} data-legal-gate={gate.id} data-gate-state={gate.state} className="contents">
                    <dt className="text-fr-v2-muted">{gate.label}</dt>
                    <dd className={cn(gate.state === "prohibited" && "font-semibold text-fr-v2-clay")}>{gate.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </CompactDisclosure>

          <CompactDisclosure
            label="Evidence report"
            status={evidenceState.label}
            statusTone={evidenceState.tone}
            hint={evidenceState.hint}
            ariaLabel="Evidence chain"
          >
            <EvidenceBand view={view} fieldId={fieldId} bare />
          </CompactDisclosure>
        </>
      )}
    </div>
  );
}

function CompactDisclosure({
  label,
  status,
  statusTone,
  hint,
  ariaLabel,
  children,
}: {
  label: string;
  status: string;
  statusTone: "ok" | "warning" | "blocked" | "neutral";
  hint: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label={ariaLabel} className="border-t border-fr-v2-rule">
      <button
        type="button"
        aria-expanded={open}
        title={hint}
        onClick={() => setOpen((value) => !value)}
        className="group flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-gold"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fr-v2-graphite">{label}</span>
          <span className="mt-0.5 block text-xs text-fr-v2-muted">{hint}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              statusTone === "ok" && "bg-fr-v2-teal",
              statusTone === "warning" && "bg-fr-v2-gold",
              statusTone === "blocked" && "bg-fr-v2-clay",
              statusTone === "neutral" && "bg-fr-v2-muted",
            )}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-fr-v2-graphite">{status}</span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-forest">{open ? "Hide" : "Open"}</span>
        </span>
      </button>
      {open ? <div className="pb-4 pt-1">{children}</div> : null}
    </section>
  );
}

function legalStatusSummary(gates: Extract<FieldNutrientPlanView, { status: "available" }>["legalGates"]) {
  if (gates.some((gate) => gate.state === "prohibited")) {
    return { label: "Blocked", tone: "blocked" as const, hint: "A legal gate currently prohibits this fertiliser action." };
  }
  if (gates.some((gate) => gate.state === "blocked" || gate.state === "unknown")) {
    return { label: "Needs information", tone: "warning" as const, hint: "One or more legal checks need more evidence before Farm Return can be certain." };
  }
  return { label: "Open", tone: "ok" as const, hint: "No current legal gate is blocking this fertiliser action." };
}

function evidenceStatusSummary(view: Extract<FieldNutrientPlanView, { status: "available" }>) {
  if (view.evidence.limitations.length > 0 || view.unknownReasons.length > 0) {
    const count = view.evidence.limitations.length + view.unknownReasons.length;
    return { label: `${count} item${count === 1 ? "" : "s"} to review`, tone: "warning" as const, hint: "Evidence is available, with limitations or unknowns worth reviewing." };
  }
  return { label: "Available", tone: "ok" as const, hint: "The calculation evidence and provenance are available to inspect." };
}

const BASIS_LABEL: Record<NutrientPlan["fieldRequirement"]["cropContext"]["basis"], string> = {
  grazing: "grazing",
  silage: "silage",
  tillage: "tillage",
};

function soilIndexText(label: "P" | "K", outcome: NutrientPlan["fieldRequirement"]["p"]["soilIndex"], basis: string | undefined): string {
  if (outcome.status !== "OK") return `${label} unknown`;
  return `${label}${outcome.value.index}${basis === "farmer_override_of_laboratory" ? " (farmer override)" : ""}`;
}

function identityLine(areaHa: number, plan: NutrientPlan): string {
  const context = plan.fieldRequirement.cropContext;
  return [
    `${formatNumber(areaHa, 2)} ha`,
    `${BASIS_LABEL[context.basis]}${context.plannedUseAssumed ? " (assumed)" : ""}`,
    soilIndexText("P", plan.fieldRequirement.p.soilIndex, plan.soilIndexProvenance?.p.basis),
    soilIndexText("K", plan.fieldRequirement.k.soilIndex, plan.soilIndexProvenance?.k.basis),
  ].join(" · ");
}

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

function MachineNote({ view, plan, soilTestDate }: { view: FieldNutrientPlanView; plan: NutrientPlan; soilTestDate?: string }) {
  const state = view.status === "unavailable" ? "NOT CALCULATED" : view.provisional ? "PROVISIONAL" : "CALCULATED";
  const date = formatDate(soilTestDate);
  return (
    <p className="shrink-0 border-l-[3px] border-fr-v2-clay pl-3 font-mono text-[11px] leading-relaxed text-fr-v2-muted">
      {state}
      <br />
      {date ? `soil test ${date}` : "no lab soil test"}
      <br />
      {plan.calculationVersion}
    </p>
  );
}

const NUTRIENT_HEAD: Record<NutrientKey, { label: string; className: string }> = {
  n: { label: "N", className: "text-fr-v2-cobalt border-fr-v2-cobalt" },
  p: { label: "P", className: "text-fr-v2-harvest-ink border-fr-v2-harvest" },
  k: { label: "K", className: "text-fr-v2-plum border-fr-v2-plum" },
};

function NutrientPosition({ view }: { view: Extract<FieldNutrientPlanView, { status: "available" }> }) {
  return (
    <section aria-labelledby="nutrient-position-heading">
      <div className="flex items-baseline justify-between border-b border-fr-v2-rule pb-1">
        <h2 id="nutrient-position-heading" className="text-sm font-bold">
          Nutrient position
        </h2>
        <span className="text-xs text-fr-v2-muted">kg/ha</span>
      </div>
      <table className="w-full table-fixed border-collapse text-sm tabular-nums">
        <thead>
          <tr>
            <th scope="col" className="w-2/5 py-2 text-left font-normal text-fr-v2-muted">
              <span className="sr-only">Stage</span>
            </th>
            {NUTRIENT_KEYS.map((key) => (
              <th key={key} scope="col" className={cn("border-b-[3px] py-2 text-right text-xs font-bold", NUTRIENT_HEAD[key].className)}>
                {NUTRIENT_HEAD[key].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <PositionRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
      {view.mixedIndexLine ? <p className="mt-2 text-xs text-fr-v2-muted">{view.mixedIndexLine}</p> : null}
      {view.unknownReasons.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-xs text-fr-v2-muted">
          {view.unknownReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {view.provisional ? (
        <p className="mt-3 border-l-[3px] border-fr-v2-harvest bg-fr-v2-harvest-tint px-3 py-2 text-xs">
          <strong className="font-semibold">Provisional — {view.provisional.headline}.</strong> {view.provisional.detail}
        </p>
      ) : null}
    </section>
  );
}

function PositionRow({ row }: { row: NutrientRow }) {
  const organic = row.id === "organic";
  const remaining = row.id === "remaining";
  return (
    <tr data-row={row.id} className={cn("border-b border-fr-v2-rule", remaining && "font-semibold")}>
      <th scope="row" className={cn("py-2.5 text-left font-medium", organic && "text-fr-v2-teal")}>
        {row.label}
      </th>
      {NUTRIENT_KEYS.map((key) => {
        const cell = row.cells[key];
        return (
          <td key={key} data-nutrient={key} className={cn("py-2.5 text-right", cell.state === "value" ? (organic ? "text-fr-v2-teal" : "") : "text-xs text-fr-v2-muted", remaining && cell.state === "value" && "font-display text-lg")}>
            {nutrientCellText(cell)}
          </td>
        );
      })}
    </tr>
  );
}

function OrganicBand({ organic, recommendation }: { organic: Extract<FieldNutrientPlanView, { status: "available" }>["organic"]; recommendation?: AutomaticSlurryFieldRecommendation | null }) {
  return (
    <section aria-label="Organic application" className="border-y border-fr-v2-cream-rule py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-teal">Organic application</p>
          {organic.state === "planned" ? (
            <div className="mt-1">
              <p className="text-base font-semibold text-fr-v2-graphite">
                {formatNumber(organic.totalM3, 0)} m³ planned
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-fr-v2-muted">
                {formatNumber(organic.rateM3ha, 0)} m³/ha
                {organic.method ? ` · ${organic.method}${organic.methodAssumed ? " (assumed method)" : ""}` : ""}
                {organic.creditAssessed && organic.timingAssumed ? " · spring timing assumed" : ""}
                {organic.creditAssessed ? "" : " · slurry credit not assessed"}
              </p>
            </div>
          ) : recommendation ? (
            <div className="mt-1">
              <p className="text-base font-semibold text-fr-v2-graphite">{formatNumber(recommendation.volumeM3, 0)} m³ recommended</p>
              <p className="mt-0.5 text-xs leading-relaxed text-fr-v2-muted">
                {formatNumber(recommendation.rateM3ha, 1)} m³/ha · {recommendation.applicationMethod === "LESS" ? "LESS" : "Splash plate"} · from {recommendation.storeName}
              </p>
              <p className="mt-1 text-xs text-fr-v2-teal">Planning recommendation · estimated chemical saving €{formatNumber(recommendation.estimatedChemicalSavingEur, 0)}</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-fr-v2-muted">No slurry planned or recommended for this field.</p>
          )}
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-muted">Application window</p>
          <p className="mt-1 text-sm text-fr-v2-muted">{recommendation?.applicationDate ?? "Not available yet"}</p>
        </div>
      </div>
    </section>
  );
}

function SolutionBand({ solution }: { solution: Extract<FieldNutrientPlanView, { status: "available" }>["solution"] }) {
  return (
    <section aria-label="Fertiliser solution" className="border-y border-fr-v2-cream-rule py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">Fertiliser solution</p>
          <p className="mt-1 text-xs text-fr-v2-muted">Chemical requirement after recorded organic nutrient credit.</p>
        </div>
        {solution.kind === "products" ? (
          <span className="text-xs text-fr-v2-muted">{solution.products.length} product{solution.products.length === 1 ? "" : "s"}</span>
        ) : null}
      </div>

      {solution.kind === "products" ? (
        <ul className="mt-3 divide-y divide-fr-v2-cream-rule/80">
          {solution.products.map((product) => (
            <li key={product.name} data-product={product.name} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_140px_110px] sm:items-center sm:gap-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fr-v2-graphite">{product.name}</p>
                <p className="mt-0.5 text-xs text-fr-v2-muted">{product.npkAnalysis}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-sm font-semibold tabular-nums text-fr-v2-graphite">{formatNumber(product.rateKgHa, 0)} kg/ha</p>
                <p className="text-[11px] text-fr-v2-muted">application rate</p>
              </div>
              <div className="sm:text-right">
                <p className="text-sm font-semibold tabular-nums text-fr-v2-graphite">{formatNumber(product.displayTonnes, 2)} t</p>
                <p className="text-[11px] text-fr-v2-muted">field total</p>
              </div>
            </li>
          ))}
        </ul>
      ) : solution.kind === "nothing_to_buy" ? (
        <p className="mt-3 text-sm text-fr-v2-graphite">{solution.message}</p>
      ) : (
        <p className="mt-3 text-sm text-fr-v2-graphite">
          <span className="font-semibold">{solution.label}.</span> {solution.message}
        </p>
      )}
      {solution.kind === "products" && solution.provisional ? (
        <p className="mt-3 border-l-[3px] border-fr-v2-gold pl-3 text-xs text-fr-v2-muted">Sized without the slurry credit — provisional until it can be assessed.</p>
      ) : null}
    </section>
  );
}

function EvidenceBand({ view, fieldId, bare = false }: { view: Extract<FieldNutrientPlanView, { status: "available" }>; fieldId: string; bare?: boolean }) {
  const { evidence } = view;
  const remainingEvidence = NUTRIENT_KEYS.flatMap((key) => {
    const state = evidence.remainingEvidence[key];
    return state ? [`${NUTRIENT_HEAD[key].label} ${EVIDENCE_STATE_LABEL[state].toLowerCase()}`] : [];
  });
  return (
    <div className={cn("text-xs", !bare && "border-l-[3px] border-fr-v2-clay bg-fr-v2-clay-tint px-4 py-3")}>
      {bare ? null : <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-clay">Evidence chain</p>}
      <p className="mt-1 font-mono text-[11px] text-fr-v2-muted">
        soil index → field area → requirement engine → organic allocation → remaining requirement → product solver
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-fr-v2-muted">Calculation</dt>
        <dd>
          {evidence.calculationVersion} · requirement engine {evidence.engineVersion}
        </dd>
        <dt className="text-fr-v2-muted">Requirement</dt>
        <dd>
          {evidence.requirementSource ?? "Not calculated"}
          {evidence.requirementRuleRefs.length > 0 ? ` (${evidence.requirementRuleRefs.join(", ")})` : ""} · {BASIS_LABEL[evidence.cropBasis]} basis
          {evidence.plannedUseAssumed ? ", field use not recorded so grazing assumed" : ""}
        </dd>
        {evidence.soilIndex ? (
          <>
            <dt className="text-fr-v2-muted">Soil index</dt>
            <dd>
              {evidence.soilIndex.p.text}
              <br />
              {evidence.soilIndex.k.text}
            </dd>
          </>
        ) : null}
        {remainingEvidence.length > 0 ? (
          <>
            <dt className="text-fr-v2-muted">Remaining evidence</dt>
            <dd>{remainingEvidence.join(" · ")}</dd>
          </>
        ) : null}
        {evidence.slurryDm ? (
          <>
            <dt className="text-fr-v2-muted">Slurry dry matter</dt>
            <dd>
              {evidence.slurryDm.dmPct === null ? "Not resolved" : `${formatNumber(evidence.slurryDm.dmPct, 1)}%`} · {evidence.slurryDm.status} · {evidence.slurryDm.source}
            </dd>
          </>
        ) : null}
        {evidence.organicSource ? (
          <>
            <dt className="text-fr-v2-muted">Slurry credit</dt>
            <dd>{evidence.organicSource}</dd>
          </>
        ) : null}
        {evidence.limitations.length > 0 ? (
          <>
            <dt className="text-fr-v2-muted">Known limitations</dt>
            <dd>{evidence.limitations.join(", ")}</dd>
          </>
        ) : null}
      </dl>
      <p className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-fr-v2-muted">Unknown values never silently become zero.</span>
        <Link href={`/evidence-report/field/${encodeURIComponent(fieldId)}`} className="font-semibold underline underline-offset-2">
          Evidence report →
        </Link>
      </p>
    </div>
  );
}
