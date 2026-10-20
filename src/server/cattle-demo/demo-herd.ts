/**
 * Cattle C10 — the demonstration herd (server-only, local demonstration mode
 * only). Canonical C1–C7 input records for twelve SYNTH animals in two
 * management groups, chosen so the reference experience exercises real engine
 * states: on track / ahead / behind, evidence conflict, one weight, no weight,
 * no goal, in withdrawal, unknown withdrawal, an overdue synthetic obligation,
 * a due programme action and an unresolved group membership.
 *
 * Display labels (tag numbers, breed labels, group / field / shed names) are
 * demonstration data. Every engine-facing id is `SYNTH-*`.
 */

import "server-only";

import { createAnimalLedger, type AnimalLedger } from "@/domain/cattle/animal-ledger";
import { EMPTY_GOAL_ROUTING_REGISTRY } from "@/domain/cattle/goals";
import { programmeOccurrenceId } from "@/domain/cattle/programmes";
import {
  DEMO_FOOD_PRODUCT,
  DEMO_OBLIGATION_CATALOGUE,
  DEMO_OBLIGATION_ID,
  DEMO_PERFORMANCE_POLICIES,
  DEMO_PERFORMANCE_TARGETS,
  DEMO_PRODUCT_RECORDS,
  DEMO_PROGRAMME_ACTION,
  DEMO_PROGRAMME_ID,
  demoProgrammes,
  medicineAdministration,
  obligationFulfilment,
  programmeCompletion,
} from "./demo-catalogue";

type Rec = Record<string, unknown>;

export const GROUP_FINISHERS = "SYNTH-GROUP-FINISHERS";
export const GROUP_STORES = "SYNTH-GROUP-STORES";

/** Display directory for opaque refs (demonstration labels only). */
export const DEMO_GROUP_LABELS: Readonly<Record<string, string>> = { [GROUP_FINISHERS]: "Finishers", [GROUP_STORES]: "Stores" };
export const DEMO_LOCATION_LABELS: Readonly<Record<string, string>> = { "SYNTH-FIELD-6": "Field 6", "SYNTH-SHED-2": "Shed 2" };
export const DEMO_TAG_SCHEME = "SYNTH-HERD-TAG";

export interface DemoAnimalSpec {
  tag: string;
  dob: string;
  sex: "MALE" | "FEMALE";
  breed: string;
  group: string;
  location: string;
  /** [observedAt, kg] scale weights. */
  weights: [string, number][];
  goal: { type: "FINISHING" | "SALE" | "RETAIN"; targetKg: number | null; targetDate: string | null } | null;
  treatments: [string, string?][];
  registrationFulfilled: boolean;
  inProgramme: boolean;
  programmeCompletedAt?: string;
  /** Extra canonical weight records (e.g. a competing reading). */
  extraWeights?: Rec[];
  /** Competing MANAGEMENT_GROUP corrections (unresolved membership). */
  membershipConflict?: boolean;
}

export const animalIdOf = (tag: string) => `SYNTH-ANIMAL-${tag}`;

/** Monthly scale weights ending `last` days apart (synthetic numbers). */
function series(points: [string, number][]): [string, number][] {
  return points;
}

