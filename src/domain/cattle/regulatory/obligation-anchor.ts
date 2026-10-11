/**
 * Cattle C2 — C1 animal state as C0 rule inputs, and obligation occurrences.
 *
 * Inputs: a C1 `AnimalSnapshot` is exposed to C0 rule evaluation under fixed,
 * documented input keys. Only KNOWN dimensions produce input items (one per
 * supporting C1 assertion, with that assertion as provenance), so an
 * UNKNOWN, conflicting or invalid C1 dimension reaches C0 as MISSING and can
 * never be read as a default. The engine separately reads each referenced
 * dimension's C1 state to report UNKNOWN / EVIDENCE_CONFLICT /
 * INVALID_EVIDENCE precisely. Identity facts (species, date of birth, sex,
 * external identifiers) are FACT; presence status, location and management
 * group are OBSERVATION. Breed is not exposed (no breed rule is in scope).
 *
 * Occurrences: an anchor is resolved from C1 at the query's knowledge cutoff.
 * - DATE_OF_BIRTH: one occurrence at the UTC start of the C1 birth date.
 * - LIFECYCLE_STATUS_START / LOCATION_START: an occurrence at instant `t`
 *   when a live (unsuperseded) C1 assertion matching the anchor starts at `t`,
 *   C1 resolves the dimension at `t` as KNOWN and matching, and at the
 *   instant just before `t` it was not KNOWN with the same value (a
 *   continuation is not a new start). A conflicting or invalid C1 state at
 *   `t` or just before it makes that occurrence's anchor CONFLICT / INVALID —
 *   never a known start. No C1 evidence of the dimension at all is UNKNOWN;
 *   evidence with no matching start is NOT_TRIGGERED (no trigger in the
 *   known record — never "not applicable") only when the dimension itself is
 *   resolved: C1 is probed at the query and at every live assertion's
 *   `validFrom`/`validTo`; an invalid or conflicting state at any probe, or an
 *   UNKNOWN state at the query or at a probe not after it, is INVALID /
 *   CONFLICT / UNKNOWN instead (precedence in that order). With occurrences,
 *   the same probe result is reported as `dimensionState`.
 */

import { canonicalizeValue } from "../../assessment-integrity";
import { BOVINE_SPECIES, compareInstants, type AnimalLedger, type AnimalLocationRef } from "../animal-ledger";
import { animalAssertionHistory, projectAnimalSnapshot, type AnimalResolution, type AnimalResolutionState, type AnimalSnapshot } from "../animal-snapshot";
import type { CattleInputItem, CattleInputScalar } from "../information";
import { compareStrings, sortedUnique } from "../integrity";
import type { ObligationAnchor, ObligationAnchorKind } from "./obligation-definition";
import { canonicalObligationInstant, obligationInstantJustBefore, utcStartOfCalendarDate } from "./obligation-time";

export const OBLIGATION_ANIMAL_INPUT_KEYS = {
  SPECIES: "cattle.animal.species",
  DATE_OF_BIRTH: "cattle.animal.dateOfBirth",
  SEX: "cattle.animal.sex",
  LIFECYCLE_STATUS: "cattle.animal.lifecycleStatus",
  LOCATION_KIND: "cattle.animal.location.kind",
  LOCATION_REF: "cattle.animal.location.ref",
  MANAGEMENT_GROUP: "cattle.animal.managementGroup",
} as const;

/** Per-scheme external identifier input key: prefix + opaque scheme. */
export const OBLIGATION_EXTERNAL_IDENTIFIER_INPUT_PREFIX = "cattle.animal.externalIdentifier.";

export interface ObligationAnimalInputDimension {
  inputKey: string;
  informationClass: "FACT" | "OBSERVATION";
  state: AnimalResolutionState;
}

export interface ObligationAnimalInputs {
  /** Items for KNOWN dimensions only (sorted by key, then provenance ref). */
  items: CattleInputItem[];
  dimensions: ObligationAnimalInputDimension[];
}

