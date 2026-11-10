/**
 * Shared recommendation engine for Plan (and any other screen).
 *
 * Every Farm Return module contributes candidates through a small source
 * function; the engine gives each one a stable key, folds per-field
 * repeats into one farm-level recommendation where the action is the
 * same, applies the farmer's own lifecycle choices (planned, snoozed,
 * dismissed, done) and ranks what is left. Pure and deterministic: no
 * clock, no network, no AI. Figures come from the existing engines
 * (fertiliser, slurry forecast, closed-period calendar, SCEP rules); this
 * module only decides what is worth saying and how to say it.
 *
 * Statutory restrictions are not recommendations: they are returned by
 * `spreadingCompliance` and shown as information. Only the farm work that
 * follows from them (preparing a fertiliser plan, slurry storage running
 * short before reopening) becomes a recommendation here.
 */
import { addDays, daysBetween, isOpen, type CalendarCategory, type CalendarEntry, type CalendarKind } from "./farm-calendar";
import { bookingState, grassWalkSuggestion, isOverdue } from "./plan-views";
import type { SpreadingCompliance } from "./spreading-compliance";

export const RECOMMENDATION_CATEGORIES = ["attention", "upcoming", "opportunity", "compliance", "insight"] as const;
export type RecommendationCategory = (typeof RECOMMENDATION_CATEGORIES)[number];
export const RECOMMENDATION_CATEGORY_LABEL: Record<RecommendationCategory, string> = {
  attention: "Needs attention",
  upcoming: "Upcoming farm work",
  opportunity: "Worth doing",
  compliance: "Rules",
  insight: "Insight",
};

/** How much the farmer can rely on what a recommendation says. */
export type Reliability = "verified" | "calculated" | "modelled" | "missing";
export const RELIABILITY_LABEL: Record<Reliability, string> = {
  verified: "From your records",
  calculated: "Calculated from your records",
  modelled: "Forecast",
  missing: "Information missing",
};

export type RecommendationSource = "fertiliser" | "slurry" | "grass" | "grazing" | "cattle" | "schemes" | "calendar" | "fields";
export type LifecycleStatus = "active" | "planned" | "snoozed" | "dismissed" | "done";

export interface EvidenceItem { label: string; value: string; reliability: Reliability }

export interface PlanPreset {
  title: string;
  category: CalendarCategory;
  kind: CalendarKind;
  startDate: string;
  endDate: string;
  fieldIds: string[];
  notes?: string;
}

export type RecommendationAction =
  | { type: "plan"; label: string; plan: PlanPreset; href?: string }
  | { type: "open"; label: string; href: string; plan?: PlanPreset }
  | { type: "complete"; label: string; entryId: string; href?: string }
  | { type: "book"; label: string; entryId: string };

export interface Recommendation {
  /** Stable across rebuilds: source, action, subject and period. */
  key: string;
  farmId: string;
  source: RecommendationSource;
  category: RecommendationCategory;
  subject: { type: "farm" | "field" | "group" | "store" | "entry"; ids: string[]; names: string[] };
  title: string;
  explanation: string;
  why: string;
  evidence: EvidenceItem[];
  provenance?: { label: string; value: string }[];
  action: RecommendationAction;
  /** Where "Details" or the title goes. */
  href?: string;
  reliability: Reliability;
  /** The date the recommendation is about (a deadline, a reopening). */
  date?: string;
  /** Gone after this date whatever the farmer did. */
  expiresAfter?: string;
  /** Changes when the circumstances change, so a dismissal can lapse. */
  fingerprint: string;
  dismissible: boolean;
  statutory: boolean;
  /** 0-50: rough operational or financial weight, set by the source. */
  impact: number;
  priority: number;
  status: LifecycleStatus;
  snoozedUntil?: string;
  planEntryId?: string;
}

export interface RecommendationState {
  key: string;
  status: "active" | "snoozed" | "dismissed" | "done";
  fingerprint: string;
  snoozedUntil: string | null;
}

export interface PromptLike {
  id: string;
  kind: string;
  fieldId?: string;
  basis: unknown;
  title: string;
  description: string;
  calculationVersion?: string;
  inputsSnapshot?: Record<string, unknown>;
}

export interface SlurryForecastLike {
  status: "READY" | "PARTIAL";
  targetDate: string;
  stores: Array<
    | { status: "BLOCKED"; housingId: string; shedName: string; reasonCodes: string[] }
    | { status: "READY"; housingId: string; shedName: string; capacityM3: number; projectedVolumeM3: number; projectedFillPct: number; overflowM3: number; projectedCapacityDate?: string; assumptions: string[] }
  >;
  version: string;
}

export interface SchemeActionLike {
  key: string;
  label: string;
  deadline: string | null;
  deadlineState: "past" | "upcoming" | null;
  state: string;
  detail: string;
  current?: number | null;
  target?: number | null;
}

