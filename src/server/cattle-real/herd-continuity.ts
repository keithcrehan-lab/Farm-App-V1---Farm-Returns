/**
 * Cattle continuity — what the signed-in Cattle home and group pages say
 * (docs/design/cattle-home-continuity-reference.html), decided here (server
 * copy), never in a component (the component boundary, R4 / R6).
 *
 * Pure: it reads the C10 herd view the frozen engines already produced, the
 * farm's recorded group facts and the D16 capability table. It computes no
 * weight, gain or value: a headcount is the group's recorded count, an
 * individual count is the animal rows recorded in the group, and a latest
 * weight is one C4 latest weight (chosen by instant, never averaged).
 *
 * Truth rules: an unread headcount is never 0; a group without individual
 * animals is never "0 animals"; work is stated only for the families Farm
 * Return can raise (D16) — "No open weighing work", never "nothing needs
 * attention"; location and goal are "Not recorded" unless the records hold
 * them.
 */

import { compareInstants } from "@/domain/cattle/animal-ledger";
import {
  EMPTY_DISPLAY,
  UNAVAILABLE_DISPLAY,
  details,
  formatDate,
  formatDayMonth,
  formatKgNumber,
  latestWeightOf,
  listedItems,
  listingOf,
  plural,
  unavailableListing,
  type AnimalRowVM,
  type CattleOutputs,
  type Details,
  type DisplayTone,
  type GroupVM,
  type HerdVM,
  type Listing,
} from "@/domain/cattle/presentation";
import type { LivestockGoal } from "@/domain/types";
import type { RealCattleRecords, RealGroupFact } from "./real-records";

/** The D16 capabilities this view reads (the table itself lives in `real-service.ts`). */
export interface ContinuityCapabilities {
  weights: boolean;
  veterinaryProgrammes: boolean;
  obligations: boolean;
  healthRecords: boolean;
  productionGoals: boolean;
}

/** A measured fact set large: "20" + "head". */
export interface ContinuityMeasure {
  value: string;
  unit: string;
}

export interface ContinuityStatement {
  label: string;
  detail: string;
  tone: DisplayTone;
}

export interface ContinuityFact {
  label: string;
  value: string;
  detail: string;
  /** Measured values and dates are set in the technical face. */
  technical: boolean;
}

export type ContinuityLatestWeight =
  | { state: "KNOWN"; label: string; value: string; unit: string; date: string; summary: string }
  | { state: "ABSENT"; label: string; value: string; detail: string };

export interface ContinuityAnimalVM {
  row: AnimalRowVM;
  /** The animal's supported work, in real-mode words (never "nothing needs attention"). */
  work: { label: string; tone: DisplayTone };
}

export interface ContinuityGroupVM {
  groupRef: string;
  name: string;
  /** The dominant measured fact: the recorded headcount, or the individual count when the headcount can't be used. */
  headline: ContinuityMeasure;
  /** "19 head held as group count · 1 animal recorded individually". */
  composition: string;
  individuals: ContinuityMeasure;
  latestWeight: ContinuityLatestWeight;
  work: ContinuityStatement;
  /** Quiet context (location, goal, last weighing): one interaction away on the home page. */
  context: Details<ContinuityFact>;
  /** The group page's line above its animals. */
  membersIntro: string;
  /** The individually recorded animals (EMPTY or UNAVAILABLE says why there are none to list). */
  members: Listing<ContinuityAnimalVM>;
  /** Animals the group's scope couldn't place (shown, never dropped). */
  unresolved: Details<ContinuityAnimalVM>;
}

export interface CattleContinuityVM {
  headline: ContinuityMeasure;
  groupsCount: ContinuityMeasure;
  /** Why the headline isn't a herd total, when it can't be one. */
  headlineNote: string | null;
  asOfLabel: string;
  /** "Living herd" intro line. */
  intro: string;
  groups: Listing<ContinuityGroupVM>;
  ungrouped: Details<ContinuityAnimalVM>;
  /** The "About records" disclosure: what Farm Return holds and doesn't, one interaction away. */
  about: Details<string>;
  /** A failed planning run: work is unknown (never "no work"); animals are still listed. */
  planning: { state: "OK" } | { state: "FAILED"; label: string; detail: string; codes: Details<string> };
}

