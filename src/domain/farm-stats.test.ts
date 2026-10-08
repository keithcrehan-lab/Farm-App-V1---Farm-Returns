import { describe, expect, it } from "vitest";
import { calculateActiveFarmAreaHa, calculateFarmCoverageStats, calculateFarmObjectRailCounts, calculateFarmSetupProgress, calculateFarmSlurryAvailableM3, calculateShedOccupancy } from "./farm-stats";
import { tracked } from "./types";
import type { Field, Housing, LivestockGroup } from "./types";

function makeLivestockGroup(id: string, count: number, overrides: Partial<LivestockGroup> = {}): LivestockGroup {
  return {
    id,
    farmId: "farm-test",
    category: "suckler_cow",
    label: id,
    count: tracked(count, "verified", "Keith Crehan"),
    system: "grazing",
    value: tracked(0, "estimated", "Farm Return assumption"),
    ...overrides,
  };
}

function makeHousing(overrides: Partial<Housing> = {}): Housing {
  return {
    id: "h1",
    farmId: "farm-test",
    shedName: "Shed 1",
    shedType: "slatted",
    linkedGroupIds: [],
    housingPeriod: { start: "2026-11-01", end: "2027-03-15" },
    storageCapacityM3: 1000,
    storageFillPct: 50,
    storageFillStatus: "farmer_recorded",
    slurryEstimate: {
      volumeM3: tracked(999, "estimated", "x"),
      availableN: tracked(0, "estimated", "x"),
      availableP: tracked(0, "estimated", "x"),
      availableK: tracked(0, "estimated", "x"),
      ruleSetVersion: "test",
    },
    ...overrides,
  };
}

function makeField(id: string, overrides: Partial<Field> = {}): Field {
  return {
    id,
    farmId: "farm-test",
    name: id,
    areaHa: 5,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "estimated", "x"),
    mappedSoil: {
      soilAssociation: "Fermoy",
      dominantSeries: "Brown Earth",
      texture: "Loam",
      drainage: "moderately_drained",
      coveragePct: 90,
      datasetVersion: "test",
      source: "test",
    },
    fertility: {
      pIndex: tracked(3, "estimated", "x"),
      kIndex: tracked(3, "estimated", "x"),
    },
    history: [],
    ...overrides,
  };
}

describe("calculateFarmCoverageStats", () => {
  it("counts only fields with a real drawn polygon as mapped", () => {
    const mapped = makeField("f1", { polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } });
    const unmapped = makeField("f2");
    const result = calculateFarmCoverageStats([mapped, unmapped]);
    expect(result.totalFieldsMapped).toBe(1);
  });

  it("counts only fields with a real verified soil test", () => {
    const verifiedTest = {
      sampleDate: "2026-01-01",
      laboratory: "Lab",
      sampleRef: "ref",
      p: 6,
      k: 100,
      pH: 6.2,
    };
    const verified = makeField("f1", { fertility: { pIndex: tracked(3, "verified", "x"), kIndex: tracked(3, "verified", "x"), verifiedTest } });
    const unverified = makeField("f2");
    const result = calculateFarmCoverageStats([verified, unverified]);
    expect(result.totalVerifiedTests).toBe(1);
  });

  it("returns 0/0 for zero fields", () => {
    const result = calculateFarmCoverageStats([]);
    expect(result).toEqual({ totalFieldsMapped: 0, totalVerifiedTests: 0 });
  });

  it("counts both stats independently — a field can be mapped without a verified test and vice versa", () => {
    const mappedOnly = makeField("f1", { polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } });
    const verifiedOnly = makeField("f2", {
      fertility: {
        pIndex: tracked(3, "verified", "x"),
        kIndex: tracked(3, "verified", "x"),
        verifiedTest: { sampleDate: "2026-01-01", laboratory: "Lab", sampleRef: "ref", p: 6, k: 100, pH: 6.2 },
      },
    });
    const result = calculateFarmCoverageStats([mappedOnly, verifiedOnly]);
    expect(result.totalFieldsMapped).toBe(1);
    expect(result.totalVerifiedTests).toBe(1);
  });
});