function itemsOf(
  inputKey: string,
  informationClass: "FACT" | "OBSERVATION",
  resolution: AnimalResolution<unknown>,
  valueOf: (value: unknown) => CattleInputScalar,
): CattleInputItem[] {
  if (resolution.state !== "KNOWN") return [];
  return resolution.evidence
    .filter((a) => a.value !== null)
    .map((a) => ({
      inputKey,
      value: valueOf(a.kind === "EXTERNAL_IDENTIFIER" ? a.value.identifier : a.value),
      unit: null,
      informationClass,
      provenance: { kind: "CANONICAL_RECORD" as const, ref: a.assertionId, recordedAt: a.provenance.receivedAt },
    }));
}

/** C1 snapshot -> C0 input items plus each exposed dimension's C1 state. */
export function obligationInputsFromSnapshot(snapshot: AnimalSnapshot): ObligationAnimalInputs {
  const K = OBLIGATION_ANIMAL_INPUT_KEYS;
  const scalar = (v: unknown) => v as CattleInputScalar;
  const dims: ObligationAnimalInputDimension[] = [
    { inputKey: K.SPECIES, informationClass: "FACT", state: "KNOWN" },
    { inputKey: K.DATE_OF_BIRTH, informationClass: "FACT", state: snapshot.dateOfBirth.state },
    { inputKey: K.SEX, informationClass: "FACT", state: snapshot.sex.state },
    { inputKey: K.LIFECYCLE_STATUS, informationClass: "OBSERVATION", state: snapshot.lifecycleStatus.state },
    { inputKey: K.LOCATION_KIND, informationClass: "OBSERVATION", state: snapshot.location.state },
    { inputKey: K.LOCATION_REF, informationClass: "OBSERVATION", state: snapshot.location.state },
    { inputKey: K.MANAGEMENT_GROUP, informationClass: "OBSERVATION", state: snapshot.managementGroup.state },
  ];
  const items: CattleInputItem[] = [
    {
      inputKey: K.SPECIES,
      value: BOVINE_SPECIES,
      unit: null,
      informationClass: "FACT",
      provenance: { kind: "CANONICAL_RECORD", ref: snapshot.animalId, recordedAt: null },
    },
    ...itemsOf(K.DATE_OF_BIRTH, "FACT", snapshot.dateOfBirth, scalar),
    ...itemsOf(K.SEX, "FACT", snapshot.sex, scalar),
    ...itemsOf(K.LIFECYCLE_STATUS, "OBSERVATION", snapshot.lifecycleStatus, scalar),
    ...itemsOf(K.LOCATION_KIND, "OBSERVATION", snapshot.location, (v) => (v as AnimalLocationRef).kind),
    ...itemsOf(K.LOCATION_REF, "OBSERVATION", snapshot.location, (v) => (v as AnimalLocationRef).ref),
    ...itemsOf(K.MANAGEMENT_GROUP, "OBSERVATION", snapshot.managementGroup, scalar),
  ];
  for (const scheme of snapshot.externalIdentifiers.byScheme) {
    const inputKey = `${OBLIGATION_EXTERNAL_IDENTIFIER_INPUT_PREFIX}${scheme.scheme}`;
    dims.push({ inputKey, informationClass: "FACT", state: scheme.state });
    items.push(...itemsOf(inputKey, "FACT", scheme as AnimalResolution<unknown>, scalar));
  }
  items.sort((a, b) => compareStrings(a.inputKey, b.inputKey) || compareStrings(a.provenance.ref, b.provenance.ref));
  dims.sort((a, b) => compareStrings(a.inputKey, b.inputKey));
  return { items, dimensions: dims };
}

/**
 * The C1 state behind an input key; `null` when the key is not a C1 key (the
 * engine cannot derive it). An identifier scheme absent from C1 is UNKNOWN.
 */
export function obligationInputDimensionState(inputs: ObligationAnimalInputs, inputKey: string): AnimalResolutionState | null {
  const dim = inputs.dimensions.find((d) => d.inputKey === inputKey);
  if (dim) return dim.state;
  return inputKey.startsWith(OBLIGATION_EXTERNAL_IDENTIFIER_INPUT_PREFIX) && inputKey.length > OBLIGATION_EXTERNAL_IDENTIFIER_INPUT_PREFIX.length ? "UNKNOWN" : null;
}

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------

