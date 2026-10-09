/**
 * Cattle C1 — canonical animal identity and the append-only animal ledger.
 *
 * Every bovine has an immutable Farm Return internal id (`FarmReturnAnimalId`).
 * External identifiers (official tag, electronic id, management id, ...) are
 * dated assertions in the ledger, never the animal's primary identity: a
 * changed external identifier never creates a new Farm Return animal and an
 * old one is never erased.
 *
 * The ledger holds FACTS and OBSERVATIONS OF STATE only — date of birth,
 * biological sex, source-described breed, external identifiers, physical
 * location, management group and neutral lifecycle (presence) status. Each
 * assertion carries operational provenance (where Farm Return learned it and
 * when), distinct from C0's `CattleEvidenceSource` (which justifies rules).
 * No source category implies a connected integration.
 *
 * Bitemporal: `provenance.receivedAt` is KNOWLEDGE time (when Farm Return
 * learned the information); `validFrom`/`validTo` (or the fact's own value,
 * e.g. a date of birth) is VALID time. Intervals are inclusive start /
 * exclusive end. All times are strict UTC ISO strings — no `Date` objects.
 *
 * Append-only: a correction is a new assertion that `supersedes` earlier
 * assertion ids; nothing is deleted or rewritten. Re-supplying an assertion
 * id with identical content is idempotent; the same id with different content
 * is rejected, never overwritten. Caller input is materialised (cloned once,
 * then validated and rebuilt from known fields) and the ledger is deep-frozen,
 * so later caller mutation cannot rewrite retained evidence.
 */

import { canonicalizeValue } from "../assessment-integrity";
import { isValidIsoUtcDateTime } from "../iso-datetime";
import { compareStrings } from "./integrity";
import { isValidCalendarDate } from "./rule";

export const CATTLE_ANIMAL_LEDGER_SCHEMA_VERSION = 1;

export const BOVINE_SPECIES = "BOVINE" as const;
export type AnimalSpecies = typeof BOVINE_SPECIES;

/** Immutable Farm Return internal animal id — the only primary identity. */
export type FarmReturnAnimalId = string & { readonly __farmReturnAnimalId: true };

