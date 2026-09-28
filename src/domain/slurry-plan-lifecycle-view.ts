/**
 * Phase 1B — the farmer-facing slurry plan view over the Phase 1A
 * lifecycle (`slurry-allocation-lifecycle.ts`). Design record:
 * `docs/farm-return-next/SLURRY_ALLOCATION_LIFECYCLE.md` § Phase 1B.
 *
 * Pure presentation grouping only: every store figure comes from
 * `reconcileSlurryStore` (the database invariant's own mirror), so the UI
 * never re-derives capacity. It adds NO agronomy, NO rate and NO
 * recommendation — which field gets slurry, and how much, stays the
 * farmer's own plan. Every volume is PHYSICAL m³.
 */
import type { Housing } from "./types";
import {
  SLURRY_ALLOCATION_LIFECYCLE_ISSUE_COPY,
  isActiveReservation,
  reconcileSlurryStore,
  reconciliationForSpread,
  storeObservedVolumeM3,
  storeWithdrawnSinceObservationM3,
  type SlurryAllocationLifecycleIssue,
  type SlurryAllocationRecord,
  type SlurryStoreReconciliation,
  type ValidSlurryAllocationCompletion,
  type ValidSlurryAllocationEdit,
} from "./slurry-allocation-lifecycle";

export const SLURRY_PLAN_LIFECYCLE_VIEW_VERSION = "slurry_plan_lifecycle_view_v1.0.0";

export interface SlurryStorePlanView {
  housingId: string;
  shedName: string;
  /** false when the store has no positive capacity on file — its volume is
   * unknown, never shown as 0 m³, and it makes the farm physical totals
   * unknown too (a partial sum is never shown as the farm figure). */
  volumeKnown: boolean;
  /** Reconciled physical slurry: last reading − completed withdrawals since. */
  currentM3: number;
  /** Σ planned volumes from this store (reserved, still in the tank). */
  reservedM3: number;
  /** max(0, current − reserved) — the database's own available figure. */
  unallocatedM3: number;
  /** The last tank reading itself (historical evidence, not "now"). */
  observedM3: number;
  observedFillPct: number;
  currentFillPct: number;
  observationStatus: Housing["storageFillStatus"];
  observationRecordedAt?: string;
  /** True when spreading recorded since the reading makes the current
   * figure differ from it — the only case the reading is shown separately. */
  differsFromReading: boolean;
}

export interface SlurryPlanTotals {
  /** Absent when any store's volume is unknown — never a partial sum. */
  currentM3?: number;
  /** Σ every active plan, whether or not its store's volume is known. */
  reservedM3: number;
  /** Absent when any store's volume is unknown — never a partial sum. */
  unallocatedM3?: number;
  /** Stores with no known volume; while > 0 the physical totals are absent. */
  storesWithUnknownVolume: number;
}

