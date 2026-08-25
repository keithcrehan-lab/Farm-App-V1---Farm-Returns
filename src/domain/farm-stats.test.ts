import { describe, expect, it } from "vitest";
import { calculateFarmCoverageStats } from "./farm-stats";
import { tracked } from "./types";
import type { Field } from "./types";

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