/** One field's grass position, from the grass engine (`buildGrassFieldState`). */
export interface GrazingFieldLike {
  fieldId: string;
  name: string;
  known: boolean;
  coverKgDmHa?: number;
  /** measured = the last reading itself; estimated = brought forward with growth and grazing. */
  basis?: "measured" | "estimated";
  band?: "unknown" | "below_target" | "target" | "above_target" | "surplus";
  measuredAgeDays?: number;
}

/** A group of cattle currently recorded in a field. */
export interface OpenGrazingLike {
  sessionId: string;
  fieldId: string;
  groupId: string;
  groupLabel: string;
  headCount: number;
  startedAt: string;
}

export interface GrazingContext {
  fields: readonly GrazingFieldLike[];
  open: readonly OpenGrazingLike[];
}

export interface PlanningContext {
  farmId: string;
  today: string;
  fields: ReadonlyArray<{ id: string; name: string }>;
  prompts: readonly PromptLike[];
  compliance: SpreadingCompliance | null;
  entries: readonly CalendarEntry[];
  /** undefined = not known (not loaded); null = no walk on record. */
  lastWalkDate?: string | null;
  milestones?: ReadonlyArray<{ groupId: string; groupLabel: string; targetDate: string; targetWeightKg?: number }>;
  hasHousing?: boolean;
  slurryForecast?: SlurryForecastLike | null;
  schemeName?: string;
  schemeActions?: readonly SchemeActionLike[];
  grazing?: GrazingContext;
}

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { timeZone: "UTC", day: "numeric", month: "short" });
const status = (p: PromptLike) => (p.basis as { status?: string } | null)?.status ?? "UNKNOWN";
const missing = (p: PromptLike): string[] => {
  const m = (p.basis as { missingInputs?: unknown } | null)?.missingInputs;
  return Array.isArray(m) ? m.map(String) : [];
};

