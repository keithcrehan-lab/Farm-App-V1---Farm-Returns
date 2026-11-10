"use client";

/**
 * The Plan assistant on the Today view: a short weekly overview, a few
 * recommendations worth acting on, and one consolidated spreading-rules
 * panel. Everything comes from `buildRecommendations` and
 * `spreadingCompliance` over the farm's own data; technical provenance is
 * kept behind "How was this calculated?".
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, ChevronDown, Lightbulb, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays } from "@/domain/farm-calendar";
import { spreadingCompliance, type SpreadingCompliance } from "@/domain/spreading-compliance";
import {
  RECOMMENDATION_CATEGORY_LABEL, RELIABILITY_LABEL, buildRecommendations, weeklyOverview,
  type GrazingContext, type PlanningContext, type PromptLike, type Recommendation, type RecommendationState, type SchemeActionLike,
} from "@/domain/recommendations";
import { buildFarmSlurryForecast } from "@/domain/slurry-storage-forecast";
import { buildGrassFieldState, latestGrassGrowthObservation, latestGrassObservationByField } from "@/domain/grass-management";
import { getGrassManagementDataAction, type GrassManagementData } from "@/app/actions/grass-management";
import { loadScepForPlanAction } from "@/app/actions/scheme-plan";
import { getRecordGapsAction } from "@/app/actions/farm-records";
import { listRecommendationStatesAction, setRecommendationStateAction } from "@/app/actions/recommendations";
import type { PlanAssistantContext } from "@/components/plan/FarmCalendar";

type ForecastInput = Parameters<typeof buildFarmSlurryForecast>[0];

interface Props {
  ctx: PlanAssistantContext;
  farmId: string;
  county: string | null | undefined;
  fields: ReadonlyArray<{ id: string; name: string }>;
  prompts: readonly PromptLike[];
  milestones: PlanningContext["milestones"] | null;
  housing: ForecastInput["housing"];
  livestockGroups: ForecastInput["livestockGroups"];
  slurryAllocations: ForecastInput["allocations"];
  schemeName?: string;
  schemeActions?: readonly SchemeActionLike[];
}

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const SHOWN = 3;

export function PlanAssistant({ ctx, farmId, county, fields, prompts, milestones, housing, livestockGroups, slurryAllocations, schemeName, schemeActions }: Props) {
  const { today, signedIn, entries } = ctx;
  const [states, setStates] = useState<RecommendationState[]>([]);
  const [open, setOpen] = useState<Recommendation | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");
  const [grass, setGrass] = useState<{ data: Extract<GrassManagementData, { status: "ok" }>; asOf: string } | null>(null);
  const [scep, setScep] = useState<{ name: string; actions: SchemeActionLike[] } | null>(null);
  const [recordGaps, setRecordGaps] = useState<PlanningContext["recordGaps"]>(undefined);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void listRecommendationStatesAction().then((r) => { if (live && r.status === "ok") setStates(r.states); }).catch(() => undefined);
    void getGrassManagementDataAction().then((d) => { if (live && d.status === "ok") setGrass({ data: d, asOf: new Date().toISOString() }); }).catch(() => undefined);
    void loadScepForPlanAction().then((r) => { if (live && r.status === "ok") setScep({ name: r.name, actions: r.actions }); }).catch(() => undefined);
    void getRecordGapsAction().then((r) => { if (live && r.ok) setRecordGaps(r.gaps); }).catch(() => undefined);
    return () => { live = false; };
  }, [signedIn]);

  const compliance = useMemo(() => spreadingCompliance(county, today, prompts), [county, today, prompts]);

  const slurryForecast = useMemo(() => {
    if (!housing.length) return null;
    const slurry = compliance?.restrictions.find((r) => r.material === "organic_fertiliser_other_than_FYM");
    const target = slurry?.active ? slurry.reopens : addDays(today, 56);
    try {
      return buildFarmSlurryForecast({ housing, livestockGroups, allocations: slurryAllocations, asOfDate: today, targetDate: target });
    } catch {
      return null;
    }
  }, [housing, livestockGroups, slurryAllocations, compliance, today]);

  // Same cover calculation as Today's grass map: last reading, brought
  // forward with growth and the grazing recorded by cattle moves.
  const grazing = useMemo<GrazingContext | undefined>(() => {
    if (!grass) return undefined;
    const { data, asOf } = grass;
    const latest = latestGrassObservationByField(data.coverObservations, asOf);
    const growth = latestGrassGrowthObservation(data.growthObservations, asOf);
    const demand = new Map<string, { demandWindows: Array<{ id: string; dailyDemandKgDm: number; startedAt: string; endedAt?: string; source: string }>; unresolvedDemandWindows: Array<{ id: string; startedAt: string; endedAt?: string }> }>();
    for (const s of data.grazingSessions) {
      const entry = demand.get(s.fieldId) ?? { demandWindows: [], unresolvedDemandWindows: [] };
      if (s.demand.status === "resolved") entry.demandWindows.push({ id: s.sessionId, dailyDemandKgDm: s.demand.dailyDemandKgDm, startedAt: s.startedAt, ...(s.endedAt ? { endedAt: s.endedAt } : {}), source: s.demand.source });
      else entry.unresolvedDemandWindows.push({ id: s.sessionId, startedAt: s.startedAt, ...(s.endedAt ? { endedAt: s.endedAt } : {}) });
      demand.set(s.fieldId, entry);
    }
    return {
      fields: data.fields.map((f) => {
        const st = buildGrassFieldState({ fieldId: f.id, areaHa: f.areaHa, observation: latest.get(f.id), growth, asOf, ...(demand.get(f.id) ?? {}) });
        return st.status === "known"
          ? { fieldId: f.id, name: f.name, known: true, coverKgDmHa: st.current.coverKgDmHa, basis: st.current.basis, band: st.band, measuredAgeDays: st.measured.ageDays }
          : { fieldId: f.id, name: f.name, known: false };
      }),
      open: data.openGrazingSessions.map((s) => ({ sessionId: s.sessionId, fieldId: s.fieldId, groupId: s.livestockGroupId, groupLabel: s.groupLabel, headCount: s.headCountSnapshot, startedAt: s.startedAt })),
    };
  }, [grass]);

  const recs = useMemo(() => buildRecommendations({
    farmId, today, fields, prompts, compliance, entries,
    lastWalkDate: ctx.lastWalk,
    milestones: milestones ?? [],
    hasHousing: housing.length > 0,
    slurryForecast,
    schemeName: scep?.name ?? schemeName,
    schemeActions: scep?.actions ?? schemeActions,
    grazing,
    recordGaps,
  }, states), [farmId, today, fields, prompts, compliance, entries, ctx.lastWalk, milestones, housing.length, slurryForecast, schemeName, schemeActions, scep, grazing, recordGaps, states]);

  const overview = useMemo(() => weeklyOverview(recs, entries, compliance, today), [recs, entries, compliance, today]);
  // Overdue jobs and bookings already sit in the Today and Up next lists; they
  // count in the overview but aren't repeated as cards.
  const listed = recs.filter((r) => r.status === "active" && r.source !== "calendar");
  const hidden = recs.filter((r) => r.status === "snoozed" || r.status === "dismissed");
  const shown = showAll ? listed : listed.slice(0, SHOWN);

  async function remember(r: Recommendation, status: RecommendationState["status"], snoozedUntil: string | null = null) {
    const next: RecommendationState = { key: r.key, status, fingerprint: r.fingerprint, snoozedUntil };
    if (!signedIn) {
      setError("Sign in to save changes to your recommendations.");
      return;
    }
    setError("");
    // Keep the previous value so a failed server write cannot masquerade as
    // a successfully saved dismissal, snooze or completion.
    const previous = states.find((s) => s.key === r.key);
    setStates((list) => [...list.filter((s) => s.key !== r.key), next]);
    setOpen(null);
    try {
      const res = await setRecommendationStateAction(next);
      if (!res.ok) throw new Error(res.error);
    } catch {
      setStates((list) => [
        ...list.filter((s) => s.key !== r.key),
        ...(previous ? [previous] : []),
      ]);
      setError("Could not save that change. Please try again.");
    }
  }

  function act(r: Recommendation, planInstead = false) {
    const a = r.action;
    setOpen(null);
    if (a.type === "complete") return ctx.setEntryStatus(a.entryId, "done");
    if (a.type === "book") return ctx.setEntryStatus(a.entryId, "booked");
    const plan = a.type === "plan" ? a.plan : planInstead ? a.plan : undefined;
    if (plan) ctx.addToPlan({ ...plan, sourceKey: r.key });
  }

  return (
    <div className="space-y-5">
      <Overview overview={overview} />

      {listed.length ? (
        <section aria-labelledby="fr-recommended">
          <h2 id="fr-recommended" className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-ink-600">Recommended for you</h2>
          <ul className="space-y-2">
            {shown.map((r) => <RecommendationCard key={r.key} r={r} signedIn={signedIn} onAct={() => act(r)} onDetails={() => setOpen(r)} />)}
          </ul>
          {listed.length > SHOWN ? (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 min-h-10 w-full text-sm font-semibold text-fr-green-700">
              {showAll ? "Show fewer" : `Show ${listed.length - SHOWN} more`}
            </button>
          ) : null}
        </section>
      ) : null}
      {error ? <p role="alert" className="text-sm text-fr-risk">{error}</p> : null}

      {compliance ? <CompliancePanel c={compliance} /> : null}

      {hidden.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-fr-ink-600">Snoozed or dismissed ({hidden.length})</summary>
          <ul className="mt-2 space-y-1">
            {hidden.map((r) => (
              <li key={r.key} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-fr-ink-900">{r.title}</span>
                <span className="shrink-0 text-xs text-fr-ink-600">{r.status === "snoozed" && r.snoozedUntil ? `Until ${fmt(r.snoozedUntil)}` : "Dismissed"}</span>
                <button type="button" onClick={() => void remember(r, "active")} className="min-h-9 shrink-0 px-2 text-xs font-semibold text-fr-green-700">Restore</button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {open ? (
        <DetailsSheet r={open} signedIn={signedIn} onClose={() => setOpen(null)} onAct={(planInstead) => act(open, planInstead)}
          onSnooze={() => void remember(open, "snoozed", addDays(today, 7))}
          onDismiss={() => void remember(open, "dismissed")}
          onDone={() => void remember(open, "done")} />
      ) : null}
    </div>
  );
}

function Overview({ overview: o }: { overview: ReturnType<typeof weeklyOverview> }) {
  const rows: Array<{ icon: typeof AlertTriangle; tone: string; label: string; text: string }> = [];
  rows.push(o.attention.length
    ? { icon: AlertTriangle, tone: "text-fr-risk", label: "Needs attention", text: o.attention.slice(0, 2).map((r) => r.title).join(" · ") + (o.attention.length > 2 ? ` and ${o.attention.length - 2} more` : "") }
    : { icon: AlertTriangle, tone: "text-fr-ink-400", label: "Needs attention", text: "Nothing urgent" });
  rows.push({
    icon: CalendarClock, tone: "text-fr-v2-forest", label: "Coming up",
    text: o.comingUp.length ? `${o.comingUp.length} this week · next: ${o.comingUp[0].title}, ${fmt(o.comingUp[0].startDate)}` : "Nothing planned this week",
  });
  if (o.opportunities) rows.push({ icon: Lightbulb, tone: "text-fr-v2-forest", label: "Worth considering", text: `${o.opportunities} suggestion${o.opportunities === 1 ? "" : "s"} below` });
  if (o.canWait) rows.push({ icon: CalendarClock, tone: "text-fr-ink-400", label: "Can wait", text: `${o.canWait} later this month` });
  return (
    <section aria-label="This week" className="rounded-[14px] border border-fr-v2-cream-rule bg-white p-3.5">
      <h2 className="mb-2 font-display text-[18px] leading-none text-fr-ink-900">This week</h2>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.label} className="flex gap-2.5 text-sm">
            <row.icon className={cn("mt-0.5 size-4 shrink-0", row.tone)} aria-hidden />
            <p className="min-w-0"><span className="font-semibold text-fr-ink-900">{row.label}: </span><span className="text-fr-ink-600">{row.text}</span></p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function primaryLabel(r: Recommendation, signedIn: boolean): string | null {
  if (r.action.type === "open") return r.action.label;
  return signedIn ? r.action.label : null;
}

function RecommendationCard({ r, signedIn, onAct, onDetails }: { r: Recommendation; signedIn: boolean; onAct: () => void; onDetails: () => void }) {
  const label = primaryLabel(r, signedIn);
  return (
    <li className="rounded-[14px] border border-fr-v2-cream-rule bg-white p-3.5">
      <p className={cn("text-[11px] font-semibold", r.category === "attention" ? "text-fr-risk" : "text-fr-ink-600")}>
        {RECOMMENDATION_CATEGORY_LABEL[r.category]}{r.reliability !== "verified" ? ` · ${RELIABILITY_LABEL[r.reliability]}` : ""}
      </p>
      <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-fr-ink-900">{r.title}</h3>
      <p className="mt-1 text-sm text-fr-ink-600">{r.explanation}</p>
      <div className="mt-2.5 flex gap-2">
        {label ? (
          r.action.type === "open"
            ? <Link href={r.action.href} className="inline-flex min-h-10 items-center rounded-full bg-fr-green-700 px-4 text-sm font-semibold text-white">{label}</Link>
            : <button type="button" onClick={onAct} className="min-h-10 rounded-full bg-fr-green-700 px-4 text-sm font-semibold text-white">{label}</button>
        ) : null}
        <button type="button" onClick={onDetails} className="min-h-10 rounded-full border border-fr-v2-cream-rule px-4 text-sm font-semibold text-fr-ink-900">Details</button>
      </div>
    </li>
  );
}

function DetailsSheet({ r, signedIn, onClose, onAct, onSnooze, onDismiss, onDone }: {
  r: Recommendation; signedIn: boolean; onClose: () => void; onAct: (planInstead?: boolean) => void; onSnooze: () => void; onDismiss: () => void; onDone: () => void;
}) {
  const label = primaryLabel(r, signedIn);
  const canPlanToo = signedIn && r.action.type === "open" && Boolean(r.action.plan);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={r.title}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[20px] bg-fr-v2-cream p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:rounded-[20px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-fr-ink-600">{RECOMMENDATION_CATEGORY_LABEL[r.category]}</p>
            <h2 className="mt-1 font-display text-[22px] leading-tight text-fr-ink-900">{r.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full text-fr-ink-600"><X className="size-5" /></button>
        </div>
        <p className="mt-3 text-sm text-fr-ink-900">{r.explanation}</p>
        <p className="mt-3 text-xs font-semibold text-fr-ink-900">Why it matters</p>
        <p className="text-sm text-fr-ink-600">{r.why}</p>

        {r.evidence.length ? (
          <div className="mt-4">
            <p className="text-xs font-semibold text-fr-ink-900">What this is based on</p>
            <ul className="mt-1 divide-y divide-fr-v2-cream-rule rounded-[12px] border border-fr-v2-cream-rule bg-white">
              {r.evidence.map((e, i) => (
                <li key={`${e.label}-${i}`} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 text-fr-ink-900">{e.label}</span>
                  <span className="text-right text-fr-ink-600">{e.value}<span className="block text-[11px] text-fr-ink-400">{RELIABILITY_LABEL[e.reliability]}</span></span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <details className="group mt-3">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-fr-ink-600">
            How was this calculated? <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <dl className="space-y-1 rounded-[10px] bg-white p-3 text-xs text-fr-ink-600">
            <div className="flex justify-between gap-3"><dt>Type of information</dt><dd className="text-right">{RELIABILITY_LABEL[r.reliability]}</dd></div>
            {(r.provenance ?? []).map((p, i) => <div key={i} className="flex justify-between gap-3"><dt>{p.label}</dt><dd className="break-words text-right">{p.value}</dd></div>)}
            {r.date ? <div className="flex justify-between gap-3"><dt>Relevant date</dt><dd>{fmt(r.date)}</dd></div> : null}
          </dl>
        </details>

        <div className="mt-4 space-y-2">
          {label ? (
            r.action.type === "open"
              ? <Link href={r.action.href} onClick={onClose} className="flex min-h-12 w-full items-center justify-center rounded-[12px] bg-fr-green-700 text-base font-semibold text-white">{label}</Link>
              : <button type="button" onClick={() => onAct()} className="min-h-12 w-full rounded-[12px] bg-fr-green-700 text-base font-semibold text-white">{label}</button>
          ) : null}
          {canPlanToo ? <button type="button" onClick={() => onAct(true)} className="min-h-11 w-full rounded-[12px] border border-fr-v2-cream-rule bg-white text-sm font-semibold text-fr-ink-900">Add to plan instead</button> : null}
          {r.href && r.action.type !== "open" ? <Link href={r.href} onClick={onClose} className="flex min-h-11 w-full items-center justify-center rounded-[12px] border border-fr-v2-cream-rule bg-white text-sm font-semibold text-fr-ink-900">Open the related screen</Link> : null}
          {r.dismissible ? (
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={onSnooze} className="min-h-11 rounded-[12px] text-sm font-semibold text-fr-ink-600">Snooze a week</button>
              <button type="button" onClick={onDone} className="min-h-11 rounded-[12px] text-sm font-semibold text-fr-ink-600">Already done</button>
              <button type="button" onClick={onDismiss} className="min-h-11 rounded-[12px] text-sm font-semibold text-fr-ink-600">Not relevant</button>
            </div>
          ) : <p className="text-center text-xs text-fr-ink-400">This stays until the situation changes.</p>}
        </div>
      </div>
    </div>
  );
}

function CompliancePanel({ c }: { c: SpreadingCompliance }) {
  const active = c.restrictions.filter((r) => r.active);
  return (
    <details className="group rounded-[14px] border border-fr-v2-cream-rule bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3.5 py-3">
        <ShieldCheck className="size-5 shrink-0 text-fr-ink-600" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fr-ink-900">Spreading rules</span>
          <span className="block text-xs text-fr-ink-600">
            {active.length ? "Reopening dates and conditions" : "All open · when the next closed periods start"} · {c.county}, zone {c.zone}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-fr-ink-600 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-fr-v2-cream-rule px-3.5 pb-3.5 pt-2">
        <ul className="divide-y divide-fr-v2-cream-rule">
          {c.restrictions.map((r) => (
            <li key={r.material} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="text-fr-ink-900">{r.label}</span>
              <span className={cn("text-right", r.active ? "font-semibold text-fr-risk" : "text-fr-v2-forest")}>
                {r.active ? `Closed until ${fmt(r.closedThrough)}` : `Open · closes ${fmt(r.closedFrom)}`}
                {r.active ? <span className="block text-[11px] font-normal text-fr-ink-600">Reopens {fmt(r.reopens)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-fr-ink-600">
          {c.conditions.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <details className="group/how mt-2">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-fr-ink-600">
            How was this calculated? <ChevronDown className="size-3.5 transition-transform group-open/how:rotate-180" aria-hidden />
          </summary>
          <dl className="space-y-1 rounded-[10px] bg-fr-v2-cream p-3 text-xs text-fr-ink-600">
            <div className="flex justify-between gap-3"><dt>County and zone</dt><dd>{c.county}, Nitrates zone {c.zone}</dd></div>
            <div className="flex justify-between gap-3"><dt>Rule</dt><dd className="break-words text-right">{c.provenance.rule}</dd></div>
            <div className="flex justify-between gap-3"><dt>Version</dt><dd className="break-words text-right">{c.provenance.calculationVersion}</dd></div>
            <div className="flex justify-between gap-3"><dt>Checked on</dt><dd>{fmt(c.provenance.checkedOn)}</dd></div>
          </dl>
        </details>
      </div>
    </details>
  );
}
