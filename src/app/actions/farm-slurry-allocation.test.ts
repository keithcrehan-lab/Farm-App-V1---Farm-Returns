import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FarmRow, FieldRow, HousingRow, SlurryAllocationRow } from "@/lib/farm-data/row-types";

/**
 * Integration coverage for the canonical remote slurry-plan save path
 * (Codex audit MEDIUMs, audit-20260925T174821Z): the real
 * `createSlurryAllocationAction` → real `getFarmForCurrentUser` /
 * `listFieldsForFarm` / `listHousingForFarm` / `listSlurryAllocationsForFarm`
 * → real `validateNewSlurryAllocationPlan` → real `createSlurryAllocation`
 * → `create_farmer_planned_slurry_allocation` RPC → persisted row → the
 * real What Matters pipeline (`evaluateWhatMattersPilot`) reading it back.
 *
 * Only the Supabase client is replaced — by an in-memory two-farm database
 * that applies the same farm-scoped visibility RLS gives an authenticated
 * user, the `(field_id, housing_id)` unique constraint, and the RPC's own
 * checks in its SQL order
 * (`20260925010000_create_farmer_planned_slurry_allocation_rpc.sql`),
 * including its `for update` lock on the store row. No local Postgres is
 * available to this test runner, so the SQL itself is not executed here;
 * the migration has not yet been applied to Dev.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/slurry-contractor-cost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/farm-data/slurry-contractor-cost")>()),
  getLatestContractorCostRateForFarm: vi.fn(async () => null),
}));
vi.mock("@/server/market/cso-fertiliser-repository", () => ({ findObservationsByMappedProduct: vi.fn(async () => []) }));

import { createClient } from "@/lib/supabase/server";
import { createSlurryAllocationAction } from "./farm";
import { evaluateWhatMattersPilot } from "./what-matters-pilot";
import { createSlurryAllocation, listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { SlurryAllocationPlanRejectedError, type NewSlurryAllocationPlanInput } from "@/domain/slurry-allocation-plan";

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string };

const TS = "2026-01-01T00:00:00Z";

function farmRow(id: string, userId: string): FarmRow {
  return {
    id,
    user_id: userId,
    name: `Farm ${id}`,
    county: "Cork",
    centroid_lng: -8.49,
    centroid_lat: 51.9,
    primary_enterprises: ["suckler_beef"],
    units: "metric",
    owner_name: "Test Farmer",
    p_build_up_compliance: null,
    onboarding_completed_at: TS,
    created_at: TS,
    updated_at: TS,
  };
}

function fieldRow(id: string, farmId: string): FieldRow {
  return {
    id,
    farm_id: farmId,
    name: `Field ${id}`,
    area_ha: 8,
    centroid_lng: -8.49,
    centroid_lat: 51.9,
    polygon: null,
    polygon_source: null,
    polygon_captured_at: null,
    lpis_ref: null,
    planned_use: { value: "grazing", status: "farmer_adjusted", source: "Test Farmer" },
    mapped_soil: null,
    fertility: {
      pIndex: { value: 2, status: "estimated", source: "Farm Return assumption" },
      kIndex: { value: 2, status: "estimated", source: "Farm Return assumption" },
    },
    commonage_status: null,
    water_buffer_context: null,
    history: [],
    thumbnail: null,
    archived_at: null,
    created_at: TS,
    updated_at: TS,
  };
}

/** 200 m³ capacity at a farmer-recorded 50% fill = 100 m³ of real slurry. */
function housingRow(id: string, farmId: string): HousingRow {
  return {
    id,
    farm_id: farmId,
    shed_name: `Shed ${id}`,
    shed_type: "slatted",
    housing_period_start: "2025-11-01",
    housing_period_end: "2026-03-31",
    tank_refinement: null,
    slurry_estimate: {
      volumeM3: { value: 100, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
      availableN: { value: 10, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
      availableP: { value: 5, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
      availableK: { value: 20, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
      ruleSetVersion: "slurry_engine_v1.0.0 (mock)",
    },
    storage_capacity_m3: 200,
    storage_fill_pct: 50,
    storage_fill_status: "farmer_recorded",
    storage_fill_recorded_at: TS,
    created_at: TS,
    updated_at: TS,
  };
}

const PLAN_REJECTED = (issue: string): DbError => ({ code: "P0001", message: `slurry_allocation_plan_rejected:${issue}` });

/** In-memory stand-in for the Supabase/Postgres boundary. */
class FakeDatabase {
  tables: Record<string, Row[]> = { farms: [], fields: [], housing: [], livestock_groups: [], slurry_allocations: [] };
  currentUserId = "user-a";
  private storeLocks = new Map<string, Promise<void>>();
  private rpcArrivals = 0;
  private rpcGate: { count: number; open: () => void; opened: Promise<void> } | null = null;
  private nextId = 1;

  /** Holds every RPC call until `count` have arrived — i.e. until every
   * concurrent request has finished its own application-level read and
   * validation — so the test controls the exact interleaving. */
  holdRpcsUntil(count: number) {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    this.rpcGate = { count, open, opened };
    this.rpcArrivals = 0;
  }

  /** RLS: an authenticated user sees only their own farm's rows. */
  visible(table: string): Row[] {
    const farmIds = new Set(this.tables.farms.filter((f) => f.user_id === this.currentUserId).map((f) => f.id));
    return this.tables[table].filter((r) => (table === "farms" ? r.user_id === this.currentUserId : farmIds.has(r.farm_id)));
  }

  private async lockStore(housingId: string): Promise<() => void> {
    const previous = this.storeLocks.get(housingId) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    this.storeLocks.set(housingId, previous.then(() => held));
    await previous;
    return release;
  }

  /** Mirrors `create_farmer_planned_slurry_allocation` step by step. */
  async createFarmerPlannedSlurryAllocation(p: Row): Promise<{ data: Row | null; error: DbError | null }> {
    if (this.rpcGate) {
      this.rpcArrivals += 1;
      if (this.rpcArrivals >= this.rpcGate.count) this.rpcGate.open();
      await this.rpcGate.opened;
    }
    const volume = p.p_volume_m3 as number;
    if (!Number.isFinite(volume) || volume <= 0) return { data: null, error: PLAN_REJECTED("VOLUME_INVALID") };
    if (!this.visible("housing").some((h) => h.id === p.p_housing_id && h.farm_id === p.p_farm_id)) {
      return { data: null, error: PLAN_REJECTED("STORE_NOT_FOUND") };
    }
    const release = await this.lockStore(p.p_housing_id as string); // select ... for update
    try {
      const store = this.visible("housing").find((h) => h.id === p.p_housing_id)!;
      if (!this.visible("fields").some((f) => f.id === p.p_field_id && f.farm_id === p.p_farm_id && f.archived_at === null)) {
        return { data: null, error: PLAN_REJECTED("FIELD_NOT_FOUND") };
      }
      const allocations = this.visible("slurry_allocations");
      if (allocations.some((a) => a.field_id === p.p_field_id && a.housing_id === p.p_housing_id)) {
        return { data: null, error: PLAN_REJECTED("ALREADY_PLANNED_FROM_STORE") };
      }
      const allocated = allocations.filter((a) => a.housing_id === p.p_housing_id).reduce((sum, a) => sum + (a.volume_m3 as number), 0);
      const volumeM3 = (store.storage_capacity_m3 as number) * ((store.storage_fill_pct as number) / 100);
      const available = Math.round(Math.max(0, volumeM3 - allocated) * 100) / 100;
      if (volume > available) return { data: null, error: PLAN_REJECTED("VOLUME_EXCEEDS_AVAILABLE") };
      // Yield between the availability read and the insert, as a real
      // statement round-trip would: without the store lock above, a second
      // call would read the same pre-insert total here and both would save.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const row: SlurryAllocationRow = {
        id: `alloc-${this.nextId++}`,
        farm_id: p.p_farm_id as string,
        field_id: p.p_field_id as string,
        housing_id: p.p_housing_id as string,
        priority: null,
        score: null,
        volume_m3: volume,
        application_method: p.p_application_method as SlurryAllocationRow["application_method"],
        application_date: p.p_application_date as SlurryAllocationRow["application_date"],
        created_at: TS,
        updated_at: TS,
      };
      this.tables.slurry_allocations.push(row as unknown as Row);
      return { data: row as unknown as Row, error: null };
    } finally {
      release();
    }
  }

  client() {
    const tables = this.tables;
    const visible = (table: string) => this.visible(table);
    const currentUserId = this.currentUserId;
    const createAllocation = (params: Row) => this.createFarmerPlannedSlurryAllocation(params);
    return {
      auth: { getUser: async () => ({ data: { user: { id: currentUserId } }, error: null }) },
      from(table: string) {
        if (!(table in tables)) throw new Error(`unexpected table ${table}`);
        const filters: [string, unknown][] = [];
        let limit: number | undefined;
        const run = () => {
          let rows = visible(table).filter((r) => filters.every(([col, val]) => r[col] === val));
          if (limit !== undefined) rows = rows.slice(0, limit);
          return rows.map((r) => ({ ...r }));
        };
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => (filters.push([col, val]), builder),
          order: () => builder,
          limit: (n: number) => ((limit = n), builder),
          maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
          then: (resolve: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve),
        };
        return builder;
      },
      rpc: async (name: string, params: Row) => {
        if (name !== "create_farmer_planned_slurry_allocation") return { data: null, error: { message: `unknown rpc ${name}` } };
        return createAllocation(params);
      },
    };
  }
}

let db: FakeDatabase;

beforeEach(() => {
  db = new FakeDatabase();
  db.tables.farms.push(farmRow("farm-a", "user-a") as unknown as Row, farmRow("farm-b", "user-b") as unknown as Row);
  db.tables.fields.push(
    fieldRow("field-a1", "farm-a") as unknown as Row,
    fieldRow("field-a2", "farm-a") as unknown as Row,
    fieldRow("field-b1", "farm-b") as unknown as Row,
  );
  db.tables.housing.push(housingRow("store-a", "farm-a") as unknown as Row, housingRow("store-b", "farm-b") as unknown as Row);
  vi.mocked(createClient).mockImplementation(async () => db.client() as never);
});

function plan(overrides: Partial<NewSlurryAllocationPlanInput> = {}): NewSlurryAllocationPlanInput {
  return { fieldId: "field-a1", housingId: "store-a", volumeM3: "40", applicationMethod: "LESS", applicationDate: "2026-03-20", ...overrides };
}

describe("createSlurryAllocationAction — canonical remote save path", () => {
  it("persists a valid farmer-planned allocation with no invented priority or score", async () => {
    const result = await createSlurryAllocationAction(plan(), "Test Farmer");

    expect(result.status).toBe("saved");
    const [row] = db.tables.slurry_allocations;
    expect(row).toMatchObject({ farm_id: "farm-a", field_id: "field-a1", housing_id: "store-a", volume_m3: 40, priority: null, score: null });
    expect(row.application_method).toMatchObject({ value: "LESS", status: "farmer_adjusted", source: "Test Farmer" });
    expect(row.application_date).toMatchObject({ value: "2026-03-20", status: "farmer_adjusted" });
    if (result.status === "saved") {
      expect(result.allocation).not.toHaveProperty("priority");
      expect(result.allocation).not.toHaveProperty("score");
    }
  });

  it("rejects a field belonging to another farm and writes nothing", async () => {
    const result = await createSlurryAllocationAction(plan({ fieldId: "field-b1" }), "Test Farmer");
    expect(result).toEqual({ status: "rejected", issues: ["FIELD_NOT_FOUND"] });
    expect(db.tables.slurry_allocations).toHaveLength(0);
  });

  it("rejects a slurry store belonging to another farm and writes nothing", async () => {
    const result = await createSlurryAllocationAction(plan({ housingId: "store-b" }), "Test Farmer");
    expect(result).toEqual({ status: "rejected", issues: ["STORE_NOT_FOUND"] });
    expect(db.tables.slurry_allocations).toHaveLength(0);
  });

  it("rejects an allocation exceeding the store's real available volume", async () => {
    const result = await createSlurryAllocationAction(plan({ volumeM3: "100.01" }), "Test Farmer");
    expect(result).toEqual({ status: "rejected", issues: ["VOLUME_EXCEEDS_AVAILABLE"] });
    expect(db.tables.slurry_allocations).toHaveLength(0);
  });

  it("two concurrent saves that each pass validation cannot together exceed the store's volume", async () => {
    // Both requests read 100 m³ available and pass application validation
    // before either write runs — the audited race.
    db.holdRpcsUntil(2);
    const [a, b] = await Promise.all([
      createSlurryAllocationAction(plan({ fieldId: "field-a1", volumeM3: "80" }), "Test Farmer"),
      createSlurryAllocationAction(plan({ fieldId: "field-a2", volumeM3: "80" }), "Test Farmer"),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["rejected", "saved"]);
    const rejected = a.status === "rejected" ? a : b;
    expect(rejected).toEqual({ status: "rejected", issues: ["VOLUME_EXCEEDS_AVAILABLE"] });
    const persisted = db.tables.slurry_allocations.filter((r) => r.housing_id === "store-a");
    expect(persisted).toHaveLength(1);
    expect(persisted.reduce((sum, r) => sum + (r.volume_m3 as number), 0)).toBeLessThanOrEqual(100);
  });

  it("concurrent saves that fit together both succeed", async () => {
    db.holdRpcsUntil(2);
    const results = await Promise.all([
      createSlurryAllocationAction(plan({ fieldId: "field-a1", volumeM3: "60" }), "Test Farmer"),
      createSlurryAllocationAction(plan({ fieldId: "field-a2", volumeM3: "40" }), "Test Farmer"),
    ]);
    expect(results.map((r) => r.status)).toEqual(["saved", "saved"]);
    expect(db.tables.slurry_allocations.reduce((sum, r) => sum + (r.volume_m3 as number), 0)).toBe(100);
  });

  it("the database write itself rejects another farm's store even if application validation were bypassed", async () => {
    await expect(
      createSlurryAllocation(
        "farm-a",
        { fieldId: "field-a1", housingId: "store-b", volumeM3: 10, applicationMethod: "LESS", applicationDate: "2026-03-20", createsMultiSourcePlan: false },
        "Test Farmer",
      ),
    ).rejects.toSatisfy((e: unknown) => e instanceof SlurryAllocationPlanRejectedError && e.issues.join() === "STORE_NOT_FOUND");
    await expect(
      createSlurryAllocation(
        "farm-a",
        { fieldId: "field-b1", housingId: "store-a", volumeM3: 10, applicationMethod: "LESS", applicationDate: "2026-03-20", createsMultiSourcePlan: false },
        "Test Farmer",
      ),
    ).rejects.toSatisfy((e: unknown) => e instanceof SlurryAllocationPlanRejectedError && e.issues.join() === "FIELD_NOT_FOUND");
    expect(db.tables.slurry_allocations).toHaveLength(0);
  });

  it("a saved allocation is read back by the normal What Matters pipeline", async () => {
    const evaluatedAt = "2026-03-15T09:00:00.000Z";
    const before = await evaluateWhatMattersPilot({ evaluatedAt });
    expect(before.status).toBe("ok");

    const saved = await createSlurryAllocationAction(plan(), "Test Farmer");
    expect(saved.status).toBe("saved");
    expect(await listSlurryAllocationsForFarm("farm-a")).toHaveLength(1);

    const after = await evaluateWhatMattersPilot({ evaluatedAt });
    if (before.status !== "ok" || after.status !== "ok") throw new Error("expected ok evaluations");
    // Before: no allocation on file — the zero-allocation state.
    expect(before.candidateContext).toEqual({});
    expect(before.noRankedExplanation?.code).toBe("NO_CANDIDATE_DATA");
    expect(before.plannedSlurryFieldCount).toBe(0);
    // After: the persisted allocation is a real What Matters candidate for
    // this field/store. With no CSO price evidence in this fixture its
    // economics stay honestly unquantified — nothing is invented.
    expect(Object.values(after.candidateContext)).toEqual([
      expect.objectContaining({ fieldId: "field-a1", evaluatedActionId: "slurry-allocation-field-a1-store-a" }),
    ]);
    expect(after.noRankedExplanation?.candidates).toEqual([
      expect.objectContaining({ fieldId: "field-a1", net: { direction: null, amount: null } }),
    ]);
  });
});