/** Small stable hash so fingerprints stay short. */
export function fingerprintOf(parts: ReadonlyArray<string | number | null | undefined>): string {
  let h = 5381;
  for (const ch of parts.map((p) => String(p ?? "")).join("|")) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

const MISSING_LABEL: Record<string, string> = {
  FIELD_COMMONAGE_STATUS: "whether it's commonage",
  LOCAL_WATER_BUFFER_OVERRIDE: "the local water-buffer assessment",
  silage: "the silage plan",
  plannedUse: "what the field is used for",
};
export function missingLabel(code: string): string {
  return MISSING_LABEL[code] ?? code.replace(/[_-]+/g, " ").toLowerCase();
}

const listNames = (names: string[], max = 3) =>
  names.length <= max ? names.join(", ").replace(/, ([^,]*)$/, " and $1") : `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Candidate = Omit<Recommendation, "priority" | "status" | "snoozedUntil" | "planEntryId" | "farmId">;

// ---------------------------------------------------------------- sources

function fertiliserSource(ctx: PlanningContext, fieldName: (id?: string) => string): Candidate[] {
  const out: Candidate[] = [];
  const recs = ctx.prompts.filter((p) => p.kind === "fertiliser_recommendation");
  const ready = recs.filter((p) => status(p) === "OK" && p.fieldId);
  const chemical = ctx.compliance?.restrictions.find((r) => r.material === "chemical_fertiliser");
  if (ready.length && chemical?.active) {
    const year = chemical.reopens.slice(0, 4);
    const ids = ready.map((p) => p.fieldId!);
    out.push({
      key: `fertiliser:prepare-plan:farm:${year}`,
      source: "fertiliser",
      category: "upcoming",
      subject: { type: "farm", ids, names: ids.map(fieldName) },
      title: `Prepare your ${year} fertiliser plan`,
      explanation: `Chemical fertiliser spreading is restricted until ${fmtDate(chemical.closedThrough)}. You can prepare your ${year} fertiliser plan ahead of the reopening date.`,
      why: "Having the plan and product ready means you can spread as soon as ground conditions allow after the closed period.",
      evidence: [
        { label: "Fields with a calculated requirement", value: `${ready.length} of ${ctx.fields.length}`, reliability: "calculated" },
        { label: "Spreading reopens", value: fmtDate(chemical.reopens), reliability: "verified" },
      ],
      provenance: [
        { label: "Calculation", value: "Field-by-field nutrient requirement from the fertiliser engine" },
        ...(ready[0].calculationVersion ? [{ label: "Version", value: ready[0].calculationVersion }] : []),
      ],
      action: {
        type: "plan", label: "Add to plan", href: "/fertiliser-plan",
        plan: { title: `Prepare ${year} fertiliser plan`, category: "nutrients", kind: "job", startDate: ctx.today, endDate: addDays(chemical.reopens, -1), fieldIds: ids },
      },
      href: "/fertiliser-plan",
      reliability: "calculated",
      date: chemical.reopens,
      expiresAfter: chemical.reopens,
      fingerprint: fingerprintOf([chemical.reopens, ...ids.sort()]),
      dismissible: true,
      statutory: false,
      impact: 30,
    });
  } else if (ready.length && chemical && !chemical.active) {
    const ids = ready.map((p) => p.fieldId!);
    out.push({
      key: `fertiliser:apply:farm:${chemical.closedFrom.slice(0, 4)}`,
      source: "fertiliser",
      category: "upcoming",
      subject: { type: "farm", ids, names: ids.map(fieldName) },
      title: `Fertiliser is due on ${plural(ids.length, "field")}`,
      explanation: `${listNames(ids.map(fieldName))} ${ids.length === 1 ? "has" : "have"} a calculated fertiliser requirement. Spreading is open until ${fmtDate(addDays(chemical.closedFrom, -1))}.`,
      why: "Spreading while the calendar is open and the grass is growing gets the most from the fertiliser.",
      evidence: ready.slice(0, 5).map((p) => ({ label: fieldName(p.fieldId), value: p.description.replace(/^.*?needs /, "Needs "), reliability: "calculated" as Reliability })),
      action: {
        type: "plan", label: "Add to plan", href: "/fertiliser-plan",
        plan: { title: "Spread fertiliser", category: "nutrients", kind: "job", startDate: ctx.today, endDate: addDays(ctx.today, 13), fieldIds: ids },
      },
      href: "/fertiliser-plan",
      reliability: "calculated",
      date: addDays(chemical.closedFrom, -1),
      expiresAfter: addDays(chemical.closedFrom, -1),
      fingerprint: fingerprintOf([chemical.closedFrom, ...ids.sort()]),
      dismissible: true,
      statutory: false,
      impact: 30,
    });
  }

  // Fields where a fertiliser figure can't be worked out yet.
  const blocked = recs.filter((p) => status(p) === "BLOCKED_INSUFFICIENT_EVIDENCE" && p.fieldId);
  if (blocked.length) {
    const ids = blocked.map((p) => p.fieldId!);
    const needs = [...new Set(blocked.flatMap(missing))];
    out.push({
      key: "fertiliser:complete-inputs:farm",
      source: "fertiliser",
      category: "opportunity",
      subject: { type: "field", ids, names: ids.map(fieldName) },
      title: `Finish the details for ${plural(ids.length, "field")} to get fertiliser advice`,
      explanation: `${listNames(ids.map(fieldName))} ${ids.length === 1 ? "needs" : "need"} ${needs.length ? listNames(needs.map(missingLabel)) : "a few more details"} before a fertiliser figure can be worked out.`,
      why: "Without these details the fertiliser plan can't cover every field.",
      evidence: blocked.map((p) => ({ label: fieldName(p.fieldId), value: missing(p).map(missingLabel).join(", ") || "Details missing", reliability: "missing" as Reliability })),
      action: { type: "open", label: "Open field", href: `/fields?field=${encodeURIComponent(ids[0])}&chapter=nutrients` },
      href: `/fields?field=${encodeURIComponent(ids[0])}&chapter=nutrients`,
      reliability: "missing",
      fingerprint: fingerprintOf([...ids.sort(), ...needs.sort()]),
      dismissible: true,
      statutory: false,
      impact: 15,
    });
  }
  return out;
}

/**
 * Why a field's soil test can't be relied on, from the soil-test check
 * (`checkFieldSoilTestAgeValidity`): no test at all, a missing input such as
 * the field's planned use, an undated or future-dated test, or a P result on
 * the statutory Index 3/4 boundary.
 */
export function soilTestReason(p: PromptLike): string {
  const s = status(p);
  if (s === "NOT_APPLICABLE") return "No soil test on record";
  if (s === "AMBIGUOUS") return "P result is on the Index 3/4 boundary";
  const m = missing(p);
  if (m.length) return `Needs ${listNames(m.map(missingLabel))}`;
  if (s === "BLOCKED_INSUFFICIENT_EVIDENCE") return "Test date is missing or not valid";
  return "Test can't be used as it stands";
}

function soilSource(ctx: PlanningContext, fieldName: (id?: string) => string): Candidate[] {
  const soil = ctx.prompts.filter((p) => p.kind === "soil_test_age" && p.fieldId);
  const none = soil.filter((p) => status(p) === "NOT_APPLICABLE").map((p) => p.fieldId!);
  const reviewPrompts = soil.filter((p) => !["OK", "NOT_APPLICABLE"].includes(status(p)));
  const review = reviewPrompts.map((p) => p.fieldId!);
  const ids = [...none, ...review];
  if (!ids.length) return [];
  // Group the fields under each reason so the card reads as a short list.
  const byReason = new Map<string, string[]>();
  for (const p of reviewPrompts) byReason.set(soilTestReason(p), [...(byReason.get(soilTestReason(p)) ?? []), fieldName(p.fieldId)]);
  const reasonText = [...byReason].map(([reason, names]) => `${listNames(names)}: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`).join(" ");
  return [{
    key: "fields:soil-tests:farm",
    source: "fields",
    category: "opportunity",
    subject: { type: "field", ids, names: ids.map(fieldName) },
    title: none.length && !review.length
      ? `Add soil test results for ${plural(none.length, "field")}`
      : `Check soil tests for ${plural(ids.length, "field")}`,
    explanation: [
      none.length ? `${listNames(none.map(fieldName))} ${none.length === 1 ? "has" : "have"} no soil test on record.` : "",
      review.length ? reasonText : "",
    ].filter(Boolean).join(" "),
    why: "Soil tests set the phosphorus and lime advice, and a field without a valid test is treated at the most restrictive index.",
    evidence: [
      ...none.map((id) => ({ label: fieldName(id), value: "No soil test on record", reliability: "missing" as Reliability })),
      ...reviewPrompts.map((p) => ({ label: fieldName(p.fieldId), value: soilTestReason(p), reliability: "missing" as Reliability })),
    ],
    // Tests that exist but need a detail fixed go to the field; no test at all means sampling.
    action: review.length
      ? { type: "open", label: "Open field", href: `/fields?field=${encodeURIComponent(review[0])}&chapter=nutrients`,
          plan: { title: "Sort out soil tests", category: "fields", kind: "job", startDate: ctx.today, endDate: addDays(ctx.today, 13), fieldIds: ids } }
      : { type: "plan", label: "Add to plan", href: "/soil-sample",
          plan: { title: "Take soil samples", category: "fields", kind: "job", startDate: ctx.today, endDate: addDays(ctx.today, 27), fieldIds: ids } },
    href: `/fields?field=${encodeURIComponent(ids[0])}`,
    reliability: "missing",
    fingerprint: fingerprintOf([...none.sort(), "/", ...review.sort()]),
    dismissible: true,
    statutory: false,
    impact: 20,
  }];
}

function fieldDetailsSource(ctx: PlanningContext, fieldName: (id?: string) => string): Candidate[] {
  const gaps = ctx.prompts.filter((p) => (p.kind === "commonage_status" || p.kind === "local_buffer_override") && p.fieldId && status(p) === "BLOCKED_INSUFFICIENT_EVIDENCE");
  if (!gaps.length) return [];
  const ids = [...new Set(gaps.map((p) => p.fieldId!))];
  const kinds = [...new Set(gaps.map((p) => p.kind))];
  const what = kinds.map((k) => (k === "commonage_status" ? "whether it's commonage" : "the water-buffer assessment"));
  return [{
    key: "fields:spreading-details:farm",
    source: "fields",
    category: "opportunity",
    subject: { type: "field", ids, names: ids.map(fieldName) },
    title: `Confirm spreading details for ${plural(ids.length, "field")}`,
    explanation: `Record ${listNames(what)} for ${ids.length === ctx.fields.length ? "your fields" : listNames(ids.map(fieldName))} so spreading checks can run in full.`,
    why: "Commonage and water-buffer rules change where and how much can be spread. Until they're recorded, those checks can't be confirmed.",
    evidence: ids.map((id) => ({
      label: fieldName(id),
      value: gaps.filter((p) => p.fieldId === id).map((p) => (p.kind === "commonage_status" ? "Commonage not recorded" : "Water buffer not assessed")).join(", "),
      reliability: "missing" as Reliability,
    })),
    action: { type: "open", label: "Open fields", href: `/fields?field=${encodeURIComponent(ids[0])}` },
    href: `/fields?field=${encodeURIComponent(ids[0])}`,
    reliability: "missing",
    fingerprint: fingerprintOf([...ids.sort(), ...kinds.sort()]),
    dismissible: true,
    statutory: false,
    impact: 10,
  }];
}

function grassSource(ctx: PlanningContext): Candidate[] {
  if (ctx.lastWalkDate === undefined) return [];
  const s = grassWalkSuggestion(ctx.lastWalkDate, ctx.today);
  if (!s) return [];
  return [{
    key: "grass:walk:farm",
    source: "grass",
    category: "upcoming",
    subject: { type: "farm", ids: [], names: [] },
    title: "Walk the farm",
    explanation: `${s.detail}. A walk updates the measured covers and the growth rate the plan uses.`,
    why: "Weekly covers show which paddocks are ready to graze next and whether supply is keeping up with demand.",
    evidence: [{ label: "Last finished walk", value: ctx.lastWalkDate ? fmtDate(ctx.lastWalkDate) : "None recorded", reliability: "verified" }],
    action: {
      type: "open", label: "Start walk", href: "/grass/walk",
      plan: { title: "Walk the farm", category: "grass", kind: "job", startDate: ctx.today, endDate: addDays(ctx.today, 2), fieldIds: [] },
    },
    href: "/grass/walk",
    reliability: "verified",
    // A new walk changes lastWalkDate, which retires this one on its own.
    fingerprint: fingerprintOf([ctx.lastWalkDate ?? "none"]),
    dismissible: true,
    statutory: false,
    impact: 20,
  }];
}

function cattleSource(ctx: PlanningContext): Candidate[] {
  return (ctx.milestones ?? []).flatMap((m): Candidate[] => {
    const days = daysBetween(ctx.today, m.targetDate);
    if (days < 0 || days > 28) return [];
    return [{
      key: `cattle:milestone:${m.groupId}:${m.targetDate}`,
      source: "cattle",
      category: "upcoming",
      subject: { type: "group", ids: [m.groupId], names: [m.groupLabel] },
      title: `Check ${m.groupLabel} against their target`,
      explanation: `The production target for ${m.groupLabel} is ${fmtDate(m.targetDate)}${m.targetWeightKg !== undefined ? ` at ${m.targetWeightKg} kg` : ""}. A weighing now shows whether they're on track.`,
      why: "Catching a shortfall a few weeks out leaves time to change the diet or the sale date.",
      evidence: [{ label: "Target date", value: fmtDate(m.targetDate), reliability: "verified" }],
      action: {
        type: "plan", label: "Add to plan", href: `/cattle/groups/${m.groupId}`,
        plan: { title: `Weigh ${m.groupLabel}`, category: "cattle", kind: "job", startDate: ctx.today, endDate: addDays(ctx.today, Math.max(0, Math.min(6, days - 1))), fieldIds: [] },
      },
      href: `/cattle/groups/${m.groupId}`,
      reliability: "verified",
      date: m.targetDate,
      expiresAfter: m.targetDate,
      fingerprint: fingerprintOf([m.targetDate, m.targetWeightKg]),
      dismissible: true,
      statutory: false,
      impact: 25,
    }];
  });
}

