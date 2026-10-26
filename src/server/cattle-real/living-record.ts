/**
 * Living Animal Record — what the signed-in animal page says about the parts of the record Farm Return does or
 * doesn't hold, decided here (server copy), never in a component (the component boundary, R4 / R6).
 *
 * Pure: it only reads the C10 profile the frozen engines already produced and the D16 capability table. It computes
 * no weight, gain, value or date — every number shown is a profile field. A capability that is `false` means the
 * application can't hold that evidence at all, so its line says "Not stored" (or "Unknown" for what depends on it):
 * never "none", "clear", "healthy" or "compliant", and never a per-animal claim of absence (D8 / D16).
 */

import { details, type AnimalProfileVM, type Details, type DisplayState, type TimelineEntryVM } from "@/domain/cattle/presentation";

/** The D16 capabilities this view reads (the table itself lives in `real-service.ts`). */
export interface LivingRecordCapabilities {
  weights: boolean;
  veterinaryProgrammes: boolean;
  obligations: boolean;
  healthRecords: boolean;
  productionGoals: boolean;
}

export interface LivingRecordNotes {
  health: string;
  costs: string;
  goal: string;
  plan: string;
  work: string;
}

/** Screen words for the record (lens leads, empty-evidence lines). */
export const LIVING_RECORD_COPY = {
  kicker: "Individual animal",
  weightLabel: "Current recorded weight",
  lenses: {
    overview: { chapter: "Overview", title: "Overview", lead: "A factual view of the animal as currently recorded. No health, compliance or performance judgement is inferred from missing data." },
    growth: { chapter: "Growth", title: "Growth", lead: "Recorded measurements first. A target or forecast line appears only when Farm Return holds the evidence for one — never a guess." },
    health: { chapter: "Health", title: "Health & compliance", lead: "Current status first; evidence follows. Missing evidence stays visibly unresolved." },
    plan: { chapter: "Plan", title: "Animal plan", lead: "A path from today's animal to a planned outcome, with the economics underneath it rather than in a separate finance dashboard." },
    history: { chapter: "History", title: "History", lead: "A searchable log of the evidence Farm Return holds for this animal." },
  },
  growth: {
    inspectHint: "Tap a weighing to inspect it. Arrow keys step between weighings.",
    targetNotRecorded: "Target not recorded",
    targetNote: "No growth target is held for this animal, so no target line is drawn.",
    forecastNote: "No forecast is drawn: Farm Return only projects a weight toward a recorded goal date.",
  },
  health: {
    title: "Health status unknown",
    evidenceEmptyTitle: "No clinical events available",
    evidenceEmptyDetail: "The absence of stored evidence is not read as “healthy” or “clear”.",
  },
  plan: {
    todayLabel: "Today",
    outcomeLabel: "Planned outcome",
    outcomeNotRecorded: "Not recorded",
    outcomeValue: "—",
  },
  history: {
    searchLabel: "Search this animal's evidence",
    searchPlaceholder: "Search animal evidence…",
    allLabel: "All",
  },
  saved: {
    status: "Weight saved. Showing your records as they are now.",
    justNow: "Recorded just now",
    updating: "Updating the record from your farm's records…",
  },
} as const;

export type HistoryFamily = "WEIGHT" | "MANAGEMENT" | "WORK" | "HEALTH" | "GOAL" | "COST";

const FAMILY_LABEL: Readonly<Record<HistoryFamily, string>> = { WEIGHT: "Weight", MANAGEMENT: "Management", WORK: "Work", HEALTH: "Health", GOAL: "Goal", COST: "Cost" };

/** The timeline's own id scheme (`buildAnimalTimeline`): the record family is the id's prefix. */
const FAMILY_OF_PREFIX: Readonly<Record<string, HistoryFamily>> = { weight: "WEIGHT", c1: "MANAGEMENT", job: "WORK", health: "HEALTH", goal: "GOAL", cost: "COST" };

export interface LivingHistoryEntry {
  entry: TimelineEntryVM;
  family: HistoryFamily;
  familyLabel: string;
  /** The line under the title: the record's own detail, or its family and information class when the title already says it. */
  detailLine: string;
  /** Lower-case words the search matches against (title, detail, class, family, date). */
  searchText: string;
}

/** One line of the record: always a value to show — a recorded value, or "—" with the reason beside it. */
export interface LivingFact {
  key: string;
  label: string;
  value: string;
  detail: string;
  /** `true` when the value is not a recorded fact (rendered quietly, never as data). */
  unresolved: boolean;
}

