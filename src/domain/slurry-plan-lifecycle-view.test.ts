import { describe, expect, it } from "vitest";
import type { Housing } from "./types";
import type { SlurryAllocationRecord } from "./slurry-allocation-lifecycle";
import { SLURRY_ALLOCATION_LIFECYCLE_ISSUE_COPY } from "./slurry-allocation-lifecycle";
import {
  SLURRY_RECONCILIATION_QUESTION,
  applyLocalSlurryCancel,
  applyLocalSlurryCompletion,
  applyLocalSlurryEdit,
  buildSlurryPlanLifecycleView,
  describeSlurryLifecycleIssues,
  storeAvailableForPlanM3,
  withLocalStoreWithdrawals,
} from "./slurry-plan-lifecycle-view";

const NOW = "2026-09-27T10:00:00.000Z";

function store(patch: Partial<Housing> = {}): Housing {
  return {
    id: "h1",
    farmId: "farm-1",
    shedName: "Main tank",
    shedType: "slatted",
    linkedGroupIds: [],
    housingPeriod: { start: "2025-11-01", end: "2026-03-31" },
    slurryEstimate: {} as Housing["slurryEstimate"],
    storageCapacityM3: 200,
    storageFillPct: 50,
    storageFillStatus: "farmer_recorded",
    storageFillRecordedAt: "2026-09-20T09:00:00.000Z",
    storeObservationSeq: 3,
    storeObservedAt: "2026-09-20T09:00:00.000Z",
    ...patch,
  };
}

function record(patch: Partial<SlurryAllocationRecord> = {}): SlurryAllocationRecord {
  return {
    id: "a1",
    farmId: "farm-1",
    fieldId: "f1",
    housingId: "h1",
    volumeM3: 30,
    status: "planned",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...patch,
  };
}

describe("buildSlurryPlanLifecycleView", () => {
  it("shows only planned records as active; completed and cancelled go to history (A, B)", () => {
    const view = buildSlurryPlanLifecycleView(
      [store()],
      [
        record({ id: "p" }),
        record({ id: "c", fieldId: "f2", status: "completed", actualVolumeM3: 20, actualSpreadDate: "2026-09-25" }),
        record({ id: "x", fieldId: "f3", status: "cancelled", cancelledAt: NOW }),
      ],
    );
    expect(view.planned.map((r) => r.id)).toEqual(["p"]);
    expect(view.completed.map((r) => r.id)).toEqual(["c"]);
    expect(view.cancelled.map((r) => r.id)).toEqual(["x"]);
    // Terminal records reserve nothing.
    expect(view.totals?.reservedM3).toBe(30);
  });

  it("current slurry is the reconciled figure, never the raw last reading after withdrawals (C, D, W)", () => {
    // Reading 50% of 200 m³ = 100 m³; 60 m³ spread since -> 40 m³ now.
    const view = buildSlurryPlanLifecycleView([store({ storeWithdrawnSinceObservationM3: 60 })], []);
    expect(view.stores[0].currentM3).toBe(40);
    expect(view.stores[0].observedM3).toBe(100);
    expect(view.stores[0].observedFillPct).toBe(50);
    expect(view.stores[0].currentFillPct).toBe(20);
    expect(view.stores[0].differsFromReading).toBe(true);
    expect(view.totals?.currentM3).toBe(40);
  });

  it("does not flag a difference when nothing was spread since the reading (W)", () => {
    const view = buildSlurryPlanLifecycleView([store()], []);
    expect(view.stores[0].differsFromReading).toBe(false);
    expect(view.stores[0].currentM3).toBe(100);
  });

  it("reserved stays separate from physical slurry; unallocated = current − reserved (E, F)", () => {
    const view = buildSlurryPlanLifecycleView([store({ storeWithdrawnSinceObservationM3: 60 })], [record({ volumeM3: 25 })]);
    expect(view.totals).toEqual({ currentM3: 40, reservedM3: 25, unallocatedM3: 15, storesWithUnknownVolume: 0 });
  });

  it("keeps multiple stores distinct and sums farm totals from each store's own reconciliation (U)", () => {
    const view = buildSlurryPlanLifecycleView(
      [store(), store({ id: "h2", shedName: "Lagoon", storageCapacityM3: 400, storageFillPct: 25, storeWithdrawnSinceObservationM3: 10 })],
      [record({ volumeM3: 30 }), record({ id: "a2", housingId: "h2", volumeM3: 50 })],
    );
    expect(view.stores.map((s) => [s.shedName, s.currentM3, s.reservedM3, s.unallocatedM3])).toEqual([
      ["Main tank", 100, 30, 70],
      ["Lagoon", 90, 50, 40],
    ]);
    expect(view.totals).toEqual({ currentM3: 190, reservedM3: 80, unallocatedM3: 110, storesWithUnknownVolume: 0 });
  });

  it("never shows an unknown store volume as 0; farm physical totals become unknown, reservations still count", () => {
    const view = buildSlurryPlanLifecycleView([store({ storageCapacityM3: 0 })], [record()]);
    expect(view.stores[0].volumeKnown).toBe(false);
    expect(view.totals).toEqual({ reservedM3: 30, storesWithUnknownVolume: 1 });
  });

  it("mixed known/unknown stores: reservations from every store are counted and no partial physical total is shown", () => {
    const view = buildSlurryPlanLifecycleView(
      [store(), store({ id: "h2", shedName: "Lagoon", storageCapacityM3: 0 })],
      [record({ id: "a2", housingId: "h2", volumeM3: 30 })],
    );
    expect(view.totals).toEqual({ reservedM3: 30, storesWithUnknownVolume: 1 });
    expect(view.totals?.currentM3).toBeUndefined();
    expect(view.totals?.unallocatedM3).toBeUndefined();
  });

  it("no slurry store at all gives no totals", () => {
    expect(buildSlurryPlanLifecycleView([], []).totals).toBeUndefined();
  });

  it("the edit hint adds back the plan's own reservation only in its own store (V)", () => {
    const view = buildSlurryPlanLifecycleView([store(), store({ id: "h2", shedName: "Lagoon" })], [record({ volumeM3: 30 })]);
    expect(storeAvailableForPlanM3(view.stores[0], record({ volumeM3: 30 }))).toBe(100);
    expect(storeAvailableForPlanM3(view.stores[1], record({ volumeM3: 30 }))).toBe(100);
  });
});