const round10 = (n: number) => Math.round(n / 10) * 10;
const READY: ReadonlyArray<GrazingFieldLike["band"]> = ["target", "above_target", "surplus"];

function coverReliability(f: GrazingFieldLike): Reliability {
  if (f.basis === "estimated") return "modelled";
  return (f.measuredAgeDays ?? 99) <= 7 ? "verified" : "calculated";
}
const coverWords = (f: GrazingFieldLike) => `${f.basis === "estimated" ? "estimated at" : "measured at"} about ${round10(f.coverKgDmHa ?? 0)} kg DM/ha`;

/**
 * Grazing from recorded cattle moves and grass covers. Keys follow the
 * group and the field it's in, so recording a move retires the old advice
 * on its own. Covers are labelled measured or estimated; the bands come
 * from the grass engine's own targets, nothing is invented here.
 */
function grazingSource(ctx: PlanningContext): Candidate[] {
  const g = ctx.grazing;
  if (!g) return [];
  const out: Candidate[] = [];
  const byField = new Map(g.fields.map((f) => [f.fieldId, f]));
  const occupied = new Set(g.open.map((o) => o.fieldId));
  const free = g.fields
    .filter((f) => f.known && !occupied.has(f.fieldId) && READY.includes(f.band))
    .sort((a, b) => (b.coverKgDmHa ?? 0) - (a.coverKgDmHa ?? 0));
  const seenGroups = new Set<string>();
  for (const o of g.open) {
    if (seenGroups.has(o.groupId)) continue;
    seenGroups.add(o.groupId);
    const f = byField.get(o.fieldId);
    const name = f?.name ?? "their field";
    if (!f || !f.known) {
      out.push({
        key: `grazing:measure:${o.fieldId}`,
        source: "grazing",
        category: "upcoming",
        subject: { type: "field", ids: [o.fieldId], names: [name] },
        title: `Measure ${name} while ${o.groupLabel} graze it`,
        explanation: `${o.groupLabel} (${o.headCount} head) are in ${name}, but there's no grass reading for it yet, so the plan can't say when they'll need moving.`,
        why: "A cover reading lets Farm Return estimate how many days of grass are left in the field.",
        evidence: [{ label: name, value: "No cover reading", reliability: "missing" }],
        action: { type: "open", label: "Start walk", href: "/grass/walk" },
        href: "/grass/walk",
        reliability: "missing",
        fingerprint: fingerprintOf([o.sessionId]),
        dismissible: true,
        statutory: false,
        impact: 20,
      });
      continue;
    }
    if (f.band !== "below_target") continue;
    const next = free[0];
    out.push({
      key: `grazing:move:${o.groupId}`,
      source: "grazing",
      category: "attention",
      subject: { type: "group", ids: [o.groupId], names: [o.groupLabel] },
      title: `Move ${o.groupLabel} out of ${name}`,
      explanation: `${name} is ${coverWords(f)}, below the grazing target. ${next ? `${next.name} is the best next field, ${coverWords(next)}.` : "No other field shows a grazing cover yet, so walk the farm to find the next one."}`,
      why: "Leaving cattle on a bare paddock costs regrowth and liveweight gain.",
      evidence: [
        { label: name, value: `${round10(f.coverKgDmHa ?? 0)} kg DM/ha`, reliability: coverReliability(f) },
        ...(next ? [{ label: `${next.name} (next)`, value: `${round10(next.coverKgDmHa ?? 0)} kg DM/ha`, reliability: coverReliability(next) }] : []),
        { label: "In the field since", value: fmtDate(o.startedAt.slice(0, 10)), reliability: "verified" as Reliability },
      ],
      provenance: [{ label: "Cover", value: "Grass engine: last reading brought forward with growth and recorded grazing" }],
      action: {
        type: "open", label: "Record a move", href: `/cattle/groups/${o.groupId}`,
        plan: { title: `Move ${o.groupLabel}${next ? ` to ${next.name}` : ""}`, category: "grass", kind: "job", startDate: ctx.today, endDate: addDays(ctx.today, 1), fieldIds: next ? [next.fieldId] : [] },
      },
      href: `/cattle/groups/${o.groupId}`,
      reliability: coverReliability(f),
      date: ctx.today,
      fingerprint: fingerprintOf([o.sessionId, o.fieldId, next?.fieldId]),
      dismissible: true,
      statutory: false,
      impact: 40,
    });
  }

  const month = Number(ctx.today.slice(5, 7));
  const ready = free.filter((f) => f.band === "above_target" || f.band === "surplus");
  if (ready.length && month !== 12 && month !== 1) {
    out.push({
      key: "grazing:ready:farm",
      source: "grazing",
      category: "opportunity",
      subject: { type: "field", ids: ready.map((f) => f.fieldId), names: ready.map((f) => f.name) },
      title: ready.length === 1 ? `${ready[0].name} is ready to graze` : `${ready.length} fields are ready to graze`,
      explanation: `${listNames(ready.map((f) => `${f.name} (${round10(f.coverKgDmHa ?? 0)} kg DM/ha)`))} ${ready.length === 1 ? "is" : "are"} above the grazing target with no cattle recorded in ${ready.length === 1 ? "it" : "them"}.`,
      why: "Grazing heavy covers before they go stemmy keeps grass quality up; a big surplus may suit baling.",
      evidence: ready.map((f) => ({ label: f.name, value: `${round10(f.coverKgDmHa ?? 0)} kg DM/ha`, reliability: coverReliability(f) })),
      action: { type: "open", label: "Open grass", href: "/grass" },
      href: "/grass",
      reliability: ready.some((f) => f.basis === "estimated") ? "modelled" : "calculated",
      fingerprint: fingerprintOf(ready.map((f) => `${f.fieldId}:${f.band}`).sort()),
      dismissible: true,
      statutory: false,
      impact: 15,
    });
  }
  return out;
}

