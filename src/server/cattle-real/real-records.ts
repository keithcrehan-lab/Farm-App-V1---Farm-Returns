/**
 * Pilot Integration P1 — the pure translation of real farm rows into the
 * frozen cattle inputs (`docs/farm-return-next/pilot-integration/DECISIONS.md`
 * D2–D5). No Supabase, no UI, no engine run, no clock.
 *
 * Only what the rows record is asserted. A null column is simply not asserted,
 * so the frozen engines report their own "not recorded" state. Nothing is
 * defaulted. Not mapped (no structured meaning): `category`, `goal_status`,
 * `notes`, the free-text weight `source`, and a group's housing (a group's
 * shed is not an animal's location).
 *
 * Identity corrections (`livestock_individual_identity_corrections`) are
 * append-only: each becomes a NEW C1 assertion that supersedes the animal's
 * previous live assertion of the same kind, received at the correction's own
 * time (C1 is bitemporal — the original row's value stays in the history as
 * what was known before the correction; nothing is rewritten).
 */

import type { LivestockGoal, LivestockGroup } from "@/domain/types";
import type { CattleDirectory } from "@/domain/cattle/presentation";
import type { IdentityCorrectionRow, LivestockIndividualRow, WeightObservationRow } from "@/lib/farm-data/row-types";

type Rec = Record<string, unknown>;

/** The C1 external-identifier scheme of the tag number as entered in Farm Return (verbatim, no format rule). */
export const REAL_TAG_SCHEME = "FARM_RETURN_TAG_NUMBER";
/** `provenance.sourceSystem` of every real record: the row lives in Farm Return's own tables. */
export const REAL_SOURCE_SYSTEM = "farm-return";

export interface RealRecordsInput {
  farmId: string;
  groups: LivestockGroup[];
  animals: LivestockIndividualRow[];
  weights: WeightObservationRow[];
  /** Append-only identity corrections; absent = none held. */
  corrections?: IdentityCorrectionRow[];
}

export interface RealHeadcountGroup {
  groupRef: string;
  name: string;
  /** The group's recorded headcount, or `null` if it can't be read. */
  headcount: number | null;
}

/** One of the farm's groups as recorded (farm order): its headcount and how many animals are recorded in it individually. */
export interface RealGroupFact {
  groupRef: string;
  name: string;
  /** The group's recorded headcount, or `null` if it can't be read. */
  headcount: number | null;
  /** Individual animal rows recorded in this group (readable or not). */
  individuals: number;
  /** The group goal chosen in Manage herd, or `null` when none is set. Not a C6 production goal (no weight or date). */
  goal: LivestockGoal | null;
}

export interface RealCattleRecords {
  /** C1 assertion inputs per animal (`createAnimalLedger` validates them). */
  assertions: { animalId: string; inputs: Rec[] }[];
  /** C4 weight record inputs. */
  weights: Rec[];
  /** Groups with at least one individually recorded animal: these are C4 group scopes. */
  scopedGroupRefs: string[];
  /** Groups with no individually recorded animal: a headcount only, never a "0 animals" scope. */
  headcountGroups: RealHeadcountGroup[];
  /** Groups that have individual animals, with the recorded headcount where it differs from the individuals. */
  headcountNotes: Record<string, string>;
  /** Animals with no group recorded. */
  ungroupedAnimalIds: string[];
  /** Every group, in the farm's order, with its recorded headcount and individual count. */
  groupFacts: RealGroupFact[];
  directory: CattleDirectory;
}

export type RealRecordsResult = { ok: true; records: RealCattleRecords } | { ok: false; reason: "FOREIGN_ROW" | "UNKNOWN_GROUP" | "UNKNOWN_ANIMAL" };

/** A Postgres timestamptz as a strict UTC instant (`2026-09-01T10:00:00.123456Z`). */
export function instantOf(timestamptz: string): string {
  const ms = Date.parse(timestamptz);
  if (!Number.isFinite(ms)) return timestamptz; // left as is: the frozen validator rejects it (fails closed)
  const frac = /\.(\d+)/.exec(timestamptz)?.[1] ?? "";
  return `${new Date(ms).toISOString().slice(0, 19)}${frac ? `.${frac.slice(0, 9)}` : ""}Z`;
}