export interface LivingHealthRow {
  key: string;
  label: string;
  /** "Not stored" / "Unknown": what Farm Return can say, from the capability table. */
  statement: string;
  detail: string;
  /** The frozen engines' own state for this part, shown underneath as evidence. */
  evidence: { state: "SHOWN"; display: DisplayState } | { state: "NOT_SHOWN" };
}

export interface LivingEconomicsLine {
  key: string;
  label: string;
  value: string;
  note: string;
}

export interface LivingRecordVM {
  copy: typeof LIVING_RECORD_COPY;
  /** Real mode has no photo store: a designed portrait plate stands in, and says so. (A future avatar adds a kind.) */
  portrait: { kind: "PLATE"; caption: string };
  facts: Details<LivingFact>;
  context: Details<{ label: string; value: string }>;
  coverage: Details<{ label: string; value: string }>;
  growth: { target: { state: "SHOWN" } | { state: "NOT_RECORDED"; label: string; note: string }; forecastNote: string };
  health: { state: "NOT_STORED"; title: string; detail: string; rows: Details<LivingHealthRow> } | { state: "FROM_RECORDS" };
  plan: { outcome: { state: "TEXT"; value: string; detail: string } | { state: "NOT_RECORDED"; value: string; detail: string; note: string }; economics: Details<LivingEconomicsLine>; economicsNote: string };
  history:
    | { state: "ITEMS"; entries: Details<LivingHistoryEntry>; filters: Details<{ family: HistoryFamily; label: string; count: number }> }
    | { state: "EMPTY"; display: DisplayState }
    | { state: "UNAVAILABLE"; display: DisplayState };
  /** The newest dated record ("Last record"), or the timeline's own state. */
  lastRecord: string;
}

const NOT_STORED = "Not stored";
const DASH = "—";

