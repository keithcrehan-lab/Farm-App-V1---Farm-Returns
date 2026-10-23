/**
 * Cattle C10 — the animal activity timeline: a VIEW assembled from existing
 * dated evidence (C1 group / location assertions, C4 weights, C3 health
 * records, C6 goal versions, Plan audit events of this animal's jobs, C10
 * cost entries). It is not a canonical event log and claims no completeness.
 *
 * Information classes stay visibly distinct (fact, observation, intent,
 * derived, recommendation, cost record): a projection or suggestion is never
 * shown as something that happened, and an estimated weight is never a weighing.
 */

import { animalAssertionHistory } from "../animal-snapshot";
import type { WeightSeriesEntry } from "../weights";
import type { AnimalCostRead } from "../../animal-plan";
import type { CattleDirectory, CattleOutputs } from "./cattle-outputs";
import { ACTION_COPY } from "./display-states";
import { formatDate, formatMoney } from "./format";
import { GOAL_TYPE_LABEL, goalTimelineDetail } from "./goal-read";
import { WEIGHT_METHOD_LABEL, weightRecordTitle } from "./weight-view";
import { completionBasisLabel } from "./work-view";

export type TimelineClass = "FACT" | "OBSERVATION" | "INTENT" | "DERIVED" | "PREDICTION" | "RULE" | "OBLIGATION" | "RECOMMENDATION" | "COST" | "RECORD";

export const TIMELINE_CLASS_LABEL: Readonly<Record<TimelineClass, string>> = {
  FACT: "Fact",
  OBSERVATION: "Observation",
  INTENT: "Plan / intent",
  DERIVED: "Calculated",
  PREDICTION: "Prediction",
  RULE: "Rule",
  OBLIGATION: "Obligation",
  RECOMMENDATION: "Work",
  COST: "Cost record",
  RECORD: "Record",
};

/** The shared cattle information class (C0), as the C4 weights barrel publishes it. */
type CattleInformationClass = WeightSeriesEntry["informationClass"];

/**
 * The owner's information class, exactly (C4 weights, C3 health): a DERIVED_VALUE is "Calculated", never
 * an observation; `null` (a C3 retraction has no class) is a plain "Record" — never promoted to a fact.
 */
const CLASS_OF_INFORMATION = {
  FACT: "FACT",
  OBSERVATION: "OBSERVATION",
  INTENT: "INTENT",
  RULE: "RULE",
  DERIVED_VALUE: "DERIVED",
  PREDICTION: "PREDICTION",
  OBLIGATION_OR_CONSTRAINT: "OBLIGATION",
  RECOMMENDATION: "RECOMMENDATION",
} as const satisfies Record<CattleInformationClass, TimelineClass>;

export function timelineClassOf(c: CattleInformationClass | null): TimelineClass {
  return c === null ? "RECORD" : CLASS_OF_INFORMATION[c];
}

export interface TimelineEntryVM {
  id: string;
  /** Sort key: instant or date (descending order in the list). */
  at: string;
  dateLabel: string;
  title: string;
  detail: string | null;
  infoClass: TimelineClass;
  classLabel: string;
  /**
   * Superseded / conflicting history stays visible, marked (SUPERSEDED is struck through). Goal versions also
   * carry CURRENT (in force now, C6 ACTIVE) or NOT_IN_FORCE (live but outside its valid period). `markerLabel`
   * is the marker's words, decided here: a corrected weight is "Corrected", a replaced goal "Superseded".
   */
  marker: "SUPERSEDED" | "CONFLICT" | "CURRENT" | "NOT_IN_FORCE" | null;
  markerLabel: string | null;
}

const MARKER_LABEL = { SUPERSEDED: "Corrected", CONFLICT: "Disagrees with another record", CURRENT: "Current goal", NOT_IN_FORCE: "Not in force now" } as const;

/** What replaced a superseded goal version, from C6's own `supersededBy` refs and the replacing record's action. */
const GOAL_SUPERSEDED_LABEL = { DECLARE: "Superseded", END: "Superseded — goal ended", WITHDRAW: "Superseded — goal withdrawn" } as const;

