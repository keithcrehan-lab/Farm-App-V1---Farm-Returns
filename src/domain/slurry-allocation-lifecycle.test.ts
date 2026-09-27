import { describe, expect, it } from "vitest";
import {
  SLURRY_ALLOCATION_LIFECYCLE_ISSUE_COPY,
  SLURRY_ALLOCATION_TRANSITIONS,
  canTransitionSlurryAllocation,
  dublinDate,
  isActiveReservation,
  lifecycleIssueFromDbError,
  reconcileSlurryStore,
  reconciliationForSpread,
  storeObservationAfterUpdate,
  storeObservedVolumeM3,
  storeWithdrawnSinceObservationM3,
  validateSlurryAllocationCompletion,
  validateSlurryAllocationEdit,
  validateSlurryStoreObservation,
  type SlurryAllocationRecord,
  type SlurryAllocationStatus,
  type StoreObservationState,
} from "./slurry-allocation-lifecycle";

/**
 * Pure-mirror coverage of the Phase 1A lifecycle. The database
 * (`20260926000000_slurry_allocation_lifecycle.sql`) is the authority; these
 * tests prove the arithmetic and state rules its triggers implement, as
 * mirrored here. They do NOT execute SQL: locking, concurrency, RLS and
 * trigger firing are covered statically by
 * `src/lib/farm-data/slurry-lifecycle-migration.test.ts` and still require
 * real-PostgreSQL validation.
 */

const STORE = "store-a";

/** 200 m³ capacity at 50% = 100 m³ observed. */
interface StoreState extends StoreObservationState {
  id: string;
  storageCapacityM3: number;
  storageFillPct: number;
}

function store(overrides: Partial<StoreState> = {}): StoreState {
  return {
    id: STORE,
    storageCapacityM3: 200,
    storageFillPct: 50,
    storageFillStatus: "farmer_recorded",
    storageFillRecordedAt: "2026-02-01T09:00:00Z",
    storeObservationSeq: 1,
    storeObservedAt: "2026-02-01T09:00:00Z",
    ...overrides,
  };
}

let nextId = 1;
function plan(volumeM3: number, overrides: Partial<SlurryAllocationRecord> = {}): SlurryAllocationRecord {
  return {
    id: `alloc-${nextId++}`,
    farmId: "farm-a",
    fieldId: `field-${nextId}`,
    housingId: STORE,
    volumeM3,
    status: "planned",
    createdAt: "2026-02-02T00:00:00Z",
    updatedAt: "2026-02-02T00:00:00Z",
    ...overrides,
  };
}

function complete(record: SlurryAllocationRecord, actualVolumeM3: number, s: StoreState, reconciliation: SlurryAllocationRecord["storeReconciliation"] = "withdrawn_after_observation") {
  return {
    ...record,
    status: "completed" as const,
    actualVolumeM3,
    actualSpreadDate: "2026-03-01",
    storeReconciliation: reconciliation,
    storeObservationSeq: s.storeObservationSeq,
    completedAt: "2026-03-01T12:00:00Z",
  };
}

function view(s: StoreState, records: SlurryAllocationRecord[]) {
  return reconcileSlurryStore(
    { ...s, storeWithdrawnSinceObservationM3: storeWithdrawnSinceObservationM3(s.id, s.storeObservationSeq, records) },
    records.filter(isActiveReservation),
  );
}

describe("lifecycle state model", () => {
  it("permits only planned → planned (edit), planned → completed, planned → cancelled", () => {
    expect(SLURRY_ALLOCATION_TRANSITIONS).toEqual({ planned: ["planned", "completed", "cancelled"], completed: [], cancelled: [] });
  });

  it.each<[SlurryAllocationStatus, SlurryAllocationStatus]>([
    ["completed", "planned"],
    ["cancelled", "planned"],
    ["cancelled", "completed"],
    ["completed", "cancelled"],
    ["completed", "completed"],
  ])("refuses %s → %s (L, M)", (from, to) => {
    expect(canTransitionSlurryAllocation(from, to)).toBe(false);
  });

  it("only planned rows are active reservations (S)", () => {
    expect(isActiveReservation({ status: "planned" })).toBe(true);
    expect(isActiveReservation({ status: "completed" })).toBe(false);
    expect(isActiveReservation({ status: "cancelled" })).toBe(false);
  });
});