export interface SlurryPlanLifecycleView {
  stores: SlurryStorePlanView[];
  /** `undefined` when there is no slurry store at all — never a fabricated 0. */
  totals?: SlurryPlanTotals;
  /** Active plans, soonest planned date first (undated last). */
  planned: SlurryAllocationRecord[];
  /** Most recently spread first. */
  completed: SlurryAllocationRecord[];
  /** Most recently cancelled first. */
  cancelled: SlurryAllocationRecord[];
  version: string;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function buildSlurryPlanLifecycleView(housing: readonly Housing[], records: readonly SlurryAllocationRecord[]): SlurryPlanLifecycleView {
  const planned = records.filter(isActiveReservation);
  const referenced = new Set(records.map((r) => r.housingId));
  const stores = housing
    .filter((h) => (Number.isFinite(h.storageCapacityM3) && h.storageCapacityM3 > 0) || referenced.has(h.id))
    .map((h): SlurryStorePlanView => {
      const volumeKnown = Number.isFinite(h.storageCapacityM3) && h.storageCapacityM3 > 0;
      const r = reconcileSlurryStore(h, planned);
      return {
        housingId: h.id,
        shedName: h.shedName,
        volumeKnown,
        currentM3: r.reconciledM3,
        reservedM3: r.reservedM3,
        unallocatedM3: r.availableM3,
        observedM3: storeObservedVolumeM3(h),
        observedFillPct: h.storageFillPct,
        currentFillPct: volumeKnown ? (r.reconciledM3 / h.storageCapacityM3) * 100 : 0,
        observationStatus: h.storageFillStatus,
        ...(h.storageFillRecordedAt ? { observationRecordedAt: h.storageFillRecordedAt } : {}),
        differsFromReading: round2(r.withdrawnSinceObservationM3) > 0,
      };
    });

  const unknownStores = stores.filter((s) => !s.volumeKnown).length;
  const totals: SlurryPlanTotals | undefined =
    stores.length === 0
      ? undefined
      : {
          ...(unknownStores === 0
            ? {
                currentM3: round2(stores.reduce((sum, s) => sum + s.currentM3, 0)),
                unallocatedM3: round2(stores.reduce((sum, s) => sum + s.unallocatedM3, 0)),
              }
            : {}),
          reservedM3: round2(planned.reduce((sum, r) => sum + r.volumeM3, 0)),
          storesWithUnknownVolume: unknownStores,
        };

  const plannedDate = (r: SlurryAllocationRecord) => r.applicationDate?.value ?? "9999-12-31";
  return {
    stores,
    ...(totals ? { totals } : {}),
    planned: [...planned].sort((a, b) => plannedDate(a).localeCompare(plannedDate(b)) || a.createdAt.localeCompare(b.createdAt)),
    completed: records
      .filter((r) => r.status === "completed")
      .sort((a, b) => (b.actualSpreadDate ?? "").localeCompare(a.actualSpreadDate ?? "") || (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    cancelled: records.filter((r) => r.status === "cancelled").sort((a, b) => (b.cancelledAt ?? "").localeCompare(a.cancelledAt ?? "")),
    version: SLURRY_PLAN_LIFECYCLE_VIEW_VERSION,
  };
}

/** How much of `store` a planned `record` could use if edited to draw from
 * it: the store's unallocated slurry plus the plan's own reservation when
 * it already draws from that store. A hint only — the database decides. */
export function storeAvailableForPlanM3(store: SlurryStorePlanView, record: Pick<SlurryAllocationRecord, "housingId" | "volumeM3">): number {
  return round2(store.unallocatedM3 + (record.housingId === store.housingId ? record.volumeM3 : 0));
}

// ---------------------------------------------------------------------------
// Farmer language for lifecycle outcomes
// ---------------------------------------------------------------------------

export type SlurryLifecycleActionKind = "edit" | "cancel" | "complete";

/** Issues meaning the plan changed since the screen loaded (another tab, a
 * concurrent write): the UI refreshes from the server and says so. */
const STALE_ISSUES: readonly SlurryAllocationLifecycleIssue[] = ["ALLOCATION_NOT_FOUND", "NOT_PLANNED", "ALREADY_COMPLETED"];

export function isStaleSlurryLifecycleIssue(issue: SlurryAllocationLifecycleIssue): boolean {
  return STALE_ISSUES.includes(issue);
}

const STALE_COPY = "This plan was already changed — it may have been recorded as spread or cancelled elsewhere. Your plan has been refreshed.";

/** Plain-language message for a refused lifecycle action — never an issue
 * code. `RECONCILIATION_REQUIRED` is normally answered by the tank-reading
 * question instead (`SLURRY_RECONCILIATION_QUESTION`). */
export function describeSlurryLifecycleIssues(issues: readonly SlurryAllocationLifecycleIssue[], kind: SlurryLifecycleActionKind): string {
  if (issues.some(isStaleSlurryLifecycleIssue)) return STALE_COPY;
  const messages = issues.map((issue) => {
    if (issue === "VOLUME_EXCEEDS_AVAILABLE") {
      return kind === "complete"
        ? "There isn't enough slurry left in this store to record that much as spread. Check the volume, or record a new tank reading first."
        : "There isn't enough unallocated slurry in this store for that change.";
    }
    return SLURRY_ALLOCATION_LIFECYCLE_ISSUE_COPY[issue];
  });
  return [...new Set(messages)].join(" ");
}

export const SLURRY_LIFECYCLE_UNEXPECTED_ERROR_COPY = "Something went wrong and nothing was saved. Please try again.";

/** The one question asked when a spread date can't be ordered against the
 * store's latest tank reading (same day, or a reading of unknown time).
 * Each answer maps to the canonical Phase 1A reconciliation. */
export const SLURRY_RECONCILIATION_QUESTION: {
  prompt: string;
  options: readonly { value: SlurryStoreReconciliation; label: string }[];
} = {
  prompt: "Was this spreading already included in your latest tank reading?",
  options: [
    { value: "reflected_in_observation", label: "Yes, the tank reading was taken after this slurry was spread." },
    { value: "withdrawn_after_observation", label: "No, the slurry was spread after the tank reading." },
  ],
};

// ---------------------------------------------------------------------------
// Demo-farm (mock mode) mirror
// ---------------------------------------------------------------------------
// A signed-in farm never uses these: its transitions go to the database
// RPCs, which are the authority. The demo farm has no database, so the farm
// store applies the SAME rules locally through the Phase 1A mirror
// (`reconcileSlurryStore`, `reconciliationForSpread`,
// `storeWithdrawnSinceObservationM3`) — no rule is restated here.

export type LocalSlurryLifecycleResult =
  | { status: "saved"; record: SlurryAllocationRecord; records: SlurryAllocationRecord[] }
  | { status: "rejected"; issues: SlurryAllocationLifecycleIssue[] };

function rejected(issue: SlurryAllocationLifecycleIssue): LocalSlurryLifecycleResult {
  return { status: "rejected", issues: [issue] };
}

function replaced(records: readonly SlurryAllocationRecord[], record: SlurryAllocationRecord): LocalSlurryLifecycleResult {
  return { status: "saved", record, records: records.map((r) => (r.id === record.id ? record : r)) };
}

/** Available m³ in `store` for `allocationId`, excluding its own reservation. */
function availableExcluding(store: Housing, records: readonly SlurryAllocationRecord[], allocationId: string): number {
  return reconcileSlurryStore(
    store,
    records.filter((r) => isActiveReservation(r) && r.id !== allocationId),
  ).availableM3;
}

export function applyLocalSlurryEdit(
  housing: readonly Housing[],
  fieldIds: readonly string[],
  records: readonly SlurryAllocationRecord[],
  edit: ValidSlurryAllocationEdit,
  now: string,
): LocalSlurryLifecycleResult {
  const current = records.find((r) => r.id === edit.allocationId);
  if (!current) return rejected("ALLOCATION_NOT_FOUND");
  if (current.status !== "planned") return rejected("NOT_PLANNED");
  if (!fieldIds.includes(edit.fieldId)) return rejected("FIELD_NOT_FOUND");
  const store = housing.find((h) => h.id === edit.housingId);
  if (!store) return rejected("STORE_NOT_FOUND");
  if (records.some((r) => r.id !== current.id && isActiveReservation(r) && r.fieldId === edit.fieldId && r.housingId === edit.housingId)) {
    return rejected("ALREADY_PLANNED_FROM_STORE");
  }
  const consumes = edit.housingId !== current.housingId || edit.volumeM3 > current.volumeM3;
  if (consumes && edit.volumeM3 > availableExcluding(store, records, current.id)) return rejected("VOLUME_EXCEEDS_AVAILABLE");
  // Mirrors the database's `plan_revision` rule: any change of field, store
  // or planned volume is a new revision (earlier origin evidence stops applying).
  const changed = edit.fieldId !== current.fieldId || edit.housingId !== current.housingId || edit.volumeM3 !== current.volumeM3;
  const planRevision = changed && current.planRevision !== undefined ? current.planRevision + 1 : current.planRevision;
  return replaced(records, {
    ...current,
    fieldId: edit.fieldId,
    housingId: edit.housingId,
    volumeM3: edit.volumeM3,
    updatedAt: now,
    ...(planRevision !== undefined ? { planRevision } : {}),
  });
}

export function applyLocalSlurryCancel(records: readonly SlurryAllocationRecord[], allocationId: string, now: string, by: string): LocalSlurryLifecycleResult {
  const current = records.find((r) => r.id === allocationId);
  if (!current) return rejected("ALLOCATION_NOT_FOUND");
  if (current.status === "cancelled") return { status: "saved", record: current, records: [...records] };
  if (current.status !== "planned") return rejected("NOT_PLANNED");
  return replaced(records, { ...current, status: "cancelled", cancelledAt: now, cancelledBy: by, updatedAt: now });
}

export function applyLocalSlurryCompletion(
  housing: readonly Housing[],
  records: readonly SlurryAllocationRecord[],
  completion: ValidSlurryAllocationCompletion,
  now: string,
  by: string,
): LocalSlurryLifecycleResult {
  const current = records.find((r) => r.id === completion.allocationId);
  if (!current) return rejected("ALLOCATION_NOT_FOUND");
  if (current.status === "completed") return rejected("ALREADY_COMPLETED");
  if (current.status !== "planned") return rejected("NOT_PLANNED");
  const store = housing.find((h) => h.id === current.housingId);
  if (!store) return rejected("STORE_NOT_FOUND");
  // A demo store whose reading has no known time is bounded above by now.
  const inferred = reconciliationForSpread({ ...store, updatedAt: now }, completion.actualSpreadDate);
  if (inferred === "ambiguous" && completion.storeReconciliation === undefined) return rejected("RECONCILIATION_REQUIRED");
  if (inferred !== "ambiguous" && completion.storeReconciliation !== undefined && completion.storeReconciliation !== inferred) {
    return rejected("RECONCILIATION_INVALID");
  }
  const reconciliation = inferred === "ambiguous" ? completion.storeReconciliation! : inferred;
  if (reconciliation === "withdrawn_after_observation" && completion.actualVolumeM3 > availableExcluding(store, records, current.id)) {
    return rejected("VOLUME_EXCEEDS_AVAILABLE");
  }
  return replaced(records, {
    ...current,
    status: "completed",
    actualVolumeM3: completion.actualVolumeM3,
    actualSpreadDate: completion.actualSpreadDate,
    storeReconciliation: reconciliation,
    storeObservationSeq: store.storeObservationSeq ?? 0,
    completedAt: now,
    completedBy: by,
    updatedAt: now,
  });
}

/** Each demo store's withdrawals against its current reading, recomputed
 * from the records (`storeWithdrawnSinceObservationM3`). */
export function withLocalStoreWithdrawals(housing: readonly Housing[], records: readonly SlurryAllocationRecord[]): Housing[] {
  return housing.map((h) => ({ ...h, storeWithdrawnSinceObservationM3: storeWithdrawnSinceObservationM3(h.id, h.storeObservationSeq ?? 0, records) }));
}