describe("farmer language", () => {
  it("never renders an internal issue code (T, H)", () => {
    const codes = Object.keys(SLURRY_ALLOCATION_LIFECYCLE_ISSUE_COPY) as (keyof typeof SLURRY_ALLOCATION_LIFECYCLE_ISSUE_COPY)[];
    for (const kind of ["edit", "cancel", "complete"] as const) {
      for (const code of codes) {
        const text = describeSlurryLifecycleIssues([code], kind);
        expect(text).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
        expect(text.length).toBeGreaterThan(0);
      }
    }
    expect(describeSlurryLifecycleIssues(["VOLUME_EXCEEDS_AVAILABLE"], "edit")).toBe("There isn't enough unallocated slurry in this store for that change.");
    expect(describeSlurryLifecycleIssues(["ALREADY_COMPLETED"], "complete")).toMatch(/already changed/);
  });

  it("maps the tank-reading answers to the canonical reconciliations (P)", () => {
    expect(SLURRY_RECONCILIATION_QUESTION.options.map((o) => o.value)).toEqual(["reflected_in_observation", "withdrawn_after_observation"]);
    expect(SLURRY_RECONCILIATION_QUESTION.options[0].label).toMatch(/^Yes, the tank reading was taken after/);
  });
});

describe("demo-farm lifecycle mirror", () => {
  const fields = ["f1", "f2"];

  it("edits within capacity and refuses an over-capacity edit (G, H)", () => {
    const records = [record({ volumeM3: 30 }), record({ id: "a2", fieldId: "f2", volumeM3: 50 })];
    const ok = applyLocalSlurryEdit([store()], fields, records, { allocationId: "a1", fieldId: "f1", housingId: "h1", volumeM3: 50 }, NOW);
    expect(ok.status === "saved" && ok.record.volumeM3).toBe(50);
    const tooMuch = applyLocalSlurryEdit([store()], fields, records, { allocationId: "a1", fieldId: "f1", housingId: "h1", volumeM3: 51 }, NOW);
    expect(tooMuch).toEqual({ status: "rejected", issues: ["VOLUME_EXCEEDS_AVAILABLE"] });
  });

  it("re-checks destination capacity on a store move (V)", () => {
    const records = [record({ volumeM3: 30 }), record({ id: "a2", fieldId: "f2", housingId: "h2", volumeM3: 90 })];
    const housing = [store(), store({ id: "h2" })];
    expect(applyLocalSlurryEdit(housing, fields, records, { allocationId: "a1", fieldId: "f1", housingId: "h2", volumeM3: 30 }, NOW)).toEqual({
      status: "rejected",
      issues: ["VOLUME_EXCEEDS_AVAILABLE"],
    });
    expect(applyLocalSlurryEdit(housing, fields, records, { allocationId: "a1", fieldId: "f1", housingId: "h2", volumeM3: 10 }, NOW).status).toBe("saved");
  });

  it("cancellation keeps the record, releases the reservation and leaves physical slurry unchanged (I, J)", () => {
    const records = [record()];
    const result = applyLocalSlurryCancel(records, "a1", NOW, "Farmer");
    expect(result.status).toBe("saved");
    if (result.status !== "saved") return;
    expect(result.records).toHaveLength(1);
    expect(result.record).toEqual(expect.objectContaining({ status: "cancelled", cancelledAt: NOW, volumeM3: 30 }));
    const housing = withLocalStoreWithdrawals([store()], result.records);
    const view = buildSlurryPlanLifecycleView(housing, result.records);
    expect(view.totals).toEqual({ currentM3: 100, reservedM3: 0, unallocatedM3: 100, storesWithUnknownVolume: 0 });
  });

  it.each([
    ["below (K)", 27],
    ["equal to (L)", 30],
    ["above (M)", 45],
  ])("completion with actual %s planned keeps both values and deducts the actual volume", (_label, actual) => {
    const result = applyLocalSlurryCompletion([store()], [record()], { allocationId: "a1", actualVolumeM3: actual, actualSpreadDate: "2026-09-25" }, NOW, "Farmer");
    expect(result.status).toBe("saved");
    if (result.status !== "saved") return;
    expect(result.record).toEqual(
      expect.objectContaining({ status: "completed", volumeM3: 30, actualVolumeM3: actual, actualSpreadDate: "2026-09-25", storeReconciliation: "withdrawn_after_observation", storeObservationSeq: 3 }),
    );
    const view = buildSlurryPlanLifecycleView(withLocalStoreWithdrawals([store()], result.records), result.records);
    expect(view.totals).toEqual({ currentM3: 100 - actual, reservedM3: 0, unallocatedM3: 100 - actual, storesWithUnknownVolume: 0 });
  });

  it("refuses an over-capacity completion and leaves the plan planned (N)", () => {
    const records = [record(), record({ id: "a2", fieldId: "f2", volumeM3: 60 })];
    const result = applyLocalSlurryCompletion([store()], records, { allocationId: "a1", actualVolumeM3: 41, actualSpreadDate: "2026-09-25" }, NOW, "Farmer");
    expect(result).toEqual({ status: "rejected", issues: ["VOLUME_EXCEEDS_AVAILABLE"] });
    expect(records[0].status).toBe("planned");
  });

  it("refuses a repeated completion and any change to a terminal record (O, R, S)", () => {
    const completed = [record({ status: "completed", actualVolumeM3: 30, actualSpreadDate: "2026-09-25" })];
    const cancelled = [record({ status: "cancelled", cancelledAt: NOW })];
    const completion = { allocationId: "a1", actualVolumeM3: 30, actualSpreadDate: "2026-09-25" };
    expect(applyLocalSlurryCompletion([store()], completed, completion, NOW, "Farmer")).toEqual({ status: "rejected", issues: ["ALREADY_COMPLETED"] });
    expect(applyLocalSlurryCompletion([store()], cancelled, completion, NOW, "Farmer")).toEqual({ status: "rejected", issues: ["NOT_PLANNED"] });
    const edit = { allocationId: "a1", fieldId: "f1", housingId: "h1", volumeM3: 10 };
    expect(applyLocalSlurryEdit([store()], fields, completed, edit, NOW)).toEqual({ status: "rejected", issues: ["NOT_PLANNED"] });
    expect(applyLocalSlurryEdit([store()], fields, cancelled, edit, NOW)).toEqual({ status: "rejected", issues: ["NOT_PLANNED"] });
    expect(applyLocalSlurryCancel(completed, "a1", NOW, "Farmer")).toEqual({ status: "rejected", issues: ["NOT_PLANNED"] });
  });

  it("asks for reconciliation only when the spread is the same day as the reading (P, Q)", () => {
    const sameDay = { allocationId: "a1", actualVolumeM3: 30, actualSpreadDate: "2026-09-20" };
    expect(applyLocalSlurryCompletion([store()], [record()], sameDay, NOW, "Farmer")).toEqual({ status: "rejected", issues: ["RECONCILIATION_REQUIRED"] });
    const answered = applyLocalSlurryCompletion([store()], [record()], { ...sameDay, storeReconciliation: "reflected_in_observation" }, NOW, "Farmer");
    expect(answered.status === "saved" && answered.record.storeReconciliation).toBe("reflected_in_observation");
    const before = applyLocalSlurryCompletion([store()], [record()], { ...sameDay, actualSpreadDate: "2026-09-10" }, NOW, "Farmer");
    expect(before.status === "saved" && before.record.storeReconciliation).toBe("reflected_in_observation");
  });
});