/** Opaque id: non-empty, no surrounding whitespace. No external format rule. */
export function isOpaqueRef(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

export function toFarmReturnAnimalId(value: string): FarmReturnAnimalId | null {
  return isOpaqueRef(value) ? (value as FarmReturnAnimalId) : null;
}

/** Where Farm Return learned a fact. A category never implies a live integration. */
export const ANIMAL_DATA_SOURCE_CATEGORIES = [
  "OFFICIAL_REGISTRY",
  "BREEDING_PERFORMANCE_DATABASE",
  "FARMER",
  "VETERINARY_SOURCE",
  "DEVICE",
  "EXTERNAL_FARM_SOFTWARE",
  "MART_MARKET",
  "PROCESSOR",
  "OTHER",
] as const;
export type AnimalDataSourceCategory = (typeof ANIMAL_DATA_SOURCE_CATEGORIES)[number];

/** Operational animal-data provenance (not a C0 rule evidence source). */
export interface AnimalDataProvenance {
  sourceCategory: AnimalDataSourceCategory;
  /** Opaque name of the originating system, if any. */
  sourceSystem: string | null;
  /** Opaque record reference within that system, if one exists. */
  sourceRecordRef: string | null;
  /** When the source says it observed/recorded the information, if supplied. */
  observedAt: string | null;
  /** KNOWLEDGE time: when Farm Return received the information. Required. */
  receivedAt: string;
  /** Opaque actor/origin reference, if appropriate. */
  actor: string | null;
}

/** Biological sex only — never a production class. */
export const BIOLOGICAL_SEXES = ["FEMALE", "MALE"] as const;
export type BiologicalSex = (typeof BIOLOGICAL_SEXES)[number];

/** A source-provided breed code/label; never a hard-coded breed enum. */
export interface BreedComponent {
  codeSystem: string | null;
  code: string | null;
  label: string | null;
  /** Source-provided proportion text, preserved verbatim, never interpreted. */
  sourceProportion: string | null;
}

export interface BreedDescription {
  codeSystem: string | null;
  code: string | null;
  label: string | null;
  /** Source-provided mixed/composite components, if any (sorted canonically). */
  components: BreedComponent[];
}

export const ANIMAL_LOCATION_KINDS = ["HOLDING", "FIELD", "HOUSING", "EXTERNAL", "OTHER"] as const;
export type AnimalLocationKind = (typeof ANIMAL_LOCATION_KINDS)[number];

/** Opaque reference to a (future) Farm Return location. */
export interface AnimalLocationRef {
  kind: AnimalLocationKind;
  ref: string;
}

export interface ExternalIdentifierValue {
  /** Opaque identifier scheme, e.g. a source-defined scheme name. */
  scheme: string;
  /** Identifier exactly as supplied — no format rule, no normalisation. */
  identifier: string;
}

/** Neutral physical presence status in the relevant holding context. */
export const ANIMAL_PRESENCE_STATUSES = ["PRESENT", "DEPARTED", "DECEASED"] as const;
export type AnimalPresenceStatus = (typeof ANIMAL_PRESENCE_STATUSES)[number];

interface AssertionEnvelope {
  assertionId: string;
  animalId: FarmReturnAnimalId;
  provenance: AnimalDataProvenance;
  /** Earlier assertion ids (same animal, same kind) this assertion corrects. Sorted. */
  supersedes: string[];
}

/** Valid-time interval: inclusive `validFrom`, exclusive `validTo` (`null` = open). */
export interface ValidInterval {
  validFrom: string;
  validTo: string | null;
}

/** `value: null` on an identity fact = the source explicitly reported it unknown. */
export type AnimalAssertion =
  | (AssertionEnvelope & { kind: "DATE_OF_BIRTH"; value: string | null })
  | (AssertionEnvelope & { kind: "SEX"; value: BiologicalSex | null })
  | (AssertionEnvelope & { kind: "BREED"; value: BreedDescription | null })
  | (AssertionEnvelope & ValidInterval & { kind: "EXTERNAL_IDENTIFIER"; value: ExternalIdentifierValue })
  | (AssertionEnvelope & ValidInterval & { kind: "LOCATION"; value: AnimalLocationRef })
  | (AssertionEnvelope & ValidInterval & { kind: "MANAGEMENT_GROUP"; value: string })
  | (AssertionEnvelope & ValidInterval & { kind: "LIFECYCLE_STATUS"; value: AnimalPresenceStatus });

export type AnimalAssertionKind = AnimalAssertion["kind"];

export const ANIMAL_ASSERTION_KINDS: readonly AnimalAssertionKind[] = [
  "DATE_OF_BIRTH",
  "SEX",
  "BREED",
  "EXTERNAL_IDENTIFIER",
  "LOCATION",
  "MANAGEMENT_GROUP",
  "LIFECYCLE_STATUS",
];

export const IDENTITY_FACT_KINDS = ["DATE_OF_BIRTH", "SEX", "BREED"] as const;
export const INTERVAL_KINDS = ["EXTERNAL_IDENTIFIER", "LOCATION", "MANAGEMENT_GROUP", "LIFECYCLE_STATUS"] as const;

export type AnimalProvenanceInput = Pick<AnimalDataProvenance, "sourceCategory" | "receivedAt"> &
  Partial<Omit<AnimalDataProvenance, "sourceCategory" | "receivedAt">>;

type InputOf<A> = A extends { validTo: string | null }
  ? Omit<A, "supersedes" | "provenance" | "animalId" | "validTo"> & {
      animalId: string;
      supersedes?: string[];
      provenance: AnimalProvenanceInput;
      validTo?: string | null;
    }
  : A extends AnimalAssertion
    ? Omit<A, "supersedes" | "provenance" | "animalId"> & { animalId: string; supersedes?: string[]; provenance: AnimalProvenanceInput }
    : never;

/** Caller-supplied assertion; optional fields materialise to explicit `null`/`[]`. */
export type AnimalAssertionInput = InputOf<AnimalAssertion>;

export interface AnimalLedger {
  ledgerSchemaVersion: typeof CATTLE_ANIMAL_LEDGER_SCHEMA_VERSION;
  animalId: FarmReturnAnimalId;
  species: AnimalSpecies;
  /** Deep-frozen, sorted by `assertionId` (insertion order never matters). */
  assertions: readonly AnimalAssertion[];
}

export type AnimalLedgerIssueCode =
  | "CATTLE_ANIMAL_INVALID_ANIMAL_ID"
  | "CATTLE_ANIMAL_INPUT_NOT_CLONEABLE"
  | "CATTLE_ANIMAL_INPUT_NOT_OBJECT"
  | "CATTLE_ANIMAL_INVALID_ASSERTION_ID"
  | "CATTLE_ANIMAL_ASSERTION_FOR_OTHER_ANIMAL"
  | "CATTLE_ANIMAL_UNKNOWN_ASSERTION_KIND"
  | "CATTLE_ANIMAL_INVALID_PROVENANCE"
  | "CATTLE_ANIMAL_INVALID_SUPERSEDES"
  | "CATTLE_ANIMAL_SELF_SUPERSESSION"
  | "CATTLE_ANIMAL_INVALID_VALUE"
  | "CATTLE_ANIMAL_INVALID_INTERVAL"
  | "CATTLE_ANIMAL_DUPLICATE_ID_DIFFERENT_CONTENT";

export interface AnimalLedgerIssue {
  code: AnimalLedgerIssueCode;
  assertionId: string | null;
  /** Position in the supplied input sequence, when applicable. */
  inputIndex: number | null;
}

export type AnimalLedgerResult =
  | { ok: true; ledger: AnimalLedger; idempotentDuplicateIds: string[] }
  | { ok: false; issues: AnimalLedgerIssue[] };

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

/** Strict UTC instant (`YYYY-MM-DDTHH:MM:SS[.f{1,9}]Z`). */
export function isValidAnimalInstant(value: unknown): value is string {
  return typeof value === "string" && INSTANT_PATTERN.test(value) && isValidIsoUtcDateTime(value);
}

/** Fixed-width sortable key so fractional-second spelling cannot reorder instants. */
function instantKey(value: string): string {
  const match = INSTANT_PATTERN.exec(value);
  if (!match) throw new Error(`cattle animal: invalid instant ${value}`);
  return `${match[1]}.${(match[2] ?? "").padEnd(9, "0")}`;
}

export function compareInstants(a: string, b: string): number {
  return compareStrings(instantKey(a), instantKey(b));
}

/** Inclusive start, exclusive end. */
export function intervalCovers(interval: ValidInterval, at: string): boolean {
  return compareInstants(interval.validFrom, at) <= 0 && (interval.validTo === null || compareInstants(at, interval.validTo) < 0);
}

// ---------------------------------------------------------------------------
// Materialisation
// ---------------------------------------------------------------------------

/** Recursively freezes a plain-data value in place and returns it. */
export function deepFreezeAnimalValue<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreezeAnimalValue((value as Record<string, unknown>)[key]);
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalRef(value: unknown): { ok: boolean; value: string | null } {
  if (value === undefined || value === null) return { ok: true, value: null };
  return isOpaqueRef(value) ? { ok: true, value } : { ok: false, value: null };
}

function materialiseProvenance(raw: unknown): AnimalDataProvenance | null {
  if (!isPlainRecord(raw)) return null;
  const category = raw.sourceCategory;
  if (typeof category !== "string" || !(ANIMAL_DATA_SOURCE_CATEGORIES as readonly string[]).includes(category)) return null;
  if (!isValidAnimalInstant(raw.receivedAt)) return null;
  const observedAt = raw.observedAt ?? null;
  if (observedAt !== null && !isValidAnimalInstant(observedAt)) return null;
  const system = optionalRef(raw.sourceSystem);
  const record = optionalRef(raw.sourceRecordRef);
  const actor = optionalRef(raw.actor);
  if (!system.ok || !record.ok || !actor.ok) return null;
  return {
    sourceCategory: category as AnimalDataSourceCategory,
    sourceSystem: system.value,
    sourceRecordRef: record.value,
    observedAt: observedAt as string | null,
    receivedAt: raw.receivedAt as string,
    actor: actor.value,
  };
}

function materialiseBreedComponent(raw: unknown): BreedComponent | null {
  if (!isPlainRecord(raw)) return null;
  const codeSystem = optionalRef(raw.codeSystem);
  const code = optionalRef(raw.code);
  const label = optionalRef(raw.label);
  const proportion = optionalRef(raw.sourceProportion);
  if (!codeSystem.ok || !code.ok || !label.ok || !proportion.ok) return null;
  if (code.value === null && label.value === null) return null;
  return { codeSystem: codeSystem.value, code: code.value, label: label.value, sourceProportion: proportion.value };
}

function materialiseBreed(raw: unknown): BreedDescription | null {
  if (!isPlainRecord(raw)) return null;
  const codeSystem = optionalRef(raw.codeSystem);
  const code = optionalRef(raw.code);
  const label = optionalRef(raw.label);
  if (!codeSystem.ok || !code.ok || !label.ok) return null;
  const rawComponents = raw.components ?? [];
  if (!Array.isArray(rawComponents)) return null;
  const components: BreedComponent[] = [];
  for (const c of rawComponents) {
    const component = materialiseBreedComponent(c);
    if (!component) return null;
    components.push(component);
  }
  if (code.value === null && label.value === null && components.length === 0) return null;
  components.sort((a, b) => compareStrings(canonicalizeValue(a), canonicalizeValue(b)));
  return { codeSystem: codeSystem.value, code: code.value, label: label.value, components };
}

type ValueResult = { ok: true; value: unknown } | { ok: false };

function materialiseValue(kind: AnimalAssertionKind, raw: unknown): ValueResult {
  const fail: ValueResult = { ok: false };
  switch (kind) {
    case "DATE_OF_BIRTH":
      if (raw === null) return { ok: true, value: null };
      return typeof raw === "string" && isValidCalendarDate(raw) ? { ok: true, value: raw } : fail;
    case "SEX":
      if (raw === null) return { ok: true, value: null };
      return typeof raw === "string" && (BIOLOGICAL_SEXES as readonly string[]).includes(raw) ? { ok: true, value: raw } : fail;
    case "BREED": {
      if (raw === null) return { ok: true, value: null };
      const breed = materialiseBreed(raw);
      return breed ? { ok: true, value: breed } : fail;
    }
    case "EXTERNAL_IDENTIFIER":
      if (!isPlainRecord(raw) || !isOpaqueRef(raw.scheme) || !isOpaqueRef(raw.identifier)) return fail;
      return { ok: true, value: { scheme: raw.scheme, identifier: raw.identifier } };
    case "LOCATION":
      if (!isPlainRecord(raw) || typeof raw.kind !== "string" || !isOpaqueRef(raw.ref)) return fail;
      if (!(ANIMAL_LOCATION_KINDS as readonly string[]).includes(raw.kind)) return fail;
      return { ok: true, value: { kind: raw.kind, ref: raw.ref } };
    case "MANAGEMENT_GROUP":
      return isOpaqueRef(raw) ? { ok: true, value: raw } : fail;
    case "LIFECYCLE_STATUS":
      return typeof raw === "string" && (ANIMAL_PRESENCE_STATUSES as readonly string[]).includes(raw) ? { ok: true, value: raw } : fail;
  }
}

function isIntervalKind(kind: AnimalAssertionKind): boolean {
  return (INTERVAL_KINDS as readonly string[]).includes(kind);
}

function materialiseAssertion(
  animalId: FarmReturnAnimalId,
  input: unknown,
  inputIndex: number,
): { assertion: AnimalAssertion } | { issues: AnimalLedgerIssue[] } {
  let raw: unknown;
  try {
    // One read of the caller's object (getters run once); everything below
    // reads the private copy only.
    raw = structuredClone(input);
  } catch {
    return { issues: [{ code: "CATTLE_ANIMAL_INPUT_NOT_CLONEABLE", assertionId: null, inputIndex }] };
  }
  if (!isPlainRecord(raw)) return { issues: [{ code: "CATTLE_ANIMAL_INPUT_NOT_OBJECT", assertionId: null, inputIndex }] };
  const assertionId = isOpaqueRef(raw.assertionId) ? raw.assertionId : null;
  const issue = (code: AnimalLedgerIssueCode): AnimalLedgerIssue => ({ code, assertionId, inputIndex });
  const issues: AnimalLedgerIssue[] = [];
  if (assertionId === null) issues.push(issue("CATTLE_ANIMAL_INVALID_ASSERTION_ID"));
  if (raw.animalId !== animalId) issues.push(issue("CATTLE_ANIMAL_ASSERTION_FOR_OTHER_ANIMAL"));
  const kind = raw.kind;
  if (typeof kind !== "string" || !(ANIMAL_ASSERTION_KINDS as readonly string[]).includes(kind)) {
    issues.push(issue("CATTLE_ANIMAL_UNKNOWN_ASSERTION_KIND"));
    return { issues };
  }
  const typedKind = kind as AnimalAssertionKind;
  const provenance = materialiseProvenance(raw.provenance);
  if (!provenance) issues.push(issue("CATTLE_ANIMAL_INVALID_PROVENANCE"));
  const rawSupersedes = raw.supersedes ?? [];
  let supersedes: string[] = [];
  if (!Array.isArray(rawSupersedes) || !rawSupersedes.every(isOpaqueRef) || new Set(rawSupersedes).size !== rawSupersedes.length) {
    issues.push(issue("CATTLE_ANIMAL_INVALID_SUPERSEDES"));
  } else {
    supersedes = [...(rawSupersedes as string[])].sort(compareStrings);
    if (assertionId !== null && supersedes.includes(assertionId)) issues.push(issue("CATTLE_ANIMAL_SELF_SUPERSESSION"));
  }
  const value = materialiseValue(typedKind, raw.value);
  if (!value.ok) issues.push(issue("CATTLE_ANIMAL_INVALID_VALUE"));
  let interval: ValidInterval | null = null;
  if (isIntervalKind(typedKind)) {
    const validTo = raw.validTo ?? null;
    if (!isValidAnimalInstant(raw.validFrom) || (validTo !== null && !isValidAnimalInstant(validTo))) {
      issues.push(issue("CATTLE_ANIMAL_INVALID_INTERVAL"));
    } else if (validTo !== null && compareInstants(raw.validFrom, validTo as string) >= 0) {
      issues.push(issue("CATTLE_ANIMAL_INVALID_INTERVAL"));
    } else {
      interval = { validFrom: raw.validFrom, validTo: validTo as string | null };
    }
  }
  if (issues.length > 0 || !provenance || !value.ok || assertionId === null) return { issues };
  const envelope = { assertionId, animalId, provenance, supersedes };
  const assertion = (interval ? { ...envelope, kind: typedKind, value: value.value, ...interval } : { ...envelope, kind: typedKind, value: value.value }) as AnimalAssertion;
  return { assertion };
}

/** Canonical content used for duplicate-id comparison (every field). */
export function assertionContentKey(assertion: AnimalAssertion): string {
  return canonicalizeValue(assertion);
}

/**
 * Builds a validated, deep-frozen ledger. Input order never matters. Any
 * invalid assertion, or a reused id with different content, fails the whole
 * build (fail closed) — nothing is partially applied or overwritten.
 */
export function createAnimalLedger(animalId: string, inputs: readonly unknown[] = []): AnimalLedgerResult {
  const id = toFarmReturnAnimalId(animalId);
  if (!id) return { ok: false, issues: [{ code: "CATTLE_ANIMAL_INVALID_ANIMAL_ID", assertionId: null, inputIndex: null }] };
  const issues: AnimalLedgerIssue[] = [];
  const byId = new Map<string, { assertion: AnimalAssertion; key: string }>();
  const duplicates = new Set<string>();
  const conflicted = new Set<string>();
  const list = Array.from(inputs);
  list.forEach((input, index) => {
    const result = materialiseAssertion(id, input, index);
    if ("issues" in result) {
      issues.push(...result.issues);
      return;
    }
    const { assertion } = result;
    const key = assertionContentKey(assertion);
    const existing = byId.get(assertion.assertionId);
    if (!existing) {
      byId.set(assertion.assertionId, { assertion, key });
    } else if (existing.key === key) {
      duplicates.add(assertion.assertionId);
    } else if (!conflicted.has(assertion.assertionId)) {
      conflicted.add(assertion.assertionId);
      issues.push({ code: "CATTLE_ANIMAL_DUPLICATE_ID_DIFFERENT_CONTENT", assertionId: assertion.assertionId, inputIndex: index });
    }
  });
  if (issues.length > 0) return { ok: false, issues };
  const assertions = [...byId.values()].map((e) => e.assertion).sort((a, b) => compareStrings(a.assertionId, b.assertionId));
  const ledger: AnimalLedger = {
    ledgerSchemaVersion: CATTLE_ANIMAL_LEDGER_SCHEMA_VERSION,
    animalId: id,
    species: BOVINE_SPECIES,
    assertions,
  };
  return { ok: true, ledger: deepFreezeAnimalValue(ledger), idempotentDuplicateIds: [...duplicates].sort(compareStrings) };
}

/**
 * Appends assertions, returning a NEW ledger (the supplied one is never
 * modified). The existing ledger is re-validated and re-materialised, so a
 * hand-built or aliased ledger object cannot bypass validation.
 */
export function appendAnimalAssertions(ledger: AnimalLedger, inputs: readonly unknown[]): AnimalLedgerResult {
  return createAnimalLedger(ledger.animalId, [...ledger.assertions, ...Array.from(inputs)]);
}
