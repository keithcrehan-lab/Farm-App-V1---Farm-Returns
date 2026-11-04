import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Codex audit F010 (HIGH) — SYSTEM_FORECAST provenance can only be
 * established through the server-only write boundary.
 *
 * Only the database is faked. The fake `authenticated` role enforces the
 * same predicates as the migrations' RLS policies (owner-only permissive
 * insert AND the restrictive "never system" policy of
 * `20261103135703_slurry_forecast_adoption_server_write_boundary.sql`);
 * the fake `service_role` bypasses RLS. This models — it does not execute —
 * the SQL; no PostgreSQL server is available to this test runner and the
 * migration has not been applied to `Farm Return V1 Dev`.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
  isServiceRoleConfigured: vi.fn(() => true),
}));

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  createSlurryForecastAdoption,
  listSlurryForecastAdoptionsForFarm,
  type NewSlurryForecastAdoption,
} from "./slurry-forecast-adoptions";
import { currentSlurryForecastAdoption } from "@/domain/slurry-forecast-adoption";

type Row = Record<string, unknown>;

const SNAPSHOT = {
  version: "slurry_storage_forecast_v1.0.0",
  assessedOn: "2026-11-03",
  targetDate: "2027-01-30",
  stores: [{ housingId: "h1", projectedAvailableForNewPlanM3: 100 }],
};

const OWN_FARM = "farm-1";
const OTHER_FARM = "farm-2";

/** The restrictive client-insert policy, verbatim in intent. */
function clientInsertAllowed(row: Row): boolean {
  return (
    row.farm_id === OWN_FARM &&
    row.forecast_source !== "SYSTEM_FORECAST" &&
    (row.system_forecast_binding ?? null) === null &&
    (row.system_forecast_version ?? null) === null &&
    (row.system_forecast_assessed_on ?? null) === null &&
    (row.system_forecast_stores ?? null) === null
  );
}

function fakeDatabase(options: { legacy?: Row[] } = {}) {
  const adoptions: Row[] = [...(options.legacy ?? [])];
  const inserts: { role: "authenticated" | "service_role"; row: Row }[] = [];
  let nextId = 1;
  let clock = Date.parse("2026-11-03T10:00:00.000Z");

  const client = (role: "authenticated" | "service_role") => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const visible = (): Row[] => {
        if (table === "farms")
          return [{ id: OWN_FARM, user_id: "user-1" }, { id: OTHER_FARM, user_id: "user-2" }].filter(
            (row) => role === "service_role" || row.user_id === "user-1",
          );
        return adoptions.filter((row) => role === "service_role" || row.farm_id === OWN_FARM);
      };
      const matching = () => visible().filter((row) => filters.every(([key, value]) => row[key] === value));
      let pending: { data: Row | null; error: { code: string; message: string } | null } | null = null;
      const builder = {
        select: (columns?: string) => {
          void columns;
          return builder;
        },
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return builder;
        },
        order: () => builder,
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        single: async () => pending ?? { data: matching()[0] ?? null, error: null },
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: matching(), error: null }),
        insert: (row: Row) => {
          inserts.push({ role, row });
          if (role === "authenticated" && !clientInsertAllowed(row)) {
            pending = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
          } else {
            clock += 1;
            const stored = { system_forecast_binding: null, ...row, id: `adopt-${nextId++}`, adopted_at: new Date(clock).toISOString() };
            adoptions.push(stored);
            pending = { data: stored, error: null };
          }
          return builder;
        },
      };
      return builder;
    },
  });

  vi.mocked(createClient).mockResolvedValue(client("authenticated") as never);
  vi.mocked(createServiceRoleClient).mockReturnValue(client("service_role") as never);
  return { adoptions, inserts, authenticated: client("authenticated") };
}

