import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Campaign B live evidence wiring — the real loader
 * (`loadRegulatoryEvidenceRecordsForFarm` / `loadSlurryRegulatoryContextForFarm`)
 * and the real row mappers, through the one canonical domain path
 * (`buildSlurryRegulatoryContextFromRecords`). Only the database is faked.
 */
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { loadRegulatoryEvidenceRecordsForFarm, loadSlurryRegulatoryContextForFarm } from "./regulatory-evidence";
import { rowToField, rowToHousing, rowToSlurryAllocationRecord } from "./mappers";
import type { FieldRow, FieldSpreadableAreaRow, HousingRow, SlurryAllocationRow, SlurryStoreNeatEvidenceRow } from "./row-types";
import {
  buildSlurryRegulatoryContext,
  physicalStoreStateTiming,
  plannedRegulatoryNeatSlurryForNutrientPlan,
  resolveRegulatoryNeatSlurryVolume,
} from "@/domain/slurry-regulatory-context";
import { buildSlurryEvidenceContext } from "@/domain/slurry-evidence-context";
import { regulatoryNeatSlurryEvidenceFromRecord } from "@/domain/regulatory-evidence-records";
import { calculateNutrientPlan } from "@/domain/nutrients";
import type { LivestockGroup } from "@/domain/types";

const mockCreateClient = vi.mocked(createClient);

afterEach(() => {
  vi.clearAllMocks();
});

const FARM_ID = "farm-1";