function calendarSource(ctx: PlanningContext): Candidate[] {
  const out: Candidate[] = [];
  for (const e of ctx.entries) {
    if (e.source !== "farmer" || !isOpen(e)) continue;
    if (isOverdue(e, ctx.today)) {
      out.push({
        key: `calendar:overdue:${e.id}`,
        source: "calendar",
        category: "attention",
        subject: { type: "entry", ids: [e.id], names: [e.title] },
        title: e.title,
        explanation: `This was due by ${fmtDate(e.endDate)}. Mark it done, or open it to move the dates.`,
        why: "Clearing overdue jobs keeps the plan trustworthy.",
        evidence: [{ label: "Due by", value: fmtDate(e.endDate), reliability: "verified" }],
        action: { type: "complete", label: "Mark done", entryId: e.id },
        reliability: "verified",
        date: e.endDate,
        fingerprint: fingerprintOf([e.endDate]),
        dismissible: false,
        statutory: false,
        impact: 20,
      });
      continue;
    }
    const days = daysBetween(ctx.today, e.startDate);
    if (bookingState(e) === "not_booked" && days <= 14) {
      const who = e.category === "vet" ? "the vet" : "the contractor";
      out.push({
        key: `calendar:book:${e.id}`,
        source: "calendar",
        category: "attention",
        subject: { type: "entry", ids: [e.id], names: [e.title] },
        title: `Book ${who}: ${e.title}`,
        explanation: `${e.title} is planned for ${fmtDate(e.startDate)} and isn't booked yet.`,
        why: "Vets and contractors fill up, especially in busy weeks.",
        evidence: [{ label: "Planned for", value: fmtDate(e.startDate), reliability: "verified" }],
        action: { type: "book", label: "Mark as booked", entryId: e.id },
        reliability: "verified",
        date: e.startDate,
        expiresAfter: e.endDate,
        fingerprint: fingerprintOf([e.startDate]),
        dismissible: true,
        statutory: false,
        impact: 25,
      });
    }
  }
  return out;
}

