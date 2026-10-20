"use client";

/**
 * Cattle C10 — the Animal plan: "if I keep this animal to my planned sale
 * date, what will it weigh, what will it cost, what might it be worth, and
 * what direct return does that imply?"
 *
 * - Projected weight: the frozen C5 straight-line PREDICTION at the sale date
 *   (server, per date). Feed and housing never change it — no feed-response
 *   model exists, and the screen says so.
 * - Every money figure: `computeAnimalPlanEconomics` (pure C10 domain,
 *   exact decimals). This component only formats and lays out.
 * - Market: the fixture provider's comparable band for the chosen mart; the
 *   scenario (low / base / high) applies to the sale-time price only.
 * - Save: sale date and target weight become a new C6 goal version in the
 *   demo session; feed / housing stay a session draft. Nothing is persisted.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addDays, computeAnimalPlanEconomics, daysBetween, isPlanDate, type AnimalPlanAssumptions, type MarketScenario, type Money } from "@/domain/animal-plan";
import { formatAdg, formatDate, formatDayMonth, formatEuro, formatEuroPerKg, formatKg, formatSignedKg } from "@/domain/cattle/presentation";
import type { DemoAnimalView, DemoProjection } from "@/server/cattle-demo/demo-service";
import type { CattleDemoScenario } from "@/server/cattle-demo/demo-replay";
import { loadCattleAnimal, projectCattleWeight } from "@/app/(app)/cattle/actions";
import { useCattleDemoSession } from "./session/CattleDemoSessionProvider";
import { BackLink, DemoNotice, Disclosure, Pending, SectionHeading, StateGlyph, cattleStyles } from "./ui";

const ISSUE_TEXT: Record<string, string> = {
  SALE_DATE_INVALID: "Choose a real sale date.",
  SALE_DATE_NOT_AFTER_TODAY: "The sale date has to be after today.",
  HOUSING_DATE_INVALID: "Choose a real housing date.",
  HOUSING_DATE_AFTER_SALE_DATE: "The housing date is on or after the sale date — move one of them.",
  HOUSING_DATE_BEFORE_TODAY: "The housing date is in the past, but the animal isn't recorded as housed.",
  CONCENTRATE_QUANTITY_INVALID: "Concentrate per day must be a number of kilograms (0 or more).",
  CONCENTRATE_PRICE_INVALID: "Concentrate price must be a number of euro per tonne.",
  FORAGE_COST_INVALID: "Forage / grazing cost must be a number of euro per day.",
  HOUSING_COST_INVALID: "Housing cost must be a number of euro per day.",
};

const REASON_TEXT: Record<string, string> = {
  NO_COSTS_RECORDED: "no costs recorded yet",
  CONCENTRATE_QUANTITY_NOT_ENTERED: "concentrate per day not entered",
  CONCENTRATE_PRICE_NOT_ENTERED: "concentrate price not entered",
  FORAGE_COST_NOT_ENTERED: "forage cost not entered",
  HOUSING_COST_NOT_ENTERED: "housing cost not entered",
  HOUSING_STATE_UNKNOWN: "housing status unknown",
  CURRENT_WEIGHT_UNKNOWN: "current weight unknown",
  PLAN_INPUT_INVALID: "fix the plan inputs",
  PER_HEAD_PRICE_NOT_PROJECTABLE_TO_SALE_WEIGHT: "a per-head price can't be moved to a new weight",
  PROJECTION_PENDING: "projecting…",
};

function reasonText(codes: string[]): string {
  return codes
    .map((c) => REASON_TEXT[c] ?? (c.startsWith("PROJECTION_") ? "no weight projection (needs two usable weights)" : c.startsWith("VALUATION_") ? "no market estimate" : c.toLowerCase().replace(/_/g, " ")))
    .filter((v, i, a) => a.indexOf(v) === i)
    .join("; ");
}

function MoneyValue({ m, signed = false, perKg = false, large = false }: { m: Money; signed?: boolean; perKg?: boolean; large?: boolean }) {
  if (m.state === "UNKNOWN") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-fr-v2-muted">
        <StateGlyph tone="unknown" />
        Unknown — {reasonText(m.reasons)}
      </span>
    );
  }
  const text = perKg ? formatEuroPerKg(m.amount) : formatEuro(m.amount, { signed });
  return (
    <span key={text} className={`tabular-nums text-fr-v2-graphite ${large ? "text-[44px] font-semibold leading-none tracking-tight" : "font-semibold"} ${cattleStyles.settle}`}>
      {text}
    </span>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-fr-v2-rule py-2.5">
      <dt className="min-w-0 text-sm text-fr-v2-charcoal">
        {label}
        {hint ? <span className="block text-[12px] text-fr-v2-muted">{hint}</span> : null}
      </dt>
      <dd className="shrink-0 text-right">{children}</dd>
    </div>
  );
}

function NumberField({ id, label, unit, value, onChange, step }: { id: string; label: string; unit: string; value: string; onChange: (v: string) => void; step: number }) {
  const bump = (d: number) => {
    const n = Number(value === "" ? "0" : value);
    if (!Number.isFinite(n)) return;
    const next = Math.max(0, Math.round((n + d) * 100) / 100);
    onChange(String(next));
  };
  return (
    <div>
      <label htmlFor={id} className="text-sm text-fr-v2-charcoal">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={() => bump(-step)} className="min-h-11 min-w-11 rounded-[8px] border border-fr-v2-rule text-fr-v2-graphite" aria-label={`Decrease ${label}`}>
          −
        </button>
        <div className="relative flex-1">
          <input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} className="h-11 w-full rounded-[8px] border border-fr-v2-rule bg-white px-3 pr-16 text-right text-[17px] font-semibold tabular-nums text-fr-v2-graphite" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-fr-v2-muted">{unit}</span>
        </div>
        <button type="button" onClick={() => bump(step)} className="min-h-11 min-w-11 rounded-[8px] border border-fr-v2-rule text-fr-v2-graphite" aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
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

/** now → housing → sale, proportional, with day counts. */
function PlanTimeline({ asOf, housingDate, saleDate, housedNow }: { asOf: string; housingDate: string | null; saleDate: string; housedNow: boolean }) {
  if (!isPlanDate(saleDate) || saleDate <= asOf) return null;
  const total = daysBetween(asOf, saleDate);
  const h = !housedNow && housingDate && isPlanDate(housingDate) && housingDate > asOf && housingDate < saleDate ? daysBetween(asOf, housingDate) : null;
  const pct = h === null ? null : (h / total) * 100;
  return (
    <div className="mt-4" aria-label={`Now to sale: ${total} days${h !== null ? `, housed after ${h} days` : ""}`}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-fr-v2-teal-tint">
        {housedNow ? <div className="absolute inset-0 bg-fr-v2-clay/40" /> : pct !== null ? <div className="absolute inset-y-0 right-0 bg-fr-v2-clay/40 transition-all duration-200 motion-reduce:transition-none" style={{ left: `${pct}%` }} /> : null}
      </div>
      <div className="relative mt-2 h-10 text-[12px]">
        <span className="absolute left-0 text-fr-v2-graphite">
          <span className="block font-semibold">Now</span>
          {formatDayMonth(asOf)}
        </span>
        {pct !== null && pct > 18 && pct < 82 ? (
          <span className="absolute -translate-x-1/2 text-center text-fr-v2-clay transition-all duration-200 motion-reduce:transition-none" style={{ left: `${pct}%` }}>
            <span className="block font-semibold">Housed</span>
            {formatDayMonth(housingDate as string)}
          </span>
        ) : null}
        <span className="absolute right-0 text-right text-fr-v2-graphite">
          <span className="block font-semibold">Sale</span>
          {formatDayMonth(saleDate)}
        </span>
      </div>
      <p className="text-[12px] text-fr-v2-muted">
        {total} days to sale{housedNow ? " · housed throughout" : h !== null ? ` · ${h} at grass, ${total - h} housed` : " · not housed before sale"}
      </p>
    </div>
  );
}

