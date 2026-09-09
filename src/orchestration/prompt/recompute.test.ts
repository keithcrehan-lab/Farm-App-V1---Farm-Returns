import { describe, expect, it } from "vitest";
import { recomputePromptByKind } from "./recompute";
import type { Farm, Field, LivestockGroup, TrackedValue } from "@/domain/types";

function index(value: 1 | 2 | 3 | 4): TrackedValue<1 | 2 | 3 | 4> {
  return { value, status: "verified", source: "Soil test" };
}

function farm(overrides: Partial<Farm> = {}): Farm {
  return {
    id: "farm-1",
    name: "Test Farm",
    location: { county: "Cork", centroid: [0, 0] },
    primaryEnterprises: ["beef"],
    units: "metric",
    ownerName: "Farmer",
    ...overrides,
  } as Farm;
}

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Home Field",
    areaHa: 10,
    centroid: [0, 0],
    fertility: { pIndex: index(1), kIndex: index(1) },
    ...overrides,
  } as Field;
}

describe("recomputePromptByKind — fertiliser_recommendation", () => {
  it("Codex audit MEDIUM (round 14): threads the real, injectable input.now through as calculateNutrientPlan's own asOfDate, not undefined (the process clock)", () => {
    const f = field();
    const now = "2020-01-01T00:00:00.000Z";
    const prompt = recomputePromptByKind({
      promptKind: "fertiliser_recommendation",
      farm: farm(),
      field: f,
      allFields: [f],
      livestockGroups: [],
      slurryAllocations: [],
      now,
    });
    // `inputsSnapshot.asOfDate` is stored verbatim whenever an explicit
    // asOfDate is supplied (`fertiliser-recommendation.ts`'s own
    // `buildPrompt` call) — proving `now`, not a fallback `new Date()`
    // call, is what actually reached `calculateNutrientPlan`.
    expect(prompt.inputsSnapshot).toMatchObject({ asOfDate: now });
  });

  it("Codex audit HIGH (round 14): threads the real farm.pBuildUpCompliance through to calculateNutrientPlan's own Article 17(6) P ceiling", () => {
    // Empirically verified fixture (see fertiliser-recommendation.test.ts's
    // identical fixture): resolves a real statutory GSR of 460 kg N/ha
    // with every other P-build-up condition satisfied — supplying
    // pBuildUpCompliance moves the real P ceiling from Table 15a's 39
    // kg/ha to Table 15b's enhanced 69 kg/ha.
    const f = field({
      fertility: {
        pIndex: index(1),
        kIndex: index(1),
        verifiedTest: { sampleDate: "2026-01-01", organicMatterPct: 10 } as Field["fertility"]["verifiedTest"],
      },
    });
    const groups: LivestockGroup[] = [
      {
        id: "g1",
        farmId: "farm-1",
        category: "dairy_cow",
        label: "Cows",
        count: { value: 50, status: "verified", source: "Farmer" },
        system: "grazing",
        avgAgeMonths: 48,
        sex: "female",
        value: { value: 60000, status: "estimated", source: "Farm Return estimate" },
        avgMilkYieldKgPerYear: { value: 6000, status: "verified", source: "Farmer" },
      },
    ];
    const now = "2026-09-09T09:00:00.000Z";
    // `farmGrasslandAreaHa`/`nonGrassPct` come from `computeFarmGrasslandAggregates(allFields)`
    // — a single 10ha grazing field with no non-grass area gives 0%, so
    // `allFields` here also needs a matching non-grass field to reach the
    // >=5% nonGrassPct this fixture's PBUILD_HIGH_GSR condition needs.
    const nonGrassField = field({ id: "field-2", areaHa: 0.6, plannedUse: { value: "tillage", status: "estimated", source: "test" } });

    const withCompliance = recomputePromptByKind({
      promptKind: "fertiliser_recommendation",
      farm: farm({ pBuildUpCompliance: { value: { adviserEngaged: true, nmpSubmitted: true, trainingCompleted: true }, status: "verified", source: "Farmer" } }),
      field: f,
      allFields: [f, nonGrassField],
      livestockGroups: groups,
      slurryAllocations: [],
      now,
    });
    const without = recomputePromptByKind({
      promptKind: "fertiliser_recommendation",
      farm: farm(),
      field: f,
      allFields: [f, nonGrassField],
      livestockGroups: groups,
      slurryAllocations: [],
      now,
    });

    if (withCompliance.basis.status !== "OK" || without.basis.status !== "OK") throw new Error("expected OK");
    const withNap = (withCompliance.basis.value as { napCompliance: { status: string; value?: { pCeilingKgHa: number } } }).napCompliance;
    const withoutNap = (without.basis.value as { napCompliance: { status: string; value?: { pCeilingKgHa: number } } }).napCompliance;
    if (withNap.status !== "OK" || withoutNap.status !== "OK") throw new Error("expected napCompliance OK");
    expect(withNap.value?.pCeilingKgHa).toBe(69);
    expect(withoutNap.value?.pCeilingKgHa).toBe(39);
  });
});