function slurrySource(ctx: PlanningContext): Candidate[] {
  const f = ctx.slurryForecast;
  if (!ctx.hasHousing || !f) return [];
  const slurryRule = ctx.compliance?.restrictions.find((r) => r.material === "organic_fertiliser_other_than_FYM");
  const ready = f.stores.filter((s): s is Extract<SlurryForecastLike["stores"][number], { status: "READY" }> => s.status === "READY");
  if (!ready.length) {
    return [{
      key: "slurry:storage-details:farm",
      source: "slurry",
      category: "opportunity",
      subject: { type: "store", ids: f.stores.map((s) => s.housingId), names: f.stores.map((s) => s.shedName) },
      title: "Add tank details to forecast slurry storage",
      explanation: "Storage can't be forecast yet because tank sizes or current levels are missing.",
      why: "A storage forecast warns you before a tank fills during the closed period.",
      evidence: f.stores.map((s) => ({ label: s.shedName, value: "Details missing", reliability: "missing" as Reliability })),
      action: { type: "open", label: "Open housing", href: "/housing" },
      href: "/housing",
      reliability: "missing",
      fingerprint: fingerprintOf(f.stores.map((s) => s.housingId).sort()),
      dismissible: true,
      statutory: false,
      impact: 15,
    }];
  }
  const tight = ready.filter((s) => s.projectedFillPct >= 85 || s.overflowM3 > 0);
  if (!tight.length) return [];
  const full = tight.filter((s) => s.overflowM3 > 0 || s.projectedFillPct >= 100);
  const closed = Boolean(slurryRule?.active);
  const by = fmtDate(f.targetDate);
  return [{
    key: `slurry:storage:farm:${f.targetDate}`,
    source: "slurry",
    category: full.length ? "attention" : "upcoming",
    subject: { type: "store", ids: tight.map((s) => s.housingId), names: tight.map((s) => s.shedName) },
    title: full.length
      ? `Slurry storage may run out ${closed ? "before spreading reopens" : `by ${by}`}`
      : `Slurry storage will be nearly full by ${by}`,
    explanation: `At current stock numbers, ${listNames(tight.map((s) => s.shedName))} ${tight.length === 1 ? "is" : "are"} forecast to reach ${tight.map((s) => `${Math.round(s.projectedFillPct)}%`).join(" and ")} by ${by}${closed ? ", when slurry spreading reopens" : ""}.`,
    why: closed
      ? "Slurry can't be spread during the closed period, so the tanks have to hold everything produced until it reopens."
      : "Planning spreading or moving stock early avoids running out of room.",
    evidence: tight.map((s) => ({ label: s.shedName, value: `${Math.round(s.projectedVolumeM3)} of ${Math.round(s.capacityM3)} m³ forecast`, reliability: "modelled" as Reliability })),
    provenance: [
      { label: "Forecast", value: "Slurry storage forecast from housed stock, tank capacity and recorded levels" },
      { label: "Version", value: f.version },
      ...[...new Set(tight.flatMap((s) => s.assumptions))].slice(0, 4).map((a) => ({ label: "Assumption", value: a })),
    ],
    action: closed
      ? { type: "open", label: "Review storage", href: "/housing" }
      : { type: "plan", label: "Add to plan", href: "/spreading", plan: { title: "Spread slurry", category: "nutrients", kind: "job", startDate: ctx.today, endDate: addDays(ctx.today, 13), fieldIds: [] } },
    href: "/housing",
    reliability: "modelled",
    date: f.targetDate,
    expiresAfter: f.targetDate,
    fingerprint: fingerprintOf([f.targetDate, ...tight.map((s) => `${s.housingId}:${Math.round(s.projectedFillPct / 5)}`)]),
    dismissible: !full.length,
    statutory: closed,
    impact: full.length ? 50 : 30,
  }];
}

