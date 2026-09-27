/**
 * Phase 1A — canonical slurry allocation lifecycle and physical store
 * reconciliation. Design record: `docs/farm-return-next/SLURRY_ALLOCATION_LIFECYCLE.md`.
 *
 * The database (`20260926000000_slurry_allocation_lifecycle.sql`) is the
 * authority: its triggers enforce every transition and the store-capacity
 * invariant for every write path. This module is the pure mirror the
 * application uses to validate input before it reaches the database, to
 * map database rejections to issue codes, and to display the reconciled
 * store volume the database enforces. It adds NO agronomy, NO nutrient
 * coefficient and NO regulatory conversion: every volume here is PHYSICAL
 * m³ in a store or spread from it, never regulatory neat slurry, and
 * nothing here derives N/P from it.
 */
import type { Housing, SlurryAllocation } from "./types";
import { SLURRY_VOLUME_MAX_DECIMAL_PLACES } from "./slurry-whole-farm-allocation";

export const SLURRY_ALLOCATION_LIFECYCLE_VERSION = "slurry_allocation_lifecycle_v1.0.0";

/** planned — reserves physical slurry in its store; completed — slurry was
 * actually spread (actual volume recorded, reservation released);
 * cancelled — kept for history, reserves nothing. */
export type SlurryAllocationStatus = "planned" | "completed" | "cancelled";

/** How a completion relates to the store's current fill observation:
 * spread after it (the actual volume is withdrawn from that observation) or
 * already reflected in it (the observation was taken after the spread). */
export type SlurryStoreReconciliation = "withdrawn_after_observation" | "reflected_in_observation";

/** Permitted transitions. planned → planned is an edit. Completed and
 * cancelled are terminal: reopening would be a separate, explicit future
 * transition, never an edit. */