export type ObligationAnchorState = "KNOWN" | "CONFLICT" | "INVALID";

export interface ObligationOccurrence {
  /** `<obligationId>|<anchorKind>|<canonical anchor instant>`. */
  occurrenceId: string;
  anchorKind: ObligationAnchorKind;
  /** Canonical anchor instant. */
  anchorAt: string;
  anchorState: ObligationAnchorState;
  /** C1 assertion ids establishing (or contesting) the anchor, sorted. */
  anchorAssertionIds: string[];
}

export type ObligationOccurrenceDerivation =
  | {
      status: "OCCURRENCES";
      occurrences: ObligationOccurrence[];
      /** Whole-dimension probe result (always KNOWN for DATE_OF_BIRTH). */
      dimensionState: "KNOWN" | "UNKNOWN" | "CONFLICT" | "INVALID";
      dimensionAssertionIds: string[];
    }
  | { status: "UNKNOWN" | "CONFLICT" | "INVALID" | "NOT_TRIGGERED"; anchorAssertionIds: string[] };

export function obligationOccurrenceId(obligationId: string, anchorKind: ObligationAnchorKind, anchorAt: string): string {
  return `${obligationId}|${anchorKind}|${anchorAt}`;
}

const ids = (r: AnimalResolution<unknown>) => sortedUnique(r.evidence.map((a) => a.assertionId));

/**
 * Derives the occurrences of `anchor` from a canonical (already
 * re-materialised) C1 ledger and its snapshot at the query.
 */