const HEALTH_KIND: Readonly<Record<string, string>> = {
  MEDICINE_ADMINISTRATION: "Medicine given",
  TREATMENT: "Treatment course",
  DIAGNOSIS: "Diagnosis",
  SYMPTOM: "Symptom noted",
  HEALTH_OBSERVATION: "Health note",
  VETERINARY_EVENT: "Vet visit",
};
const CATEGORY: Readonly<Record<string, string>> = { FEED: "Feed", MEDICINE: "Medicine", VETERINARY: "Veterinary", BEDDING: "Bedding", OTHER: "Other" };

const entry = (e: Omit<TimelineEntryVM, "classLabel" | "dateLabel" | "markerLabel"> & { dateLabel?: string; markerLabel?: string }): TimelineEntryVM => ({
  ...e,
  dateLabel: e.dateLabel ?? formatDate(e.at),
  classLabel: TIMELINE_CLASS_LABEL[e.infoClass],
  markerLabel: e.markerLabel ?? (e.marker === null ? null : MARKER_LABEL[e.marker]),
});

function jobTitle(actionKey: string, directory: CattleDirectory): string {
  const kind = /^CATTLE_RECOMMENDATION:(.+)$/.exec(actionKey)?.[1];
  if (kind) return ACTION_COPY[kind]?.title ?? "Suggested action";
  if (actionKey.startsWith("CATTLE_PROGRAMME:")) {
    try {
      const [programmeId] = JSON.parse(actionKey.slice("CATTLE_PROGRAMME:".length)) as [string];
      return directory.programmeLabels[programmeId] ?? "Programme treatment";
    } catch {
      return "Programme treatment";
    }
  }
  const obligation = /^CATTLE_OBLIGATION:(.+)$/.exec(actionKey)?.[1];
  return obligation ? (directory.obligationLabels[obligation] ?? "Requirement") : "Cattle work";
}