/** The frozen C8 action families, the capability each needs and the farmer's word for its work. */
const WORK_FAMILIES: readonly { capability: keyof ContinuityCapabilities; noun: string }[] = [
  { capability: "weights", noun: "weighing" },
  { capability: "healthRecords", noun: "health" },
  { capability: "veterinaryProgrammes", noun: "programme" },
  { capability: "obligations", noun: "compliance" },
  { capability: "productionGoals", noun: "goal" },
];

const joinWords = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The group goal as Manage herd names it (`HerdManagementClient`). */
const GOAL_LABEL: Readonly<Record<LivestockGoal, string>> = { maintain: "Maintain", grow: "Grow", breed: "Breed", sell_store: "Sell as store", finish_slaughter: "Finish to slaughter" };

export const CONTINUITY_COPY = {
  intro: "Select a cattle group to work with it.",
  notRecorded: "Not recorded",
  location: { label: "Location", detail: "Where these animals are isn't recorded in Farm Return's cattle records yet." },
  goal: { label: "Production goal", unsetDetail: "No group goal is set in Manage herd.", setDetail: "The group goal set in Manage herd. No target weight or date is held." },
  lastWeighing: { label: "Last weighing" },
  workNotChecked: (why: string): ContinuityStatement => ({ label: "Not checked", detail: why, tone: "unknown" }),
} as const;

interface Words {
  noOpen: string;
  otherWork: string;
  explainer: string;
}

function workWords(caps: ContinuityCapabilities): Words {
  const supported = WORK_FAMILIES.filter((f) => caps[f.capability]).map((f) => f.noun);
  const unsupported = WORK_FAMILIES.filter((f) => !caps[f.capability]).map((f) => f.noun);
  return {
    noOpen: supported.length === 0 ? "No work is raised here yet" : `No open ${joinWords(supported)} work`,
    otherWork: unsupported.length === 0 ? "All supported work checked" : "Other work not inferred",
    explainer:
      unsupported.length === 0
        ? "Farm Return checks every kind of cattle work it can raise from your records."
        : `Farm Return raises ${supported.length === 0 ? "no cattle work" : `${joinWords(supported)} work only`} for now. ${capitalise(joinWords(unsupported))} work isn't inferred, because those records aren't kept in Farm Return yet — that doesn't mean none is due.`,
  };
}

function animalOf(row: AnimalRowVM, words: Words): ContinuityAnimalVM {
  const w = row.nextWork;
  const work = w.state === "JOB" ? { label: w.title, tone: w.tone } : w.state === "NONE_OPEN" ? { label: words.noOpen, tone: "neutral" as const } : { label: w.display.label, tone: w.display.tone };
  return { row, work };
}

/** The headline, composition line and whether the recorded headcount is a usable total for the group. */
function measureOf(f: RealGroupFact): { headline: ContinuityMeasure; composition: string; head: number | null } {
  const n = f.individuals;
  const recorded = plural(n, "animal recorded individually", "animals recorded individually");
  if (f.headcount === null) {
    return n === 0
      ? { headline: { value: "—", unit: "headcount can't be read" }, composition: "Individual animals not recorded · headcount can't be read", head: null }
      : { headline: { value: String(n), unit: n === 1 ? "animal recorded" : "animals recorded" }, composition: `Group headcount can't be read · ${recorded}`, head: null };
  }
  const h = f.headcount;
  if (n === 0) return { headline: { value: String(h), unit: "head" }, composition: `${h} head recorded for the group · individual animals not recorded`, head: h };
  if (h === n) return { headline: { value: String(h), unit: "head" }, composition: `All ${plural(n, "head")} recorded individually`, head: h };
  if (h > n) return { headline: { value: String(h), unit: "head" }, composition: `${h - n} head held as group count · ${recorded}`, head: h };
  // Fewer head than individual rows: the records disagree; neither figure is chosen as the group's size.
  return { headline: { value: String(n), unit: n === 1 ? "animal recorded" : "animals recorded" }, composition: `The group's headcount is ${h}; ${n} ${n === 1 ? "is" : "are"} recorded individually.`, head: null };
}

