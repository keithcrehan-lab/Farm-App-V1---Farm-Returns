import { describe, expect, it } from "vitest";
import {
  bindSystemSlurryForecast,
  currentSlurryForecastAdoption,
  forecastSupersededFieldIds,
  forecastIntentAllocations,
  planningSeasonSlurryAllocations,
  type PlanningSlurryAllocation,
  type SystemSlurryForecastSnapshot,
  type SlurryForecastAdoptionRecord,
} from "./slurry-forecast-adoption";

const SNAPSHOT: SystemSlurryForecastSnapshot = {
  version: "slurry_storage_forecast_v1.0.0",
  assessedOn: "2026-11-01",
  targetDate: "2027-01-30",
  stores: [{ housingId: "h1", projectedAvailableForNewPlanM3: 120 }],
};

const adopt = (id: string, adoptedAt: string, overrides: Partial<SlurryForecastAdoptionRecord> = {}): SlurryForecastAdoptionRecord => ({
  id,
  farmId: "farm-1",
  planningSeason: "2027",
  action: "adopt",
  planningDate: "2027-01-30",
  forecastSource: "SYSTEM_FORECAST",
  expectedAvailableM3: 120,
  productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
  scenarioVersion: "slurry_planning_scenario_v1.0.0",
  systemForecast: SNAPSHOT,
  systemForecastBinding: "SERVER_BOUND",
  intents: [{ fieldId: "f1", housingId: "h1", volumeM3: 60, applicationMethod: "LESS", applicationDate: "2027-02-15" }],
  adoptedAt,
  ...overrides,
});

describe("slurry forecast adoption", () => {
  it("the latest record for the season governs; a withdrawal clears it; other seasons never apply", () => {
    const first = adopt("a1", "2026-11-01T10:00:00.000Z");
    const second = adopt("a2", "2026-11-02T10:00:00.000Z");
    expect(currentSlurryForecastAdoption([first, second], "2027")?.id).toBe("a2");
    const withdraw = adopt("w1", "2026-11-03T10:00:00.000Z", { action: "withdraw", intents: [] });
    expect(currentSlurryForecastAdoption([first, second, withdraw], "2027")).toBeUndefined();
    expect(currentSlurryForecastAdoption([first], "2028")).toBeUndefined();
  });

  it("carries forecast provenance onto every intent allocation", () => {
    const [allocation] = forecastIntentAllocations(adopt("a1", "2026-11-01T10:00:00.000Z") as SlurryForecastAdoptionRecord & { action: "adopt" });
    expect(allocation).toMatchObject({
      fieldId: "f1",
      volumeM3: 60,
      applicationMethod: { value: "LESS", status: "farmer_adjusted", sourceDate: "2026-11-01" },
      planningSource: { kind: "FORECAST_INTENT", adoptionId: "a1", forecastSource: "SYSTEM_FORECAST", expectedAvailableM3: 120, planningDate: "2027-01-30" },
    });
  });

  it("a physical reservation for a field replaces its forecast intent — never both", () => {
    const intents = forecastIntentAllocations(
      adopt("a1", "2026-11-01T10:00:00.000Z", {
        intents: [
          { fieldId: "f1", housingId: "h1", volumeM3: 60, applicationMethod: "LESS", applicationDate: "2027-02-15" },
          { fieldId: "f2", housingId: "h1", volumeM3: 40, applicationMethod: "LESS", applicationDate: "2027-02-15" },
        ],
      }) as SlurryForecastAdoptionRecord & { action: "adopt" },
    );
    const physical: PlanningSlurryAllocation = { fieldId: "f1", housingId: "h1", volumeM3: 30, planningSource: { kind: "PHYSICAL_RESERVATION", allocationId: "p1" } };
    const combined = planningSeasonSlurryAllocations([physical], intents, new Set());
    expect(combined.map((a) => [a.fieldId, a.planningSource.kind])).toEqual([
      ["f1", "PHYSICAL_RESERVATION"],
      ["f2", "FORECAST_INTENT"],
    ]);
  });

  it("an unbound SYSTEM_FORECAST adoption never governs; a FARMER_FORECAST needs no system snapshot", () => {
    const unbound = adopt("a1", "2026-11-01T10:00:00.000Z", { systemForecast: undefined });
    expect(currentSlurryForecastAdoption([unbound], "2027")).toBeUndefined();
    // A snapshot without the server write boundary's marker — a legacy row,
    // or one inserted directly with a forged snapshot — proves nothing.
    const forged = adopt("a3", "2026-11-01T10:00:00.000Z", { systemForecastBinding: undefined });
    expect(currentSlurryForecastAdoption([forged], "2027")).toBeUndefined();
    const bound = adopt("a4", "2026-11-01T10:00:00.000Z");
    expect(currentSlurryForecastAdoption([bound], "2027")?.id).toBe("a4");
    const farmer = adopt("a2", "2026-11-01T10:00:00.000Z", { systemForecast: undefined, forecastSource: "FARMER_FORECAST" });
    expect(currentSlurryForecastAdoption([farmer], "2027")?.id).toBe("a2");
  });
});

