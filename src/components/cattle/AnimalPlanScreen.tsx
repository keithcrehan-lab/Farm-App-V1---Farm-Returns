"use client";

/**
 * Cattle C10 — the Animal plan: "if I keep this animal to my planned sale
 * date, what will it weigh, what will it cost, what might it be worth, and
 * what direct return does that imply?"
 *
 * This component holds the farmer's draft (form state), asks the server for
 * the C5 projection to the chosen date, and saves. Everything it shows comes
 * from `planScreenView` (C10 presentation): the economics
 * (`computeAnimalPlanEconomics`, exact decimals) run there on the sealed owner
 * reads, and each figure arrives as an explicit cell — a KNOWN figure or
 * "Unknown — why" — with the assumed-housing, projection and fixture marks
 * already decided. Nothing here reads a cost, valuation, housing or weight
 * state, and nothing here computes a day count (component-boundary test).
 *
 * - Save: sale date and target weight become a new C6 goal version in the
 *   demo session; feed / housing stay a session draft. Nothing is persisted.
 *   A refused save always says so; the screen never implies an unsaved plan
 *   was saved.
 * - Numbers: inputs keep their exact decimal text; steppers add exact steps
 *   (`stepNumericInput`); only display formatting rounds. Typed numbers are kept as typed and read by
 *   the shared parser (`parseNumericInput`, F016) — never stripped into another number.
 */

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addDays,
  formatDate,
  isPlanDate,
  NUMERIC_FIELDS,
  numericInputValue,
  parseNumericInput,
  planTargetRead,
  planSaveIntent,
  planScreenView,
  stepNumericInput,
  type NumericFieldSpec,
  planTargetText,
  type AnimalPlanAssumptions,
  type HousingAssumption,
  type MarketScenario,
  type PlanCellVM,
  type PlanTimelineVM,
} from "@/domain/cattle/presentation";
import type { DemoAnimalView, DemoProjection } from "@/server/cattle-demo/demo-service";
import type { CattleDemoScenario } from "@/server/cattle-demo/demo-replay";
import { loadCattleAnimal, projectCattleWeight } from "@/app/(app)/cattle/actions";
import { useCattleDemoSession } from "./session/CattleDemoSessionProvider";
import { useDemoView } from "./session/use-demo-view";
import { BackLink, DemoNotice, Disclosure, Pending, SectionHeading, StateGlyph, ViewStatus, cattleStyles } from "./ui";

interface PlanForm {
  assumptions: AnimalPlanAssumptions;
  martId: string;
  targetKg: string;
}

/** Marks a figure that rests on the farmer's housing assumption rather than a record. */
function AssumedMark({ assumed }: { assumed: boolean }) {
  if (!assumed) return null;
  return <span className="ml-1.5 rounded-[4px] bg-fr-v2-plum-tint px-1.5 py-0.5 text-[11px] font-medium text-fr-v2-plum">Assumed housing</span>;
}

const CELL_TONE: Record<Extract<PlanCellVM, { state: "KNOWN" }>["tone"], string> = { plain: "text-fr-v2-graphite", projected: "text-fr-v2-cobalt", gain: "text-fr-v2-forest", loss: "text-[#b23a2b]" };

function Cell({ cell, large = false }: { cell: PlanCellVM; large?: boolean }) {
  if (cell.state === "UNKNOWN") {
    return (
      <span className="inline-flex items-baseline gap-1.5 text-left text-sm text-fr-v2-muted">
        <StateGlyph tone="unknown" />
        {cell.text}
      </span>
    );
  }
  return (
    <span key={cell.text} className={`tabular-nums ${CELL_TONE[cell.tone]} ${large ? "text-[44px] font-semibold leading-none tracking-tight" : "font-semibold"} ${cattleStyles.settle}`}>
      {cell.text}
      {cell.sub ? <span className="ml-1.5 text-[12px] font-normal text-fr-v2-muted">{cell.sub}</span> : null}
    </span>
  );
}