function latestOf(outputs: CattleOutputs, members: readonly AnimalRowVM[]): ContinuityLatestWeight {
  const label = members.length > 1 ? "Latest individual weight" : "Latest weight";
  let best: { kg: number; observedAt: string; basis: string; method: string } | null = null;
  for (const m of members) {
    const w = latestWeightOf(outputs.weights?.series.find((s) => s.animalId === m.animalId) ?? null);
    if (w.state !== "KNOWN") continue;
    if (best === null || compareInstants(w.observedAt, best.observedAt) > 0) best = { kg: w.kg, observedAt: w.observedAt, basis: w.basis.kind, method: w.basis.methodLabel.toLowerCase() };
  }
  if (best === null) return { state: "ABSENT", label, value: "—", detail: members.length === 0 ? "No individual animals to weigh" : "No weight recorded yet" };
  // An estimate or an external figure says what it is; an unrecorded method is explained under "About records".
  const basis = best.basis === "ESTIMATED" || best.basis === "DERIVED" ? ` · ${best.method}` : "";
  return { state: "KNOWN", label, value: formatKgNumber(best.kg), unit: "kg", date: `${formatDayMonth(best.observedAt)}${basis}`, summary: formatDate(best.observedAt) };
}

/** Location: the members' C1 snapshots. Real records assert none (a group's shed isn't an animal's location). */
function locationOf(outputs: CattleOutputs, members: readonly AnimalRowVM[], scopeLabel: string): string | null {
  const refs = members.map((m) => {
    const l = outputs.snapshots[m.animalId]?.location ?? null;
    return l?.state === "KNOWN" && l.value ? l.value.ref : null;
  });
  return refs.length > 0 && refs.every((r) => r !== null && r === refs[0]) ? scopeLabel : null;
}

function contextOf(f: RealGroupFact, location: string | null, latest: ContinuityLatestWeight): ContinuityFact[] {
  const where: ContinuityFact =
    location === null
      ? { label: CONTINUITY_COPY.location.label, value: CONTINUITY_COPY.notRecorded, detail: CONTINUITY_COPY.location.detail, technical: false }
      : { label: CONTINUITY_COPY.location.label, value: location, detail: "Every animal in the group has this recorded location.", technical: false };
  const goal: ContinuityFact =
    f.goal === null
      ? { label: CONTINUITY_COPY.goal.label, value: CONTINUITY_COPY.notRecorded, detail: CONTINUITY_COPY.goal.unsetDetail, technical: false }
      : { label: CONTINUITY_COPY.goal.label, value: GOAL_LABEL[f.goal], detail: CONTINUITY_COPY.goal.setDetail, technical: false };
  const last: ContinuityFact =
    latest.state === "KNOWN"
      ? { label: CONTINUITY_COPY.lastWeighing.label, value: latest.summary, detail: `${latest.value} ${latest.unit}`, technical: true }
      : { label: CONTINUITY_COPY.lastWeighing.label, value: CONTINUITY_COPY.notRecorded, detail: latest.detail, technical: false };
  return [where, goal, last];
}

