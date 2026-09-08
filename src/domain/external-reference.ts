/**
 * Farm Return Next — Checkpoint 1.5 (Intelligence & Extensibility
 * Architecture). A minimal, farm-scoped mapping from a Farm Return
 * subject to an id in some *other* system — so a future integration
 * (government animal system, EID reader, weigh head, accounting package,
 * machinery telemetry, laboratory system) has one consistent place to put
 * its own id, instead of a bespoke `*Id`/`*Ref` column being added to
 * whichever domain type happens to need it first.
 *
 * **No integration is implemented here.** This is a TypeScript contract
 * only — there is no database table, no migration, and nothing in this
 * app currently constructs a real `ExternalReference`. It exists so that
 * *when* a real integration is built, it has a shape to target rather
 * than inventing its own ad hoc one under time pressure.
 *
 * **Deliberately not a generic polymorphic database column.** This
 * codebase has already made, and documented, exactly this call once:
 * `supabase/migrations/20260829020000_jobs_weight_observation_reference.sql`'s
 * own header comment rejected a `jobs.target_type`/`target_id`
 * polymorphic pair "invented here for one job type alone" in favour of a
 * narrow, single-purpose, same-farm-enforced foreign key — explicitly
 * leaving room for "a future migration [to] add the general target_type/
 * target_id pair alongside this column" once a real need justifies it.
 * `ExternalReference` is that future general shape, kept at the
 * TypeScript-contract stage until a real external system actually needs
 * it persisted — at which point its own migration would need the same
 * same-farm trigger discipline every other farm-scoped table already has
 * (`livestock_individuals_check_same_farm`, `job_sessions_check_same_farm`,
 * ... — `supabase/migrations/20260828070000_cross_farm_integrity.sql`),
 * checked against whatever real entity `subject` resolves to, not merely
 * against a bare `farm_id` column with no such check.
 */

import type { SubjectRef } from "./subject";

export type ExternalSystemKind =
  | "government_animal_system"
  | "eid"
  | "weigh_head"
  | "accounting"
  | "machinery_telemetry"
  | "laboratory_system"
  | "other";

export interface ExternalReference {
  /** Required on every instance — see this module's own header comment:
   * a `SubjectRef` alone carries no farm, so this is the one place an
   * `ExternalReference` states which farm it belongs to. A future
   * persisted table backing this type must still re-verify it against
   * `subject`'s own real owning farm via a database trigger, exactly like
   * every other farm-scoped table already does — this field is not
   * itself the enforcement, only the record of it. */
  farmId: string;
  subject: SubjectRef;
  system: ExternalSystemKind;
  /** The id as that external system knows it — an EID tag number, a
   * weigh-head device serial, an accounting package's own customer/item
   * code. Opaque to Farm Return; never parsed or assumed to follow any
   * particular format. */
  externalId: string;
  /** When Farm Return first captured/linked this reference (ISO
   * datetime), not when the external system itself issued the id. */
  capturedAt?: string;
  /** Human-readable provenance, e.g. "Farmer entered", "Imported from
   * herd register CSV". */
  source?: string;
}

export function externalReference(
  farmId: string,
  subject: SubjectRef,
  system: ExternalSystemKind,
  externalId: string,
  extra: Partial<Omit<ExternalReference, "farmId" | "subject" | "system" | "externalId">> = {},
): ExternalReference {
  return { farmId, subject, system, externalId, ...extra };
}
