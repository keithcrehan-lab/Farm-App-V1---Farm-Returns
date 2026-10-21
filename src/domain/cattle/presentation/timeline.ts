/**
 * Cattle C10 — the animal activity timeline: a VIEW assembled from existing
 * dated evidence (C1 group / location assertions, C4 weights, C3 health
 * records, C6 goal versions, Plan audit events of this animal's jobs, C10
 * cost entries). It is not a canonical event log and claims no completeness.
 *
 * Information classes stay visibly distinct (fact, observation, intent,
 * derived, recommendation, cost record): a projection or suggestion is never
 * shown as something that happened.
 */

import { animalAssertionHistory } from "../animal-snapshot";
import type { AnimalCostSummary } from "../../animal-plan";
import type { CattleDirectory, CattleOutputs } from "./cattle-outputs";
import { ACTION_COPY } from "./display-states";
import { formatDate, formatDayMonth, formatKg, formatMoney } from "./format";

export type TimelineClass = "FACT" | "OBSERVATION" | "INTENT" | "DERIVED" | "RECOMMENDATION" | "COST";

export const TIMELINE_CLASS_LABEL: Readonly<Record<TimelineClass, string>> = {
  FACT: "Fact",
  OBSERVATION: "Observation",
  INTENT: "Plan / intent",
  DERIVED: "Calculated",
  RECOMMENDATION: "Work",
  COST: "Cost record",
};

export interface TimelineEntryVM {
  id: string;
  /** Sort key: instant or date (descending order in the list). */
  at: string;
  dateLabel: string;
  title: string;
  detail: string | null;
  infoClass: TimelineClass;
  classLabel: string;
  /** Superseded / conflicting history stays visible, marked. */
  marker: "SUPERSEDED" | "CONFLICT" | null;
}

const GOAL_TYPE: Readonly<Record<string, string>> = { FINISHING: "Finishing", SALE: "Sale", RETAIN: "Keep on farm", BREEDING: "Breeding", REPLACEMENT: "Replacement" };
const HEALTH_KIND: Readonly<Record<string, string>> = {
  MEDICINE_ADMINISTRATION: "Medicine given",
  TREATMENT: "Treatment course",
  DIAGNOSIS: "Diagnosis",
  SYMPTOM: "Symptom noted",
  HEALTH_OBSERVATION: "Health note",
  VETERINARY_EVENT: "Vet visit",
};
const CATEGORY: Readonly<Record<string, string>> = { FEED: "Feed", MEDICINE: "Medicine", VETERINARY: "Veterinary", BEDDING: "Bedding", OTHER: "Other" };

const entry = (e: Omit<TimelineEntryVM, "classLabel" | "dateLabel"> & { dateLabel?: string }): TimelineEntryVM => ({ ...e, dateLabel: e.dateLabel ?? formatDate(e.at), classLabel: TIMELINE_CLASS_LABEL[e.infoClass] });

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

export function buildAnimalTimeline(outputs: CattleOutputs, animalId: string, directory: CattleDirectory, costs: AnimalCostSummary | null): TimelineEntryVM[] {
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
        title: kg !== null ? `Weighed ${formatKg(kg)}` : "Weight recorded (unit not convertible)",
        detail: w.measurementBasis === "MEASURED" ? "Scale reading" : "Estimate",
        infoClass: "OBSERVATION",
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
        infoClass: h.informationClass === "OBSERVATION" ? "OBSERVATION" : "FACT",
        marker: h.status === "SUPERSEDED" ? "SUPERSEDED" : h.inCompetition ? "CONFLICT" : null,
      }),
    );
  }

  // C6 goal versions (intent, never fact).
  for (const g of outputs.goals[animalId]?.history ?? []) {
    const d = g.declaration;
    const target = [d.targetWeight && d.targetWeight.canonical.state === "KNOWN" ? formatKg(d.targetWeight.canonical.kg) : null, d.targetDate ? `by ${formatDayMonth(d.targetDate)}` : null].filter(Boolean).join(" ");
    out.push(
      entry({
        id: `goal:${d.goalId}:${d.version}`,
        at: d.provenance.receivedAt,
        title: `${d.action === "DECLARE" ? (d.supersedesVersions.length > 0 ? "Goal updated" : "Goal set") : d.action === "END" ? "Goal ended" : "Goal withdrawn"}: ${GOAL_TYPE[d.goalType] ?? d.goalType}`,
        detail: target || null,
        infoClass: "INTENT",
        marker: null,
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
      if (e.type === "COMPLETED") out.push(entry({ id: `job:${s.job.id}:completed:${e.at}`, at: e.at, title: `Work closed: ${title}`, detail: e.basis === "CANONICAL_EVIDENCE" ? "Closed by your records" : "Marked done", infoClass: "RECOMMENDATION", marker: null }));
    }
  }

  // C10 cost entries.
  for (const c of costs?.entries ?? []) {
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