describe("F010: forecast supersession lifecycle", () => {
  const record = (
    status: "planned" | "completed" | "cancelled",
    overrides: { fieldId?: string; applicationDate?: string; actualSpreadDate?: string; priority?: "not_suitable" } = {},
  ) => ({
    fieldId: overrides.fieldId ?? "f1",
    status,
    ...(overrides.priority ? { priority: overrides.priority } : {}),
    applicationDate: { value: overrides.applicationDate ?? "2027-03-01", status: "farmer_adjusted" as const, source: "Farmer" },
    ...(overrides.actualSpreadDate ? { actualSpreadDate: overrides.actualSpreadDate } : {}),
  });
  const intents = () =>
    forecastIntentAllocations(
      adopt("a1", "2026-11-01T10:00:00.000Z", {
        intents: [
          { fieldId: "f1", housingId: "h1", volumeM3: 60, applicationMethod: "LESS", applicationDate: "2027-02-15" },
          { fieldId: "f2", housingId: "h1", volumeM3: 40, applicationMethod: "LESS", applicationDate: "2027-02-15" },
        ],
      }) as SlurryForecastAdoptionRecord & { action: "adopt" },
    );
  const kinds = (records: Parameters<typeof forecastSupersededFieldIds>[0], physical: PlanningSlurryAllocation[] = []) =>
    planningSeasonSlurryAllocations(physical, intents(), forecastSupersededFieldIds(records, "2027")).map((a) => [a.fieldId, a.planningSource.kind]);

  it("planned: the reservation supersedes the field's intent", () => {
    expect([...forecastSupersededFieldIds([record("planned")], "2027")]).toEqual(["f1"]);
  });

  it("completed: completion keeps the forecast superseded — it is never resurrected, so the field is never counted twice", () => {
    // Completion releases the reservation, so no planned allocation is left
    // for the field; the actual is the field's evidence.
    expect(kinds([record("completed", { actualSpreadDate: "2027-03-02" })])).toEqual([["f2", "FORECAST_INTENT"]]);
    // A spread actually made in the season supersedes even when it was planned for another date.
    expect(kinds([record("completed", { applicationDate: "2026-12-20", actualSpreadDate: "2027-01-05" })])).toEqual([["f2", "FORECAST_INTENT"]]);
  });

  it("cancelled: a cancelled allocation reserves and credits nothing, so the adopted intent is again the field's only basis (no double count)", () => {
    expect(forecastSupersededFieldIds([record("cancelled")], "2027").size).toBe(0);
    expect(kinds([record("cancelled")])).toEqual([
      ["f1", "FORECAST_INTENT"],
      ["f2", "FORECAST_INTENT"],
    ]);
    // A not-suitable plan never supersedes either.
    expect(forecastSupersededFieldIds([record("planned", { priority: "not_suitable" })], "2027").size).toBe(0);
  });

  it("season rollover: another season's allocations never suppress this season's intent, and another season's adoption never applies", () => {
    expect(kinds([record("completed", { applicationDate: "2026-03-01", actualSpreadDate: "2026-03-01" }), record("planned", { applicationDate: "2028-02-01" })])).toEqual([
      ["f1", "FORECAST_INTENT"],
      ["f2", "FORECAST_INTENT"],
    ]);
    expect(currentSlurryForecastAdoption([adopt("a1", "2026-11-01T10:00:00.000Z")], "2028")).toBeUndefined();
  });
});