export function buildAnimalTimeline(outputs: CattleOutputs, animalId: string, directory: CattleDirectory, costs: AnimalCostRead): TimelineEntryVM[] {
  const out: TimelineEntryVM[] = [];
  const cutoff = outputs.viewpoint.knowledgeCutoff;

  // C4 weights (every known record, superseded and conflicting ones marked).
  const series = outputs.weights?.series.find((s) => s.animalId === animalId);
  for (const w of series?.history ?? []) {
    if (!w.inView) continue;
    const kg = w.canonicalWeight.state === "CONVERTED" ? w.canonicalWeight.kg : null;
    out.push(
      entry({
        id: `weight:${w.recordId}`,
        at: w.observedAt,
        // "Weighed" only for a measured record; an estimate / external figure / unrecorded method says so (C4 basis).
        title: weightRecordTitle(kg, w.measurementBasis, w.observation.method),
        detail: WEIGHT_METHOD_LABEL[w.observation.method] ?? "Method not recorded",
        infoClass: timelineClassOf(w.informationClass),
        marker: w.status === "SUPERSEDED" ? "SUPERSEDED" : w.inCompetition || (series?.latest.state === "EVIDENCE_CONFLICT" && series.latest.recordIds.includes(w.recordId)) ? "CONFLICT" : null,
      }),
    );
  }

  // C3 health records.
  for (const h of outputs.health[animalId]?.timeline.entries ?? []) {
    if (h.occurredAt === null) continue;
    out.push(
      entry({
        id: `health:${h.recordId}`,
        at: h.occurredAt,
        title: HEALTH_KIND[h.kind] ?? "Health record",
        detail: null,
        infoClass: timelineClassOf(h.informationClass),
        marker: h.status === "SUPERSEDED" ? "SUPERSEDED" : h.inCompetition ? "CONFLICT" : null,
      }),
    );
  }

  // C6 goal versions (intent, never fact): every version kept, marked from C6's own record state — a replaced
  // version is superseded (by a correction, an ending or a withdrawal), the versions in force are the current
  // goals only while C6 says ACTIVE, conflicting versions are marked as such. No goal resolution of C10's own.
  const goals = outputs.goals[animalId];
  const refKey = (r: { goalId: string; version: string }) => `${r.goalId}\u0000${r.version}`;
  const actionOf = new Map((goals?.history ?? []).map((h) => [refKey(h.declaration), h.declaration.action]));
  const inForce = new Set((goals?.status === "ACTIVE" ? goals.activeGoals : []).map((a) => refKey(a.declaration)));
  const inConflict = new Set((goals?.conflicts ?? []).flatMap((c) => c.goals.map(refKey)));
  for (const g of goals?.history ?? []) {
    const d = g.declaration;
    const key = refKey(d);
    const replacedBy = g.supersededBy.map((r) => actionOf.get(refKey(r)));
    const goalMarker: Pick<TimelineEntryVM, "marker"> & { markerLabel?: string } =
      g.recordState === "SUPERSEDED"
        ? { marker: "SUPERSEDED", markerLabel: replacedBy.length === 1 && replacedBy[0] !== undefined ? GOAL_SUPERSEDED_LABEL[replacedBy[0]] : "Superseded" }
        : inConflict.has(key)
          ? { marker: "CONFLICT" }
          : inForce.has(key)
            ? { marker: "CURRENT" }
            : d.action === "DECLARE" && goals?.status !== "INVALID"
              ? { marker: "NOT_IN_FORCE" }
              : { marker: null };
    out.push(
      entry({
        id: `goal:${d.goalId}:${d.version}`,
        at: d.provenance.receivedAt,
        title: `${d.action === "DECLARE" ? (d.supersedesVersions.length > 0 ? "Goal updated" : "Goal set") : d.action === "END" ? "Goal ended" : "Goal withdrawn"}: ${GOAL_TYPE_LABEL[d.goalType] ?? d.goalType}`,
        // The same three target states as the goal line: a target C6 can't convert stays visible as recorded.
        detail: goalTimelineDetail(d),
        infoClass: "INTENT",
        ...goalMarker,
      }),
    );
  }

  // C1 group and location history.
  const ledger = outputs.ledgers.find((l) => l.animalId === animalId);
  if (ledger) {
    for (const kind of ["MANAGEMENT_GROUP", "LOCATION"] as const) {
      for (const h of animalAssertionHistory(ledger, kind, cutoff) ?? []) {
        const a = h.assertion;
        if (a.kind !== kind || !("validFrom" in a)) continue;
        const label = a.kind === "MANAGEMENT_GROUP" ? `Group: ${directory.groupLabels[a.value] ?? "unnamed group"}` : a.kind === "LOCATION" ? `Location: ${directory.locationLabels[a.value.ref] ?? "unnamed"}` : "";
        out.push(entry({ id: `c1:${a.assertionId}`, at: a.validFrom, title: label, detail: h.supersededBy.length > 0 ? "Corrected later" : null, infoClass: "FACT", marker: h.supersededBy.length > 0 ? "SUPERSEDED" : null }));
      }
    }
  }

  // Plan job events (raised / closed).
  for (const s of outputs.jobs) {
    if (!(s.job.scope.kind === "STATIC" && s.job.scope.members.some((m) => m.id === animalId))) continue;
    const title = jobTitle(s.job.actionKey, directory);
    out.push(entry({ id: `job:${s.job.id}:created`, at: s.createdAt, title: `Work raised: ${title}`, detail: null, infoClass: "RECOMMENDATION", marker: null }));
    for (const e of s.events) {
      if (e.type === "COMPLETED") out.push(entry({ id: `job:${s.job.id}:completed:${e.at}`, at: e.at, title: `Work closed: ${title}`, detail: completionBasisLabel(e.basis), infoClass: "RECOMMENDATION", marker: null }));
    }
  }

  // C10 cost entries (an UNAVAILABLE cost read is listed as a timeline gap by the profile, never as "no costs").
  for (const c of costs.state === "UNAVAILABLE" ? [] : costs.entries) {
    out.push(
      entry({
        id: `cost:${c.entryId}`,
        at: `${c.effectiveDate}T00:00:00Z`,
        dateLabel: formatDate(c.effectiveDate),
        title: `${CATEGORY[c.category] ?? "Cost"} ${formatMoney(c.amount, c.currency)}`,
        detail: c.attribution === "ALLOCATED" ? `Allocated — ${c.allocationBasis ?? "basis not stated"}` : (c.note ?? "Direct"),
        infoClass: "COST",
        marker: null,
      }),
    );
  }

  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? -1 : 1));
}
