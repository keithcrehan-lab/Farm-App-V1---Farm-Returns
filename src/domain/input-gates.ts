/**
 * Scientific engine V3 — Phase C: fail-closed input gates for
 * `docs/scientific-engine/v3/implementation/required_input_fields.csv`.
 *
 * Each function checks whether one required V3 input has actually been
 * captured on the existing farm-model types (Phase C's additive fields on
 * `Field`/`SlurryAllocation`/`SilagePlan`/`FertiliserProduct`, see
 * `types.ts`) and returns an `EngineOutcome` — `"OK"` with the resolved
 * value once present, `"BLOCKED_INSUFFICIENT_EVIDENCE"` when it is not.
 * Nothing here computes an agronomic/statutory number; these are gates on
 * *evidence*, not calculations.
 *
 * Still imported by nothing in `src/app`/`src/components`/`src/store` as
 * of this phase — no existing screen currently captures any of these
 * fields, so no existing calculation can consult these gates yet without
 * unconditionally failing closed. Wiring a gate into a real calculation
 * happens together with adding the farmer-facing capture UI for its
 * field, in a later phase.
 */

import { blockedInsufficientEvidence, ok, type EngineOutcome, type EvidenceState } from "./evidence";
import type { ConcentrateFeedSpec, DataStatus, Field, FertiliserProduct, SilagePlan, SlurryAllocation, TrackedValue } from "./types";
import type { FeedBasis } from "./units";

/**
 * Maps a `TrackedValue`'s `DataStatus` to an `EvidenceState` — but ONLY
 * for the narrow case every gate in this file actually handles: a
 * farmer's (or an official document's) direct declaration of a discrete
 * categorical/boolean fact about their own land or records (commonage
 * status, application method, sale evidence, formulation, feed basis).
 * This is deliberately NOT the general-purpose `DataStatus -> EvidenceState`
 * mapper Phase 1's plan explicitly declined to build (a farmer's
 * *estimate* of a continuous lab quantity, e.g. a guessed P-index, is NOT
 * this case and must never route through this helper) — it exists only
 * because every one of THIS file's inputs is genuinely the same kind of
 * fact: `"verified"`/`"farmer_adjusted"` means someone directly asserted
 * it (treated as `MEASURED`, matching `sample_recommendation_audit.json`'s
 * own `FIELD_OR_WEATHER_ASSESSMENT` -> real evidence-state pairing);
 * `"estimated"`/`"mapped"` means it hasn't been farmer-confirmed yet
 * (`IRISH_DEFAULT` — a placeholder, not a fact).
 */
function evidenceStateForDirectAssertion(status: DataStatus): EvidenceState {
  return status === "verified" || status === "farmer_adjusted" ? "MEASURED" : "IRISH_DEFAULT";
}

// ---------------------------------------------------------------------------
// FIELD_COMMONAGE_STATUS
// ---------------------------------------------------------------------------

export function requireCommonageStatus(
  field: Pick<Field, "commonageStatus">,
): EngineOutcome<"commonage" | "not_commonage"> {
  const tv = field.commonageStatus;
  if (tv === undefined || tv.value === "unknown") {
    return blockedInsufficientEvidence("UNKNOWN_COMMONAGE_STATUS", ["FIELD_COMMONAGE_STATUS"]);
  }
  return ok(tv.value, evidenceStateForDirectAssertion(tv.status));
}

// ---------------------------------------------------------------------------
// SILAGE_SALE_EVIDENCE
// ---------------------------------------------------------------------------

export function requireSilageSaleEvidence(
  plan: Pick<SilagePlan, "saleEvidence">,
): EngineOutcome<{ hasWrittenEvidence: boolean; documentReference?: string }> {
  const tv = plan.saleEvidence;
  if (tv === undefined) {
    return blockedInsufficientEvidence("MISSING_SALE_EVIDENCE", ["SILAGE_SALE_EVIDENCE"]);
  }
  return ok(tv.value, evidenceStateForDirectAssertion(tv.status));
}

// ---------------------------------------------------------------------------
// SLURRY_APPLICATION_METHOD
// ---------------------------------------------------------------------------

export function requireSlurryApplicationMethod(
  allocation: Pick<SlurryAllocation, "applicationMethod">,
): EngineOutcome<"LESS" | "splashplate" | "incorporate_24h" | "other"> {
  const tv = allocation.applicationMethod;
  if (tv === undefined) {
    return blockedInsufficientEvidence("UNKNOWN_SLURRY_METHOD", ["SLURRY_APPLICATION_METHOD"]);
  }
  return ok(tv.value, evidenceStateForDirectAssertion(tv.status));
}

