/**
 * Economic Opportunity Engine — Slurry Realisation Cost V1, farmer-entered
 * contractor rate.
 *
 * `SlurryDirectEconomicAssessment`'s `realisationCost` (Phase 5,
 * `slurry-direct-economic-assessment.ts:107-111`) is a tri-state
 * "incremental realisation cost (contractor spreading, transport, ...)"
 * that Phase 5 subtracts from the audited gross fertiliser-plan-cost
 * difference to produce a net economic result — confirmed directly from
 * Phase 5's own type doc comment and its net-return calculation (never
 * reinterpreted here).
 *
 * REVISION (supersedes the original V1 design): this module previously
 * supplied that incremental cost automatically from a fixed, versioned
 * Farm Return pilot benchmark (`SLURRY_REALISATION_COST_IE_V1`,
 * €120/ha). An independent Codex audit raised the same CRITICAL finding
 * twice, even after the benchmark was clearly disclosed as a non-authoritative
 * assumption: `SCIENTIFIC_RULES.md`'s fail-closed rule requires an
 * unsupported production financial number to remain `unknown`, not be
 * substituted with a labelled guess. The owner's explicit decision was to
 * honour that rule rather than override it — see this repo's own commit
 * history around this file for the full audit trail.
 *
 * The realisation cost is therefore now sourced ONLY from a real,
 * farmer-entered contractor-cost-rate declaration — genuine
 * `FARMER_DECLARATION` evidence, immutable, bound to the exact
 * field/action/economic-assessment it applies to, exactly like
 * `slurry-actionability-policy.ts`'s own `FarmerDeclarationEvidence`
 * (deliberately reusing that established binding/immutability/provenance
 * pattern rather than inventing a second one). It is never described as a
 * market benchmark, an FCI rate, or any other externally-authoritative
 * figure — it is the farmer's own declared cost, nothing more.
 *
 * One deliberate difference from `FarmerDeclarationEvidence`: a contractor
 * cost rate binding does NOT require an exact `evaluatedAt` match. Physical
 * ground-condition declarations (trafficability, waterlogging, frost) are
 * genuinely time-sensitive — the ground itself can change between one
 * evaluation and the next, so `slurry-actionability-policy.ts` correctly
 * treats a declaration for a different `evaluatedAt` as stale. A farmer's
 * contractor rate is not time-sensitive in that way: it remains valid for
 * as long as it is bound to the same real economic assessment
 * (`boundAssessmentId`, which itself already changes once per calendar day
 * via `asOfDate` — `what-matters-pilot.ts`'s own assessment-ID construction).
 * Requiring a fresh rate entry on every page refresh/re-evaluation within
 * the same day would be a real UX regression with no corresponding audit
 * benefit, so this binding check intentionally omits it.
 *
 * Field area is read exclusively from the authoritative `Field.areaHa`
 * (always derived from the farmer-drawn polygon at field-creation time —
 * `types.ts:196-202`, `field-boundary.ts:72` — never typed/guessed).
 * Missing, non-finite, non-positive, or unexpectedly-precise area values
 * (i.e. not genuinely rounded to `field-boundary.ts`'s own 2-decimal-place
 * boundary) all resolve to `{status: "unknown"}` via `units.ts`'s
 * `exactQuantityFromRoundedNumber` — never a fabricated/default area, and
 * never a `known_zero` cost for a field whose area could not actually be
 * established.
 */
import Decimal from "decimal.js";
import { createMoneyAmount, multiplyMoney, type CurrencyCode, type MoneyAmount } from "./money";
import { exactQuantityFromRoundedNumber } from "./units";
import type { RealisationCostInput } from "./slurry-direct-economic-assessment";
import type { Field } from "./types";

/** `field-boundary.ts:72`'s own rounding boundary for `Field.areaHa`
 * (`Math.round((areaM2 / 10_000) * 100) / 100`) — 2 decimal places. */
const FIELD_AREA_HA_MAX_DECIMAL_PLACES = 2;

// ---------------------------------------------------------------------------
// Farmer-entered contractor-cost-rate evidence — immutable, assessment-scoped
// snapshot. Same shape/discipline as `FarmerDeclarationEvidence`
// (`slurry-actionability-policy.ts`), deliberately without an evaluatedAt
// binding requirement (see header comment).
// ---------------------------------------------------------------------------

export interface CreateFarmerContractorCostDeclarationInput {
  id: string;
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  /** Exact canonical decimal string, e.g. `"120"` — never a JS `number`. */
  ratePerHa: string;
  currency: CurrencyCode;
  declaredAt: string;
  /** No actor-identity/authentication concept exists anywhere in this
   * domain layer today — left optional/unset rather than inventing one
   * (same disclosed limitation as `FarmerDeclarationEvidence`). */
  declaredByActorId?: string;
}

export interface FarmerContractorCostDeclaration {
  id: string;
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  ratePerHa: string;
  currency: CurrencyCode;
  declaredAt: string;
  declaredByActorId: string | null;
  provenance: "FARMER_DECLARATION";
}

