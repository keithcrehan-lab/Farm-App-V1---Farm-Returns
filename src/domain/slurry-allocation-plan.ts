/**
 * Slurry planning entry — validation for a farmer-created field slurry
 * allocation, plus the "slurry spreading is open but nothing is planned"
 * Today entry state.
 *
 * Adds NO scientific, regulatory or economic logic. A new allocation is
 * the same canonical `SlurryAllocation` record (`slurry_allocations`) the
 * What Matters pipeline already reads; this module only checks that what
 * the farmer entered is well-formed and consistent with records Farm Return
 * already holds (the field, the slurry store, the store's real unallocated
 * volume from `slurry-storage.ts`). Every value — store, field, volume,
 * method, date — comes from the farmer; nothing is defaulted or chosen for
 * them. A farmer-planned allocation carries no `priority`/`score`: those
 * are ranking outputs no audited engine has produced for it.
 */
import type { Field, Housing, SlurryAllocation } from "./types";
import { buildSlurryTankView, type FarmSlurryStorageOverview, type SlurryTankView } from "./slurry-storage";
import { SLURRY_VOLUME_MAX_DECIMAL_PLACES } from "./slurry-whole-farm-allocation";

/** A volume at Phase 6's own documented m³ precision boundary, so float
 * noise from `capacity × fill%` (e.g. 115.99999999999999) never rejects a
 * farmer who types the figure they were shown. */
function atVolumePrecision(volumeM3: number): number {
  const factor = 10 ** SLURRY_VOLUME_MAX_DECIMAL_PLACES;
  return Math.round(volumeM3 * factor) / factor;
}

/** A store's real unallocated slurry (`slurry-storage.ts`) at that precision. */
export function availableToPlanM3(tank: Pick<SlurryTankView, "unallocatedM3">): number {
  return atVolumePrecision(tank.unallocatedM3);
}

export const SLURRY_ALLOCATION_PLAN_VALIDATION_VERSION = "slurry_allocation_plan_validation_v1.0.0";

export type SlurryApplicationMethod = NonNullable<SlurryAllocation["applicationMethod"]>["value"];

export const SLURRY_APPLICATION_METHOD_OPTIONS: readonly { value: SlurryApplicationMethod; label: string }[] = [
  { value: "LESS", label: "Low Emission Slurry Spreading (LESS)" },
  { value: "splashplate", label: "Splashplate" },
  { value: "incorporate_24h", label: "Incorporated within 24 hours" },
  { value: "other", label: "Other" },
];

/** Raw farmer input — strings straight from the form, so nothing is
 * coerced before it is checked. */
export interface NewSlurryAllocationPlanInput {
  fieldId: string;
  housingId: string;
  volumeM3: string;
  applicationMethod: string;
  applicationDate: string;
}

export interface ValidSlurryAllocationPlan {
  fieldId: string;
  housingId: string;
  volumeM3: number;
  applicationMethod: SlurryApplicationMethod;
  applicationDate: string;
  /** True when the field already has planned slurry from a different
   * store. Such a field cannot currently become a What Matters candidate
   * (the resolver gives it no combined date), so the UI must say so
   * rather than promise an evaluation. */
  createsMultiSourcePlan: boolean;
}

export type SlurryAllocationPlanIssue =
  | "FIELD_NOT_FOUND"
  | "STORE_NOT_FOUND"
  | "ALREADY_PLANNED_FROM_STORE"
  | "VOLUME_INVALID"
  | "VOLUME_EXCEEDS_AVAILABLE"
  | "METHOD_INVALID"
  | "DATE_INVALID";

export type SlurryAllocationPlanValidation =
  | { status: "OK"; value: ValidSlurryAllocationPlan; version: string }
  | { status: "INVALID"; issues: SlurryAllocationPlanIssue[]; version: string };