describe("store reconciliation arithmetic (mirror of the database invariant)", () => {
  it("A. a planned allocation reserves slurry", () => {
    expect(view(store(), [plan(40)])).toMatchObject({ observedM3: 100, reservedM3: 40, availableM3: 60 });
  });

  it("B/C. an upward edit fits only while unreserved slurry remains", () => {
    const other = plan(30);
    const edited = plan(40);
    // Edit check = requested ≤ reconciled − other reservations (row excluded).
    const availableForEdit = view(store(), [other]).availableM3;
    expect(70).toBeLessThanOrEqual(availableForEdit);
    expect(70.01).toBeGreaterThan(availableForEdit);
    expect(view(store(), [other, { ...edited, volumeM3: 70 }]).availableM3).toBe(0);
  });

  it("D. a downward edit releases the difference immediately", () => {
    const a = plan(60);
    expect(view(store(), [a]).availableM3).toBe(40);
    expect(view(store(), [{ ...a, volumeM3: 25 }]).availableM3).toBe(75);
  });

  it("E/F. cancellation releases the whole reservation and keeps the row", () => {
    const a = plan(60);
    const records = [{ ...a, status: "cancelled" as const, cancelledAt: "2026-02-03T00:00:00Z" }];
    expect(records).toHaveLength(1);
    expect(view(store(), records)).toMatchObject({ reservedM3: 0, withdrawnSinceObservationM3: 0, availableM3: 100 });
  });

  it("G/H. completion stops reserving but withdraws the actual volume — spread slurry never reappears", () => {
    const s = store();
    const a = plan(60);
    const done = complete(a, 60, s);
    expect(view(s, [done])).toMatchObject({ reservedM3: 0, withdrawnSinceObservationM3: 60, reconciledM3: 40, availableM3: 40 });
    // A naive `status = completed` with no withdrawal would have shown 100.
    expect(view(s, [done]).availableM3).toBe(view(s, [a]).availableM3);
  });

  it("I. actual below planned releases the unused reservation", () => {
    const s = store();
    const done = complete(plan(60), 45, s);
    expect(done.volumeM3).toBe(60);
    expect(view(s, [done]).availableM3).toBe(55);
  });

  it("J. actual above planned fits only when unreserved slurry exists", () => {
    const s = store();
    const other = plan(30);
    const a = plan(50);
    // Completion check = actual ≤ reconciled − other reservations.
    const limit = view(s, [other]).availableM3;
    expect(limit).toBe(70);
    expect(view(s, [other, complete(a, 70, s)]).availableM3).toBe(0);
  });

  it("K. withdrawals are summed per completed row — one row can only be completed once", () => {
    const s = store();
    const done = complete(plan(40), 40, s);
    expect(view(s, [done]).withdrawnSinceObservationM3).toBe(40);
    expect(canTransitionSlurryAllocation("completed", "completed")).toBe(false);
  });

  it("a completion already reflected in the observation withdraws nothing further (no double subtraction)", () => {
    const s = store();
    expect(view(s, [complete(plan(40), 40, s, "reflected_in_observation")])).toMatchObject({ withdrawnSinceObservationM3: 0, availableM3: 100 });
  });

  it("non-finite observed volume is 0, never NaN", () => {
    expect(storeObservedVolumeM3({ storageCapacityM3: Number.NaN, storageFillPct: 50 })).toBe(0);
  });
});

