import { describe, expect, it } from "vitest";
import { buildFarmPlanSummaryReportCsv, buildNutrientPlanReportCsv, buildSoilTestHistoryReportCsv } from "./reports";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { tracked } from "@/domain/types";
import type { Field, LivestockGroup } from "@/domain/types";

function makeField(id: string, overrides: Partial<Field> = {}): Field {
  return {
    id,
    farmId: "farm-test",
    name: id,
    areaHa: 5,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "estimated", "Farm Return assumption"),
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
      pIndex: tracked(3, "estimated", "Farm Return assumption"),
      kIndex: tracked(3, "estimated", "Farm Return assumption"),
    },
    history: [],
    ...overrides,
  };
}

function makeGroup(id: string, count: number): LivestockGroup {
  return {
    id,
    farmId: "farm-test",
    category: "suckler_cow",
    label: id,
    count: tracked(count, "verified", "Keith"),
    system: "grazing",
    value: tracked(0, "estimated", "Farm Return assumption"),
  };
}

describe("buildNutrientPlanReportCsv", () => {
  it("one row per field, real N/P/K requirement matching calculateNutrientPlan directly", () => {
    const field = makeField("f1");
    const livestockGroups = [makeGroup("g1", 20)];
    const csv = buildNutrientPlanReportCsv([field], livestockGroups, [], []);

    const directPlan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: field.areaHa,
      livestockGroups,
      slurryAllocation: undefined,
      silage: undefined,
    });

    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2); // header + 1 field
    expect(lines[1]).toContain(`f1,5,Grazing,${directPlan.requirement.value.n},${directPlan.requirement.value.p},${directPlan.requirement.value.k}`);
    expect(lines[1]).toContain(String(directPlan.estimatedFieldCostEur));
  });

  it("zero fields produces a header-only CSV", () => {
    const csv = buildNutrientPlanReportCsv([], [], [], []);
    expect(csv.split("\r\n")).toHaveLength(1);
  });
});

describe("buildSoilTestHistoryReportCsv", () => {
  it("includes a real verified test's lab values when present", () => {
    const field = makeField("f1", {
      fertility: {
        pIndex: tracked(3, "verified", "Lab"),
        kIndex: tracked(3, "verified", "Lab"),
        pH: tracked(6.2, "verified", "Lab"),
        verifiedTest: { sampleDate: "2025-05-12", laboratory: "Southern Labs", sampleRef: "SL-001", p: 6.1, k: 98, pH: 6.2 },
      },
    });
    const csv = buildSoilTestHistoryReportCsv([field]);
    expect(csv).toContain("2025-05-12");
    expect(csv).toContain("Southern Labs");
    expect(csv).toContain("6.1");
  });

  it("leaves lab columns blank for a field with no verified test, not a fabricated value", () => {
    const field = makeField("f1");
    const csv = buildSoilTestHistoryReportCsv([field]);
    const lines = csv.split("\r\n");
    // Field,P index,P status,K index,K status,pH,date,lab,ref,labP,labK
    expect(lines[1]).toBe("f1,3,estimated,3,estimated,,,,,,");
  });
});

describe("buildFarmPlanSummaryReportCsv", () => {
  it("reports a field's real boundary status", () => {
    const mapped = makeField("f1", { polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } });
    const unmapped = makeField("f2");
    const csv = buildFarmPlanSummaryReportCsv([mapped, unmapped]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain("Mapped (real boundary)");
    expect(lines[2]).toContain("Not yet mapped");
  });
});