export const DEMO_ANIMALS: readonly DemoAnimalSpec[] = [
  {
    tag: "1427",
    dob: "2025-08-12",
    sex: "MALE",
    breed: "Charolais cross",
    group: GROUP_FINISHERS,
    location: "SYNTH-FIELD-6",
    weights: series([
      ["2026-04-20T10:00:00Z", 362],
      ["2026-05-19T10:00:00Z", 394],
      ["2026-06-17T10:00:00Z", 425],
      ["2026-07-16T10:00:00Z", 457],
      ["2026-08-15T10:00:00Z", 489],
      ["2026-09-14T10:00:00Z", 521],
    ]),
    goal: { type: "FINISHING", targetKg: 640, targetDate: "2026-12-04" },
    treatments: [["2026-06-02T08:00:00Z"]],
    registrationFulfilled: true,
    inProgramme: true,
    programmeCompletedAt: "2026-03-08T09:00:00Z",
  },
  {
    tag: "1431",
    dob: "2025-07-28",
    sex: "FEMALE",
    breed: "Limousin cross",
    group: GROUP_FINISHERS,
    location: "SYNTH-FIELD-6",
    weights: series([
      ["2026-06-10T10:00:00Z", 402],
      ["2026-07-09T10:00:00Z", 438],
      ["2026-08-08T10:00:00Z", 476],
      ["2026-09-07T10:00:00Z", 514],
      ["2026-10-09T10:00:00Z", 554],
    ]),
    goal: { type: "FINISHING", targetKg: 600, targetDate: "2026-11-13" },
    treatments: [],
    registrationFulfilled: true,
    inProgramme: false,
  },
  {
    tag: "1433",
    dob: "2025-08-30",
    sex: "MALE",
    breed: "Hereford cross",
    group: GROUP_FINISHERS,
    location: "SYNTH-FIELD-6",
    weights: series([
      ["2026-06-04T10:00:00Z", 371],
      ["2026-07-03T10:00:00Z", 392],
      ["2026-08-02T10:00:00Z", 414],
      ["2026-09-01T10:00:00Z", 435],
      ["2026-10-02T10:00:00Z", 457],
    ]),
    goal: { type: "FINISHING", targetKg: 600, targetDate: "2027-01-15" },
    treatments: [],
    registrationFulfilled: true,
    inProgramme: false,
  },
  {
    tag: "1438",
    dob: "2025-08-05",
    sex: "MALE",
    breed: "Charolais cross",
    group: GROUP_FINISHERS,
    location: "SYNTH-FIELD-6",
    weights: series([
      ["2026-07-07T10:00:00Z", 431],
      ["2026-08-06T10:00:00Z", 463],
    ]),
    // Two different scale readings recorded for the same instant: a C4 competition.
    extraWeights: [
      { recordId: "SYNTH-W-1438-A", observedAt: "2026-10-05T10:00:00Z", kg: 498 },
      { recordId: "SYNTH-W-1438-B", observedAt: "2026-10-05T10:00:00Z", kg: 512 },
    ],
    goal: { type: "FINISHING", targetKg: 640, targetDate: "2026-12-11" },
    treatments: [],
    registrationFulfilled: true,
    inProgramme: false,
  },
  {
    tag: "1440",
    dob: "2025-09-14",
    sex: "FEMALE",
    breed: "Angus cross",
    group: GROUP_FINISHERS,
    location: "SYNTH-FIELD-6",
    weights: series([["2026-10-01T10:00:00Z", 433]]),
    goal: { type: "FINISHING", targetKg: 560, targetDate: "2027-02-05" },
    treatments: [],
    registrationFulfilled: true,
    inProgramme: false,
  },
  {
    tag: "1442",
    dob: "2025-09-02",
    sex: "MALE",
    breed: "Simmental cross",
    group: GROUP_FINISHERS,
    location: "SYNTH-FIELD-6",
    weights: [],
    goal: { type: "FINISHING", targetKg: 620, targetDate: "2027-01-29" },
    treatments: [],
    registrationFulfilled: true,
    inProgramme: false,
  },
  {
    tag: "1445",
    dob: "2025-08-21",
    sex: "MALE",
    breed: "Belgian Blue cross",
    group: GROUP_FINISHERS,
    location: "SYNTH-FIELD-6",
    weights: series([
      ["2026-07-24T10:00:00Z", 448],
      ["2026-08-23T10:00:00Z", 481],
      ["2026-09-25T10:00:00Z", 515],
    ]),
    goal: null,
    treatments: [],
    registrationFulfilled: true,
    inProgramme: false,
  },
  {
    tag: "1447",
    dob: "2025-07-19",
    sex: "MALE",
    breed: "Charolais cross",
    group: GROUP_FINISHERS,
    location: "SYNTH-FIELD-6",
    weights: series([
      ["2026-07-21T10:00:00Z", 478],
      ["2026-08-20T10:00:00Z", 509],
      ["2026-09-21T10:00:00Z", 541],
    ]),
    goal: { type: "FINISHING", targetKg: 650, targetDate: "2026-12-18" },
    treatments: [["2026-10-02T08:00:00Z"]],
    registrationFulfilled: true,
    inProgramme: false,
  },
  {
    tag: "1449",
    dob: "2025-09-09",
    sex: "FEMALE",
    breed: "Limousin cross",
    group: GROUP_FINISHERS,
    location: "SYNTH-FIELD-6",
    weights: series([
      ["2026-08-12T10:00:00Z", 402],
      ["2026-09-11T10:00:00Z", 431],
    ]),
    goal: { type: "FINISHING", targetKg: 560, targetDate: "2027-02-19" },
    treatments: [],
    registrationFulfilled: true,
    inProgramme: false,
    membershipConflict: true,
  },
  {
    tag: "1452",
    dob: "2026-03-20",
    sex: "MALE",
    breed: "Charolais cross",
    group: GROUP_STORES,
    location: "SYNTH-SHED-2",
    weights: series([
      ["2026-08-18T10:00:00Z", 214],
      ["2026-09-17T10:00:00Z", 241],
      ["2026-10-08T10:00:00Z", 262],
    ]),
    goal: { type: "RETAIN", targetKg: null, targetDate: null },
    treatments: [],
    registrationFulfilled: true,
    inProgramme: true,
  },
  {
    tag: "1455",
    dob: "2026-03-02",
    sex: "FEMALE",
    breed: "Angus cross",
    group: GROUP_STORES,
    location: "SYNTH-SHED-2",
    weights: series([
      ["2026-08-30T10:00:00Z", 236],
      ["2026-09-29T10:00:00Z", 260],
    ]),
    goal: { type: "RETAIN", targetKg: null, targetDate: null },
    // A product with no product record: the withdrawal state is unknown.
    treatments: [["2026-10-03T08:00:00Z", "SYNTH-PRODUCT-UNLISTED"]],
    registrationFulfilled: true,
    inProgramme: false,
  },
  {
    tag: "1458",
    dob: "2026-09-12",
    sex: "MALE",
    breed: "Hereford cross",
    group: GROUP_STORES,
    location: "SYNTH-SHED-2",
    weights: series([["2026-10-12T10:00:00Z", 74]]),
    goal: { type: "RETAIN", targetKg: null, targetDate: null },
    treatments: [],
    registrationFulfilled: false,
    inProgramme: false,
  },
];

