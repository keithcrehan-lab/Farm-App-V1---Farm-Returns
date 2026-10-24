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
 */

import type { LivestockGroup } from "@/domain/types";
import type { CattleDirectory } from "@/domain/cattle/presentation";
import type { LivestockIndividualRow, WeightObservationRow } from "@/lib/farm-data/row-types";

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
}

export interface RealHeadcountGroup {
  groupRef: string;
  name: string;
  /** The group's recorded headcount (Livestock), or `null` if it can't be read. */
  headcount: number | null;
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
  /** Groups that have individual animals, with the Livestock headcount where it differs from the individuals. */
  headcountNotes: Record<string, string>;
  /** Animals with no group recorded. */
  ungroupedAnimalIds: string[];
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

function assertionsOf(a: LivestockIndividualRow): Rec[] {
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
  if (groups.some((g) => g.farmId !== farmId) || animals.some((a) => a.farm_id !== farmId) || weights.some((w) => w.farm_id !== farmId)) return { ok: false, reason: "FOREIGN_ROW" };
  const groupIds = new Set(groups.map((g) => g.id));
  if (animals.some((a) => a.group_id !== null && !groupIds.has(a.group_id))) return { ok: false, reason: "UNKNOWN_GROUP" };
  const animalIds = new Set(animals.map((a) => a.id));
  if (weights.some((w) => !animalIds.has(w.animal_id))) return { ok: false, reason: "UNKNOWN_ANIMAL" };

  const individuals = new Map<string, number>();
  for (const a of animals) if (a.group_id !== null) individuals.set(a.group_id, (individuals.get(a.group_id) ?? 0) + 1);
  const scopedGroupRefs: string[] = [];
  const headcountGroups: RealHeadcountGroup[] = [];
  const headcountNotes: Record<string, string> = {};
  for (const g of groups) {
    const n = individuals.get(g.id) ?? 0;
    const head = headcountOf(g);
    if (n === 0) headcountGroups.push({ groupRef: g.id, name: g.label, headcount: head });
    else {
      scopedGroupRefs.push(g.id);
      if (head !== null && head !== n) headcountNotes[g.id] = `Livestock records ${head} head in this group; ${n} ${n === 1 ? "is" : "are"} recorded individually.`;
    }
  }

  return {
    ok: true,
    records: {
      assertions: animals.map((a) => ({ animalId: a.id, inputs: assertionsOf(a) })),
      weights: weights.map(weightOf),
      scopedGroupRefs,
      headcountGroups,
      headcountNotes,
      ungroupedAnimalIds: animals.filter((a) => a.group_id === null).map((a) => a.id),
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