const headcountOf = (g: LivestockGroup): number | null => {
  const v = (g.count as { value?: unknown } | null | undefined)?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

const provenance = (receivedAt: string, rowId: string) => ({ sourceCategory: "FARMER", sourceSystem: REAL_SOURCE_SYSTEM, sourceRecordRef: rowId, receivedAt });

const CORRECTED_KIND = { date_of_birth: "DATE_OF_BIRTH", sex: "SEX", breed: "BREED" } as const;
const BASE_ID_SUFFIX = { DATE_OF_BIRTH: "dob", SEX: "sex", BREED: "breed" } as const;

function identityValue(fact: IdentityCorrectionRow["fact"] | "date_of_birth", value: string): unknown {
  if (fact === "sex") return value === "male" ? "MALE" : value === "female" ? "FEMALE" : value;
  if (fact === "breed") return { codeSystem: null, code: null, label: value, components: [] };
  return value;
}

/** Corrections in the order they were recorded (ties by id): each supersedes the one before it. */
export function orderedCorrections(corrections: readonly IdentityCorrectionRow[]): IdentityCorrectionRow[] {
  return [...corrections].sort((x, y) => {
    const dx = Date.parse(x.recorded_at);
    const dy = Date.parse(y.recorded_at);
    if (dx !== dy) return dx - dy;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });
}

/** The animal's current identity facts: the latest correction of each fact, otherwise the original row. */
export function effectiveIdentityOf(a: Pick<LivestockIndividualRow, "id" | "date_of_birth" | "sex" | "breed">, corrections: readonly IdentityCorrectionRow[]): { dateOfBirth: string | null; sex: "male" | "female" | null; breed: string | null } {
  let dateOfBirth = a.date_of_birth;
  let sex = a.sex;
  let breed = a.breed;
  for (const c of orderedCorrections(corrections.filter((x) => x.animal_id === a.id))) {
    if (c.fact === "date_of_birth") dateOfBirth = c.value;
    else if (c.fact === "sex" && (c.value === "male" || c.value === "female")) sex = c.value;
    else if (c.fact === "breed") breed = c.value;
  }
  return { dateOfBirth, sex, breed };
}

function assertionsOf(a: LivestockIndividualRow, corrections: readonly IdentityCorrectionRow[]): Rec[] {
  const id = a.id;
  const at = instantOf(a.created_at);
  const prov = provenance(at, id);
  const out: Rec[] = [];
  if (a.tag_number !== null) out.push({ assertionId: `${id}:tag`, animalId: id, kind: "EXTERNAL_IDENTIFIER", value: { scheme: REAL_TAG_SCHEME, identifier: a.tag_number }, validFrom: at, provenance: prov });
  if (a.date_of_birth !== null) out.push({ assertionId: `${id}:dob`, animalId: id, kind: "DATE_OF_BIRTH", value: a.date_of_birth, provenance: prov });
  if (a.sex !== null) out.push({ assertionId: `${id}:sex`, animalId: id, kind: "SEX", value: a.sex === "male" ? "MALE" : a.sex === "female" ? "FEMALE" : a.sex, provenance: prov });
  if (a.breed !== null) out.push({ assertionId: `${id}:breed`, animalId: id, kind: "BREED", value: { codeSystem: null, code: null, label: a.breed, components: [] }, provenance: prov });
  // D4: the application never reassigns an animal, so the stored group holds from the row's creation.
  if (a.group_id !== null) out.push({ assertionId: `${id}:group`, animalId: id, kind: "MANAGEMENT_GROUP", value: a.group_id, validFrom: at, provenance: prov });

  // Append-only corrections: each supersedes the previous live assertion of its kind (C1 correction chain).
  const live: Partial<Record<string, string>> = {};
  for (const kind of Object.values(CORRECTED_KIND)) {
    if (out.some((x) => x.assertionId === `${id}:${BASE_ID_SUFFIX[kind]}`)) live[kind] = `${id}:${BASE_ID_SUFFIX[kind]}`;
  }
  for (const c of orderedCorrections(corrections)) {
    const kind = CORRECTED_KIND[c.fact];
    if (!kind) continue;
    const assertionId = `${id}:${BASE_ID_SUFFIX[kind]}:${c.id}`;
    const previous = live[kind];
    out.push({
      assertionId,
      animalId: id,
      kind,
      value: identityValue(c.fact, c.value),
      ...(previous ? { supersedes: [previous] } : {}),
      provenance: provenance(instantOf(c.recorded_at), c.id),
    });
    live[kind] = assertionId;
  }
  return out;
}

function weightOf(w: WeightObservationRow): Rec {
  return {
    recordId: w.id,
    animalId: w.animal_id,
    // D5: a date-only weight sits at 00:00 UTC of its date (in view from the start of that day).
    observedAt: `${w.observed_date}T00:00:00Z`,
    weight: { value: w.weight_kg, unit: "KILOGRAM" },
    // No method is stored: UNKNOWN, never inferred from the free-text source.
    method: "UNKNOWN",
    deviceRef: null,
    quality: null,
    conditionsNote: null,
    provenance: { ...provenance(instantOf(w.created_at), w.id), observedAt: null, actor: null },
    supersedes: [],
  };
}

/**
 * Rows → frozen inputs. Every row must belong to `farmId`, every weight to one of the farm's animals and every
 * membership to one of the farm's groups; anything else fails the whole read closed (the database already forbids
 * it — this never silently drops a row).
 */
export function realCattleRecords(input: RealRecordsInput): RealRecordsResult {
  const { farmId, groups, animals, weights } = input;
  const corrections = input.corrections ?? [];
  if (groups.some((g) => g.farmId !== farmId) || animals.some((a) => a.farm_id !== farmId) || weights.some((w) => w.farm_id !== farmId) || corrections.some((c) => c.farm_id !== farmId)) return { ok: false, reason: "FOREIGN_ROW" };
  const groupIds = new Set(groups.map((g) => g.id));
  if (animals.some((a) => a.group_id !== null && !groupIds.has(a.group_id))) return { ok: false, reason: "UNKNOWN_GROUP" };
  const animalIds = new Set(animals.map((a) => a.id));
  if (weights.some((w) => !animalIds.has(w.animal_id)) || corrections.some((c) => !animalIds.has(c.animal_id))) return { ok: false, reason: "UNKNOWN_ANIMAL" };
  const correctionsByAnimal = new Map<string, IdentityCorrectionRow[]>();
  for (const c of corrections) correctionsByAnimal.set(c.animal_id, [...(correctionsByAnimal.get(c.animal_id) ?? []), c]);

  const individuals = new Map<string, number>();
  for (const a of animals) if (a.group_id !== null) individuals.set(a.group_id, (individuals.get(a.group_id) ?? 0) + 1);
  const scopedGroupRefs: string[] = [];
  const headcountGroups: RealHeadcountGroup[] = [];
  const headcountNotes: Record<string, string> = {};
  for (const g of groups) {
    const n = individuals.get(g.id) ?? 0;
    const head = headcountOf(g);
    if (n === 0) headcountGroups.push({ groupRef: g.id, name: g.label, headcount: head });
    else scopedGroupRefs.push(g.id);
  }

  return {
    ok: true,
    records: {
      assertions: animals.map((a) => ({ animalId: a.id, inputs: assertionsOf(a, correctionsByAnimal.get(a.id) ?? []) })),
      weights: weights.map(weightOf),
      scopedGroupRefs,
      headcountGroups,
      headcountNotes,
      ungroupedAnimalIds: animals.filter((a) => a.group_id === null).map((a) => a.id),
      groupFacts: groups.map((g) => {
        const individualCount = individuals.get(g.id) ?? 0;
        return {
          groupRef: g.id,
          name: g.label,
          headcount: individualCount > 0 ? individualCount : headcountOf(g),
          individuals: individualCount,
          goal: g.goal ?? null,
        };
      }),
      directory: {
        tagScheme: REAL_TAG_SCHEME,
        groupLabels: Object.fromEntries(groups.map((g) => [g.id, g.label])),
        locationLabels: {},
        programmeLabels: {},
        obligationLabels: {},
        foodProductLabels: {},
        productLabels: {},
      },
    },
  };
}