function schemeSource(ctx: PlanningContext): Candidate[] {
  const name = ctx.schemeName ?? "Scheme";
  return (ctx.schemeActions ?? []).flatMap((a): Candidate[] => {
    if (!a.deadline || a.deadlineState !== "upcoming") return [];
    const days = daysBetween(ctx.today, a.deadline);
    if (days < 0 || days > 60) return [];
    // Done already: nothing to remind about. Progress figures win over the rule state.
    const complete = a.current != null && a.target != null ? a.current >= a.target : /^(MET|PASS|PASSED|SATISFIED|ON_TRACK|COMPLETE|COMPLETED)$/i.test(a.state);
    if (complete) return [];
    const attention = days <= 21;
    return [{
      key: `schemes:${a.key}:${a.deadline}`,
      source: "schemes",
      category: attention ? "attention" : "upcoming",
      subject: { type: "farm", ids: [], names: [] },
      title: `${name}: ${a.label} by ${fmtDate(a.deadline)}`,
      explanation: a.detail,
      why: "Missing a scheme deadline can reduce or stop the payment.",
      evidence: [{ label: "Deadline", value: fmtDate(a.deadline), reliability: "verified" }],
      action: {
        type: "plan", label: "Add to plan", href: "/schemes",
        plan: { title: `${name}: ${a.label}`, category: "schemes", kind: "deadline", startDate: a.deadline, endDate: a.deadline, fieldIds: [] },
      },
      href: "/schemes",
      reliability: "verified",
      date: a.deadline,
      expiresAfter: a.deadline,
      fingerprint: fingerprintOf([a.deadline, a.state]),
      dismissible: !attention,
      statutory: false,
      impact: 40,
    }];
  });
}