export function deriveObligationOccurrences(
  obligationId: string,
  anchor: ObligationAnchor,
  ledger: AnimalLedger,
  snapshot: AnimalSnapshot,
): ObligationOccurrenceDerivation {
  if (anchor.kind === "DATE_OF_BIRTH") {
    const dob = snapshot.dateOfBirth;
    if (dob.state === "INVALID_EVIDENCE") return { status: "INVALID", anchorAssertionIds: ids(dob) };
    if (dob.state === "CONFLICTING_EVIDENCE") return { status: "CONFLICT", anchorAssertionIds: ids(dob) };
    const anchorAt = dob.state === "KNOWN" && dob.value !== null ? utcStartOfCalendarDate(dob.value) : null;
    if (anchorAt === null) return { status: "UNKNOWN", anchorAssertionIds: ids(dob) };
    return {
      status: "OCCURRENCES",
      occurrences: [{ occurrenceId: obligationOccurrenceId(obligationId, anchor.kind, anchorAt), anchorKind: anchor.kind, anchorAt, anchorState: "KNOWN", anchorAssertionIds: ids(dob) }],
      dimensionState: "KNOWN",
      dimensionAssertionIds: ids(dob),
    };
  }

  const kind = anchor.kind === "LIFECYCLE_STATUS_START" ? "LIFECYCLE_STATUS" : "LOCATION";
  const dimensionOf = (s: AnimalSnapshot): AnimalResolution<unknown> => (kind === "LIFECYCLE_STATUS" ? s.lifecycleStatus : s.location);
  const matches = (value: unknown): boolean =>
    anchor.kind === "LIFECYCLE_STATUS_START" ? value === anchor.status : anchor.locationKind === null || (value as AnimalLocationRef).kind === anchor.locationKind;

  const current = dimensionOf(snapshot);
  if (current.state === "INVALID_EVIDENCE") return { status: "INVALID", anchorAssertionIds: ids(current) };
  const history = animalAssertionHistory(ledger, kind, snapshot.knowledgeCutoff);
  if (history === null) return { status: "INVALID", anchorAssertionIds: [] };
  if (history.length === 0) return { status: "UNKNOWN", anchorAssertionIds: [] };

  const starts = sortedUnique(
    history
      .filter((h) => h.supersededBy.length === 0 && "validFrom" in h.assertion && matches(h.assertion.value))
      .map((h) => canonicalObligationInstant("validFrom" in h.assertion ? h.assertion.validFrom : null))
      .filter((t): t is string => t !== null),
  );
  const at = (instant: string): AnimalResolution<unknown> | null => {
    const projected = projectAnimalSnapshot(ledger, { effectiveAt: instant, knowledgeCutoff: snapshot.knowledgeCutoff });
    return projected.ok ? dimensionOf(projected.snapshot) : null;
  };
  const occurrences: ObligationOccurrence[] = [];
  const push = (anchorAt: string, anchorState: ObligationAnchorState, assertionIds: string[]) =>
    occurrences.push({ occurrenceId: obligationOccurrenceId(obligationId, anchor.kind, anchorAt), anchorKind: anchor.kind, anchorAt, anchorState, anchorAssertionIds: sortedUnique(assertionIds) });
  for (const t of starts) {
    const now = at(t);
    if (now === null || now.state === "INVALID_EVIDENCE") {
      push(t, "INVALID", now ? ids(now) : []);
      continue;
    }
    if (now.state === "CONFLICTING_EVIDENCE") {
      push(t, "CONFLICT", ids(now));
      continue;
    }
    if (now.state !== "KNOWN" || !matches(now.value)) continue;
    const beforeInstant = obligationInstantJustBefore(t);
    const before = beforeInstant === null ? null : at(beforeInstant);
    if (before !== null && before.state === "INVALID_EVIDENCE") push(t, "INVALID", [...ids(now), ...ids(before)]);
    else if (before !== null && before.state === "CONFLICTING_EVIDENCE") push(t, "CONFLICT", [...ids(now), ...ids(before)]);
    else if (before !== null && before.state === "KNOWN" && canonicalizeValue(before.value) === canonicalizeValue(now.value)) continue;
    else push(t, "KNOWN", ids(now));
  }
  // Probe the whole dimension so a conflicting, invalid or unknown period is
  // never read as "no trigger" (nor cleared as not applicable).
  const probes = sortedUnique(
    history
      .filter((h) => h.supersededBy.length === 0 && "validFrom" in h.assertion)
      .flatMap((h) => ("validFrom" in h.assertion ? [h.assertion.validFrom, h.assertion.validTo] : []))
      .map((t) => canonicalObligationInstant(t))
      .filter((t): t is string => t !== null),
  );
  const flagged = { invalid: false, INVALID: [] as string[], CONFLICT: [] as string[], UNKNOWN: [] as string[] };
  const probe = (r: AnimalResolution<unknown> | null, unknownCounts: boolean) => {
    if (r === null || r.state === "INVALID_EVIDENCE") {
      flagged.invalid = true;
      flagged.INVALID.push(...(r ? ids(r) : []));
    }
    else if (r.state === "CONFLICTING_EVIDENCE") flagged.CONFLICT.push(...ids(r));
    else if (r.state === "UNKNOWN" && unknownCounts) flagged.UNKNOWN.push(...ids(r));
  };
  probe(current, true);
  for (const t of probes) probe(at(t), compareInstants(t, snapshot.effectiveAt) <= 0);
  const dimensionState = flagged.invalid ? "INVALID" : flagged.CONFLICT.length > 0 ? "CONFLICT" : flagged.UNKNOWN.length > 0 || current.state === "UNKNOWN" ? "UNKNOWN" : "KNOWN";
  const dimensionAssertionIds = sortedUnique(dimensionState === "KNOWN" ? [] : dimensionState === "INVALID" ? flagged.INVALID : dimensionState === "CONFLICT" ? flagged.CONFLICT : flagged.UNKNOWN);
  if (occurrences.length === 0) {
    if (dimensionState !== "KNOWN") return { status: dimensionState, anchorAssertionIds: dimensionAssertionIds };
    return { status: "NOT_TRIGGERED", anchorAssertionIds: sortedUnique(history.map((h) => h.assertion.assertionId)) };
  }
  return { status: "OCCURRENCES", occurrences, dimensionState, dimensionAssertionIds };
}