describe("F010: SYSTEM_FORECAST adoption is bound to the server-calculated forecast", () => {
  const forecast = (overrides: Partial<Parameters<typeof bindSystemSlurryForecast>[0]["forecast"]> = {}) => ({
    status: "READY" as const,
    targetDate: "2027-01-30",
    stores: [
      { status: "READY", housingId: "h1", projectedAvailableForNewPlanM3: 80 },
      { status: "READY", housingId: "h2", projectedAvailableForNewPlanM3: 40 },
    ] as never,
    projectedPhysicalM3: 150,
    projectedAvailableForNewPlanM3: 120,
    blockedStoreCount: 0,
    version: "slurry_storage_forecast_v1.0.0",
    ...overrides,
  });
  const bind = (overrides: Partial<Parameters<typeof bindSystemSlurryForecast>[0]> = {}) =>
    bindSystemSlurryForecast({
      planningDate: "2027-01-30",
      expectedAvailableM3: 120,
      candidates: [
        { housingId: "h1", volumeM3: 80 },
        { housingId: "h2", volumeM3: 30 },
      ],
      forecast: forecast(),
      assessedOn: "2026-11-03",
      ...overrides,
    });

  it("binds the server's volume, version, assessment date and per-store availability", () => {
    expect(bind({ expectedAvailableM3: 120.004 })).toEqual({
      status: "BOUND",
      expectedAvailableM3: 120,
      snapshot: {
        version: "slurry_storage_forecast_v1.0.0",
        assessedOn: "2026-11-03",
        targetDate: "2027-01-30",
        stores: [
          { housingId: "h1", projectedAvailableForNewPlanM3: 80 },
          { housingId: "h2", projectedAvailableForNewPlanM3: 40 },
        ],
      },
    });
  });

  it("rejects a caller volume that is not the calculated forecast", () => {
    expect(bind({ expectedAvailableM3: 500 })).toEqual({ status: "REJECTED", issues: ["SYSTEM_FORECAST_VOLUME_MISMATCH"] });
    expect(bind({ expectedAvailableM3: 120.02 })).toEqual({ status: "REJECTED", issues: ["SYSTEM_FORECAST_VOLUME_MISMATCH"] });
  });

  it("rejects field intent drawn beyond a store's forecast availability, or from a store not in the forecast", () => {
    expect(bind({ candidates: [{ housingId: "h2", volumeM3: 60 }] })).toEqual({ status: "REJECTED", issues: ["SYSTEM_FORECAST_STORE_VOLUME_EXCEEDED"] });
    expect(bind({ candidates: [{ housingId: "h9", volumeM3: 10 }] })).toEqual({ status: "REJECTED", issues: ["SYSTEM_FORECAST_STORE_NOT_FORECAST"] });
  });

  it("rejects an incomplete forecast or one for a different planning date", () => {
    expect(bind({ forecast: forecast({ status: "PARTIAL" }) })).toEqual({ status: "REJECTED", issues: ["SYSTEM_FORECAST_UNAVAILABLE"] });
    expect(bind({ forecast: forecast({ targetDate: "2027-02-15" }) })).toEqual({ status: "REJECTED", issues: ["SYSTEM_FORECAST_DATE_MISMATCH"] });
  });
});