export const SLURRY_ALLOCATION_PLAN_ISSUE_COPY: Record<SlurryAllocationPlanIssue, string> = {
  FIELD_NOT_FOUND: "Choose a field.",
  STORE_NOT_FOUND: "Choose the slurry store this slurry comes from.",
  ALREADY_PLANNED_FROM_STORE: "This field already has slurry planned from this store. Edit it from the field instead.",
  VOLUME_INVALID: "Enter the volume you plan to spread, in m³.",
  VOLUME_EXCEEDS_AVAILABLE: "That's more slurry than this store has available to plan.",
  METHOD_INVALID: "Choose how the slurry will be spread.",
  DATE_INVALID: "Choose the date you plan to spread.",
};

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateNewSlurryAllocationPlan(
  input: NewSlurryAllocationPlanInput,
  context: { fields: readonly Pick<Field, "id" | "archivedAt">[]; housingList: readonly Housing[]; allocations: readonly SlurryAllocation[] },
): SlurryAllocationPlanValidation {
  const issues: SlurryAllocationPlanIssue[] = [];

  const field = context.fields.find((f) => f.id === input.fieldId && !f.archivedAt);
  if (!field) issues.push("FIELD_NOT_FOUND");
  const housing = context.housingList.find((h) => h.id === input.housingId);
  if (!housing) issues.push("STORE_NOT_FOUND");
  if (field && housing && context.allocations.some((a) => a.fieldId === field.id && a.housingId === housing.id)) {
    issues.push("ALREADY_PLANNED_FROM_STORE");
  }

  const volumeText = input.volumeM3.trim();
  const volumeM3 = Number(volumeText);
  if (volumeText === "" || !Number.isFinite(volumeM3) || volumeM3 <= 0) {
    issues.push("VOLUME_INVALID");
  } else if (housing && volumeM3 > availableToPlanM3(buildSlurryTankView(housing, context.allocations))) {
    issues.push("VOLUME_EXCEEDS_AVAILABLE");
  }

  const method = SLURRY_APPLICATION_METHOD_OPTIONS.find((o) => o.value === input.applicationMethod)?.value;
  if (!method) issues.push("METHOD_INVALID");
  if (!isIsoDate(input.applicationDate)) issues.push("DATE_INVALID");

  if (issues.length > 0 || !field || !housing || !method) {
    return { status: "INVALID", issues, version: SLURRY_ALLOCATION_PLAN_VALIDATION_VERSION };
  }

  const createsMultiSourcePlan = context.allocations.some((a) => a.fieldId === field.id && a.housingId !== housing.id && a.priority !== "not_suitable");
  return {
    status: "OK",
    value: { fieldId: field.id, housingId: housing.id, volumeM3, applicationMethod: method, applicationDate: input.applicationDate, createsMultiSourcePlan },
    version: SLURRY_ALLOCATION_PLAN_VALIDATION_VERSION,
  };
}

export interface SlurryPlanningEntry {
  openFieldCount: number;
  /** Present only when every store holding slurry has a farmer-recorded
   * fill level — an estimated/backfilled fill is not stated as a fact. */
  availableVolumeM3?: number;
}

/**
 * Today's "Slurry spreading is open" entry: slurry is physically available
 * in storage, at least one field is currently open for slurry spreading (the
 * existing statutory spreading-window Prompts, counted by the caller), and
 * the farm has no persisted field slurry allocation What Matters could
 * evaluate. Returns `undefined` whenever any of those is not established —
 * an unknown count or volume never becomes a zero or a claim.
 */
export function buildSlurryPlanningEntry(input: {
  plannedSlurryFieldCount: number | undefined;
  openSlurryFieldCount: number;
  storage: Pick<FarmSlurryStorageOverview, "tanks" | "totalUnallocatedM3">;
}): SlurryPlanningEntry | undefined {
  if (input.plannedSlurryFieldCount !== 0) return undefined;
  if (input.openSlurryFieldCount <= 0) return undefined;
  const availableVolumeM3 = atVolumePrecision(input.storage.totalUnallocatedM3);
  if (!(availableVolumeM3 > 0)) return undefined;
  const tanksWithSlurry = input.storage.tanks.filter((t) => t.volumeM3 > 0);
  const volumeReliable = tanksWithSlurry.length > 0 && tanksWithSlurry.every((t) => t.status === "farmer_recorded");
  return {
    openFieldCount: input.openSlurryFieldCount,
    ...(volumeReliable ? { availableVolumeM3 } : {}),
  };
}
