/**
 * The real "Edit animal details" correction (date of birth, sex, breed): what the browser may send, the server's own
 * validation of it, and the farmer-facing words (pure; no Supabase, no clock). The tag isn't editable here: it is the
 * animal's external identifier in the C1 ledger and the application has no tag-change contract.
 *
 * Record semantics: a correction is APPENDED (`livestock_individual_identity_corrections`) and becomes a C1 assertion
 * superseding the previous one (`real-records.ts`). The original row, earlier corrections and every weight stay as
 * recorded — nothing historical is replaced.
 */

import type { RealEvaluation } from "./real-service";
import { isCalendarDate, isUuid } from "./record-weight";

export const ANIMAL_DETAILS_SOURCE = "Farmer correction";

export const BREED_MAX_LENGTH = 80;

export type AnimalDetailsRefusal =
  | "INVALID_REQUEST"
  | "NOTHING_TO_CHANGE"
  | "INVALID_DATE"
  | "FUTURE_DATE"
  | "INVALID_SEX"
  | "INVALID_BREED"
  | "DEMO_MODE"
  | "NOT_SIGNED_IN"
  | "ANIMAL_NOT_FOUND"
  | "WRITE_FAILED";

export type AnimalDetailsResult = { ok: true; changed: number } | { ok: false; reason: AnimalDetailsRefusal; message: string };

/** Farmer-facing words for each refusal (never mentions another farm, or whether an id exists elsewhere). */
export const ANIMAL_DETAILS_MESSAGES: Readonly<Record<AnimalDetailsRefusal, string>> = {
  INVALID_REQUEST: "These details couldn't be saved. Reload the page and try again.",
  NOTHING_TO_CHANGE: "Enter a date of birth, sex or breed to save.",
  INVALID_DATE: "Enter a real date of birth.",
  FUTURE_DATE: "The date of birth can't be later than today.",
  INVALID_SEX: "Choose male or female.",
  INVALID_BREED: `Enter the breed in up to ${BREED_MAX_LENGTH} characters.`,
  DEMO_MODE: "Animal details can't be saved here.",
  NOT_SIGNED_IN: "Sign in to correct an animal's details.",
  ANIMAL_NOT_FOUND: "This animal isn't on your farm's records, so nothing was saved.",
  WRITE_FAILED: "The details couldn't be saved. Nothing was recorded — try again.",
};

export const refuseDetails = (reason: AnimalDetailsRefusal): AnimalDetailsResult => ({ ok: false, reason, message: ANIMAL_DETAILS_MESSAGES[reason] });

export function animalDetailsSavedMessage(changed: number): string {
  return changed === 0 ? "Those details were already recorded. Nothing was changed." : "Details saved. The animal's earlier values stay in its history as corrected.";
}

export interface AnimalDetailsRequest {
  animalId: string;
  dateOfBirth?: string;
  sex?: "male" | "female";
  breed?: string;
}

/**
 * Validates an untrusted request against the farmer's `today` (Ireland). Only `animalId` plus any of `dateOfBirth`,
 * `sex`, `breed` may be sent (no farm id, no source); an absent or `null` field is left as recorded.
 */
export function readAnimalDetailsRequest(raw: unknown, today: string): { ok: true; request: AnimalDetailsRequest } | { ok: false; reason: AnimalDetailsRefusal } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "INVALID_REQUEST" };
  const r = raw as Record<string, unknown>;
  const allowed = new Set(["animalId", "dateOfBirth", "sex", "breed"]);
  if (Object.keys(r).some((k) => !allowed.has(k))) return { ok: false, reason: "INVALID_REQUEST" };
  if (!isUuid(r.animalId)) return { ok: false, reason: "INVALID_REQUEST" };
  const request: AnimalDetailsRequest = { animalId: r.animalId.toLowerCase() };
  if (r.dateOfBirth !== undefined && r.dateOfBirth !== null) {
    if (!isCalendarDate(r.dateOfBirth)) return { ok: false, reason: "INVALID_DATE" };
    if (r.dateOfBirth > today) return { ok: false, reason: "FUTURE_DATE" };
    request.dateOfBirth = r.dateOfBirth;
  }
  if (r.sex !== undefined && r.sex !== null) {
    if (r.sex !== "male" && r.sex !== "female") return { ok: false, reason: "INVALID_SEX" };
    request.sex = r.sex;
  }
  if (r.breed !== undefined && r.breed !== null) {
    if (typeof r.breed !== "string") return { ok: false, reason: "INVALID_BREED" };
    const breed = r.breed.trim();
    if (breed.length === 0 || breed.length > BREED_MAX_LENGTH) return { ok: false, reason: "INVALID_BREED" };
    request.breed = breed;
  }
  if (request.dateOfBirth === undefined && request.sex === undefined && request.breed === undefined) return { ok: false, reason: "NOTHING_TO_CHANGE" };
  return { ok: true, request };
}

export interface AnimalIdentityValues {
  dateOfBirth: string | null;
  sex: "male" | "female" | null;
  breed: string | null;
}

/** Only the facts that actually differ from the current values are appended (a repeat save writes nothing). */
export function identityCorrectionsFor(request: AnimalDetailsRequest, current: AnimalIdentityValues): { fact: "date_of_birth" | "sex" | "breed"; value: string }[] {
  const out: { fact: "date_of_birth" | "sex" | "breed"; value: string }[] = [];
  if (request.dateOfBirth !== undefined && request.dateOfBirth !== current.dateOfBirth) out.push({ fact: "date_of_birth", value: request.dateOfBirth });
  if (request.sex !== undefined && request.sex !== current.sex) out.push({ fact: "sex", value: request.sex });
  if (request.breed !== undefined && request.breed !== current.breed) out.push({ fact: "breed", value: request.breed });
  return out;
}

/** The edit form's starting values: the animal's current facts as the C1 ledger resolves them (corrections applied). */
export interface AnimalDetailsEdit extends AnimalIdentityValues {
  animalId: string;
  /** The farmer's calendar date: no later date of birth is accepted. */
  today: string;
}

export function animalDetailsEditOf(e: RealEvaluation, animalId: string, today: string): AnimalDetailsEdit | null {
  if (!e.outputs.ledgers.some((l) => l.animalId === animalId)) return null;
  const snap = e.outputs.snapshots[animalId] ?? null;
  const sex = snap?.sex.state === "KNOWN" ? snap.sex.value : null;
  return {
    animalId,
    dateOfBirth: snap?.dateOfBirth.state === "KNOWN" ? snap.dateOfBirth.value : null,
    sex: sex === "MALE" ? "male" : sex === "FEMALE" ? "female" : null,
    breed: snap?.breed.state === "KNOWN" ? (snap.breed.value?.label ?? null) : null,
    today,
  };
}
