/**
 * Farm Return Next — activity-specific Confirm Actual payload contracts
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §5/§6). One universal Job Session (`job-session-lifecycle.ts`) plus an
 * activity-specific Actual payload, not five unrelated job systems — this
 * module is the "activity-specific Actual payload" half.
 *
 * Every validator here is a pure structural/completeness check, never a
 * scientific calculation — no agronomic rate, no yield, no worked-area
 * figure is derived or invented here. Where this module accepts an
 * already-known real farm value (a field's own mapped `areaHa`), the
 * caller supplies it as `FieldAreaContext`; this module never looks it up
 * or fabricates a substitute.
 *
 * `SlurryApplicationMethod` is imported, not redefined — `less-method-gate.ts`
 * already owns that vocabulary (`DOMAIN_CONTRACTS.md`'s reuse boundary).
 */
import type { SlurryApplicationMethod } from "./less-method-gate";

export type ActivityType =
  | "fertiliser_spreading"
  | "slurry_spreading"
  | "silage"
  | "field_inspection"
  | "livestock_work";

/** §5/§12 — the three real completion states a Confirm Actual records.
 * Distinct from `JobSessionStatus`'s own `"cancelled"` (abandoned *before*
 * Confirm Actual, see `job-session-lifecycle.ts`'s own doc comment on
 * `cancelJobSession`) — `"did_not_happen"` here means the farmer *did*
 * reach Confirm Actual and is explicitly recording that outcome as the
 * confirmed fact. */
export type CompletionType = "whole" | "partial" | "did_not_happen";

export interface FieldAreaContext {
  fieldId: string;
  /** The field's own real, already-mapped area (`Field.areaHa`,
   * `src/domain/types.ts`) — never computed from GPS. */
  areaHa: number;
}