const systemAdoption: NewSlurryForecastAdoption = {
  planningSeason: "2027",
  action: "adopt",
  planningDate: "2027-01-30",
  forecastSource: "SYSTEM_FORECAST",
  expectedAvailableM3: 100,
  productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
  scenarioVersion: "slurry_planning_scenario_v1.0.0",
  systemForecast: SNAPSHOT,
  intents: [{ fieldId: "f1", housingId: "h1", volumeM3: 60, applicationMethod: "LESS", applicationDate: "2027-02-15" }],
};
const farmerAdoption: NewSlurryForecastAdoption = {
  ...systemAdoption,
  forecastSource: "FARMER_FORECAST",
  systemForecast: undefined,
  expectedAvailableM3: 120,
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("F010: SYSTEM_FORECAST write boundary", () => {
  it("an authenticated direct insert cannot establish SYSTEM_FORECAST provenance — even with a well-formed snapshot and the marker", async () => {
    const db = fakeDatabase();
    const forged = await db.authenticated
      .from("slurry_forecast_adoptions")
      .insert({
        farm_id: OWN_FARM,
        planning_season: "2027",
        action: "adopt",
        planning_date: "2027-01-30",
        forecast_source: "SYSTEM_FORECAST",
        expected_available_m3: 900,
        production_basis: "CARRY_FORWARD_CURRENT_SETTINGS",
        scenario_version: "slurry_planning_scenario_v1.0.0",
        system_forecast_version: SNAPSHOT.version,
        system_forecast_assessed_on: SNAPSHOT.assessedOn,
        system_forecast_stores: SNAPSHOT.stores,
        system_forecast_binding: "SERVER_BOUND",
        intents: [],
      })
      .select("*")
      .single();
    expect(forged.error?.code).toBe("42501");
    // A FARMER_FORECAST row cannot smuggle a snapshot or the marker either.
    const smuggled = await db.authenticated
      .from("slurry_forecast_adoptions")
      .insert({ farm_id: OWN_FARM, forecast_source: "FARMER_FORECAST", system_forecast_binding: "SERVER_BOUND" })
      .select("*")
      .single();
    expect(smuggled.error?.code).toBe("42501");
    expect(db.adoptions).toEqual([]);
  });

  it("the server write is the only SYSTEM_FORECAST path: service role, after an ownership check, stamped SERVER_BOUND — and it governs", async () => {
    const db = fakeDatabase();
    const stored = await createSlurryForecastAdoption(OWN_FARM, systemAdoption);
    expect(db.inserts.map((insert) => insert.role)).toEqual(["service_role"]);
    expect(db.inserts[0].row).toMatchObject({ forecast_source: "SYSTEM_FORECAST", system_forecast_binding: "SERVER_BOUND", system_forecast_stores: SNAPSHOT.stores });
    expect(stored).toMatchObject({ forecastSource: "SYSTEM_FORECAST", systemForecastBinding: "SERVER_BOUND", systemForecast: { version: SNAPSHOT.version } });
    const records = await listSlurryForecastAdoptionsForFarm(OWN_FARM);
    expect(currentSlurryForecastAdoption(records, "2027")?.id).toBe(stored.id);
  });

  it("never uses the service role for a farm the session does not own", async () => {
    const db = fakeDatabase();
    await expect(createSlurryForecastAdoption(OTHER_FARM, systemAdoption)).rejects.toThrow(/not owned/);
    expect(vi.mocked(createServiceRoleClient)).not.toHaveBeenCalled();
    expect(db.adoptions).toEqual([]);
  });

  it("FARMER_FORECAST adoptions and withdrawals stay on the session client under RLS, and govern", async () => {
    const db = fakeDatabase();
    const farmer = await createSlurryForecastAdoption(OWN_FARM, farmerAdoption);
    expect(currentSlurryForecastAdoption(await listSlurryForecastAdoptionsForFarm(OWN_FARM), "2027")?.id).toBe(farmer.id);
    await createSlurryForecastAdoption(OWN_FARM, { planningSeason: "2027", action: "withdraw", intents: [] });
    expect(db.inserts.map((insert) => insert.role)).toEqual(["authenticated", "authenticated"]);
    expect(vi.mocked(createServiceRoleClient)).not.toHaveBeenCalled();
    expect(currentSlurryForecastAdoption(await listSlurryForecastAdoptionsForFarm(OWN_FARM), "2027")).toBeUndefined();
    await expect(createSlurryForecastAdoption(OWN_FARM, { ...farmerAdoption, systemForecast: SNAPSHOT })).rejects.toThrow(/requires SYSTEM_FORECAST/);
  });

  it("canonical consumption rejects a legacy SYSTEM_FORECAST row carrying a (possibly forged) snapshot but no SERVER_BOUND marker", async () => {
    fakeDatabase({
      legacy: [
        {
          id: "legacy-1",
          farm_id: OWN_FARM,
          planning_season: "2027",
          action: "adopt",
          planning_date: "2027-01-30",
          forecast_source: "SYSTEM_FORECAST",
          expected_available_m3: 900,
          production_basis: "CARRY_FORWARD_CURRENT_SETTINGS",
          carried_forward_from_season: null,
          scenario_version: "slurry_planning_scenario_v1.0.0",
          system_forecast_version: SNAPSHOT.version,
          system_forecast_assessed_on: SNAPSHOT.assessedOn,
          system_forecast_stores: SNAPSHOT.stores,
          system_forecast_binding: null,
          intents: [],
          adopted_at: "2026-11-02T10:00:00.000Z",
          adopted_by: null,
        },
      ],
    });
    const records = await listSlurryForecastAdoptionsForFarm(OWN_FARM);
    expect(records[0].systemForecast).toBeDefined();
    expect(records[0].systemForecastBinding).toBeUndefined();
    expect(currentSlurryForecastAdoption(records, "2027")).toBeUndefined();
  });
});