// ---------------------------------------------------------------- engine

const CATEGORY_WEIGHT: Record<RecommendationCategory, number> = { attention: 400, compliance: 350, upcoming: 200, opportunity: 100, insight: 50 };
const RELIABILITY_PENALTY: Record<Reliability, number> = { verified: 0, calculated: 5, modelled: 10, missing: 20 };

export function priorityOf(c: Pick<Recommendation, "category" | "statutory" | "date" | "impact" | "reliability">, today: string): number {
  const days = c.date ? daysBetween(today, c.date) : 60;
  const timeliness = Math.max(0, 60 - Math.max(0, days));
  return CATEGORY_WEIGHT[c.category] + (c.statutory ? 100 : 0) + timeliness + c.impact - RELIABILITY_PENALTY[c.reliability];
}

/** All candidates from every module, deduplicated by key (first wins). */
export function candidateRecommendations(ctx: PlanningContext): Recommendation[] {
  const names = new Map(ctx.fields.map((f) => [f.id, f.name]));
  const fieldName = (id?: string) => (id && names.get(id)) || "A field";
  const all = [
    ...calendarSource(ctx),
    ...slurrySource(ctx),
    ...schemeSource(ctx),
    ...fertiliserSource(ctx, fieldName),
    ...grazingSource(ctx),
    ...cattleSource(ctx),
    ...grassSource(ctx),
    ...soilSource(ctx, fieldName),
    ...fieldDetailsSource(ctx, fieldName),
  ];
  const seen = new Set<string>();
  return all.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true))).map((c) => ({
    ...c, farmId: ctx.farmId, priority: priorityOf(c, ctx.today), status: "active" as LifecycleStatus,
  }));
}

/**
 * Applies what the farmer has already done: a calendar entry made from a
 * recommendation marks it planned (or done); a snooze or dismissal holds
 * while its fingerprint matches; anything past its expiry date is gone.
 * Non-dismissible recommendations ignore a stored dismissal.
 */
export function applyLifecycle(recs: Recommendation[], states: readonly RecommendationState[], entries: readonly CalendarEntry[], today: string): Recommendation[] {
  const byKey = new Map(states.map((s) => [s.key, s]));
  return recs.flatMap((r): Recommendation[] => {
    if (r.expiresAfter && r.expiresAfter < today) return [];
    const planned = entries.find((e) => e.sourceKey === r.key && e.status !== "cancelled");
    if (planned) return [{ ...r, status: planned.status === "done" ? "done" : "planned", planEntryId: planned.id }];
    const s = byKey.get(r.key);
    if (!s || s.status === "active" || s.fingerprint !== r.fingerprint) return [r];
    if (s.status === "dismissed") return r.dismissible ? [{ ...r, status: "dismissed" }] : [r];
    if (s.status === "snoozed") return s.snoozedUntil && s.snoozedUntil > today ? [{ ...r, status: "snoozed", snoozedUntil: s.snoozedUntil }] : [r];
    return [{ ...r, status: "done" }];
  }).sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

export function buildRecommendations(ctx: PlanningContext, states: readonly RecommendationState[] = []): Recommendation[] {
  return applyLifecycle(candidateRecommendations(ctx), states, ctx.entries, ctx.today);
}

// ---------------------------------------------------------------- overview

export interface WeeklyOverview {
  attention: Recommendation[];
  comingUp: CalendarEntry[];
  opportunities: number;
  canWait: number;
  restrictions: string[];
}

/** What needs doing now, what's coming, what can wait, from real farm data only. */
export function weeklyOverview(recs: readonly Recommendation[], entries: readonly CalendarEntry[], compliance: SpreadingCompliance | null, today: string): WeeklyOverview {
  const active = recs.filter((r) => r.status === "active");
  const weekEnd = addDays(today, 6);
  return {
    attention: active.filter((r) => r.category === "attention"),
    comingUp: entries
      .filter((e) => e.kind !== "season" && isOpen(e) && e.startDate <= weekEnd && e.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 5),
    opportunities: active.filter((r) => r.category === "opportunity" || r.category === "upcoming").length,
    canWait: recs.filter((r) => r.status === "snoozed").length + entries.filter((e) => e.kind !== "season" && isOpen(e) && e.startDate > weekEnd && daysBetween(today, e.startDate) <= 28).length,
    restrictions: (compliance?.restrictions ?? []).filter((r) => r.active).map((r) => `${r.label} closed until ${fmtDate(r.closedThrough)}`),
  };
}