function Row({ label, hint, children }: { label: string; hint: string | null; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-fr-v2-rule py-2.5">
      <dt className="min-w-[42%] text-sm text-fr-v2-charcoal">
        {label}
        {hint ? <span className="block text-[12px] text-fr-v2-muted">{hint}</span> : null}
      </dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

/**
 * `step` is an exact decimal string; stepping never rounds the entered value (invariant B). The text is kept exactly
 * as typed (F016): the shared parser accepts it or says why not; a stepper leaves text that isn't a number alone.
 */
function NumberField({ id, label, unit, value, onChange, step, field }: { id: string; label: string; unit: string; value: string; onChange: (v: string) => void; step: string; field: NumericFieldSpec }) {
  const read = parseNumericInput(value, field);
  const bump = (d: string) => {
    const next = stepNumericInput(value, d, field);
    if (next !== null) onChange(next);
  };
  return (
    <div>
      <label htmlFor={id} className="text-sm text-fr-v2-charcoal">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={() => bump(`-${step}`)} className="min-h-11 min-w-11 rounded-[8px] border border-fr-v2-rule text-fr-v2-graphite" aria-label={`Decrease ${label}`}>
          −
        </button>
        <div className="relative flex-1">
          <input
            id={id}
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={read.state === "INVALID"}
            aria-describedby={read.state === "INVALID" ? `${id}-error` : undefined}
            className="h-11 w-full rounded-[8px] border border-fr-v2-rule bg-white px-3 pr-16 text-right text-[17px] font-semibold tabular-nums text-fr-v2-graphite"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-fr-v2-muted">{unit}</span>
        </div>
        <button type="button" onClick={() => bump(step)} className="min-h-11 min-w-11 rounded-[8px] border border-fr-v2-rule text-fr-v2-graphite" aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
      {read.state === "INVALID" ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-[#b23a2b]" role="alert">
          {read.message}
        </p>
      ) : null}
    </div>
  );
}

/** A draft number field: the text as entered; an emptied field is "not entered" (`null`), never 0. */
function DraftNumber({ id, label, unit, value, onChange, step }: { id: string; label: string; unit: string; value: string | null; onChange: (v: string | null) => void; step: string }) {
  return <NumberField id={id} label={label} unit={unit} value={value === null ? "" : value} onChange={(v) => onChange(v === "" ? null : v)} step={step} field={NUMERIC_FIELDS.PLAN_AMOUNT} />;
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="text-sm text-fr-v2-charcoal">{label}</legend>
      <div className="mt-1 flex rounded-[8px] border border-fr-v2-rule p-0.5">
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={`min-h-11 flex-1 rounded-[6px] px-2 text-sm font-medium ${value === v ? "bg-fr-v2-graphite text-white" : "text-fr-v2-graphite"}`}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** now → housing → sale, laid out from `planTimeline` (the canonical intervals); no date arithmetic here. */
function PlanTimeline({ t }: { t: PlanTimelineVM }) {
  if (t.state === "NONE") return null;
  if (t.state === "UNSPLIT") {
    return (
      <div className="mt-4">
        <div className={`h-2 w-full rounded-full ${cattleStyles.hatch}`} />
        <p className="mt-2 text-[12px] text-fr-v2-muted">{t.summary}</p>
      </div>
    );
  }
  return (
    <div className="mt-4" aria-label={t.ariaLabel}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-fr-v2-teal-tint">
        {t.housedSegments.map((g) => (
          <div key={g.startPct} className="absolute inset-y-0 bg-fr-v2-clay/40 transition-all duration-200 motion-reduce:transition-none" style={{ left: `${g.startPct}%`, width: `${g.widthPct}%` }} />
        ))}
      </div>
      <div className="relative mt-2 h-10 text-[12px]">
        <span className="absolute left-0 text-fr-v2-graphite">
          <span className="block font-semibold">Now</span>
          {t.nowLabel}
        </span>
        {t.housedMarker.state === "SHOWN" && t.housedMarker.pct > 18 && t.housedMarker.pct < 82 ? (
          <span className="absolute -translate-x-1/2 text-center text-fr-v2-clay transition-all duration-200 motion-reduce:transition-none" style={{ left: `${t.housedMarker.pct}%` }}>
            <span className="block font-semibold">Housed</span>
            {t.housedMarker.label}
          </span>
        ) : null}
        <span className="absolute right-0 text-right text-fr-v2-graphite">
          <span className="block font-semibold">Sale</span>
          {t.saleLabel}
        </span>
      </div>
      <p className="text-[12px] text-fr-v2-muted">{t.summary}</p>
    </div>
  );
}

export function AnimalPlanScreen({ initial, tag, scenario }: { initial: DemoAnimalView; tag: string; scenario: CattleDemoScenario }) {
  const { session, addEvent, planDraft, setPlanDraft } = useCattleDemoSession();
  const identity = `plan:${tag}:${scenario}`;
  const { view, pending: loading, failed } = useDemoView(initial, identity, (s) => loadCattleAnimal(s, tag, scenario));
  // The form: the session draft when there is one (it also holds what was last saved), else the server defaults.
  const defaults: PlanForm = { assumptions: initial.plan.defaults, martId: initial.plan.defaultMartId, targetKg: planTargetText(initial.profile.goal.read) };
  const existing = planDraft(tag);
  const [form, setForm] = useState<PlanForm>(existing ? { assumptions: existing.assumptions, martId: existing.martId, targetKg: existing.targetKg } : defaults);
  const a = form.assumptions;
  const martId = form.martId;
  const targetKg = form.targetKg;
  const update = (patch: Partial<PlanForm>) => {
    const next = { ...form, ...patch };
    setForm(next);
    setPlanDraft(tag, { ...next, saved: existing?.saved ?? null });
    setSaveResult(null);
  };
  const [projections, setProjections] = useState<Record<string, DemoProjection>>({});
  const [projecting, startProjecting] = useTransition();
  const [saveResult, setSaveResult] = useState<"SAVED" | "REFUSED" | null>(null);

  // C5 projection for the chosen sale date — cached per identity + session + date, so a recorded weight or another scenario re-projects.
  const projectionKey = `${identity}\u0000${JSON.stringify(session)}\u0000${a.saleDate}`;
  useEffect(() => {
    if (!isPlanDate(a.saleDate) || projections[projectionKey]) return;
    const date = a.saleDate;
    const key = projectionKey;
    let current = true;
    const t = setTimeout(() => {
      startProjecting(async () => {
        const r = await projectCattleWeight(session, tag, date, scenario).catch(() => ({ ok: false as const }));
        // A failed request is its own reason ("couldn't be loaded"), never a perpetual "projecting…".
        if (current) setProjections((p) => ({ ...p, [key]: r.ok ? r.value : { state: "NOT_PROJECTED", saleDate: date, reason: "REQUEST_FAILED" } }));
      });
    }, 120);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [a.saleDate, projectionKey, projections, session, tag, scenario]);

  const plan = view.plan;
  const profile = view.profile;
  const projection = projections[projectionKey];
  const vm = useMemo(() => planScreenView({ inputs: plan.inputs, assumptions: a, martId, projection, profile }), [plan.inputs, a, martId, projection, profile]);

  const draftDirty = JSON.stringify(form) !== JSON.stringify(existing?.saved ?? defaults);
  const set = (patch: Partial<AnimalPlanAssumptions>) => update({ assumptions: { ...a, ...patch } });
  const profileHref = `/cattle/animals/${encodeURIComponent(tag)}${scenario === "STANDARD" ? "" : `?scenario=${scenario}`}`;
  const targetRead = planTargetRead(targetKg);
  const targetValid = targetRead.state !== "INVALID";
  const intent = planSaveIntent(profile.goal.read, tag);
  const save = () => {
    if (vm.saveBlocked || !targetValid) return;
    // A full session refuses the action: nothing is marked saved and the form keeps the values.
    if (addEvent({ kind: "SAVE_PLAN_GOAL", tag, goalType: intent.goalType, targetKg: numericInputValue(targetRead), targetDate: a.saleDate }) === null) {
      setSaveResult("REFUSED");
      return;
    }
    setPlanDraft(tag, { ...form, saved: form });
    setSaveResult("SAVED");
  };
  // The save status never implies an unsaved plan was saved: a refusal is reported whatever the draft state.
  const saveStatus =
    saveResult === "REFUSED"
      ? null
      : saveResult === "SAVED" && !draftDirty
        ? "Saved to this demo session — the goal now uses this date and weight."
        : draftDirty
          ? "Unsaved changes"
          : existing?.saved
            ? "Saved to this demo session"
            : "Not saved";
  const market = vm.market;

  return (
    <article className="mx-auto max-w-5xl pb-12" aria-labelledby="plan-title">
      <div className="flex items-center justify-between gap-3">
        <BackLink href={profileHref} label={`Animal ${tag}`} />
        {failed ? <ViewStatus pending={false} failed /> : loading || projecting ? <Pending label={projecting ? "Projecting weight…" : "Recalculating…"} /> : null}
      </div>
      <div className="mt-1 text-[13px] font-medium uppercase tracking-[0.08em] text-fr-v2-plum">Animal plan</div>
      <h1 id="plan-title" className="font-display text-[40px] font-semibold leading-tight tracking-tight text-fr-v2-graphite">
        {tag} to sale on {vm.titleDate}
      </h1>
      <p className="mt-1 text-[15px] text-fr-v2-charcoal">
        If you keep {tag} until then: what it&apos;s likely to weigh, what it will cost, what it might be worth. {plan.saleDateSource}
      </p>
      <div className="mt-4">
        <DemoNotice>Synthetic animal, fixture mart prices and demonstration costs. Changes stay in this browser session.</DemoNotice>
      </div>

      {/* The decision number */}
      <section aria-labelledby="return-h" className="mt-8">
        <h2 id="return-h" className="text-sm text-fr-v2-muted">
          {vm.returnHeading}
        </h2>
        <div className="mt-1">
          <Cell cell={vm.headline.value} large={vm.headline.large} />
          <AssumedMark assumed={vm.headline.assumed} />
        </div>
        <p className="mt-2 text-[15px] text-fr-v2-charcoal">{vm.headline.summary}</p>
        <p className="mt-1 text-[12px] text-fr-v2-muted">{vm.headline.footnote}</p>
        {vm.currentWeightNote ? <p className="mt-1 text-[12px] text-fr-v2-cobalt">{vm.currentWeightNote}</p> : null}
        {vm.issues.length > 0 ? (
          <ul className="mt-3 space-y-1 border-l-2 border-[#b23a2b] pl-3 text-sm text-[#b23a2b]" role="alert">
            {vm.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        ) : null}
        {vm.withdrawalNotices.map((n) => (
          <p key={n.text} className={`mt-3 flex items-start gap-2 border-l-2 pl-3 text-sm ${n.tone === "risk" ? "border-[#b23a2b] text-[#b23a2b]" : "border-fr-v2-rule text-fr-v2-charcoal"}`} role="status">
            <StateGlyph tone={n.tone} />
            <span>{n.text}</span>
          </p>
        ))}
        <PlanTimeline t={vm.timeline} />
      </section>

      <div className="mt-8 grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[1fr_1.15fr]">
        {/* Assumptions */}
        <section aria-labelledby="assume-h" className="space-y-5">
          <SectionHeading id="assume-h" title="Your assumptions" />
          <div>
            <label htmlFor="sale-date" className="text-sm text-fr-v2-charcoal">
              Planned sale date
            </label>
            <div className="mt-1 flex items-center gap-2">
              <button type="button" className="min-h-11 rounded-[8px] border border-fr-v2-rule px-3 text-sm" onClick={() => isPlanDate(a.saleDate) && set({ saleDate: addDays(a.saleDate, -7) })}>
                −1 wk
              </button>
              <input id="sale-date" type="date" value={a.saleDate} min={addDays(plan.asOfDate, 1)} onChange={(e) => set({ saleDate: e.target.value })} className="h-11 flex-1 rounded-[8px] border border-fr-v2-rule bg-white px-3 text-base" />
              <button type="button" className="min-h-11 rounded-[8px] border border-fr-v2-rule px-3 text-sm" onClick={() => isPlanDate(a.saleDate) && set({ saleDate: addDays(a.saleDate, 7) })}>
                +1 wk
              </button>
            </div>
          </div>
          <NumberField id="target-kg" label="Target weight (goal)" unit="kg" value={targetKg} onChange={(v) => update({ targetKg: v })} step="10" field={NUMERIC_FIELDS.TARGET_KG} />

          <div className="space-y-4 pt-2">
            <div className="text-[13px] font-semibold text-fr-v2-graphite">Feed</div>
            <DraftNumber id="conc-kg" label="Concentrate per day" unit="kg/day" value={a.concentrateKgPerDay} onChange={(v) => set({ concentrateKgPerDay: v })} step="0.5" />
            <DraftNumber id="conc-price" label="Concentrate price" unit="€/tonne" value={a.concentratePricePerTonne} onChange={(v) => set({ concentratePricePerTonne: v })} step="10" />
            <DraftNumber id="forage" label="Forage / grazing" unit="€/day" value={a.forageCostPerDay} onChange={(v) => set({ forageCostPerDay: v })} step="0.1" />
            <p className="text-[12px] text-fr-v2-muted">Feed changes the cost only. It doesn&apos;t change the projected weight: there is no validated feed-response model, so the projection keeps the animal&apos;s recent daily gain.</p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="text-[13px] font-semibold text-fr-v2-graphite">Housing</div>
            {vm.housing.assumptionControl ? (
              <div className="space-y-3">
                {vm.housing.note ? (
                  <p className={`px-3 py-2 text-sm text-fr-v2-charcoal ${cattleStyles.hatch}`} role="note">
                    {vm.housing.note}
                  </p>
                ) : null}
                <Segmented<"NONE" | HousingAssumption>
                  label="Assume for this plan"
                  value={a.assumedCurrentHousing === null ? "NONE" : a.assumedCurrentHousing}
                  options={[["NONE", "No assumption"], ["OUTDOORS", "Outdoors now"], ["HOUSED", "Housed now"]] as const}
                  onChange={(v) => set({ assumedCurrentHousing: v === "NONE" ? null : v })}
                />
              </div>
            ) : null}
            {vm.housing.now.state === "HOUSED_NOW" ? (
              <p className="text-sm text-fr-v2-charcoal">{vm.housing.now.text}</p>
            ) : (
              <div>
                <label htmlFor="housing-date" className="text-sm text-fr-v2-charcoal">
                  Planned housing date
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input id="housing-date" type="date" value={a.housingDate === null ? "" : a.housingDate} onChange={(e) => set({ housingDate: e.target.value === "" ? null : e.target.value })} className="h-11 flex-1 rounded-[8px] border border-fr-v2-rule bg-white px-3 text-base" />
                  <button type="button" className="min-h-11 rounded-[8px] px-3 text-sm text-fr-v2-forest" onClick={() => set({ housingDate: null })}>
                    Not housed
                  </button>
                </div>
              </div>
            )}
            <DraftNumber id="housing-cost" label="Housing and bedding" unit="€/day" value={a.housingCostPerDay} onChange={(v) => set({ housingCostPerDay: v })} step="0.05" />
          </div>

          <div className="space-y-4 pt-2">
            <div className="text-[13px] font-semibold text-fr-v2-graphite">Market</div>
            <Segmented label="Mart" value={martId} options={plan.marts.map((m) => [m.martId, m.martName] as const)} onChange={(v) => update({ martId: v })} />
            <Segmented<MarketScenario> label="Sale price scenario" value={a.scenario} options={[["LOW", "Low"], ["BASE", "As now"], ["HIGH", "High"]] as const} onChange={(v) => set({ scenario: v })} />
            <p className="text-[12px] text-fr-v2-muted">Low and high use the bottom and top of the observed range; &ldquo;as now&rdquo; assumes today&apos;s average holds. Prices can move either way.</p>
          </div>

          {intent.change ? <p className="pt-2 text-sm text-fr-v2-charcoal">{intent.change}</p> : null}
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <button type="button" onClick={save} disabled={vm.saveBlocked || !targetValid} className="min-h-12 rounded-[8px] bg-fr-v2-forest px-6 text-base font-semibold text-white disabled:opacity-40">
              Save plan
            </button>
            {saveResult === "REFUSED" ? (
              <span className="text-sm text-[#b23a2b]" role="alert">
                This demonstration session is full, so the plan wasn&apos;t saved. Reset the demo on the Cattle page to continue.
              </span>
            ) : null}
            <span className="text-sm text-fr-v2-muted" role="status">
              {saveStatus}
            </span>
          </div>
        </section>

        {/* Results */}
        <section aria-labelledby="results-h">
          <SectionHeading id="results-h" title="What that means" />
          <dl className="mt-2">
            {vm.rows.map((r) => (
              <Row key={r.key} label={r.label} hint={r.hint}>
                <Cell cell={r.value} />
                <AssumedMark assumed={r.assumed} />
              </Row>
            ))}
          </dl>
          <Disclosure label="What “projected direct profit” includes">
            <div className="space-y-2 text-sm text-fr-v2-charcoal">
              <p>Included: the costs recorded against this animal (charged directly or explicitly allocated from shared costs), plus the feed and housing you forecast here.</p>
              <p>Not included: your labour, land or rent, finance and interest, machinery and depreciation, general farm overheads, and any shared cost not allocated to this animal. So it isn&apos;t the farm&apos;s profit on this animal — it&apos;s the direct return.</p>
              <p>The projected weight is a straight-line continuation of recent daily gain from the cattle engine. It&apos;s a prediction, not a weighing, and feed changes don&apos;t alter it.</p>
            </div>
          </Disclosure>

          <div className="mt-6">
            <SectionHeading title="Market estimate" />
            {market.state === "NO_ESTIMATE" ? (
              <p className={`mt-3 px-3 py-3 text-sm text-fr-v2-charcoal ${cattleStyles.hatch}`}>{market.text}</p>
            ) : (
              <div className="mt-3">
                <div className="text-sm text-fr-v2-muted">Estimated current value</div>
                <div className="text-[30px] font-semibold tabular-nums leading-tight text-fr-v2-graphite">{market.central}</div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-fr-v2-muted">Source</dt>
                  <dd className="text-fr-v2-graphite">
                    {market.source}
                    <span className={market.freshness.stale ? "ml-2 font-medium text-fr-v2-harvest-ink" : "ml-2 text-fr-v2-muted"}>{market.freshness.text}</span>
                  </dd>
                  <dt className="text-fr-v2-muted">Observed range</dt>
                  <dd className="tabular-nums text-fr-v2-graphite">
                    {market.range} <span className="text-fr-v2-muted">{market.priceRange}</span>
                  </dd>
                  <dt className="text-fr-v2-muted">Compared with</dt>
                  <dd className="text-fr-v2-graphite">{market.comparedWith}</dd>
                  <dt className="text-fr-v2-muted">Basis</dt>
                  <dd className="text-fr-v2-graphite">
                    {market.basis}
                    {market.weightBasisNote ? <span className="block text-fr-v2-cobalt">{market.weightBasisNote}</span> : null}
                  </dd>
                  <dt className="text-fr-v2-muted">Status</dt>
                  <dd className="font-medium text-fr-v2-harvest-ink">{market.status}</dd>
                </dl>
                <p className="mt-2 text-[12px] text-fr-v2-muted">An estimate from comparable animals, not a price for this animal. It isn&apos;t used by the cattle engine&apos;s recommendations.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-fr-v2-rule pt-4">
        <Link href={profileHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-fr-v2-forest hover:underline">
          ← Back to {tag}
        </Link>
        <span className="text-[12px] text-fr-v2-muted">As of {formatDate(plan.asOfDate)} · money shown to the nearest euro; calculated exactly</span>
      </div>
    </article>
  );
}