describe("store observation identity (Q, R and the resume hardening)", () => {
  const AT = "2026-03-05T10:00:00Z";

  function afterWrite(s: StoreState, written: Partial<StoreState>): StoreState {
    const next = { ...s, ...written };
    return { ...next, ...storeObservationAfterUpdate(s, next, AT) };
  }

  it("a direct write to observation identity does not create a new observation — the withdrawal stays deducted", () => {
    const s = store();
    const records = [complete(plan(60), 60, s)];
    const tampered = afterWrite(s, { storeObservationSeq: 99, storeObservedAt: "2030-01-01T00:00:00Z" });
    expect(tampered.storeObservationSeq).toBe(1);
    expect(tampered.storeObservedAt).toBe(s.storeObservedAt);
    expect(view(tampered, records).withdrawnSinceObservationM3).toBe(60);
    expect(view(tampered, records).availableM3).toBe(40);
  });

  it("a genuine new farmer-recorded observation supersedes withdrawals from the previous sequence (Q)", () => {
    const s = store();
    const records = [complete(plan(60), 60, s)];
    // Farmer reads the tank at 20% (40 m³) after the spread.
    const observed = afterWrite(s, { storageFillPct: 20, storageFillStatus: "farmer_recorded", storageFillRecordedAt: AT });
    expect(observed.storeObservationSeq).toBe(2);
    expect(observed.storeObservedAt).toBe(AT);
    expect(view(observed, records)).toMatchObject({ observedM3: 40, withdrawnSinceObservationM3: 0, availableM3: 40 });
    expect(records).toHaveLength(1); // history kept
  });

  it("an unchanged-percentage genuine re-observation still starts a new observation", () => {
    const s = store();
    const observed = afterWrite(s, { storageFillRecordedAt: AT });
    expect(observed.storageFillPct).toBe(50);
    expect(observed.storeObservationSeq).toBe(2);
  });

  it.each<[string, Partial<StoreState>]>([
    ["an 'estimated' fill change", { storageFillPct: 30, storageFillStatus: "estimated", storageFillRecordedAt: undefined }],
    ["a capacity-only correction", { storageCapacityM3: 250 }],
    ["a farmer_recorded fill change keeping the old reading timestamp", { storageFillPct: 40 }],
    ["a re-save of the same reading", {}],
  ])("%s is not a new observation — withdrawal accounting is not reset", (_label, written) => {
    const s = store();
    const records = [complete(plan(20), 20, s)];
    const after = afterWrite(s, written);
    expect(after.storeObservationSeq).toBe(1);
    expect(view(after, records).withdrawnSinceObservationM3).toBe(20);
  });

  it("R. a lower observation below active reservations is a conflict, never a silent cancel", () => {
    const s = store();
    const planned = [plan(60)];
    const lower = afterWrite(s, { storageFillPct: 20, storageFillRecordedAt: AT });
    // Database rule: reject when round(reconciled − reserved, 2) < 0.
    const v = view(lower, planned);
    expect(v.reconciledM3 - v.reservedM3).toBeLessThan(0);
    expect(v.availableM3).toBe(0);
    expect(planned[0].status).toBe("planned");
    expect(lifecycleIssueFromDbError({ code: "23514", message: "housing_store_volume_below_allocated" })).toBe("STORE_OBSERVATION_CONFLICT");
  });
});

describe("reconciliationForSpread", () => {
  const exact = { storeObservedAt: "2026-03-05T10:00:00Z", updatedAt: "2026-03-05T10:00:00Z" };

  it("orders a spread against an exactly-timed observation by Dublin calendar date", () => {
    expect(reconciliationForSpread(exact, "2026-03-06")).toBe("withdrawn_after_observation");
    expect(reconciliationForSpread(exact, "2026-03-04")).toBe("reflected_in_observation");
    expect(reconciliationForSpread(exact, "2026-03-05")).toBe("ambiguous");
  });

  it("a legacy observation of unknown instant can never be declared reflected automatically", () => {
    expect(reconciliationForSpread({ updatedAt: "2026-03-05T10:00:00Z" }, "2026-03-01")).toBe("ambiguous");
  });

  it("uses Europe/Dublin dates (IST late evening is the next UTC day's date locally)", () => {
    expect(dublinDate("2026-06-30T23:30:00Z")).toBe("2026-07-01");
  });
});

