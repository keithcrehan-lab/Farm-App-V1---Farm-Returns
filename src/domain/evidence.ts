/**
 * Scientific engine V3 foundation — evidence vocabulary and fail-closed
 * outcome type. Phase 1 of `docs/scientific-engine/v3/`
 * (`SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md`'s proposed sequence,
 * approved plan `tingly-cooking-key`).
 *
 * This module is currently imported by nothing in `src/app`,
 * `src/components`, `src/store`, or any existing `src/domain/*.ts` file —
 * it exists so future gate modules (commonage, LESS, soiled water,
 * concentrate CP/P, silage destination, product admissibility, spreading
 * calendar, ...) have one shared vocabulary to return, instead of each
 * inventing its own ad hoc "blocked" shape. No existing calculation's
 * output changes because of this file.
 */

// ---------------------------------------------------------------------------
// EvidenceState — docs/scientific-engine/v3/implementation/data_quality_states.csv
// ---------------------------------------------------------------------------

/**
 * Six states, not the five the spec prose (Section M) lists — the CSV is
 * the implementation-authoritative source and includes `GENERIC_FALLBACK`
 * ("Non-Irish or broad default", normally blocked for production output).
 */
export type EvidenceState =
  | "MEASURED"
  | "DERIVED"
  | "IRISH_MODEL"
  | "IRISH_DEFAULT"
  | "GENERIC_FALLBACK"
  | "INSUFFICIENT";

/** `data_quality_states.csv`'s own `priority` column — lower is stronger
 * evidence. Not currently consumed anywhere; kept alongside the states it
 * describes so a future ranking/display need doesn't re-derive it. */
export const EVIDENCE_STATE_PRIORITY: Record<EvidenceState, number> = {
  MEASURED: 1,
  DERIVED: 2,
  IRISH_MODEL: 3,
  IRISH_DEFAULT: 4,
  GENERIC_FALLBACK: 5,
  INSUFFICIENT: 99,
};

/** `data_quality_states.csv`'s own `ui_label` column — the farmer-facing
 * word for each state (never "82% confidence" — spec §M). */
export const EVIDENCE_STATE_UI_LABEL: Record<EvidenceState, string> = {
  MEASURED: "Measured",
  DERIVED: "Calculated",
  IRISH_MODEL: "Official model",
  IRISH_DEFAULT: "Estimated from Irish guidance",
  GENERIC_FALLBACK: "Low evidence",
  INSUFFICIENT: "More information required",
};

// ---------------------------------------------------------------------------
// Reason codes — a reviewed starter registry, not a closed enum.
// ---------------------------------------------------------------------------

/**
 * Reason codes already named in `FARM_RETURN_SCIENTIFIC_CALCULATION_SPEC.md`,
 * `validation/golden_farm_tests.csv` and `reports/sample_recommendation_audit.json`.
 * Every future gate module adds to this list as it's built, rather than
 * typing a free string inline at the call site — this is a starting point,
 * not the final set V3 needs.
 */