function familyOf(e: TimelineEntryVM): HistoryFamily {
  return FAMILY_OF_PREFIX[e.id.slice(0, e.id.indexOf(":"))] ?? "MANAGEMENT";
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function livingRecordOf(p: AnimalProfileVM, capabilities: LivingRecordCapabilities, notes: LivingRecordNotes): LivingRecordVM {
  const timeline = p.timeline.state === "ITEMS" ? p.timeline.items : [];
  const history: LivingHistoryEntry[] = timeline.map((entry) => {
    const family = familyOf(entry);
    const familyLabel = FAMILY_LABEL[family];
    const detailLine = entry.detail !== null && !entry.title.toLowerCase().includes(entry.detail.toLowerCase()) ? entry.detail : `${familyLabel} record · ${entry.classLabel}`;
    return { entry, family, familyLabel, detailLine, searchText: [entry.title, entry.detail, entry.classLabel, familyLabel, entry.dateLabel, entry.markerLabel].filter((x) => x !== null).join(" ").toLowerCase() };
  });
  const weightRecords = history.filter((h) => h.family === "WEIGHT").length;

  // Overview facts.
  const w = p.metrics.weight;
  const g = p.metrics.gain;
  const loc = p.identity.location;
  const open = p.work.open;
  const facts: LivingFact[] = [
    { key: "weight", label: "Current weight", value: w.value !== null ? `${w.value} ${w.unit ?? "kg"}` : DASH, detail: w.value !== null ? (w.caption ?? w.state.label) : (w.state.detail ?? w.state.label), unresolved: w.value === null },
    { key: "growth", label: "Recent growth", value: g.value !== null ? `${g.value} ${g.unit ?? "kg/day"}` : DASH, detail: g.value !== null ? `Daily gain · ${g.caption ?? g.state.label}` : (g.state.detail ?? g.state.label), unresolved: g.value === null },
    {
      key: "target",
      label: "Production target",
      value: p.goal.summary.state === "TEXT" ? p.goal.summary.text : DASH,
      detail: capabilities.productionGoals ? p.goal.state.label : "Structured goal not recorded",
      unresolved: p.goal.summary.state !== "TEXT",
    },
    { key: "location", label: "Location", value: loc.value ?? DASH, detail: loc.value !== null ? (loc.housingNote ?? "Recorded") : "Animal-level location isn't recorded in Farm Return yet", unresolved: loc.value === null },
    open.state === "ITEMS"
      ? { key: "work", label: "Open work", value: String(1 + open.others.length), detail: open.primary.title, unresolved: false }
      : open.state === "EMPTY"
        ? { key: "work", label: "Open work", value: "0", detail: `${open.display.label} · ${capabilities.healthRecords || capabilities.veterinaryProgrammes || capabilities.obligations || capabilities.productionGoals ? "from the records Farm Return holds" : "only weighing work is checked for your farm so far"}`, unresolved: false }
        : { key: "work", label: "Open work", value: DASH, detail: open.display.detail ?? open.display.label, unresolved: true },
  ];

  const field = (f: { value: string | null; state: DisplayState }) => f.value ?? f.state.label;
  const context = [
    { label: "Breed", value: field(p.identity.breed) },
    { label: "Sex", value: field(p.identity.sex) },
    { label: "Group", value: field(p.identity.group) },
    { label: "Age", value: field(p.identity.age) },
    { label: "Status", value: field(p.identity.status) },
  ];
  const coverage = [
    { label: "Weights", value: p.chart.state === "EMPTY" || p.chart.state === "UNAVAILABLE" ? p.chart.display.label : plural(weightRecords, "record") },
    { label: "Health", value: !capabilities.healthRecords ? NOT_STORED : p.health.medicines.state === "ITEMS" ? (p.health.medicinesLabel ?? "Recorded") : p.health.medicines.display.label },
    { label: "Goal", value: capabilities.productionGoals ? p.goal.state.label : "Not recorded" },
    { label: "Location", value: loc.value !== null ? "Recorded" : loc.state.label },
  ];

  const healthStored = capabilities.healthRecords || capabilities.veterinaryProgrammes || capabilities.obligations;
  const listingEvidence = (l: AnimalProfileVM["health"]["programmes"]): LivingHealthRow["evidence"] => (l.state === "ITEMS" ? { state: "NOT_SHOWN" } : { state: "SHOWN", display: l.display });

  const economics: LivingEconomicsLine[] = [
    { key: "value", label: "Current value", value: DASH, note: "Mart prices aren't held" },
    { key: "hold", label: "Cost to hold", value: DASH, note: "Animal costs aren't kept" },
    { key: "sale", label: "Expected sale value", value: DASH, note: "Needs prices and a goal" },
    { key: "return", label: "Return from holding", value: DASH, note: "Not calculated" },
  ];

  const families = (Object.keys(FAMILY_LABEL) as HistoryFamily[]).map((family) => ({ family, label: FAMILY_LABEL[family], count: history.filter((h) => h.family === family).length })).filter((f) => f.count > 0);

  return {
    copy: LIVING_RECORD_COPY,
    portrait: { kind: "PLATE", caption: "Photos aren't stored in Farm Return yet" },
    facts: details(facts),
    context: details(context),
    coverage: details(coverage),
    growth: {
      target: p.chart.state === "CHART" && p.chart.goalTarget.state === "SHOWN" ? { state: "SHOWN" } : { state: "NOT_RECORDED", label: LIVING_RECORD_COPY.growth.targetNotRecorded, note: LIVING_RECORD_COPY.growth.targetNote },
      forecastNote: LIVING_RECORD_COPY.growth.forecastNote,
    },
    health: healthStored
      ? { state: "FROM_RECORDS" }
      : {
          state: "NOT_STORED",
          title: LIVING_RECORD_COPY.health.title,
          detail: notes.health,
          rows: details<LivingHealthRow>([
            { key: "withdrawal", label: "Withdrawal", statement: "Unknown", detail: "Medicine evidence isn't stored, so withdrawal can't be treated as clear", evidence: { state: "NOT_SHOWN" } },
            { key: "medicines", label: "Medicine records", statement: NOT_STORED, detail: "Medicine and treatment history isn't kept in Farm Return yet", evidence: { state: "NOT_SHOWN" } },
            { key: "programmes", label: "Veterinary programmes", statement: NOT_STORED, detail: "Programme records aren't kept in Farm Return yet", evidence: listingEvidence(p.health.programmes) },
            { key: "requirements", label: "Requirements", statement: NOT_STORED, detail: "Requirement evidence isn't kept in Farm Return yet", evidence: listingEvidence(p.health.obligations) },
          ]),
        },
    plan: {
      outcome:
        p.goal.summary.state === "TEXT"
          ? { state: "TEXT", value: p.goal.summary.text, detail: p.goal.state.label }
          : { state: "NOT_RECORDED", value: LIVING_RECORD_COPY.plan.outcomeValue, detail: LIVING_RECORD_COPY.plan.outcomeNotRecorded, note: notes.goal },
      economics: details(economics),
      economicsNote: `${notes.costs} ${notes.plan}`,
    },
    history: p.timeline.state === "ITEMS" ? { state: "ITEMS", entries: details(history), filters: details(families) } : p.timeline,
    lastRecord: timeline[0]?.dateLabel ?? (p.timeline.state === "ITEMS" ? DASH : p.timeline.display.label),
  };
}