// ---------------------------------------------------------------------------
// LOCAL_WATER_BUFFER_OVERRIDE
// ---------------------------------------------------------------------------

/**
 * Unlike the other gates in this file, `localOverrideStatus: "unknown"` is
 * itself a legitimate, non-blocking captured state here — AF010's
 * resolution is `GUARDED_EXTERNAL_DATA`, and `GFT090` expects
 * `QUALIFIED_NOT_DEFINITIVE` (not a hard block) when a local override
 * status is genuinely unresolved after being assessed. Only a field that
 * was never assessed at all (`waterBufferContext === undefined`) fails
 * closed here.
 */
export function resolveLocalWaterBufferOverrideStatus(
  field: Pick<Field, "waterBufferContext">,
): EngineOutcome<"authoritative_rule" | "verified_none" | "unknown"> {
  const tv = field.waterBufferContext;
  if (tv === undefined) {
    return blockedInsufficientEvidence("MISSING_LOCAL_BUFFER_ASSESSMENT", ["LOCAL_WATER_BUFFER_OVERRIDE"]);
  }
  return ok(tv.value.localOverrideStatus, evidenceStateForDirectAssertion(tv.status));
}

// ---------------------------------------------------------------------------
// CONCENTRATE_CP_PERCENT
// ---------------------------------------------------------------------------

export function requireConcentrateCpPercent(spec: ConcentrateFeedSpec): EngineOutcome<number> {
  const tv = spec.cpPercent;
  if (tv === undefined) {
    return blockedInsufficientEvidence("MISSING_CONCENTRATE_CP", ["CONCENTRATE_CP_PERCENT"]);
  }
  return ok(tv.value, evidenceStateForDirectAssertion(tv.status));
}

// ---------------------------------------------------------------------------
// CONCENTRATE_P_CONTENT — NOT a blocking gate: the required-input row's own
// `fail_if_missing` behaviour is "Use labelled statutory 0.5 kg P/100kg
// default", not a block, so this resolves rather than requires.
// ---------------------------------------------------------------------------

/** `rules_statutory/concentrate_feed_compliance_2026.csv`, row
 * `CONC_P_DEFAULT_CONTENT`: "default phosphorus content, 0.5, kg P per 100
 * kg concentrate" — a statutory default from an approved V3 source, used
 * only when known/supplier-provided P content is absent. Known content
 * always outranks this default (`GFT149`). */
export const STATUTORY_CONCENTRATE_P_DEFAULT_KG_PER_100KG = 0.5;

export function resolveConcentratePContentKgPer100kg(spec: ConcentrateFeedSpec): EngineOutcome<number> {
  const tv = spec.pContentKgPer100kg;
  if (tv !== undefined) {
    return ok(tv.value, evidenceStateForDirectAssertion(tv.status));
  }
  return ok(STATUTORY_CONCENTRATE_P_DEFAULT_KG_PER_100KG, "IRISH_DEFAULT");
}

// ---------------------------------------------------------------------------
// FERTILISER_UREA_INHIBITOR_STATUS
// ---------------------------------------------------------------------------

export function requireFertiliserFormulation(
  product: Pick<FertiliserProduct, "formulation">,
): EngineOutcome<NonNullable<FertiliserProduct["formulation"]> extends TrackedValue<infer V> ? V : never> {
  const tv = product.formulation;
  if (tv === undefined) {
    return blockedInsufficientEvidence("MISSING_FERTILISER_FORMULATION", ["FERTILISER_UREA_INHIBITOR_STATUS"]);
  }
  return ok(tv.value, evidenceStateForDirectAssertion(tv.status));
}

// ---------------------------------------------------------------------------
// FEED_BASIS
// ---------------------------------------------------------------------------

export function requireFeedBasis(basis: FeedBasis | undefined): EngineOutcome<FeedBasis> {
  if (basis === undefined) {
    return blockedInsufficientEvidence("MISSING_FEED_BASIS", ["FEED_BASIS"]);
  }
  // The basis tag is the engine's/farmer's own classification of
  // already-known data (which side of the fresh/DM line a figure sits
  // on), not a fresh farm measurement — DERIVED, not MEASURED.
  return ok(basis, "DERIVED");
}