function groupOf(f: RealGroupFact, g: GroupVM | undefined, outputs: CattleOutputs, words: Words): ContinuityGroupVM {
  const { headline, composition } = measureOf(f);
  const individuals: ContinuityMeasure = { value: String(f.individuals), unit: f.individuals === 1 ? "animal" : "animals" };
  const base = { groupRef: f.groupRef, name: f.name, headline, individuals };

  if (f.individuals === 0) {
    const latest = latestOf(outputs, []);
    return {
      ...base,
      composition,
      individuals: { value: "—", unit: "individual animals not recorded" },
      latestWeight: latest,
      work: CONTINUITY_COPY.workNotChecked("Work is raised for individually recorded animals; this group has none recorded."),
      context: details(contextOf(f, null, latest)),
      membersIntro: "Add individual animals to this group in Manage herd to weigh and follow them one by one.",
      members: listingOf([], EMPTY_DISPLAY.GROUP_ANIMALS),
      unresolved: details([]),
    };
  }

  if (g === undefined || g.scope.state !== "KNOWN") {
    // Every animal record refused (no scope run), or the scope couldn't be resolved: membership is unknown, not empty.
    const display = g?.scope.state === "UNAVAILABLE" ? g.scope.display : { label: "Animal records can't be read", detail: "This group's animal records couldn't be read, so they aren't listed.", tone: "review" as const, code: "CONTINUITY:UNREADABLE" };
    const latest: ContinuityLatestWeight = { state: "ABSENT", label: "Latest weight", value: "—", detail: display.label };
    return {
      ...base,
      composition: `${composition} · ${display.label.toLowerCase()}`,
      latestWeight: latest,
      work: CONTINUITY_COPY.workNotChecked(display.detail ?? display.label),
      context: details(contextOf(f, null, latest)),
      membersIntro: display.detail ?? display.label,
      members: unavailableListing(display),
      unresolved: details([]),
    };
  }

  const scope = g.scope.value;
  const rows = listedItems(scope.members);
  const latest = latestOf(outputs, rows);
  const work: ContinuityStatement =
    g.workCounts.state === "ITEMS"
      ? { label: g.workCounts.items.map((w) => w.label).join(" · "), detail: words.otherWork, tone: "attention" }
      : g.workCounts.state === "EMPTY"
        ? { label: words.noOpen, detail: words.otherWork, tone: "neutral" }
        : { label: g.workCounts.display.label, detail: g.workCounts.display.detail ?? words.otherWork, tone: g.workCounts.display.tone };
  const of = f.headcount !== null && f.headcount >= f.individuals ? ` of ${f.headcount} head` : "";
  return {
    ...base,
    composition: scope.unresolvedNote ? `${composition} · ${scope.unresolvedNote}` : composition,
    latestWeight: latest,
    work,
    context: details(contextOf(f, locationOf(outputs, rows, scope.locationLabel), latest)),
    membersIntro: `${f.individuals}${of} ${f.individuals === 1 ? "is" : "are"} recorded individually.`,
    members: scope.members.state === "ITEMS" ? listingOf(rows.map((r) => animalOf(r, words)), EMPTY_DISPLAY.GROUP_ANIMALS) : scope.members,
    unresolved: details(scope.unresolved.map((r) => animalOf(r, words))),
  };
}

export function cattleContinuityOf(
  herd: HerdVM,
  outputs: CattleOutputs,
  records: RealCattleRecords,
  ungroupedRows: readonly AnimalRowVM[],
  caps: ContinuityCapabilities,
  notes: { readOnly: string; method: string; work: string },
): CattleContinuityVM {
  const words = workWords(caps);
  const groupVMs = herd.groups.state === "ITEMS" ? herd.groups.items : [];
  const groups = records.groupFacts.map((f) => groupOf(f, groupVMs.find((g) => g.groupRef === f.groupRef), outputs, words));

  // A herd total only when every group's recorded headcount is usable; otherwise the individual records, said as such.
  const heads = records.groupFacts.map((f) => measureOf(f).head);
  const ungroupedCount = records.ungroupedAnimalIds.length;
  const total = heads.every((h) => h !== null) ? heads.reduce<number>((sum, h) => sum + (h ?? 0), 0) + ungroupedCount : null;
  const individuals = records.assertions.length;
  const nothing = records.groupFacts.length === 0 && individuals === 0;
  // No group and no animal recorded is "no cattle recorded", never "0 head".
  const headline: ContinuityMeasure = nothing
    ? { value: "—", unit: "no cattle recorded yet" }
    : total !== null
      ? { value: String(total), unit: "head" }
      : { value: String(individuals), unit: individuals === 1 ? "animal recorded individually" : "animals recorded individually" };

  return {
    headline,
    groupsCount: { value: String(records.groupFacts.length), unit: records.groupFacts.length === 1 ? "group" : "groups" },
    headlineNote: !nothing && total === null ? "A group's headcount isn't recorded or disagrees with its animals, so no herd total is shown." : null,
    asOfLabel: herd.asOfLabel,
    intro: CONTINUITY_COPY.intro,
    groups: listingOf(groups, individuals === 0 ? EMPTY_DISPLAY.HERD_ANIMALS : EMPTY_DISPLAY.HERD_GROUPS),
    ungrouped: details(ungroupedRows.map((r) => animalOf(r, words))),
    about: details([notes.readOnly, words.explainer, notes.work, notes.method]),
    planning:
      herd.planning.state === "PLANNING_OK"
        ? { state: "OK" }
        : { state: "FAILED", label: UNAVAILABLE_DISPLAY.PLANNING.label, detail: UNAVAILABLE_DISPLAY.PLANNING.detail ?? UNAVAILABLE_DISPLAY.PLANNING.label, codes: details(herd.planning.failureCodes.slice(0, 3)) },
  };
}