export const REASON_CODES = [
  "AMBIGUOUS_STATUTORY_BOUNDARY",
  "BLOCK_UNSUPPORTED_CLASS",
  "BLOCK_MISSING_PERIOD",
  "BLOCK_EXACT_LOOKUP",
  "BLOCK_UNSUPPORTED_SCENARIO",
  "BLOCK_MISSING_DMD",
  "BLOCK_NO_VALIDATED_CLASSIFICATION_PROTOCOL",
  "BLOCK_NO_INTERPOLATION",
  "BLOCK_MIXED_BASIS",
  "BLOCK_MISSING_MANURE_N",
  "NOT_APPLICABLE_TO_SEASONAL_RULE",
  "NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE",
  "NOT_TRIGGERED_BY_DATE_ALONE",
  "MISSING_GEOREF_OR_LPIS",
  "UNKNOWN_BLOCK",
  "INDEX4_PERSISTED",
  "DO_NOT_APPLY_170_REFERENCE_TABLE_UNQUALIFIED",
  "DO_NOT_TREAT_230_AS_WHOLE_FARM_ALLOWANCE",
  "FLAG_FERTILITY_CONTEXT_NOT_IDEAL",
  "FLAG_STALE_INPUT",
  "QUALIFIED_NOT_DEFINITIVE",
  "PROHIBITED_BY_LOCAL_OVERRIDE",
  "COMPARE_SCENARIOS_DO_NOT_REWRITE_INTENT",
  "NO_AUTONOMOUS_SELL_RECOMMENDATION",
  "GROUND_WATERLOGGED",
  // Phase C — required_input_fields.csv fail-closed input gates
  // (src/domain/input-gates.ts).
  "UNKNOWN_COMMONAGE_STATUS",
  "MISSING_SALE_EVIDENCE",
  "UNKNOWN_SLURRY_METHOD",
  "MISSING_LOCAL_BUFFER_ASSESSMENT",
  "MISSING_CONCENTRATE_CP",
  "MISSING_FERTILISER_FORMULATION",
  "MISSING_FEED_BASIS",
  // Phase D — real statutory livestock excretion / GSR
  // (src/domain/statutory-excretion.ts).
  "MISSING_DAIRY_MILK_YIELD_BAND",
  "MISSING_LIVESTOCK_AGE",
  "MISSING_LIVESTOCK_SEX_FOR_1_2Y_BAND",
  "MISSING_ELIGIBLE_GRASSLAND_AREA",
  "MISSING_LIVESTOCK_CATEGORISATION_FOR_GSR",
  // Phase F — new V3 statutory gate modules.
  "COMMONAGE_NO_CHEMICAL_FERTILISER",
  "COMMONAGE_GATE_NOT_APPLICABLE",
  "LESS_REQUIRED_GSR100",
  "LESS_REQUIRED_PIG_SLURRY",
  "LESS_REQUIRED_ARABLE",
  "LESS_GATE_NOT_APPLICABLE",
  "SOILED_WATER_42_DAY_LIMIT_EXCEEDED",
  "SOILED_WATER_RATE_LIMIT_EXCEEDED",
  "CONCENTRATE_CP_SEASONAL_CAP_EXCEEDED",
  "CONCENTRATE_CP_GATE_NOT_APPLICABLE",
  "FERTILISER_UNINHIBITED_SOLID_UREA_EXCLUDED",
  "LOCAL_BUFFER_OVERRIDE_EXCEEDS_ACTUAL_DISTANCE",
  "LOCAL_BUFFER_STATUS_UNKNOWN",
  "SOILED_WATER_HISTORY_UNKNOWN",
  "FERTILISER_FORM_UNKNOWN",
  "FERTILISER_UREIC_N_UNKNOWN",
  "FERTILISER_INHIBITOR_STATUS_UNKNOWN",
  "NATIONAL_BUFFER_DISTANCE_NOT_MET",
  // Phase G — closed-period spreading calendar + SPREADING_LEGAL_GATE.
  "CLOSED_PERIOD_CALENDAR",
  "MISSING_COUNTY_ZONE",
  "SPREAD_STOP_FLOOD",
  "SPREAD_STOP_FROZEN_SNOW",
  "SPREAD_STOP_HEAVY_RAIN",
  "SPREAD_STOP_STEEP_RISK",
  // Phase H — fodder budget / clover-N.
  "MISSING_FODDER_CATEGORISATION",
  // Phase I — real trace emission for the NAP compliance decision.
  "NAP_CEILING_MET",
  "NAP_CEILING_EXCEEDED",
  // Phase K — golden-farm scenario/test harness gap-filling.
  "MILKING_PLATFORM_STOCKING_RATE_OUT_OF_RANGE",
  // Second closure pass, Priority 2 — statutory manure N/P value ledger
  // (src/domain/statutory-manure-value.ts).
  "NO_MANURE_APPLICATION_TO_VALUE",
  "MISSING_FIELD_AREA",
  // Second closure pass, Priority 7 — SELL_HOLD_ECONOMICS evidence gate
  // (src/domain/sell-hold-economics-gate.ts).
  "BLOCK_MISSING_SALE_ROUTE",
  "BLOCK_MISSING_PERFORMANCE_MODEL",
  // Second closure pass, Priority 11 — national water-buffer distance
  // gate wired live (AF010, src/domain/nutrients.ts).
  "NATIONAL_BUFFER_GATE_NOT_APPLICABLE",
  "MISSING_NATIONAL_BUFFER_ASSESSMENT",
  // Codex remediation Priority 1 — fail-closed nutrients: a field's P/K
  // Soil Index (`Field.fertility.pIndex`/`kIndex`) is genuinely absent
  // (Priority 2 removed the fabricated Index-2 default), so no fertiliser
  // requirement/product/cost recommendation can be computed for it.
  "MISSING_SOIL_FERTILITY_INDEX",
  // Codex remediation Priority 8 — no real Irish soil spatial dataset is
  // integrated in this build (see `src/domain/soil-resolution.ts`'s own
  // header comment for the exact blocker); a field's mapped soil stays
  // unresolved rather than defaulted.
  "SOIL_DATASET_NOT_INTEGRATED",
  // Codex remediation Priority 4 — real livestock group routing
  // (src/domain/livestock.ts's classifyFinishingAnimalType/
  // finishingOptionsForGroup). A group's category/goal doesn't match a
  // supported feed/finishing model, or matches one this app has no full
  // evidenced budget for yet (e.g. finishing_heifer) — never silently
  // treated as a zero-cost/no-op group.
  "UNSUPPORTED_LIVESTOCK_CATEGORY_FOR_FEED_MODEL",
  // Farm Return Next Checkpoint 2, Vertical B — real, additive (existing
  // codes/behaviour unchanged, `DOMAIN_CONTRACTS.md`'s "non-breaking,
  // additive change" carve-out, not the full contract-change protocol).
  // Codex audit HIGH/MEDIUM, `docs/farm-return-next/audit-logs/
  // 20260901T103024Z.md`: distinct from the pre-existing
  // `MISSING_LOCAL_BUFFER_ASSESSMENT` (the whole `waterBufferContext`
  // assessment never captured) — this names the narrower, real case
  // where the local-override status and required override distance are
  // both known, but the field's own measured actual distance to the
  // water feature specifically is missing. See
  // `local-buffer-override-gate.ts`.
  "MISSING_LOCAL_BUFFER_ACTUAL_DISTANCE",
  // Farm Return Next Checkpoint 2, Vertical H (satellite field
  // intelligence) — real, additive. No Sentinel-2 L2A scene from the
  // Copernicus Data Space Ecosystem covers a field within the requested
  // lookback window (empty search result, or every candidate scene's
  // real footprint doesn't actually intersect the field). See
  // `satellite-field-coverage.ts`.
  "NO_RECENT_SATELLITE_SCENE_AVAILABLE",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/** A registered reason code is a documentation aid, not a runtime
 * restriction — `EngineOutcome.reasonCode` stays a plain `string` (see
 * below) so a future gate isn't blocked from shipping a new, real V3
 * reason code before this list is updated. Use this to flag call sites
 * using an *unregistered* code for review, not to reject them. */
export function isRegisteredReasonCode(code: string): code is ReasonCode {
  return (REASON_CODES as readonly string[]).includes(code);
}

// ---------------------------------------------------------------------------
// EngineOutcome<T> — the fail-closed result every future gate/calculation
// returns instead of a bare value.
// ---------------------------------------------------------------------------

/**
 * Mirrors `FARM_RETURN_SCIENTIFIC_CALCULATION_SPEC.md` Section D's
 * "The application must be allowed to say: INSUFFICIENT_EVIDENCE / UNKNOWN
 * / NOT_APPLICABLE / LEGAL_PROHIBITION" plus the `AMBIGUOUS_STATUTORY_
 * BOUNDARY` state B1 introduces. `.value` only exists on the `"OK"` branch
 * — TypeScript's discriminated-union narrowing means a caller cannot read
 * a value out of a blocked/ambiguous/unknown outcome without the compiler
 * forcing a `status` check first. Fail-closed by construction, not by
 * convention.
 */
export type EngineOutcome<T> =
  | { status: "OK"; value: T; evidenceState: EvidenceState }
  | { status: "BLOCKED_INSUFFICIENT_EVIDENCE"; reasonCode: string; missingInputs: string[] }
  | { status: "AMBIGUOUS"; reasonCode: string; detail: string }
  | { status: "NOT_APPLICABLE"; reasonCode: string }
  | { status: "LEGAL_PROHIBITION"; reasonCode: string; consequence: string }
  | { status: "UNKNOWN"; reasonCode: string };

export function ok<T>(value: T, evidenceState: EvidenceState): EngineOutcome<T> {
  return { status: "OK", value, evidenceState };
}

export function blockedInsufficientEvidence<T>(reasonCode: string, missingInputs: string[]): EngineOutcome<T> {
  return { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode, missingInputs };
}

export function ambiguous<T>(reasonCode: string, detail: string): EngineOutcome<T> {
  return { status: "AMBIGUOUS", reasonCode, detail };
}

export function notApplicable<T>(reasonCode: string): EngineOutcome<T> {
  return { status: "NOT_APPLICABLE", reasonCode };
}

export function legalProhibition<T>(reasonCode: string, consequence: string): EngineOutcome<T> {
  return { status: "LEGAL_PROHIBITION", reasonCode, consequence };
}

export function unknown<T>(reasonCode: string): EngineOutcome<T> {
  return { status: "UNKNOWN", reasonCode };
}

export function isOk<T>(outcome: EngineOutcome<T>): outcome is Extract<EngineOutcome<T>, { status: "OK" }> {
  return outcome.status === "OK";
}