export type FarmerContractorCostDeclarationOutcome = { status: "OK"; declaration: FarmerContractorCostDeclaration } | { status: "REJECTED"; reasonCode: string; detail: string };

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export type ContractorCostRateValidationOutcome = { status: "OK" } | { status: "REJECTED"; reasonCode: string; detail: string };

/** Validates a raw contractor rate string on its own, independent of any
 * particular field/action/assessment binding — the one check a caller
 * (e.g. `saveFarmerContractorCostRate`, before it ever touches storage)
 * can run up front to reject an invalid rate with a structured error
 * instead of silently discarding it later. Rejects (never silently
 * clamps/defaults) a missing, malformed, non-finite, zero, or negative
 * rate — a €0/ha or negative "cost" is not a real contractor rate. */
export function validateContractorCostRate(ratePerHa: string, currency: CurrencyCode): ContractorCostRateValidationOutcome {
  let rate: Decimal;
  try {
    // `createMoneyAmount` itself validates canonical decimal-string shape
    // (throws on malformed/NaN/Infinity input) but permits a negative
    // amount ("-" is a valid leading character for ordinary money) — a
    // contractor RATE must additionally be strictly positive, checked here.
    createMoneyAmount(ratePerHa, currency);
    rate = new Decimal(ratePerHa);
  } catch {
    return {
      status: "REJECTED",
      reasonCode: "SLURRY_REALISATION_COST_DECLARATION_INVALID_RATE",
      detail: `ratePerHa "${ratePerHa}" is not a valid canonical decimal amount.`,
    };
  }
  if (!rate.isFinite() || rate.lessThanOrEqualTo(0)) {
    return {
      status: "REJECTED",
      reasonCode: "SLURRY_REALISATION_COST_DECLARATION_INVALID_RATE",
      detail: `ratePerHa "${ratePerHa}" must be a finite, strictly positive amount.`,
    };
  }
  return { status: "OK" };
}

/** Validates and constructs one immutable farmer contractor-cost
 * declaration. Rejects (never silently clamps/defaults) a missing,
 * malformed, non-finite, zero, or negative rate — a €0/ha or negative
 * "cost" is not a real contractor rate. */
export function createFarmerContractorCostDeclaration(input: CreateFarmerContractorCostDeclarationInput): FarmerContractorCostDeclarationOutcome {
  if (
    isBlank(input.id) ||
    isBlank(input.opportunityRecordId) ||
    isBlank(input.boundAssessmentId) ||
    isBlank(input.evaluatedActionId) ||
    isBlank(input.fieldId) ||
    isBlank(input.declaredAt)
  ) {
    return {
      status: "REJECTED",
      reasonCode: "SLURRY_REALISATION_COST_DECLARATION_MALFORMED_INPUT",
      detail: "id, opportunityRecordId, boundAssessmentId, evaluatedActionId, fieldId and declaredAt must all be non-empty.",
    };
  }

  const rateValidation = validateContractorCostRate(input.ratePerHa, input.currency);
  if (rateValidation.status !== "OK") return rateValidation;

  return {
    status: "OK",
    declaration: {
      id: input.id,
      opportunityRecordId: input.opportunityRecordId,
      boundAssessmentId: input.boundAssessmentId,
      evaluatedActionId: input.evaluatedActionId,
      fieldId: input.fieldId,
      ratePerHa: input.ratePerHa,
      currency: input.currency,
      declaredAt: input.declaredAt,
      declaredByActorId: input.declaredByActorId ?? null,
      provenance: "FARMER_DECLARATION",
    },
  };
}

export interface ContractorCostBindingTarget {
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
}

export interface ContractorCostBindingValidationResult {
  valid: boolean;
  reasonCode?: string;
  detail?: string;
}

/** Never trust a declaration merely because it carries a matching
 * `opportunityRecordId` — a wrong-field declaration, or one made against a
 * since-superseded economic assessment of the same field/action, is
 * rejected rather than silently carried across (same discipline as
 * `validateFarmerDeclarationBinding`). Deliberately does NOT check
 * `evaluatedAt` — see this module's header comment. */
export function validateFarmerContractorCostDeclarationBinding(declaration: FarmerContractorCostDeclaration, target: ContractorCostBindingTarget): ContractorCostBindingValidationResult {
  if (declaration.opportunityRecordId !== target.opportunityRecordId || declaration.fieldId !== target.fieldId) {
    return {
      valid: false,
      reasonCode: "SLURRY_REALISATION_COST_DECLARATION_WRONG_FIELD",
      detail: `declaration was made for opportunityRecordId="${declaration.opportunityRecordId}"/fieldId="${declaration.fieldId}", not the target opportunityRecordId="${target.opportunityRecordId}"/fieldId="${target.fieldId}" — rejected rather than trusted.`,
    };
  }
  if (declaration.boundAssessmentId !== target.boundAssessmentId || declaration.evaluatedActionId !== target.evaluatedActionId) {
    return {
      valid: false,
      reasonCode: "SLURRY_REALISATION_COST_DECLARATION_STALE_ASSESSMENT",
      detail: `declaration was bound to boundAssessmentId="${declaration.boundAssessmentId}"/evaluatedActionId="${declaration.evaluatedActionId}", which no longer matches the current target's boundAssessmentId="${target.boundAssessmentId}"/evaluatedActionId="${target.evaluatedActionId}" — this action has been reassessed since the declaration was made; a fresh rate declaration is required.`,
    };
  }
  return { valid: true };
}