// ---------------------------------------------------------------------------
// A. Fertiliser spreading
// ---------------------------------------------------------------------------
export interface FertiliserSpreadingActual {
  activityType: "fertiliser_spreading";
  completionType: CompletionType;
  fieldIds: string[];
  product?: string;
  quantity?: number;
  quantityUnit?: "kg" | "t" | "bags";
  /** Present only for `"whole"` (derived from the real mapped area(s) of
   * `fieldIds`, summed) or `"partial"` when the farmer explicitly
   * confirmed a figure — never manufactured for `"partial"` when none is
   * known (§11/§12). Absent for `"did_not_happen"`. */
  areaHa?: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// B. Slurry spreading
// ---------------------------------------------------------------------------
export interface SlurrySpreadingActual {
  activityType: "slurry_spreading";
  completionType: CompletionType;
  fieldIds: string[];
  /** Only when the repo genuinely knows it (§6B) — no invented default. */
  slurryType?: "cattle_slurry" | "pig_slurry" | "other";
  quantity?: number;
  quantityUnit?: "m3" | "gallons";
  /** Reused, not redefined — `less-method-gate.ts`. */
  applicationMethod?: SlurryApplicationMethod;
  areaHa?: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// C. Silage
// ---------------------------------------------------------------------------
export interface SilageActual {
  activityType: "silage";
  completionType: CompletionType;
  fieldIds: string[];
  /** Present only when confirmed — never derived from GPS dwell time. */
  harvestedAreaHa?: number;
  /** §6C — "do not create a biomass/yield estimate merely to populate the
   * screen": both absent unless genuinely supplied or measured. */
  bales?: number;
  tonnes?: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// D. Field inspection — lightweight, no agronomic payload at all.
// ---------------------------------------------------------------------------
export interface FieldInspectionActual {
  activityType: "field_inspection";
  completionType: CompletionType;
  fieldIds: string[];
  observedIssueCategory?: string;
  /** A farmer's own free-text observation — never generated. */
  observationNote?: string;
  /** A photo/observation reference id, when one was attached — this module
   * never fetches or validates the referenced evidence's own content. */
  evidenceRef?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// E. Livestock work — the one activity that may have no field at all.
// ---------------------------------------------------------------------------
export interface LivestockWorkActual {
  activityType: "livestock_work";
  completionType: CompletionType;
  /** At least one of these two is required (see `validateLivestockWorkActual`)
   * — a group-level action (e.g. "dosed the whole batch") or a specific
   * animal, per whatever the originating job actually concerned. Reused
   * ids, not new domain concepts: `LivestockGroup.id`/individual animal id
   * already exist in `src/domain/types.ts`/`individual-animals.ts`. */
  livestockGroupId?: string;
  animalId?: string;
  action: string;
  outcome?: string;
  note?: string;
}

export type JobActualPayload =
  | FertiliserSpreadingActual
  | SlurrySpreadingActual
  | SilageActual
  | FieldInspectionActual
  | LivestockWorkActual;

export type JobActualValidationResult<T extends JobActualPayload> =
  | { ok: true; payload: T }
  | { ok: false; errors: string[] };

function sumMappedArea(fieldIds: string[], fields: FieldAreaContext[]): number | undefined {
  if (fieldIds.length === 0) return undefined;
  const areas = fieldIds.map((id) => fields.find((f) => f.fieldId === id)?.areaHa);
  if (areas.some((a) => a === undefined)) return undefined; // a referenced field's real area is unknown -- do not guess
  return (areas as number[]).reduce((sum, a) => sum + a, 0);
}

/** §11/§12 — resolves the real `areaHa` for a field-scoped Actual:
 * `"whole"` uses the real mapped area (summed across every field in this
 * session); `"partial"` uses only a farmer-confirmed figure, never a
 * manufactured one; `"did_not_happen"` has no area. This is the one
 * function every field-scoped activity's validator below calls, so the
 * "never invent a worked area" rule lives in exactly one place. */
function resolveFieldScopedArea(
  completionType: CompletionType,
  fieldIds: string[],
  farmerConfirmedAreaHa: number | undefined,
  fields: FieldAreaContext[],
): number | undefined {
  if (completionType === "did_not_happen") return undefined;
  if (completionType === "whole") return sumMappedArea(fieldIds, fields);
  // "partial": only ever the farmer's own confirmed figure.
  return farmerConfirmedAreaHa;
}

export interface RawJobActualInput {
  completionType: CompletionType;
  fieldIds?: string[];
  product?: string;
  quantity?: number;
  quantityUnit?: string;
  areaHa?: number;
  slurryType?: string;
  applicationMethod?: string;
  harvestedAreaHa?: number;
  bales?: number;
  tonnes?: number;
  observedIssueCategory?: string;
  observationNote?: string;
  evidenceRef?: string;
  livestockGroupId?: string;
  animalId?: string;
  action?: string;
  outcome?: string;
  note?: string;
}

function requireNonEmptyFieldIds(fieldIds: string[] | undefined, errors: string[]): string[] {
  if (!fieldIds || fieldIds.length === 0) {
    errors.push("at least one field is required for this activity");
    return [];
  }
  return fieldIds;
}

export function validateFertiliserSpreadingActual(
  raw: RawJobActualInput,
  fields: FieldAreaContext[],
): JobActualValidationResult<FertiliserSpreadingActual> {
  const errors: string[] = [];
  const fieldIds = requireNonEmptyFieldIds(raw.fieldIds, errors);
  if (raw.completionType !== "did_not_happen") {
    if (!raw.product || raw.product.trim().length === 0) errors.push("product is required");
    if (raw.quantity === undefined || !Number.isFinite(raw.quantity) || raw.quantity <= 0) {
      errors.push("a positive quantity is required");
    }
    if (raw.quantityUnit !== "kg" && raw.quantityUnit !== "t" && raw.quantityUnit !== "bags") {
      errors.push('quantityUnit must be one of "kg", "t", "bags"');
    }
  }
  if (raw.completionType === "partial" && raw.areaHa !== undefined && (!Number.isFinite(raw.areaHa) || raw.areaHa <= 0)) {
    errors.push("areaHa, when supplied, must be a positive number");
  }
  if (errors.length > 0) return { ok: false, errors };
  // Codex audit MEDIUM (round 1, docs/overnight/audits/
  // gps-job-session-actual-contract-codex-audit-round1.md): "did not
  // happen" must actually clear any quantity the farmer had already
  // typed before switching completion type — not just skip *requiring*
  // one. Without this, a value entered and then hidden by the UI still
  // reached this payload and was rejected by the database's own
  // `job_actuals_completion_type_shape` CHECK, turning a perfectly valid
  // "did not happen" submission into a confusing generic failure.
  const didNotHappen = raw.completionType === "did_not_happen";
  return {
    ok: true,
    payload: {
      activityType: "fertiliser_spreading",
      completionType: raw.completionType,
      fieldIds,
      product: didNotHappen ? undefined : raw.product,
      quantity: didNotHappen ? undefined : raw.quantity,
      quantityUnit: didNotHappen ? undefined : (raw.quantityUnit as "kg" | "t" | "bags" | undefined),
      areaHa: resolveFieldScopedArea(raw.completionType, fieldIds, raw.areaHa, fields),
      note: raw.note,
    },
  };
}

export function validateSlurrySpreadingActual(
  raw: RawJobActualInput,
  fields: FieldAreaContext[],
): JobActualValidationResult<SlurrySpreadingActual> {
  const errors: string[] = [];
  const fieldIds = requireNonEmptyFieldIds(raw.fieldIds, errors);
  if (raw.completionType !== "did_not_happen") {
    // §6B — never infer volume from GPS; a positive farmer-entered figure
    // is required, exactly like fertiliser quantity above.
    if (raw.quantity === undefined || !Number.isFinite(raw.quantity) || raw.quantity <= 0) {
      errors.push("a positive quantity is required");
    }
    if (raw.quantityUnit !== "m3" && raw.quantityUnit !== "gallons") {
      errors.push('quantityUnit must be one of "m3", "gallons"');
    }
  }
  if (raw.slurryType !== undefined && !["cattle_slurry", "pig_slurry", "other"].includes(raw.slurryType)) {
    errors.push('slurryType, when supplied, must be one of "cattle_slurry", "pig_slurry", "other"');
  }
  if (
    raw.applicationMethod !== undefined &&
    !["LESS", "splashplate", "incorporate_24h", "other"].includes(raw.applicationMethod)
  ) {
    errors.push("applicationMethod, when supplied, must be a real supported method");
  }
  if (errors.length > 0) return { ok: false, errors };
  // See validateFertiliserSpreadingActual's identical fix, same Codex
  // audit finding — "did not happen" clears quantity, and (for
  // consistency, though not itself DB-CHECK-enforced) slurryType/
  // applicationMethod too: neither is meaningful for work that never
  // happened.
  const slurryDidNotHappen = raw.completionType === "did_not_happen";
  return {
    ok: true,
    payload: {
      activityType: "slurry_spreading",
      completionType: raw.completionType,
      fieldIds,
      slurryType: slurryDidNotHappen ? undefined : (raw.slurryType as SlurrySpreadingActual["slurryType"]),
      quantity: slurryDidNotHappen ? undefined : raw.quantity,
      quantityUnit: slurryDidNotHappen ? undefined : (raw.quantityUnit as "m3" | "gallons" | undefined),
      applicationMethod: slurryDidNotHappen ? undefined : (raw.applicationMethod as SlurryApplicationMethod | undefined),
      areaHa: resolveFieldScopedArea(raw.completionType, fieldIds, raw.areaHa, fields),
      note: raw.note,
    },
  };
}

export function validateSilageActual(
  raw: RawJobActualInput,
  fields: FieldAreaContext[],
): JobActualValidationResult<SilageActual> {
  const errors: string[] = [];
  const fieldIds = requireNonEmptyFieldIds(raw.fieldIds, errors);
  if (raw.bales !== undefined && (!Number.isFinite(raw.bales) || raw.bales < 0)) {
    errors.push("bales, when supplied, must be a non-negative number");
  }
  if (raw.tonnes !== undefined && (!Number.isFinite(raw.tonnes) || raw.tonnes < 0)) {
    errors.push("tonnes, when supplied, must be a non-negative number");
  }
  if (raw.harvestedAreaHa !== undefined && (!Number.isFinite(raw.harvestedAreaHa) || raw.harvestedAreaHa <= 0)) {
    errors.push("harvestedAreaHa, when supplied, must be a positive number");
  }
  if (errors.length > 0) return { ok: false, errors };
  // Codex audit MEDIUM (round 1, docs/overnight/audits/
  // gps-job-session-actual-contract-codex-audit-round1.md): the prior
  // `raw.harvestedAreaHa ?? resolveFieldScopedArea(...)` let a
  // leftover, already-typed `harvestedAreaHa` take precedence even for
  // `"did_not_happen"` — resolveFieldScopedArea's own honest "no area
  // for did_not_happen" answer was only ever reached if the caller
  // happened to have not supplied one. Fixed: did_not_happen clears
  // harvestedAreaHa/bales/tonnes outright, the same "did not happen
  // means nothing carries through" fix as fertiliser/slurry.
  const silageDidNotHappen = raw.completionType === "did_not_happen";
  // §6C: harvestedAreaHa is farmer-confirmed only, same reasoning as
  // fertiliser/slurry's own areaHa — "whole" may use the real mapped
  // area, "partial" only a farmer-confirmed figure, never manufactured.
  const harvestedAreaHa = silageDidNotHappen
    ? undefined
    : (raw.harvestedAreaHa ?? resolveFieldScopedArea(raw.completionType, fieldIds, undefined, fields));
  return {
    ok: true,
    payload: {
      activityType: "silage",
      completionType: raw.completionType,
      fieldIds,
      harvestedAreaHa,
      bales: silageDidNotHappen ? undefined : raw.bales,
      tonnes: silageDidNotHappen ? undefined : raw.tonnes,
      note: raw.note,
    },
  };
}

export function validateFieldInspectionActual(
  raw: RawJobActualInput,
): JobActualValidationResult<FieldInspectionActual> {
  const errors: string[] = [];
  const fieldIds = requireNonEmptyFieldIds(raw.fieldIds, errors);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      activityType: "field_inspection",
      completionType: raw.completionType,
      fieldIds,
      observedIssueCategory: raw.observedIssueCategory,
      observationNote: raw.observationNote,
      evidenceRef: raw.evidenceRef,
      note: raw.note,
    },
  };
}

/** §6E — "do not force every Job Session to have a field": no `fieldIds`
 * requirement here at all, unlike every other activity's validator. */
export function validateLivestockWorkActual(
  raw: RawJobActualInput,
): JobActualValidationResult<LivestockWorkActual> {
  const errors: string[] = [];
  if (!raw.livestockGroupId && !raw.animalId) {
    errors.push("either livestockGroupId or animalId is required");
  }
  if (!raw.action || raw.action.trim().length === 0) {
    errors.push("action is required");
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      activityType: "livestock_work",
      completionType: raw.completionType,
      livestockGroupId: raw.livestockGroupId,
      animalId: raw.animalId,
      action: raw.action!,
      outcome: raw.outcome,
      note: raw.note,
    },
  };
}

/**
 * The one dispatcher every real caller (`job-actuals.ts`,
 * `ConfirmActualSheet`) uses — routes to the right per-activity validator
 * by `activityType` rather than each call site duplicating that switch.
 */
export function validateJobActualInput(
  activityType: ActivityType,
  raw: RawJobActualInput,
  fields: FieldAreaContext[] = [],
): JobActualValidationResult<JobActualPayload> {
  switch (activityType) {
    case "fertiliser_spreading":
      return validateFertiliserSpreadingActual(raw, fields);
    case "slurry_spreading":
      return validateSlurrySpreadingActual(raw, fields);
    case "silage":
      return validateSilageActual(raw, fields);
    case "field_inspection":
      return validateFieldInspectionActual(raw);
    case "livestock_work":
      return validateLivestockWorkActual(raw);
  }
}

/**
 * §12 — "remaining planned work" derived at display time, never persisted
 * as a mutation of the original plan. `plannedAreaHa` is whatever the
 * caller considers "the plan" for this field (today, the field's own
 * real mapped area — no separate "planned work area" concept exists
 * elsewhere in this repo yet). Floors at 0 — a confirmed Actual area
 * larger than the plan (e.g. a farmer over-reports, or the field was
 * remapped smaller since planning) must never show as a negative
 * "remaining" figure.
 */
export function computeRemainingPlannedAreaHa(plannedAreaHa: number, confirmedActualAreaHa: number): number {
  return Math.max(0, plannedAreaHa - confirmedActualAreaHa);
}

export const JOB_ACTUAL_VERSION = "job_actual_v1.0.0";
