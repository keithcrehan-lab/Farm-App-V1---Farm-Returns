"use client";

import { useMemo } from "react";
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

      {view.status === "unavailable" ? (
        <p className="border-l-[3px] border-fr-v2-harvest bg-fr-v2-harvest-tint px-4 py-3 text-sm">{view.message}</p>
      ) : (
        <>
          <NutrientPosition view={view} />

          <OrganicBand organic={view.organic} />

          <SolutionBand solution={view.solution} />

          <section aria-labelledby="legal-status-heading" className="flex flex-col gap-2">
            <h2 id="legal-status-heading" className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">
              Legal status
            </h2>
            <NapComplianceCard compliance={result.displayedNapCompliance} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {view.legalGates.map((gate) => (
                <div key={gate.id} data-legal-gate={gate.id} data-gate-state={gate.state} className="contents">
                  <dt className="text-fr-v2-muted">{gate.label}</dt>
                  <dd className={cn(gate.state === "prohibited" && "font-semibold text-fr-v2-clay")}>{gate.text}</dd>
                </div>
              ))}
            </dl>
          </section>

          <EvidenceBand view={view} fieldId={field.id} />
        </>
      )}

      <nav aria-label="Field nutrient plan actions" className="flex flex-wrap items-center gap-3 border-t border-fr-v2-rule pt-4">
        <Link href={backHref} className="rounded-[6px] border border-fr-v2-rule px-4 py-2.5 text-sm font-semibold">
          Farm map
        </Link>
        <Link href={`/nutrients?field=${encodeURIComponent(field.id)}`} className="rounded-[6px] border border-fr-v2-rule px-4 py-2.5 text-sm font-semibold">
          Plan in nutrient planner
        </Link>
        <Link href="/fertiliser-plan" className="ml-auto rounded-[6px] bg-fr-v2-graphite px-4 py-2.5 text-sm font-semibold text-white">
          Whole-farm nutrient plan →
        </Link>
      </nav>
    </div>
  );
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

function OrganicBand({ organic }: { organic: Extract<FieldNutrientPlanView, { status: "available" }>["organic"] }) {
  return (
    <section aria-label="Organic application" className="flex flex-wrap items-end justify-between gap-4 border-l-[3px] border-fr-v2-teal bg-fr-v2-teal-tint px-4 py-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-teal">Organic application</p>
        {organic.state === "planned" ? (
          <>
            <p className="font-display text-3xl tabular-nums text-fr-v2-teal">
              {formatNumber(organic.totalM3, 0)}
              <span className="ml-1 font-sans text-sm">m³</span>
            </p>
            <p className="text-xs text-fr-v2-muted">
              {formatNumber(organic.rateM3ha, 0)} m³/ha
              {organic.method ? ` · ${organic.method}${organic.methodAssumed ? " (assumed method)" : ""}` : ""}
              {organic.creditAssessed && organic.timingAssumed ? " · spring timing assumed" : ""}
              {organic.creditAssessed ? "" : " · slurry credit not assessed"}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-fr-v2-muted">No slurry planned for this field.</p>
        )}
      </div>
      <div className="text-right">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-cobalt">Application window</p>
        <p className="text-xs text-fr-v2-muted">Not available yet</p>
      </div>
    </section>
  );
}

function SolutionBand({ solution }: { solution: Extract<FieldNutrientPlanView, { status: "available" }>["solution"] }) {
  return (
    <section aria-label="Fertiliser solution" className="border-l-[3px] border-fr-v2-harvest bg-fr-v2-harvest-tint px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-harvest-ink">Fertiliser solution</p>
      {solution.kind === "products" ? (
        <ul className="mt-2 flex flex-col gap-3">
          {solution.products.map((product) => (
            <li key={product.name} data-product={product.name} className="flex items-end justify-between gap-4">
              <div>
                <p className="font-display text-xl">{product.name}</p>
                <p className="text-xs text-fr-v2-muted">
                  {product.npkAnalysis} · {formatNumber(product.rateKgHa, 0)} kg/ha
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl tabular-nums">
                  {formatNumber(product.displayTonnes, 2)}
                  <span className="ml-1 font-sans text-sm">t</span>
                </p>
                <p className="text-xs text-fr-v2-muted">field total</p>
              </div>
            </li>
          ))}
        </ul>
      ) : solution.kind === "nothing_to_buy" ? (
        <p className="mt-1 text-sm">{solution.message}</p>
      ) : (
        <p className="mt-1 text-sm">
          <span className="font-semibold">{solution.label}.</span> {solution.message}
        </p>
      )}
      {solution.kind === "products" && solution.provisional ? (
        <p className="mt-2 text-xs text-fr-v2-muted">Sized without the slurry credit — provisional until it can be assessed.</p>
      ) : null}
    </section>
  );
}

function EvidenceBand({ view, fieldId }: { view: Extract<FieldNutrientPlanView, { status: "available" }>; fieldId: string }) {
  const { evidence } = view;
  const remainingEvidence = NUTRIENT_KEYS.flatMap((key) => {
    const state = evidence.remainingEvidence[key];
    return state ? [`${NUTRIENT_HEAD[key].label} ${EVIDENCE_STATE_LABEL[state].toLowerCase()}`] : [];
  });
  return (
    <section aria-label="Evidence chain" className="border-l-[3px] border-fr-v2-clay bg-fr-v2-clay-tint px-4 py-3 text-xs">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-clay">Evidence chain</p>
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
    </section>
  );
}
