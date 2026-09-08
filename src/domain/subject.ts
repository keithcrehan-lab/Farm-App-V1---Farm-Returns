/**
 * Farm Return Next — Checkpoint 1.5 (Intelligence & Extensibility
 * Architecture). A generic, minimal reference to "the farm entity this
 * thing is about" — introduced because `Measurement`
 * (`src/domain/measurement.ts`) and `ExternalReference`
 * (`src/domain/external-reference.ts`) both genuinely need to point at
 * *any* kind of farm entity (a field, an animal, a machine, ...), not just
 * a field, and no existing type already expresses that.
 *
 * **What this is not**: a generic entity/ORM framework, and not a change
 * to any existing persisted schema. `job_sessions.primary_field_id`/
 * `field_segments` (the real, live, audited GPS Job Mode contract —
 * `docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`)
 * stays exactly as it is; this campaign does not touch it, and does not
 * ask it to become subject-shaped. That decision has real precedent
 * already in this codebase: `supabase/migrations/
 * 20260829020000_jobs_weight_observation_reference.sql`'s own header
 * comment deliberately rejected a generic `target_type`/`target_id`
 * polymorphic database column for exactly one job type, reasoning that
 * "a raw jobs.target_type/target_id polymorphic pair, invented here for
 * one job type alone, would be exactly the schema decision [a future
 * general model] was trying to avoid pre-empting" — the same reasoning
 * applies here: `SubjectRef` is a TypeScript-only vocabulary for *new*
 * concepts that don't have a competing narrow schema decision yet, not a
 * retrofit of one onto an existing, working, narrowly-typed table.
 *
 * `SubjectType` intentionally covers more kinds than any Farm Return
 * screen or table currently models (`MACHINE`/`BUILDING`/`INPUT`/
 * `STORAGE` have no real backing entity yet) — see each variant's own
 * comment for what, if anything, already exists for it. Adding a case
 * here costs nothing (a widened union, not a new table); the
 * architectural property this buys is that a future `Measurement` or
 * `ExternalReference` about one of those kinds never needs this file's
 * own shape to change, only a real backing entity to eventually exist.
 */

export type SubjectType =
  | "FARM"
  | "FIELD"
  | "ANIMAL"
  | "ANIMAL_GROUP"
  | "MACHINE"
  | "BUILDING"
  | "INPUT"
  | "STORAGE";

/**
 * Which real Farm Return type/table each `SubjectType` corresponds to
 * today, for anyone wiring a `SubjectRef` up to a real lookup. Not a
 * runtime dependency — a documentation aid kept next to the union it
 * describes, so it can't drift out of a doc comment nobody reads.
 *
 * - `FARM` — `src/domain/types.ts`'s `Farm`.
 * - `FIELD` — `src/domain/types.ts`'s `Field`.
 * - `ANIMAL` — `src/domain/types.ts`'s `IndividualAnimal`.
 * - `ANIMAL_GROUP` — `src/domain/types.ts`'s `LivestockGroup` (already the
 *   real anchor for "a group of animals managed together" — grazing vs.
 *   housed is `LivestockGroup.system`, management intent is
 *   `LivestockGroup.goal`; no separate `AnimalGroup` type was introduced
 *   for Checkpoint 1.5, see `docs/farm-return-next/
 *   CHECKPOINT_1_5_ARCHITECTURE.md`'s own reasoning).
 * - `BUILDING` — `src/domain/types.ts`'s `Housing` is the closest existing
 *   entity (a shed), not a 1:1 rename target — a future `BUILDING`
 *   subject may resolve to a `Housing` id, or to a genuinely different
 *   building type Housing doesn't model (a slurry store, a meal bin).
 * - `MACHINE` / `INPUT` / `STORAGE` — no backing entity exists yet. A
 *   `SubjectRef` of one of these kinds is valid TypeScript today but has
 *   nothing real to resolve against — exactly the same "declared ahead of
 *   a backing entity" situation `src/domain/types.ts`'s own
 *   `ConcentrateFeedSpec` already documents for itself ("not yet a stored
 *   farm entity ... a parameter shape ... to accept, not a Field/
 *   LivestockGroup addition").
 */
export const SUBJECT_TYPE_NOTES: Record<SubjectType, string> = {
  FARM: "Farm (src/domain/types.ts)",
  FIELD: "Field (src/domain/types.ts)",
  ANIMAL: "IndividualAnimal (src/domain/types.ts)",
  ANIMAL_GROUP: "LivestockGroup (src/domain/types.ts) — already the AnimalGroup anchor",
  BUILDING: "Housing (src/domain/types.ts) is the closest existing entity, not a guaranteed 1:1 match",
  MACHINE: "no backing entity yet",
  INPUT: "no backing entity yet",
  STORAGE: "no backing entity yet",
};

/**
 * A minimal, farm-scoped pointer to one real (or eventually-real) Farm
 * Return entity. Deliberately just `{ type, id }` — no denormalised name/
 * label, no embedded farm id. This is not an accident of laziness: a
 * `SubjectRef` is a *reference*, not a snapshot, and the non-negotiable
 * farm-scoping invariant (`CHECKPOINT_1_5_ARCHITECTURE.md`) is enforced
 * by whoever *resolves* a `SubjectRef` against real, farm-scoped storage
 * (the same `.eq("farm_id", farmId)` discipline every real farm-data
 * query in this app already uses — e.g. `getWeightObservationById`,
 * `src/lib/farm-data/individual-animals.ts`), never by trusting a field on
 * this object itself. A `SubjectRef` carrying its own claimed `farmId`
 * would be exactly the kind of client-suppliable ownership claim
 * `CLAUDE.md`/this checkpoint's brief says never to trust.
 */
export interface SubjectRef {
  type: SubjectType;
  id: string;
}

export function subjectRef(type: SubjectType, id: string): SubjectRef {
  return { type, id };
}

export function isSameSubject(a: SubjectRef, b: SubjectRef): boolean {
  return a.type === b.type && a.id === b.id;
}