const FIELD_ROW: FieldRow = {
  id: "field-1",
  farm_id: FARM_ID,
  name: "Home Field",
  area_ha: 8,
  centroid_lng: -8.49,
  centroid_lat: 51.9,
  polygon: null,
  polygon_source: null,
  polygon_captured_at: null,
  lpis_ref: null,
  planned_use: { value: "grazing", status: "farmer_adjusted", source: "Keith" },
  mapped_soil: null,
  fertility: {
    pIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2025-03-01" },
    kIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2025-03-01" },
  },
  commonage_status: null,
  water_buffer_context: null,
  history: [],
  thumbnail: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const HOUSING_ROW: HousingRow = {
  id: "housing-1",
  farm_id: FARM_ID,
  shed_name: "Shed 1",
  shed_type: "slatted",
  housing_period_start: "2025-11-01",
  housing_period_end: "2026-03-31",
  tank_refinement: null,
  slurry_estimate: {
    volumeM3: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableN: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableP: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableK: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    ruleSetVersion: "slurry_engine_v1.0.0 (mock)",
  },
  storage_capacity_m3: 200,
  storage_fill_pct: 53,
  storage_fill_status: "farmer_recorded",
  storage_fill_recorded_at: "2026-02-01T00:00:00Z",
  store_observation_seq: 1,
  store_observed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const PHYSICAL_M3 = 106; // 200 m³ × 53 %

const ALLOCATION_ROW: SlurryAllocationRow = {
  id: "sa-1",
  farm_id: FARM_ID,
  field_id: "field-1",
  housing_id: "housing-1",
  priority: null,
  volume_m3: 60,
  score: null,
  application_method: null,
  application_date: null,
  status: "planned",
  actual_volume_m3: null,
  actual_spread_date: null,
  store_reconciliation: null,
  store_observation_seq: null,
  completed_at: null,
  completed_by: null,
  cancelled_at: null,
  cancelled_by: null,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
};

const neatRow = (overrides: Partial<SlurryStoreNeatEvidenceRow> = {}): SlurryStoreNeatEvidenceRow => ({
  id: "neat-1",
  farm_id: FARM_ID,
  housing_id: "housing-1",
  status: "farmer_adjusted",
  neat_volume_m3: PHYSICAL_M3,
  effective_date: "2026-02-02",
  source: "Farmer declaration",
  note: null,
  created_at: "2026-02-02T10:00:00Z",
  ...overrides,
});

const areaRow = (overrides: Partial<FieldSpreadableAreaRow> = {}): FieldSpreadableAreaRow => ({
  id: "area-1",
  farm_id: FARM_ID,
  field_id: "field-1",
  status: "verified",
  // PostgREST returns `numeric` as a string.
  spreadable_area_ha: "6.5",
  gross_area_ha_at_record: 8,
  effective_date: "2026-02-10",
  source: "Adviser map",
  note: null,
  created_at: "2026-02-10T09:00:00Z",
  ...overrides,
});

type TableResult = { data: unknown[] | null; error: { code?: string; message?: string } | null };

/** PostgREST's default `max-rows`: no response carries more rows than this. */
const SERVER_MAX_ROWS = 1000;

function fakeClient(tables: Record<string, TableResult> = {}, maxRows = SERVER_MAX_ROWS) {
  const eq = vi.fn();
  const capped = (result: TableResult, from = 0, to = Infinity): TableResult =>
    result.error ? result : { data: (result.data ?? []).slice(from, Math.min(to + 1, from + maxRows)), error: null };
  const from = vi.fn().mockImplementation((table: string) => ({
    select: () => ({
      eq: (column: string, value: string) => {
        eq(table, column, value);
        const result = tables[table] ?? { data: [], error: null };
        let ordered = result;
        const query = {
          // An unpaged read is truncated at the server cap.
          then: (resolve: (r: TableResult) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(capped(result)).then(resolve, reject),
          order: (column: string) => {
            if (!result.error) {
              ordered = { data: [...(result.data ?? [])].sort((a, b) => String((a as Record<string, unknown>)[column]).localeCompare(String((b as Record<string, unknown>)[column]))), error: null };
            }
            return query;
          },
          range: (rangeFrom: number, rangeTo: number) => Promise.resolve(capped(ordered, rangeFrom, rangeTo)),
        };
        return query;
      },
    }),
  }));
  return { client: { from } as never, eq };
}

const CATTLE: LivestockGroup[] = [
  {
    id: "g1",
    farmId: FARM_ID,
    category: "suckler_cow",
    label: "Cows",
    count: { value: 20, status: "verified", source: "Farmer" },
    system: "grazing",
    value: { value: 30000, status: "estimated", source: "Farm Return estimate" },
  } as LivestockGroup,
];

function base(overrides: { fieldRow?: Partial<FieldRow>; housingRow?: Partial<HousingRow>; allocations?: SlurryAllocationRow[] } = {}) {
  return {
    fields: [rowToField({ ...FIELD_ROW, ...overrides.fieldRow })],
    housing: [rowToHousing({ ...HOUSING_ROW, ...overrides.housingRow }, [])],
    allocationRecords: (overrides.allocations ?? [ALLOCATION_ROW]).map(rowToSlurryAllocationRecord),
    compositionRecords: [],
    livestockGroups: CATTLE,
    asOfDate: "2026-03-01",
  };
}

async function loadContext(tables: Record<string, TableResult>, overrides: Parameters<typeof base>[0] = {}) {
  const { client } = fakeClient(tables);
  mockCreateClient.mockResolvedValue(client);
  return (await loadSlurryRegulatoryContextForFarm(FARM_ID, base(overrides))).context;
}

const neatTable = (rows: SlurryStoreNeatEvidenceRow[]): Record<string, TableResult> => ({ slurry_store_neat_evidence_records: { data: rows, error: null } });
const areaTable = (rows: FieldSpreadableAreaRow[]): Record<string, TableResult> => ({ field_spreadable_area_records: { data: rows, error: null } });

describe("loadRegulatoryEvidenceRecordsForFarm", () => {
  it("reads both evidence tables farm-scoped and maps every row", async () => {
    const { client, eq } = fakeClient({ ...neatTable([neatRow()]), ...areaTable([areaRow()]) });
    mockCreateClient.mockResolvedValue(client);
    const loaded = await loadRegulatoryEvidenceRecordsForFarm(FARM_ID);
    expect(eq).toHaveBeenCalledWith("slurry_store_neat_evidence_records", "farm_id", FARM_ID);
    expect(eq).toHaveBeenCalledWith("field_spreadable_area_records", "farm_id", FARM_ID);
    expect(loaded.evidenceTablesApplied).toBe(true);
    expect(loaded.neatSlurryEvidenceRecords).toEqual([expect.objectContaining({ id: "neat-1", neatVolumeM3: PHYSICAL_M3, effectiveDate: "2026-02-02" })]);
    expect(loaded.spreadableAreaRecords).toEqual([expect.objectContaining({ id: "area-1", spreadableAreaHa: 6.5, grossAreaHaAtRecord: 8 })]);
  });

  it("an unapplied migration (42P01 / PGRST205) is no records and flagged, never a known value", async () => {
    for (const code of ["42P01", "PGRST205"]) {
      const missing = { data: null, error: { code, message: "relation does not exist" } };
      const { client } = fakeClient({ slurry_store_neat_evidence_records: missing, field_spreadable_area_records: missing });
      mockCreateClient.mockResolvedValue(client);
      expect(await loadRegulatoryEvidenceRecordsForFarm(FARM_ID)).toEqual({ neatSlurryEvidenceRecords: [], spreadableAreaRecords: [], evidenceTablesApplied: false });
    }
  });

  it("any other read error is thrown, never read as 'no records'", async () => {
    const { client } = fakeClient({ field_spreadable_area_records: { data: null, error: { code: "42501", message: "permission denied" } } });
    mockCreateClient.mockResolvedValue(client);
    await expect(loadRegulatoryEvidenceRecordsForFarm(FARM_ID)).rejects.toMatchObject({ code: "42501" });
  });

  describe("histories beyond the server row cap are read completely", () => {
    const pad = (i: number) => String(i).padStart(4, "0");
    const oldNeat = Array.from({ length: SERVER_MAX_ROWS }, (_, i) => neatRow({ id: `neat-${pad(i)}`, status: "verified" }));
    const oldArea = Array.from({ length: SERVER_MAX_ROWS }, (_, i) => areaRow({ id: `area-${pad(i)}` }));

    it("a newer unavailable neat record past the first page blocks the superseded known value", async () => {
      const newer = neatRow({ id: "neat-z", status: "unavailable", neat_volume_m3: null, effective_date: "2026-02-05" });
      for (const maxRows of [SERVER_MAX_ROWS, 300]) {
        const { client } = fakeClient(neatTable([...oldNeat, newer]), maxRows);
        mockCreateClient.mockResolvedValue(client);
        const { context } = await loadSlurryRegulatoryContextForFarm(FARM_ID, base());
        expect(context.stores[0].regulatoryNeatVolumeM3).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" });
      }
    });

    it("a tied conflicting neat record past the first page stays conflicting", async () => {
      const c = await loadContext(neatTable([...oldNeat, neatRow({ id: "neat-z", status: "verified", neat_volume_m3: 90 })]));
      expect(c.stores[0].regulatoryNeatVolumeM3).toMatchObject({ state: "conflicting", reasonCode: "REGULATORY_NEAT_SLURRY_TIED_OBSERVATIONS_CONFLICT" });
    });

    it("a tied conflicting spreadable area past the first page stays conflicting", async () => {
      const c = await loadContext(areaTable([...oldArea, areaRow({ id: "area-z", spreadable_area_ha: 5 })]));
      expect(c.spreadableArea[0].spreadableAreaHa).toMatchObject({ state: "conflicting", reasonCode: "SPREADABLE_AREA_TIED_OBSERVATIONS_CONFLICT" });
    });

    it("every row is loaded exactly once", async () => {
      const { client } = fakeClient({ ...neatTable([...oldNeat, neatRow({ id: "neat-z" })]), ...areaTable(oldArea) }, 300);
      mockCreateClient.mockResolvedValue(client);
      const loaded = await loadRegulatoryEvidenceRecordsForFarm(FARM_ID);
      expect(loaded.neatSlurryEvidenceRecords).toHaveLength(SERVER_MAX_ROWS + 1);
      expect(loaded.spreadableAreaRecords).toHaveLength(SERVER_MAX_ROWS);
    });
  });
});

describe("Campaign B live evidence wiring — regulatory neat slurry", () => {
  it("A: real loader + no neat evidence => NOT_ESTABLISHED, and no nutrient-plan neat input", async () => {
    const c = await loadContext({});
    expect(c.stores[0].physicalVolumeM3).toMatchObject({ state: "known", value: PHYSICAL_M3 });
    expect(c.stores[0].regulatoryNeatVolumeM3).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED" });
    expect(c.plannedRegulatoryNeatSlurryByField["field-1"]).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED" });
    expect(plannedRegulatoryNeatSlurryForNutrientPlan(c, "field-1", { volumeM3: 60 })).toBeUndefined();
  });

  it("B: real loader + known neat evidence => the same canonical fact as direct domain resolution, provenance intact", async () => {
    const c = await loadContext(neatTable([neatRow({ neat_volume_m3: "80" as unknown as number })]));
    const b = base();
    const direct = resolveRegulatoryNeatSlurryVolume(
      c.stores[0].physicalVolumeM3,
      regulatoryNeatSlurryEvidenceFromRecord({
        id: "neat-1",
        farmId: FARM_ID,
        housingId: "housing-1",
        status: "farmer_adjusted",
        neatVolumeM3: 80,
        effectiveDate: "2026-02-02",
        source: "Farmer declaration",
        recordedAt: "2026-02-02T10:00:00Z",
      }),
      physicalStoreStateTiming(b.housing[0], b.allocationRecords),
    );
    expect(c.stores[0].regulatoryNeatVolumeM3).toEqual(direct);
    expect(c.stores[0].regulatoryNeatVolumeM3).toMatchObject({
      state: "known",
      value: 80,
      status: "farmer_adjusted",
      source: "Farmer declaration",
      recordedAt: "2026-02-02",
      recordId: "neat-1",
    });
  });

  it("B: a wholly-neat store gives the planned field a neat quantity equal to the plan's physical allocation — origin never set", async () => {
    const c = await loadContext(neatTable([neatRow({ status: "verified" })]));
    expect(c.plannedRegulatoryNeatSlurryByField["field-1"]).toMatchObject({ state: "known", value: 60, status: "verified" });
    const input = plannedRegulatoryNeatSlurryForNutrientPlan(c, "field-1", { volumeM3: 60 });
    expect(input).toEqual({ volumeM3: 60, status: "verified", source: "Farmer declaration" });
    expect(input).not.toHaveProperty("origin");
    // A plan allocation of a different physical quantity is not described
    // by the neat fact — nothing is passed.
    expect(plannedRegulatoryNeatSlurryForNutrientPlan(c, "field-1", { volumeM3: 50 })).toBeUndefined();
    expect(plannedRegulatoryNeatSlurryForNutrientPlan(c, "field-1", undefined)).toBeUndefined();
  });

  it("E-zero: an explicit zero after the observation is a known zero", async () => {
    const c = await loadContext(neatTable([neatRow({ neat_volume_m3: 0 })]));
    expect(c.stores[0].regulatoryNeatVolumeM3).toMatchObject({ state: "known", value: 0 });
  });

  it("C: real loader + unavailable neat evidence => unavailable survives", async () => {
    const c = await loadContext(neatTable([neatRow({ status: "unavailable", neat_volume_m3: null })]));
    expect(c.stores[0].regulatoryNeatVolumeM3).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" });
    expect(c.plannedRegulatoryNeatSlurryByField["field-1"]).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" });
    expect(plannedRegulatoryNeatSlurryForNutrientPlan(c, "field-1", { volumeM3: 60 })).toBeUndefined();
  });

  it("D: real loader + temporally non-comparable neat evidence => current fact remains blocked (a zero included)", async () => {
    for (const row of [neatRow({ effective_date: "2026-01-15" }), neatRow({ effective_date: "2026-02-01", neat_volume_m3: 0 })]) {
      const c = await loadContext(neatTable([row]));
      expect(c.stores[0].regulatoryNeatVolumeM3).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_COMPARABLE_WITH_CURRENT_STORE_STATE" });
      expect(plannedRegulatoryNeatSlurryForNutrientPlan(c, "field-1", { volumeM3: 60 })).toBeUndefined();
    }
  });

  it("conflicting tied neat records stay conflicting through the real loader", async () => {
    const c = await loadContext(neatTable([neatRow({ id: "neat-b", neat_volume_m3: 90 }), neatRow({ id: "neat-a" })]));
    expect(c.stores[0].regulatoryNeatVolumeM3).toMatchObject({ state: "conflicting", reasonCode: "REGULATORY_NEAT_SLURRY_TIED_OBSERVATIONS_CONFLICT" });
    expect(c.plannedRegulatoryNeatSlurryByField["field-1"].state).toBe("conflicting");
  });

  it("the latest record is selected by the domain, not by row order", async () => {
    const older = neatRow({ id: "neat-old", neat_volume_m3: 50, effective_date: "2026-02-02" });
    const newer = neatRow({ id: "neat-new", neat_volume_m3: 70, effective_date: "2026-02-05" });
    for (const rows of [[older, newer], [newer, older]]) {
      const c = await loadContext(neatTable(rows));
      expect(c.stores[0].regulatoryNeatVolumeM3).toMatchObject({ state: "known", value: 70, recordId: "neat-new" });
    }
  });
});

describe("Campaign B live evidence wiring — spreadable area", () => {
  it("E: no spreadable record => missing, never the gross field area", async () => {
    const c = await loadContext({});
    const area = c.spreadableArea[0];
    expect(area.grossMappedAreaHa).toMatchObject({ state: "known", value: 8 });
    expect(area.spreadableAreaHa).toEqual({ state: "missing", reasonCode: "SPREADABLE_AREA_NOT_ESTABLISHED" });
  });

  it("F: a persisted known spreadable area survives mapper/load with provenance", async () => {
    const c = await loadContext(areaTable([areaRow()]));
    expect(c.spreadableArea[0].spreadableAreaHa).toEqual({
      state: "known",
      value: 6.5,
      status: "verified",
      source: "Adviser map",
      recordedAt: "2026-02-10",
      recordId: "area-1",
      freshness: "NO_FRESHNESS_POLICY",
    });
  });

  it("G: an explicit spreadable zero survives as a known zero", async () => {
    const c = await loadContext(areaTable([areaRow({ spreadable_area_ha: 0 })]));
    expect(c.spreadableArea[0].spreadableAreaHa).toMatchObject({ state: "known", value: 0 });
  });

  it("H: a historical area now above the current gross area stays conflicting — never clamped", async () => {
    const c = await loadContext(areaTable([areaRow({ spreadable_area_ha: 7 })]), { fieldRow: { area_ha: 5 } });
    const fact = c.spreadableArea[0].spreadableAreaHa;
    expect(fact).toMatchObject({ state: "conflicting", reasonCode: "SPREADABLE_AREA_EXCEEDS_GROSS_AREA" });
    if (fact.state === "conflicting") expect(fact.candidates.map((x) => x.value)).toEqual([7, 5]);
  });

  it("H: tied contradictory persisted areas stay conflicting", async () => {
    const c = await loadContext(areaTable([areaRow({ id: "area-b", spreadable_area_ha: 5 }), areaRow({ id: "area-a" })]));
    expect(c.spreadableArea[0].spreadableAreaHa).toMatchObject({ state: "conflicting", reasonCode: "SPREADABLE_AREA_TIED_OBSERVATIONS_CONFLICT" });
  });
});

describe("Campaign B live evidence wiring — origin, regressions and one canonical path", () => {
  it("I/J: known neat evidence with cattle on the farm and the store on the holding still leaves origin unknown — NAP blocked", async () => {
    const c = await loadContext(neatTable([neatRow()]));
    expect(c.farm.homeProducedManurePAccounting).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED" });
    const b = base();
    const plan = calculateNutrientPlan({
      field: b.fields[0],
      farmGrasslandAreaHa: 8,
      livestockGroups: CATTLE,
      slurryAllocation: b.allocationRecords[0],
      asOfDate: "2026-03-01",
      plannedRegulatoryNeatSlurry: plannedRegulatoryNeatSlurryForNutrientPlan(c, "field-1", b.allocationRecords[0]),
    });
    expect(plan.statutoryManureValue.status).toBe("OK");
    expect(plan.napCompliance).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED" });
  });

  it("K: physical volume, composition and gross area are unchanged by the evidence wiring", async () => {
    const b = base();
    const direct = buildSlurryEvidenceContext(b);
    const wired = await loadContext({ ...neatTable([neatRow()]), ...areaTable([areaRow()]) });
    expect(wired.evidence).toEqual(direct);
    expect(wired.stores[0].physicalVolumeM3).toEqual(direct.stores[0].physicalVolumeM3);
    expect(wired.stores[0].composition.recordedDryMatterPct).toEqual(direct.stores[0].recordedDryMatterPct);
    expect(wired.spreadableArea[0].grossMappedAreaHa).toEqual(buildSlurryRegulatoryContext(b).spreadableArea[0].grossMappedAreaHa);
  });

  // J / L — static source checks over production code (tests excluded).
  const SRC = path.resolve(__dirname, "../..");
  function productionFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return productionFiles(full);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }
  const sources = productionFiles(SRC).map((file) => ({ file: path.relative(SRC, file), text: readFileSync(file, "utf8") }));

  it("J: no production caller sets a manure origin for the nutrient plan", () => {
    const offenders = sources.filter(({ text }) => /home_produced_grazing_livestock|origin:\s*["']imported["']/.test(text)).map((s) => s.file);
    // Only the domain that interprets an origin (and its type) may name it.
    expect(offenders.sort()).toEqual(["domain/nutrients.ts"]);
  });

  it("L: Campaign B evidence is selected only through the canonical domain path", () => {
    const selectorUsers = sources
      .filter(({ text }) => /\b(currentNeatSlurryEvidenceByHousing|currentSpreadableAreaByField|regulatoryNeatSlurryEvidenceByHousing)\(/.test(text))
      .map((s) => s.file);
    expect(selectorUsers.sort()).toEqual(["domain/regulatory-evidence-records.ts", "domain/slurry-regulatory-context.ts"]);
    const contextBuilders = sources.filter(({ text }) => /\bbuildSlurryRegulatoryContext\(/.test(text)).map((s) => s.file);
    expect(contextBuilders).toEqual(["domain/slurry-regulatory-context.ts"]);
    const evidenceReaders = sources
      .filter(({ text }) => /\.from\(\s*["'](slurry_store_neat_evidence_records|field_spreadable_area_records)["']/.test(text))
      .map((s) => s.file);
    expect(evidenceReaders.sort()).toEqual(["lib/farm-data/regulatory-evidence.ts"]);
  });
});