function ledgerOf(spec: DemoAnimalSpec): AnimalLedger {
  const id = animalIdOf(spec.tag);
  const prov = (receivedAt = `${spec.dob}T18:00:00Z`) => ({ sourceCategory: "FARMER", receivedAt });
  const born = `${spec.dob}T00:00:00Z`;
  const groupFrom = spec.group === GROUP_FINISHERS ? "2026-05-01T00:00:00Z" : born;
  const assertions: Rec[] = [
    { assertionId: `${id}-dob`, animalId: id, kind: "DATE_OF_BIRTH", value: spec.dob, provenance: prov() },
    { assertionId: `${id}-sex`, animalId: id, kind: "SEX", value: spec.sex, provenance: prov() },
    { assertionId: `${id}-breed`, animalId: id, kind: "BREED", value: { codeSystem: null, code: null, label: spec.breed, components: [] }, provenance: prov() },
    { assertionId: `${id}-tag`, animalId: id, kind: "EXTERNAL_IDENTIFIER", value: { scheme: DEMO_TAG_SCHEME, identifier: spec.tag }, validFrom: born, validTo: null, provenance: prov() },
    { assertionId: `${id}-present`, animalId: id, kind: "LIFECYCLE_STATUS", value: "PRESENT", validFrom: born, validTo: null, provenance: prov() },
    { assertionId: `${id}-location`, animalId: id, kind: "LOCATION", value: { kind: spec.location.startsWith("SYNTH-SHED") ? "HOUSING" : "FIELD", ref: spec.location }, validFrom: groupFrom, validTo: null, provenance: prov(groupFrom) },
    { assertionId: `${id}-group`, animalId: id, kind: "MANAGEMENT_GROUP", value: spec.group, validFrom: groupFrom, validTo: null, provenance: prov(groupFrom) },
  ];
  if (spec.membershipConflict) {
    // Two live corrections of the same assertion naming different groups: unresolved, never latest-wins.
    for (const [suffix, group, receivedAt] of [["a", GROUP_FINISHERS, "2026-09-10T12:00:00Z"], ["b", GROUP_STORES, "2026-09-11T12:00:00Z"]] as const) {
      assertions.push({ assertionId: `${id}-group-fix-${suffix}`, animalId: id, kind: "MANAGEMENT_GROUP", value: group, validFrom: groupFrom, validTo: null, supersedes: [`${id}-group`], provenance: prov(receivedAt) });
    }
  }
  const r = createAnimalLedger(id, assertions);
  if (!r.ok) throw new Error(`demo ledger ${spec.tag}: ${JSON.stringify(r.issues)}`);
  return r.ledger;
}