function latestValidContractorCostDeclaration(declarations: readonly FarmerContractorCostDeclaration[], target: ContractorCostBindingTarget): FarmerContractorCostDeclaration | null {
  const valid = declarations.filter((d) => validateFarmerContractorCostDeclarationBinding(d, target).valid);
  if (valid.length === 0) return null;
  return valid.reduce((latest, current) => (current.declaredAt > latest.declaredAt ? current : latest));
}

// ---------------------------------------------------------------------------
// Realisation-cost resolution — from farmer-entered evidence only, never an
// automatic system value.
// ---------------------------------------------------------------------------

export type SlurryRealisationCostUnavailableReasonCode =
  | "SLURRY_REALISATION_COST_NO_FARMER_RATE_DECLARED"
  | "SLURRY_REALISATION_COST_FIELD_AREA_UNAVAILABLE"
  | "SLURRY_REALISATION_COST_FIELD_AREA_NOT_POSITIVE";

/** Full reconstruction trail for one field's resolved (or unresolved)
 * realisation cost — a reviewer must be able to verify `fieldAreaHa ×
 * declaration.ratePerHa = amount` from this object alone, without reading
 * source code. */
export interface SlurryRealisationCostResolution {
  readonly fieldId: string;
  readonly input: RealisationCostInput;
  /** The real farmer declaration actually used, or `null` when no valid
   * declaration exists for this exact opportunity/assessment. */
  readonly declaration: FarmerContractorCostDeclaration | null;
  /** Exact decimal string actually used, or `null` when unresolved. */
  readonly fieldAreaHa: string | null;
  /** Human-reconstructible expression, e.g. `"5 ha × €120/ha = €600"`, or
   * `null` when unresolved. */
  readonly calculationExpression: string | null;
  readonly reasonCode: SlurryRealisationCostUnavailableReasonCode | null;
}

function unresolved(fieldId: string, fieldAreaHa: string | null, declaration: FarmerContractorCostDeclaration | null, reasonCode: SlurryRealisationCostUnavailableReasonCode): SlurryRealisationCostResolution {
  return {
    fieldId,
    input: { status: "unknown" },
    declaration,
    fieldAreaHa,
    calculationExpression: null,
    reasonCode,
  };
}

/**
 * Resolves realisation-cost evidence for one field from the field's own
 * authoritative `areaHa` and the latest VALID farmer contractor-cost
 * declaration for this exact opportunity/assessment. Never accepts a
 * caller-supplied area, and never substitutes any value when no valid
 * declaration exists — `{status: "unknown"}` in that case, exactly like a
 * missing area.
 */
export function resolveSlurryRealisationCostFromFarmerRate(
  field: Pick<Field, "id" | "areaHa">,
  target: ContractorCostBindingTarget,
  declarations: readonly FarmerContractorCostDeclaration[],
): SlurryRealisationCostResolution {
  const declaration = latestValidContractorCostDeclaration(declarations, target);
  if (declaration === null) {
    return unresolved(field.id, null, null, "SLURRY_REALISATION_COST_NO_FARMER_RATE_DECLARED");
  }

  let areaExact: string;
  try {
    areaExact = exactQuantityFromRoundedNumber(field.areaHa, FIELD_AREA_HA_MAX_DECIMAL_PLACES, "field area (ha)");
  } catch {
    return unresolved(field.id, null, declaration, "SLURRY_REALISATION_COST_FIELD_AREA_UNAVAILABLE");
  }

  // Zero (or, defensively, any non-positive value `exactQuantityFromRoundedNumber`
  // did not already reject) is treated as unresolved area, not a known-zero
  // cost: a 0ha field cannot really be spread on, so "€0 to spread here" would
  // misrepresent a data problem as a confirmed favourable cost.
  if (new Decimal(areaExact).lessThanOrEqualTo(0)) {
    return unresolved(field.id, areaExact, declaration, "SLURRY_REALISATION_COST_FIELD_AREA_NOT_POSITIVE");
  }

  const rate: MoneyAmount = createMoneyAmount(declaration.ratePerHa, declaration.currency);
  const amount = multiplyMoney(rate, areaExact);

  return {
    fieldId: field.id,
    input: { status: "quantified", amount },
    declaration,
    fieldAreaHa: areaExact,
    calculationExpression: `${areaExact} ha × €${declaration.ratePerHa}/ha = €${amount.amount}`,
    reasonCode: null,
  };
}