export const SLURRY_ALLOCATION_TRANSITIONS: Readonly<Record<SlurryAllocationStatus, readonly SlurryAllocationStatus[]>> = {
  planned: ["planned", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionSlurryAllocation(from: SlurryAllocationStatus, to: SlurryAllocationStatus): boolean {
  return SLURRY_ALLOCATION_TRANSITIONS[from].includes(to);
}

/** One persisted allocation with its full lifecycle — planned volume and
 * actual completed volume are separate fields and never overwrite each
 * other. */
export interface SlurryAllocationRecord extends SlurryAllocation {
  id: string;
  farmId: string;
  status: SlurryAllocationStatus;
  createdAt: string;
  updatedAt: string;
  actualVolumeM3?: number;
  actualSpreadDate?: string;
  storeReconciliation?: SlurryStoreReconciliation;
  /** The store observation (`Housing.storeObservationSeq`) this completion
   * was reconciled against. */
  storeObservationSeq?: number;
  completedAt?: string;
  completedBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

export function isActiveReservation(record: Pick<SlurryAllocationRecord, "status">): boolean {
  return record.status === "planned";
}

function atVolumePrecision(volumeM3: number): number {
  const factor = 10 ** SLURRY_VOLUME_MAX_DECIMAL_PLACES;
  return Math.round(volumeM3 * factor) / factor;
}

/** Σ actual m³ withdrawn from `housingId` against observation `observationSeq`
 * — the database's `slurry_store_withdrawn_since_observation_m3`. */
export function storeWithdrawnSinceObservationM3(
  housingId: string,
  observationSeq: number,
  records: readonly Pick<SlurryAllocationRecord, "housingId" | "status" | "storeReconciliation" | "storeObservationSeq" | "actualVolumeM3">[],
): number {
  return records
    .filter(
      (r) =>
        r.housingId === housingId &&
        r.status === "completed" &&
        r.storeReconciliation === "withdrawn_after_observation" &&
        r.storeObservationSeq === observationSeq,
    )
    .reduce((sum, r) => sum + (r.actualVolumeM3 ?? 0), 0);
}

/** The store's fill-observation columns as one housing write sees them. */
export interface StoreObservationState {
  storageFillStatus: "estimated" | "farmer_recorded";
  storageFillRecordedAt?: string;
  storeObservationSeq: number;
  storeObservedAt?: string;
}

/** `housing_track_store_observation` — the observation identity after a
 * housing UPDATE. Only a freshly-stamped farmer-recorded reading (status
 * `farmer_recorded`, a new non-null `storageFillRecordedAt`) is a new
 * observation. Any `storeObservationSeq`/`storeObservedAt` in the write is
 * discarded, and an 'estimated' fill change, a capacity correction or any
 * other edit keeps the current observation — so completed withdrawals stay
 * deducted. `observedAt` is the database clock at the write. */
export function storeObservationAfterUpdate(
  before: StoreObservationState,
  written: StoreObservationState,
  observedAt: string,
): Pick<StoreObservationState, "storeObservationSeq" | "storeObservedAt"> {
  const newReading =
    written.storageFillStatus === "farmer_recorded" &&
    written.storageFillRecordedAt !== undefined &&
    written.storageFillRecordedAt !== before.storageFillRecordedAt;
  if (newReading) return { storeObservationSeq: before.storeObservationSeq + 1, storeObservedAt: observedAt };
  return { storeObservationSeq: before.storeObservationSeq, ...(before.storeObservedAt !== undefined ? { storeObservedAt: before.storeObservedAt } : {}) };
}

/** `capacity × fill% / 100`, non-finite → 0 — `slurry_store_observed_volume_m3`. */
export function storeObservedVolumeM3(housing: Pick<Housing, "storageCapacityM3" | "storageFillPct">): number {
  const v = housing.storageCapacityM3 * (housing.storageFillPct / 100);
  return Number.isFinite(v) ? v : 0;
}

/** observed − completed withdrawals since that observation: the physical
 * slurry the store currently holds (never re-counts spread slurry). */
export function storeReconciledVolumeM3(
  housing: Pick<Housing, "storageCapacityM3" | "storageFillPct" | "storeWithdrawnSinceObservationM3">,
): number {
  return storeObservedVolumeM3(housing) - (housing.storeWithdrawnSinceObservationM3 ?? 0);
}

/** Current fill % from the reconciled volume; 0 when capacity is not a
 * positive finite figure (never divides by zero). */
export function storeReconciledFillPct(
  housing: Pick<Housing, "storageCapacityM3" | "storageFillPct" | "storeWithdrawnSinceObservationM3">,
): number {
  const capacity = housing.storageCapacityM3;
  if (!Number.isFinite(capacity) || capacity <= 0) return 0;
  return (storeReconciledVolumeM3(housing) / capacity) * 100;
}

export interface SlurryStoreReconciliationView {
  observedM3: number;
  withdrawnSinceObservationM3: number;
  /** observed − withdrawn: physical slurry the store currently holds. */
  reconciledM3: number;
  /** Σ planned volumes — active reservations only. */
  reservedM3: number;
  /** round(max(0, reconciled − reserved), 2). */
  availableM3: number;
}

/** The database invariant's own figures for one store. */
export function reconcileSlurryStore(
  housing: Pick<Housing, "id" | "storageCapacityM3" | "storageFillPct" | "storeWithdrawnSinceObservationM3">,
  activePlans: readonly Pick<SlurryAllocation, "housingId" | "volumeM3">[],
): SlurryStoreReconciliationView {
  const observedM3 = storeObservedVolumeM3(housing);
  const withdrawnSinceObservationM3 = housing.storeWithdrawnSinceObservationM3 ?? 0;
  const reconciledM3 = storeReconciledVolumeM3(housing);
  const reservedM3 = activePlans.filter((a) => a.housingId === housing.id).reduce((sum, a) => sum + a.volumeM3, 0);
  return {
    observedM3,
    withdrawnSinceObservationM3,
    reconciledM3,
    reservedM3,
    availableM3: atVolumePrecision(Math.max(0, reconciledM3 - reservedM3)),
  };
}

/** Calendar date (YYYY-MM-DD) of an instant in Europe/Dublin — the
 * database's `(t at time zone 'Europe/Dublin')::date`. */
export function dublinDate(instant: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    typeof instant === "string" ? new Date(instant) : instant,
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Which reconciliation a spread on `spreadDate` may use against a store's
 * current observation — `slurry_store_reconciliation_for_spread`. A legacy
 * observation of unknown instant (`storeObservedAt` and
 * `storageFillRecordedAt` both absent) is bounded above by `updatedAt`. */
export function reconciliationForSpread(
  store: { storeObservedAt?: string; storageFillRecordedAt?: string; updatedAt: string },
  spreadDate: string,
): SlurryStoreReconciliation | "ambiguous" {
  const exact = store.storeObservedAt !== undefined || store.storageFillRecordedAt !== undefined;
  const observationDate = dublinDate(store.storeObservedAt ?? store.storageFillRecordedAt ?? store.updatedAt);
  if (spreadDate > observationDate) return "withdrawn_after_observation";
  if (spreadDate < observationDate && exact) return "reflected_in_observation";
  return "ambiguous";
}

// ---------------------------------------------------------------------------
// Runtime input validation and database rejection mapping
// ---------------------------------------------------------------------------

export type SlurryAllocationLifecycleIssue =
  | "ALLOCATION_NOT_FOUND"
  | "NOT_PLANNED"
  | "ALREADY_COMPLETED"
  | "TRANSITION_INVALID"
  | "TRANSITION_CHANGES_PLAN"
  | "ACTUAL_VOLUME_INVALID"
  | "SPREAD_DATE_INVALID"
  | "RECONCILIATION_REQUIRED"
  | "RECONCILIATION_INVALID"
  | "HISTORY_PROTECTED"
  | "FIELD_NOT_FOUND"
  | "STORE_NOT_FOUND"
  | "ALREADY_PLANNED_FROM_STORE"
  | "VOLUME_INVALID"
  | "VOLUME_EXCEEDS_AVAILABLE"
  | "STORE_OBSERVATION_CONFLICT"
  | "FILL_INVALID";

export const SLURRY_ALLOCATION_LIFECYCLE_ISSUE_COPY: Record<SlurryAllocationLifecycleIssue, string> = {
  ALLOCATION_NOT_FOUND: "That slurry plan could not be found.",
  NOT_PLANNED: "This slurry plan has already been completed or cancelled, so it can't be changed.",
  ALREADY_COMPLETED: "This slurry plan has already been recorded as spread.",
  TRANSITION_INVALID: "That change isn't allowed for this slurry plan.",
  TRANSITION_CHANGES_PLAN: "Completing or cancelling a plan can't also change its field, store or planned volume.",
  ACTUAL_VOLUME_INVALID: "Enter the volume actually spread, in m³.",
  SPREAD_DATE_INVALID: "Enter the date the slurry was spread (not a future date).",
  RECONCILIATION_REQUIRED: "Say whether this spreading happened before or after the store's latest fill reading.",
  RECONCILIATION_INVALID: "That doesn't match the date of the store's latest fill reading.",
  HISTORY_PROTECTED: "Completed and cancelled slurry plans are kept as history and can't be deleted.",
  FIELD_NOT_FOUND: "Choose a field.",
  STORE_NOT_FOUND: "Choose the slurry store this slurry comes from.",
  ALREADY_PLANNED_FROM_STORE: "This field already has slurry planned from this store.",
  VOLUME_INVALID: "Enter the volume you plan to spread, in m³.",
  VOLUME_EXCEEDS_AVAILABLE: "That's more slurry than this store has available.",
  STORE_OBSERVATION_CONFLICT:
    "That fill level is below the slurry already planned from this store. Complete, reduce or cancel those plans first — nothing was changed.",
  FILL_INVALID: "Enter the store's current fill as a percentage between 0 and 100.",
};

const ISSUES = Object.keys(SLURRY_ALLOCATION_LIFECYCLE_ISSUE_COPY) as SlurryAllocationLifecycleIssue[];

export function isSlurryAllocationLifecycleIssue(value: string): value is SlurryAllocationLifecycleIssue {
  return (ISSUES as string[]).includes(value);
}

export class SlurryAllocationLifecycleRejectedError extends Error {
  readonly issues: SlurryAllocationLifecycleIssue[];
  constructor(issues: SlurryAllocationLifecycleIssue[]) {
    super(issues.map((i) => SLURRY_ALLOCATION_LIFECYCLE_ISSUE_COPY[i]).join(" "));
    this.name = "SlurryAllocationLifecycleRejectedError";
    this.issues = issues;
  }
}

const DB_PREFIXES = ["slurry_allocation_lifecycle_rejected:", "slurry_allocation_plan_rejected:", "slurry_store_observation_rejected:"];

/** Maps a database rejection raised by the lifecycle triggers/RPCs to its
 * issue; `undefined` for any other error. */
export function lifecycleIssueFromDbError(error: { code?: string; message?: string }): SlurryAllocationLifecycleIssue | undefined {
  const message = error.message ?? "";
  for (const prefix of DB_PREFIXES) {
    const at = message.indexOf(prefix);
    if (at >= 0) {
      const code = message.slice(at + prefix.length).trim().split(/\s/)[0];
      if (isSlurryAllocationLifecycleIssue(code)) return code;
    }
  }
  if (message.includes("housing_store_volume_below_allocated")) return "STORE_OBSERVATION_CONFLICT";
  if (error.code === "23505") return "ALREADY_PLANNED_FROM_STORE";
  return undefined;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function positiveVolume(text: unknown): number | undefined {
  if (typeof text !== "string" && typeof text !== "number") return undefined;
  const trimmed = String(text).trim();
  const v = Number(trimmed);
  return trimmed !== "" && Number.isFinite(v) && v > 0 ? v : undefined;
}

type Validation<T> = { status: "OK"; value: T; version: string } | { status: "INVALID"; issues: SlurryAllocationLifecycleIssue[]; version: string };

function result<T>(issues: SlurryAllocationLifecycleIssue[], value: () => T): Validation<T> {
  return issues.length > 0
    ? { status: "INVALID", issues, version: SLURRY_ALLOCATION_LIFECYCLE_VERSION }
    : { status: "OK", value: value(), version: SLURRY_ALLOCATION_LIFECYCLE_VERSION };
}

export interface SlurryAllocationEditInput {
  allocationId: string;
  fieldId: string;
  housingId: string;
  volumeM3: string | number;
}
export interface ValidSlurryAllocationEdit {
  allocationId: string;
  fieldId: string;
  housingId: string;
  volumeM3: number;
}

/** Shape-only checks; ownership, state and capacity are re-checked by the
 * database in one transaction. */
export function validateSlurryAllocationEdit(input: SlurryAllocationEditInput): Validation<ValidSlurryAllocationEdit> {
  const issues: SlurryAllocationLifecycleIssue[] = [];
  if (typeof input.allocationId !== "string" || input.allocationId.trim() === "") issues.push("ALLOCATION_NOT_FOUND");
  if (typeof input.fieldId !== "string" || input.fieldId.trim() === "") issues.push("FIELD_NOT_FOUND");
  if (typeof input.housingId !== "string" || input.housingId.trim() === "") issues.push("STORE_NOT_FOUND");
  const volumeM3 = positiveVolume(input.volumeM3);
  if (volumeM3 === undefined) issues.push("VOLUME_INVALID");
  return result(issues, () => ({ allocationId: input.allocationId, fieldId: input.fieldId, housingId: input.housingId, volumeM3: volumeM3! }));
}

export interface SlurryAllocationCompletionInput {
  allocationId: string;
  actualVolumeM3: string | number;
  actualSpreadDate: string;
  /** Required only when the spread date cannot be ordered against the
   * store's current observation (`reconciliationForSpread` → "ambiguous"). */
  storeReconciliation?: string;
}
export interface ValidSlurryAllocationCompletion {
  allocationId: string;
  actualVolumeM3: number;
  actualSpreadDate: string;
  storeReconciliation?: SlurryStoreReconciliation;
}

export function validateSlurryAllocationCompletion(
  input: SlurryAllocationCompletionInput,
  today: string,
): Validation<ValidSlurryAllocationCompletion> {
  const issues: SlurryAllocationLifecycleIssue[] = [];
  if (typeof input.allocationId !== "string" || input.allocationId.trim() === "") issues.push("ALLOCATION_NOT_FOUND");
  const actualVolumeM3 = positiveVolume(input.actualVolumeM3);
  if (actualVolumeM3 === undefined) issues.push("ACTUAL_VOLUME_INVALID");
  if (typeof input.actualSpreadDate !== "string" || !isIsoDate(input.actualSpreadDate) || input.actualSpreadDate > today) {
    issues.push("SPREAD_DATE_INVALID");
  }
  const reconciliation = input.storeReconciliation;
  if (reconciliation !== undefined && reconciliation !== "withdrawn_after_observation" && reconciliation !== "reflected_in_observation") {
    issues.push("RECONCILIATION_INVALID");
  }
  return result(issues, () => ({
    allocationId: input.allocationId,
    actualVolumeM3: actualVolumeM3!,
    actualSpreadDate: input.actualSpreadDate,
    ...(reconciliation !== undefined ? { storeReconciliation: reconciliation as SlurryStoreReconciliation } : {}),
  }));
}

/** A fill observation, 0-100 %. */
export function validateSlurryStoreObservation(input: { housingId: string; fillPct: string | number }): Validation<{ housingId: string; fillPct: number }> {
  const issues: SlurryAllocationLifecycleIssue[] = [];
  if (typeof input.housingId !== "string" || input.housingId.trim() === "") issues.push("STORE_NOT_FOUND");
  const text = typeof input.fillPct === "number" || typeof input.fillPct === "string" ? String(input.fillPct).trim() : "";
  const fillPct = Number(text);
  if (text === "" || !Number.isFinite(fillPct) || fillPct < 0 || fillPct > 100) issues.push("FILL_INVALID");
  return result(issues, () => ({ housingId: input.housingId, fillPct }));
}
