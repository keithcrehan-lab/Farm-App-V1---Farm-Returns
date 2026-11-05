import { SCHEME_DATA_KEYS } from "./data-keys";

export const SCEP_2026_SCHEME_FACT_KEYS = [
  SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key,
  SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key,
  SCHEME_DATA_KEYS.SCEP_SBLAS_CURRENT_2026.key,
  SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key,
  SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key,
  SCHEME_DATA_KEYS.SCEP_HIGH_MERIT_SIRED_CALVES_2026.key,
  SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key,
  SCHEME_DATA_KEYS.SCEP_WEIGHED_PAIRS_2026.key,
  SCHEME_DATA_KEYS.SCEP_SURVEYS_SUBMITTED_2026.key,
] as const;

export type Scep2026SchemeFactKey =
  (typeof SCEP_2026_SCHEME_FACT_KEYS)[number];

export interface SchemeFactAssertion {
  id: string;
  farmId: string;
  schemeVersionId: string;
  dataKey: string;
  value: unknown;
  assertionStatus:
    | "farmer_confirmed"
    | "adviser_confirmed"
    | "imported"
    | "verified_external";
  sourceKind:
    | "farmer_entered"
    | "adviser_entered"
    | "imported_record"
    | "official_confirmation";
  sourceRef: string | null;
  assertedBy: string | null;
  observedAt: string | null;
  receivedAt: string;
  supersedesId: string | null;
}

export type SchemeFactValidationResult =
  | { valid: true; value: boolean | number }
  | { valid: false; reason: string };

const BOOLEAN_KEYS = new Set<string>([
  SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key,
  SCHEME_DATA_KEYS.SCEP_SBLAS_CURRENT_2026.key,
  SCHEME_DATA_KEYS.SCEP_SURVEYS_SUBMITTED_2026.key,
]);

const COUNT_KEYS = new Set<string>([
  SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key,
  SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key,
  SCHEME_DATA_KEYS.SCEP_HIGH_MERIT_SIRED_CALVES_2026.key,
  SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key,
  SCHEME_DATA_KEYS.SCEP_WEIGHED_PAIRS_2026.key,
]);

export function isScep2026SchemeFactKey(
  key: string,
): key is Scep2026SchemeFactKey {
  return (SCEP_2026_SCHEME_FACT_KEYS as readonly string[]).includes(key);
}

/**
 * The write boundary for the first live source-pinned scheme. Validation
 * is intentionally narrower than JSON: no strings that "look numeric",
 * negative counts or impossible magnitudes are accepted.
 */
export function validateScep2026SchemeFact(
  key: string,
  value: unknown,
): SchemeFactValidationResult {
  if (!isScep2026SchemeFactKey(key)) {
    return { valid: false, reason: "Unsupported SCEP 2026 fact key." };
  }

  if (BOOLEAN_KEYS.has(key)) {
    return typeof value === "boolean"
      ? { valid: true, value }
      : { valid: false, reason: "This answer must be yes or no." };
  }

  if (COUNT_KEYS.has(key)) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 100_000
    ) {
      return {
        valid: false,
        reason: "This value must be a whole number between 0 and 100,000.",
      };
    }
    if (
      key === SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key &&
      value === 0
    ) {
      return {
        valid: false,
        reason: "A participating SCEP yearly reference number must be at least 1.",
      };
    }
    return { valid: true, value };
  }

  if (key === SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100_000
    ) {
      return {
        valid: false,
        reason: "Eligible forage area must be a valid non-negative hectare value.",
      };
    }
    return { valid: true, value };
  }

  return { valid: false, reason: "Unsupported SCEP 2026 fact value." };
}