describe("runtime validation", () => {
  it("rejects missing ids and non-positive / non-numeric volumes", () => {
    expect(validateSlurryAllocationEdit({ allocationId: "", fieldId: "", housingId: "", volumeM3: "0" })).toMatchObject({
      status: "INVALID",
      issues: ["ALLOCATION_NOT_FOUND", "FIELD_NOT_FOUND", "STORE_NOT_FOUND", "VOLUME_INVALID"],
    });
    expect(validateSlurryAllocationEdit({ allocationId: "a", fieldId: "f", housingId: "h", volumeM3: "abc" }).status).toBe("INVALID");
    expect(validateSlurryAllocationEdit({ allocationId: "a", fieldId: "f", housingId: "h", volumeM3: " 12.5 " })).toMatchObject({ status: "OK", value: { volumeM3: 12.5 } });
  });

  it("completion needs a positive actual volume, a real non-future date and a known reconciliation", () => {
    const today = "2026-03-10";
    expect(validateSlurryAllocationCompletion({ allocationId: "a", actualVolumeM3: "", actualSpreadDate: "2026-03-11" }, today)).toMatchObject({
      status: "INVALID",
      issues: ["ACTUAL_VOLUME_INVALID", "SPREAD_DATE_INVALID"],
    });
    expect(validateSlurryAllocationCompletion({ allocationId: "a", actualVolumeM3: 5, actualSpreadDate: "2026-02-30" }, today).status).toBe("INVALID");
    expect(
      validateSlurryAllocationCompletion({ allocationId: "a", actualVolumeM3: 5, actualSpreadDate: "2026-03-01", storeReconciliation: "guess" }, today),
    ).toMatchObject({ status: "INVALID", issues: ["RECONCILIATION_INVALID"] });
    expect(validateSlurryAllocationCompletion({ allocationId: "a", actualVolumeM3: "45", actualSpreadDate: "2026-03-10" }, today)).toMatchObject({
      status: "OK",
      value: { actualVolumeM3: 45, actualSpreadDate: "2026-03-10" },
    });
  });

  it("a store observation is 0-100 %, and a blank is never read as 0", () => {
    expect(validateSlurryStoreObservation({ housingId: "h", fillPct: "" }).status).toBe("INVALID");
    expect(validateSlurryStoreObservation({ housingId: "h", fillPct: 101 }).status).toBe("INVALID");
    expect(validateSlurryStoreObservation({ housingId: "h", fillPct: "0" })).toMatchObject({ status: "OK", value: { fillPct: 0 } });
  });
});

describe("database rejection mapping", () => {
  it("maps every prefixed lifecycle code to farmer-facing copy", () => {
    expect(lifecycleIssueFromDbError({ message: "slurry_allocation_lifecycle_rejected:ALREADY_COMPLETED" })).toBe("ALREADY_COMPLETED");
    expect(lifecycleIssueFromDbError({ message: "slurry_allocation_plan_rejected:VOLUME_EXCEEDS_AVAILABLE" })).toBe("VOLUME_EXCEEDS_AVAILABLE");
    expect(lifecycleIssueFromDbError({ message: "slurry_store_observation_rejected:FILL_INVALID" })).toBe("FILL_INVALID");
    expect(lifecycleIssueFromDbError({ code: "23505", message: "duplicate key" })).toBe("ALREADY_PLANNED_FROM_STORE");
    expect(lifecycleIssueFromDbError({ message: "connection reset" })).toBeUndefined();
    for (const copy of Object.values(SLURRY_ALLOCATION_LIFECYCLE_ISSUE_COPY)) expect(copy.length).toBeGreaterThan(0);
  });
});