// V3 closure pass, Priority 8 — real Dashboard "Slurry available" figure,
// replacing the previous hardcoded "2,850 m³" literal.
describe("calculateFarmSlurryAvailableM3", () => {
  it("sums each shed's real capacity x fill%, not slurryEstimate.volumeM3 (still-mock)", () => {
    const housing = [makeHousing({ storageCapacityM3: 1000, storageFillPct: 50 }), makeHousing({ storageCapacityM3: 2000, storageFillPct: 25 })];
    expect(calculateFarmSlurryAvailableM3(housing)).toBe(1000 * 0.5 + 2000 * 0.25);
  });

  it("returns 0 for no housing", () => {
    expect(calculateFarmSlurryAvailableM3([])).toBe(0);
  });

  it("keeps completed withdrawals deducted (Phase 1A audit HIGH): 200 m³ × 50% less 60 m³ spread = 40 m³", () => {
    const housing = [makeHousing({ storageCapacityM3: 200, storageFillPct: 50, storeWithdrawnSinceObservationM3: 60 })];
    expect(calculateFarmSlurryAvailableM3(housing)).toBe(40);
  });

  it("returns 0 for an empty tank (0% fill), not the full capacity", () => {
    const housing = [makeHousing({ storageCapacityM3: 1000, storageFillPct: 0 })];
    expect(calculateFarmSlurryAvailableM3(housing)).toBe(0);
  });
});

// Real Mode Completion Phase 6 — Dashboard setup-progress panel.
describe("calculateFarmSetupProgress", () => {
  it("recommends mapping a field first, for a completely empty farm", () => {
    const result = calculateFarmSetupProgress([], [], []);
    expect(result).toEqual({
      totalFields: 0,
      fieldsMapped: 0,
      soilTestsVerified: 0,
      livestockGroupCount: 0,
      livestockHeadCount: 0,
      housingCount: 0,
      nextAction: { label: "Map your first field", href: "/fields" },
    });
  });

  it("recommends drawing a boundary once a field exists but has no real polygon", () => {
    const result = calculateFarmSetupProgress([makeField("f1")], [], []);
    expect(result.nextAction).toEqual({ label: "Draw a real boundary for your fields", href: "/fields" });
  });

  it("recommends a soil test once a field is mapped but has no verified test", () => {
    const mapped = makeField("f1", { polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } });
    const result = calculateFarmSetupProgress([mapped], [], []);
    expect(result.nextAction).toEqual({ label: "Add a real soil test", href: "/soil" });
  });

  it("recommends adding livestock once fields/soil are done but no groups exist", () => {
    const field = makeField("f1", {
      polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      fertility: {
        pIndex: tracked(3, "verified", "x"),
        kIndex: tracked(3, "verified", "x"),
        verifiedTest: { sampleDate: "2026-01-01", laboratory: "Lab", sampleRef: "ref", p: 6, k: 100, pH: 6.2 },
      },
    });
    const result = calculateFarmSetupProgress([field], [], []);
    expect(result.nextAction).toEqual({ label: "Add your livestock", href: "/livestock" });
  });

  it("recommends adding housing once fields/soil/livestock are all done", () => {
    const field = makeField("f1", {
      polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      fertility: {
        pIndex: tracked(3, "verified", "x"),
        kIndex: tracked(3, "verified", "x"),
        verifiedTest: { sampleDate: "2026-01-01", laboratory: "Lab", sampleRef: "ref", p: 6, k: 100, pH: 6.2 },
      },
    });
    const result = calculateFarmSetupProgress([field], [makeLivestockGroup("lg1", 20)], []);
    expect(result.nextAction).toEqual({ label: "Add your winter housing", href: "/housing" });
  });

  it("has no next action once every step has at least one real record", () => {
    const field = makeField("f1", {
      polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      fertility: {
        pIndex: tracked(3, "verified", "x"),
        kIndex: tracked(3, "verified", "x"),
        verifiedTest: { sampleDate: "2026-01-01", laboratory: "Lab", sampleRef: "ref", p: 6, k: 100, pH: 6.2 },
      },
    });
    const result = calculateFarmSetupProgress([field], [makeLivestockGroup("lg1", 20)], [makeHousing()]);
    expect(result.nextAction).toBeNull();
  });

  it("sums real head count across groups, not just group count", () => {
    const result = calculateFarmSetupProgress([], [makeLivestockGroup("lg1", 20), makeLivestockGroup("lg2", 32)], []);
    expect(result.livestockHeadCount).toBe(52);
    expect(result.livestockGroupCount).toBe(2);
  });
});