export function AnimalPlanScreen({ initial, tag, scenario }: { initial: DemoAnimalView; tag: string; scenario: CattleDemoScenario }) {
  const { session, addEvent, planDraft, setPlanDraft } = useCattleDemoSession();
  const [view, setView] = useState(initial);
  const [loading, startLoading] = useTransition();
  const loaded = useRef(JSON.stringify({ version: 1, events: [] }));
  const existing = planDraft(tag);
  const [a, setA] = useState<AnimalPlanAssumptions>(existing?.assumptions ?? initial.plan.defaults);
  const [martId, setMartId] = useState(existing?.martId ?? initial.plan.defaultMartId);
  const [targetKg, setTargetKg] = useState(initial.profile.goal.targetWeightKg !== null ? String(initial.profile.goal.targetWeightKg) : "");
  const [projections, setProjections] = useState<Record<string, DemoProjection>>({});
  const [projecting, startProjecting] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  // The profile / plan base follows the session (a saved plan becomes a new goal version).
  useEffect(() => {
    const key = JSON.stringify(session);
    if (key === loaded.current) return;
    loaded.current = key;
    setProjections({});
    startLoading(async () => {
      const r = await loadCattleAnimal(session, tag, scenario);
      if (r.ok) setView(r.value);
    });
  }, [session, tag, scenario]);

  // C5 projection for the chosen sale date (server; cached per date for this session).
  useEffect(() => {
    if (!isPlanDate(a.saleDate) || projections[a.saleDate]) return;
    const date = a.saleDate;
    const t = setTimeout(() => {
      startProjecting(async () => {
        const r = await projectCattleWeight(session, tag, date, scenario);
        if (r.ok) setProjections((p) => ({ ...p, [date]: r.value }));
      });
    }, 120);
    return () => clearTimeout(t);
  }, [a.saleDate, projections, session, tag, scenario]);

  const plan = view.plan;
  const profile = view.profile;
  const valuation = plan.valuations[martId];
  const projection = projections[a.saleDate];
  const economics = useMemo(
    () =>
      computeAnimalPlanEconomics({
        asOfDate: plan.asOfDate,
        assumptions: a,
        currentlyHoused: plan.currentlyHoused,
        currentWeightKg: plan.currentWeightKg,
        projection: projection === undefined ? { state: "NOT_PROJECTED", reason: "PENDING" } : projection.state === "PROJECTED" ? { state: "PROJECTED", kg: projection.kg } : { state: "NOT_PROJECTED", reason: projection.reason },
        costs: plan.costs ?? { animalId: profile.animalId, asOfDate: plan.asOfDate, state: "NONE_RECORDED", currency: null, total: null, direct: null, allocated: null, byCategory: [], entryCount: 0, futureEntryIds: [], issues: [], entries: [] },
        valuation,
      }),
    [a, plan, projection, valuation, profile.animalId],
  );

  const draftDirty = JSON.stringify({ a, martId }) !== JSON.stringify(existing?.saved ? { a: existing.saved.assumptions, martId: existing.saved.martId } : { a: initial.plan.defaults, martId: initial.plan.defaultMartId });
  const set = (patch: Partial<AnimalPlanAssumptions>) => {
    const next = { ...a, ...patch };
    setA(next);
    setPlanDraft(tag, { assumptions: next, martId, saved: existing?.saved ?? null });
  };
  const housedNow = plan.currentlyHoused === true;
  const fixture = economics.valuationStanding === "FIXTURE";
  const ret = economics.returnFromHolding;
  const retTone = ret.state === "KNOWN" && economics.valuationStanding === "LIVE_CURRENT" ? (Number(ret.amount) >= 0 ? "text-fr-v2-forest" : "text-[#b23a2b]") : "text-fr-v2-graphite";
  const invalid = economics.validity.state === "INVALID" ? economics.validity.issues : [];
  const profileHref = `/cattle/animals/${encodeURIComponent(tag)}${scenario === "STANDARD" ? "" : `?scenario=${scenario}`}`;
  const targetValid = targetKg === "" || (Number.isFinite(Number(targetKg)) && Number(targetKg) > 0 && Number(targetKg) <= 2000);

  const save = () => {
    if (invalid.length > 0 || !targetValid) return;
    addEvent({ kind: "SAVE_PLAN_GOAL", tag, goalType: profile.goal.goalType === "SALE" ? "SALE" : "FINISHING", targetKg: targetKg === "" ? null : Number(targetKg), targetDate: a.saleDate });
    setPlanDraft(tag, { assumptions: a, martId, saved: { assumptions: a, martId } });
    setSavedFlash(true);
  };

  return (
    <article className="mx-auto max-w-5xl pb-12" aria-labelledby="plan-title">
      <div className="flex items-center justify-between gap-3">
        <BackLink href={profileHref} label={`Animal ${tag}`} />
        {loading || projecting ? <Pending label={projecting ? "Projecting weight…" : "Recalculating…"} /> : null}
      </div>
      <div className="mt-1 text-[13px] font-medium uppercase tracking-[0.08em] text-fr-v2-plum">Animal plan</div>
      <h1 id="plan-title" className="font-display text-[40px] font-semibold leading-tight tracking-tight text-fr-v2-graphite">
        {tag} to sale on {isPlanDate(a.saleDate) ? formatDate(a.saleDate) : "—"}
      </h1>
      <p className="mt-1 text-[15px] text-fr-v2-charcoal">
        If you keep {tag} until then: what it&apos;s likely to weigh, what it will cost, what it might be worth.
        {plan.saleDateSource === "GOAL" ? " Sale date starts from the declared goal." : " No goal date is declared; the sale date is a starting suggestion."}
      </p>
      <div className="mt-4">
        <DemoNotice>Synthetic animal, fixture mart prices and demonstration costs. Changes stay in this browser session.</DemoNotice>
      </div>

      {/* The decision number */}
      <section aria-labelledby="return-h" className="mt-8">
        <h2 id="return-h" className="text-sm text-fr-v2-muted">
          Return from holding to {isPlanDate(a.saleDate) ? formatDayMonth(a.saleDate) : "sale"}
        </h2>
        <div className={`mt-1 ${retTone}`}>
          {ret.state === "KNOWN" ? <MoneyValue m={ret} signed large /> : <MoneyValue m={ret} />}
        </div>
        <p className="mt-2 text-[15px] text-fr-v2-charcoal">
          {economics.projectedDirectProfit.state === "KNOWN" && economics.currentSellNowMargin.state === "KNOWN"
            ? `Projected direct profit ${formatEuro(economics.projectedDirectProfit.amount)} at sale, against ${formatEuro(economics.currentSellNowMargin.amount)} if sold now.`
            : "Projected direct profit and the sell-now margin need every input below."}
        </p>
        <p className="mt-1 text-[12px] text-fr-v2-muted">
          {fixture ? "Based on development fixture prices — not a market quote. " : ""}Direct costs only: labour, land, finance and overheads aren&apos;t included. A projection, not a guarantee.
        </p>
        {invalid.length > 0 ? (
          <ul className="mt-3 space-y-1 border-l-2 border-[#b23a2b] pl-3 text-sm text-[#b23a2b]" role="alert">
            {invalid.map((i) => (
              <li key={i}>{ISSUE_TEXT[i] ?? i}</li>
            ))}
          </ul>
        ) : null}
        <PlanTimeline asOf={plan.asOfDate} housingDate={a.housingDate} saleDate={a.saleDate} housedNow={housedNow} />
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
          <NumberField id="target-kg" label="Target weight (goal)" unit="kg" value={targetKg} onChange={setTargetKg} step={10} />
          {!targetValid ? <p className="text-sm text-[#b23a2b]">Target weight must be a number of kilograms.</p> : null}

          <div className="space-y-4 pt-2">
            <div className="text-[13px] font-semibold text-fr-v2-graphite">Feed</div>
            <NumberField id="conc-kg" label="Concentrate per day" unit="kg/day" value={a.concentrateKgPerDay ?? ""} onChange={(v) => set({ concentrateKgPerDay: v === "" ? null : v })} step={0.5} />
            <NumberField id="conc-price" label="Concentrate price" unit="€/tonne" value={a.concentratePricePerTonne ?? ""} onChange={(v) => set({ concentratePricePerTonne: v === "" ? null : v })} step={10} />
            <NumberField id="forage" label="Forage / grazing" unit="€/day" value={a.forageCostPerDay ?? ""} onChange={(v) => set({ forageCostPerDay: v === "" ? null : v })} step={0.1} />
            <p className="text-[12px] text-fr-v2-muted">Feed changes the cost only. It doesn&apos;t change the projected weight: there is no validated feed-response model, so the projection keeps the animal&apos;s recent daily gain.</p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="text-[13px] font-semibold text-fr-v2-graphite">Housing</div>
            {housedNow ? (
              <p className="text-sm text-fr-v2-charcoal">Recorded as housed now ({profile.identity.location.value ?? "location unnamed"}), so housing costs run every day to sale.</p>
            ) : (
              <div>
                <label htmlFor="housing-date" className="text-sm text-fr-v2-charcoal">
                  Planned housing date
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input id="housing-date" type="date" value={a.housingDate ?? ""} onChange={(e) => set({ housingDate: e.target.value === "" ? null : e.target.value })} className="h-11 flex-1 rounded-[8px] border border-fr-v2-rule bg-white px-3 text-base" />
                  <button type="button" className="min-h-11 rounded-[8px] px-3 text-sm text-fr-v2-forest" onClick={() => set({ housingDate: null })}>
                    Not housed
                  </button>
                </div>
              </div>
            )}
            <NumberField id="housing-cost" label="Housing and bedding" unit="€/day" value={a.housingCostPerDay ?? ""} onChange={(v) => set({ housingCostPerDay: v === "" ? null : v })} step={0.05} />
          </div>

          <div className="space-y-4 pt-2">
            <div className="text-[13px] font-semibold text-fr-v2-graphite">Market</div>
            <Segmented label="Mart" value={martId} options={plan.marts.map((m) => [m.martId, m.martName] as const)} onChange={(v) => { setMartId(v); setPlanDraft(tag, { assumptions: a, martId: v, saved: existing?.saved ?? null }); }} />
            <Segmented<MarketScenario> label="Sale price scenario" value={a.scenario} options={[["LOW", "Low"], ["BASE", "As now"], ["HIGH", "High"]] as const} onChange={(v) => set({ scenario: v })} />
            <p className="text-[12px] text-fr-v2-muted">Low and high use the bottom and top of the observed range; &ldquo;as now&rdquo; assumes today&apos;s average holds. Prices can move either way.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3">
            <button type="button" onClick={save} disabled={invalid.length > 0 || !targetValid} className="min-h-12 rounded-[8px] bg-fr-v2-forest px-6 text-base font-semibold text-white disabled:opacity-40">
              Save plan
            </button>
            <span className="text-sm text-fr-v2-muted" role="status">
              {savedFlash && !draftDirty ? "Saved to this demo session — the goal now uses this date and weight." : draftDirty ? "Unsaved changes" : existing?.saved ? "Saved to this demo session" : "Not saved"}
            </span>
          </div>
        </section>

        {/* Results */}
        <section aria-labelledby="results-h">
          <SectionHeading id="results-h" title="What that means" />
          <dl className="mt-2">
            <Row label="Projected weight at sale" hint={projection?.state === "PROJECTED" ? `Prediction: recent ${formatAdg(projection.adgKgPerDay)} continued from ${formatDayMonth(projection.fromObservedAt)}` : undefined}>
              {economics.projectedWeightKg.state === "KNOWN" ? (
                <span key={economics.projectedWeightKg.value} className={`font-semibold tabular-nums text-fr-v2-cobalt ${cattleStyles.settle}`}>
                  {formatKg(Number(economics.projectedWeightKg.value))}
                  {economics.projectedAdditionalKg.state === "KNOWN" ? <span className="ml-1.5 text-[12px] font-normal text-fr-v2-muted">{formatSignedKg(Number(economics.projectedAdditionalKg.value))}</span> : null}
                </span>
              ) : (
                <MoneyValue m={{ state: "UNKNOWN", reasons: projection === undefined ? ["PROJECTION_PENDING"] : economics.projectedWeightKg.reasons }} />
              )}
            </Row>
            {profile.goal.targetWeightKg !== null ? <Row label="Goal weight">{formatKg(profile.goal.targetWeightKg)}</Row> : null}
            <Row label="Estimated value now" hint={valuation?.state === "ESTIMATED" && valuation.estimate ? `Range ${formatEuro(valuation.estimate.low)} – ${formatEuro(valuation.estimate.high)}` : undefined}>
              <MoneyValue m={economics.currentEstimatedValue} />
            </Row>
            <Row label="Projected sale value" hint={economics.salePrice.state === "KNOWN" ? `${formatEuroPerKg(economics.salePrice.amount)} × projected weight` : undefined}>
              <MoneyValue m={economics.projectedSaleValue} />
            </Row>
            <Row label="Recorded direct costs to date" hint={plan.costs?.state === "RECORDED" ? `${plan.costs.entryCount} entries, incl. allocated` : undefined}>
              <MoneyValue m={economics.recordedDirectCosts} />
            </Row>
            <Row label="Forecast feed to sale" hint={economics.remainingDays !== null ? `${economics.remainingDays} days` : undefined}>
              <MoneyValue m={economics.forecastFeedCost} />
            </Row>
            <Row label="Forecast housing to sale" hint={economics.housedDays !== null ? `${economics.housedDays} housed days` : undefined}>
              <MoneyValue m={economics.forecastHousingCost} />
            </Row>
            <Row label="Total direct cost by sale">
              <MoneyValue m={economics.totalDirectCostBySale} />
            </Row>
            <Row label="Cost per kg liveweight" hint="Now · at sale">
              <span className="inline-flex gap-2">
                <MoneyValue m={economics.costPerKgNow} perKg />
                <span className="text-fr-v2-muted">·</span>
                <MoneyValue m={economics.costPerKgAtSale} perKg />
              </span>
            </Row>
            <Row label="Projected direct profit at sale" hint="Sale value − recorded costs − forecast costs">
              <MoneyValue m={economics.projectedDirectProfit} />
            </Row>
            <Row label="Sell-now margin" hint="Value now − recorded costs">
              <MoneyValue m={economics.currentSellNowMargin} />
            </Row>
            <Row label="Return from holding" hint="Projected direct profit − sell-now margin">
              <MoneyValue m={economics.returnFromHolding} signed />
            </Row>
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
            {valuation === undefined || valuation.state !== "ESTIMATED" ? (
              <p className={`mt-3 px-3 py-3 text-sm text-fr-v2-charcoal ${cattleStyles.hatch}`}>
                No estimate from this mart:{" "}
                {valuation?.reasons.map((r) => ({ NO_COMPARABLE_WEIGHT_BAND: "no comparable weight band in the report", MART_VALUATION_NEEDS_KNOWN_LIVEWEIGHT: "the animal's current weight is unknown", ANIMAL_SEX_UNKNOWN: "the animal's sex isn't recorded", WEIGHT_NEEDED_TO_CHOOSE_CATEGORY: "a current weight is needed to choose the category" })[r] ?? r.toLowerCase().replace(/_/g, " ")).join("; ") ?? "provider unavailable"}
                . Values that depend on it stay unknown.
              </p>
            ) : (
              <div className="mt-3">
                <div className="text-sm text-fr-v2-muted">Estimated current value</div>
                <div className="text-[30px] font-semibold tabular-nums leading-tight text-fr-v2-graphite">{formatEuro(valuation.estimate!.central)}</div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-fr-v2-muted">Source</dt>
                  <dd className="text-fr-v2-graphite">
                    {valuation.mart?.martName} · {valuation.reportDate ? formatDayMonth(valuation.reportDate) : ""}
                    {valuation.freshness?.state === "STALE" ? <span className="ml-2 font-medium text-fr-v2-harvest-ink">Old report — {valuation.freshness.ageDays} days</span> : <span className="ml-2 text-fr-v2-muted">{valuation.freshness?.ageDays} days old</span>}
                  </dd>
                  <dt className="text-fr-v2-muted">Observed range</dt>
                  <dd className="tabular-nums text-fr-v2-graphite">
                    {formatEuro(valuation.estimate!.low)} – {formatEuro(valuation.estimate!.high)} <span className="text-fr-v2-muted">({formatEuroPerKg(valuation.price!.low)} – {formatEuroPerKg(valuation.price!.high)})</span>
                  </dd>
                  <dt className="text-fr-v2-muted">Compared with</dt>
                  <dd className="text-fr-v2-graphite">{valuation.category?.label}{valuation.sampleSize ? ` · ${valuation.sampleSize} sold` : ""}</dd>
                  <dt className="text-fr-v2-muted">Basis</dt>
                  <dd className="text-fr-v2-graphite">
                    {valuation.basis === "EUR_PER_KG_LIVEWEIGHT" ? "€/kg liveweight × current weight (derived, not observed for this animal)" : "€/head as reported"} · central figure: {valuation.centralDerivation === "OBSERVED_AVERAGE" ? "observed average" : valuation.centralDerivation === "OBSERVED_MEDIAN" ? "observed median" : "midpoint"}
                  </dd>
                  <dt className="text-fr-v2-muted">Status</dt>
                  <dd className="font-medium text-fr-v2-harvest-ink">{valuation.provider?.isLive ? "Live data" : "Development fixture — not live, not a real mart report"}</dd>
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