export function weightRecord(recordId: string, animalId: string, observedAt: string, kg: number, receivedAt = observedAt, method = "SCALE"): Rec {
  return { recordId, animalId, observedAt, weight: { value: kg, unit: "KILOGRAM" }, method, provenance: { sourceCategory: method === "SCALE" ? "DEVICE" : "FARMER", receivedAt } };
}

export function goalDeclaration(o: { goalId: string; version: string; supersedes: string[]; animalId: string; type: string; targetKg: number | null; targetDate: string | null; validFrom: string; receivedAt: string }): Rec {
  return {
    goalId: o.goalId,
    version: o.version,
    supersedesVersions: o.supersedes,
    action: "DECLARE",
    subject: { kind: "ANIMAL", animalId: o.animalId },
    goalType: o.type,
    targetWeight: o.targetKg === null ? null : { value: o.targetKg, unit: "KILOGRAM" },
    targetDate: o.targetDate,
    targetOutcome: null,
    validFrom: o.validFrom,
    validTo: null,
    declaredBy: { actor: "SYNTH-FARMER-1", role: "FARMER" },
    provenance: { sourceCategory: "FARMER", receivedAt: o.receivedAt },
  };
}

export const goalIdOf = (tag: string) => `SYNTH-GOAL-${tag}`;

/** The canonical base records of the demonstration herd (before any demo-session action). */
export interface DemoHerdRecords {
  ledgers: AnimalLedger[];
  weights: Rec[];
  goals: Rec[];
  health: { animalId: string; healthRecords: Rec[] }[];
  obligationEvidence: Rec[];
  programmeAnimals: string[];
  programmeCompletions: Rec[];
}

export function demoHerdRecords(): DemoHerdRecords {
  const out: DemoHerdRecords = { ledgers: [], weights: [], goals: [], health: [], obligationEvidence: [], programmeAnimals: [], programmeCompletions: [] };
  for (const spec of DEMO_ANIMALS) {
    const id = animalIdOf(spec.tag);
    out.ledgers.push(ledgerOf(spec));
    spec.weights.forEach(([at, kg], i) => out.weights.push(weightRecord(`SYNTH-W-${spec.tag}-${i + 1}`, id, at, kg)));
    for (const w of spec.extraWeights ?? []) out.weights.push(weightRecord(String(w.recordId), id, String(w.observedAt), Number(w.kg)));
    if (spec.goal) {
      out.goals.push(goalDeclaration({ goalId: goalIdOf(spec.tag), version: "v1", supersedes: [], animalId: id, type: spec.goal.type, targetKg: spec.goal.targetKg, targetDate: spec.goal.targetDate, validFrom: "2026-05-01T00:00:00Z", receivedAt: "2026-05-01T09:00:00Z" }));
    }
    out.health.push({ animalId: id, healthRecords: spec.treatments.map(([at, product], i) => medicineAdministration(`SYNTH-H-${spec.tag}-${i + 1}`, id, at, product)) });
    if (spec.registrationFulfilled) {
      const due = new Date(`${spec.dob}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + 5);
      const at = due.toISOString().replace(".000Z", "Z");
      out.obligationEvidence.push(obligationFulfilment(id, at, at));
    }
    if (spec.inProgramme) {
      out.programmeAnimals.push(id);
      if (spec.programmeCompletedAt) {
        // The first (index 0) occurrence, anchored at the C1 date of birth (C7's canonical anchor spelling).
        const occurrenceId = programmeOccurrenceId(DEMO_PROGRAMME_ID, DEMO_PROGRAMME_ACTION, id, "DATE_OF_BIRTH", `${spec.dob}T00:00:00.000000000Z`, 0);
        out.programmeCompletions.push(programmeCompletion(id, occurrenceId, spec.programmeCompletedAt));
      }
    }
  }
  return out;
}

/** The C8 / C9 canonical request parts that do not depend on the demo session. */
export function demoStaticRequestParts(records: DemoHerdRecords) {
  return {
    obligations: { catalogue: DEMO_OBLIGATION_CATALOGUE, obligationIds: [DEMO_OBLIGATION_ID], evidence: records.obligationEvidence },
    health: { foodProducts: [DEMO_FOOD_PRODUCT], productRecords: DEMO_PRODUCT_RECORDS, animals: records.health },
    performance: { targets: DEMO_PERFORMANCE_TARGETS, policies: DEMO_PERFORMANCE_POLICIES, contexts: [], windowFrom: null },
    programmes: demoProgrammes(records.programmeAnimals, records.programmeCompletions),
    goalRouting: EMPTY_GOAL_ROUTING_REGISTRY,
  };
}