describe("calculateActiveFarmAreaHa", () => {
  it("sums every active field's own areaHa", () => {
    expect(calculateActiveFarmAreaHa([makeField("a", { areaHa: 2.5 }), makeField("b", { areaHa: 4 })])).toBe(6.5);
  });

  it("never counts an archived field", () => {
    expect(calculateActiveFarmAreaHa([makeField("a", { areaHa: 2.5 }), makeField("b", { areaHa: 4, archivedAt: "2026-09-01T00:00:00Z" })])).toBe(2.5);
  });

  it("returns null, never 0, when the farm has no active field", () => {
    expect(calculateActiveFarmAreaHa([])).toBeNull();
    expect(calculateActiveFarmAreaHa([makeField("a", { archivedAt: "2026-09-01T00:00:00Z" })])).toBeNull();
  });
});

describe("calculateFarmObjectRailCounts", () => {
  it("counts cattle head and groups from persisted groups and sheds from housing", () => {
    const progress = calculateFarmSetupProgress([], [makeLivestockGroup("g1", 15), makeLivestockGroup("g2", 20)], [makeHousing(), makeHousing({ id: "h2" })]);
    expect(calculateFarmObjectRailCounts(progress)).toEqual({
      cattleHeadCount: 35,
      cattleGroupCount: 2,
      shedCount: 2,
    });
  });

  it("maps the canonical calculateFarmSetupProgress counts rather than re-summing groups", () => {
    expect(calculateFarmObjectRailCounts({ livestockHeadCount: 7, livestockGroupCount: 3, housingCount: 4 })).toEqual({
      cattleHeadCount: 7,
      cattleGroupCount: 3,
      shedCount: 4,
    });
  });

  it("reports zero only for genuinely empty persisted lists", () => {
    expect(calculateFarmObjectRailCounts(calculateFarmSetupProgress([], [], []))).toEqual({ cattleHeadCount: 0, cattleGroupCount: 0, shedCount: 0 });
  });
});

describe("calculateShedOccupancy", () => {
  it("sums only the groups the shed actually links", () => {
    const groups = [makeLivestockGroup("a", 12), makeLivestockGroup("b", 8), makeLivestockGroup("c", 40)];
    expect(calculateShedOccupancy(makeHousing({ linkedGroupIds: ["a", "b"] }), groups)).toEqual({ linkedGroupCount: 2, headCount: 20, headCountStatuses: ["verified"] });
  });

  it("ignores a linked id with no matching group rather than counting it", () => {
    expect(calculateShedOccupancy(makeHousing({ linkedGroupIds: ["gone", "a"] }), [makeLivestockGroup("a", 5)])).toEqual({ linkedGroupCount: 1, headCount: 5, headCountStatuses: ["verified"] });
  });

  it("reports no linked group as zero groups, for the UI to state honestly", () => {
    expect(calculateShedOccupancy(makeHousing(), [makeLivestockGroup("a", 5)])).toEqual({ linkedGroupCount: 0, headCount: 0, headCountStatuses: [] });
  });

  it("never turns an unavailable head count into a number", () => {
    const unknown = makeLivestockGroup("a", 0, { count: tracked(0, "unavailable", "Not recorded") });
    expect(calculateShedOccupancy(makeHousing({ linkedGroupIds: ["a", "b"] }), [unknown, makeLivestockGroup("b", 9)])).toEqual({ linkedGroupCount: 2, headCount: null, headCountStatuses: ["unavailable", "verified"] });
  });

  it("carries the provenance status of every contributing head count", () => {
    const estimated = makeLivestockGroup("a", 12, { count: tracked(12, "estimated", "Farm Return assumption") });
    expect(calculateShedOccupancy(makeHousing({ linkedGroupIds: ["a", "b"] }), [estimated, makeLivestockGroup("b", 8)]).headCountStatuses).toEqual(["estimated", "verified"]);
  });
});
