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
    // Codex audit CRITICAL (round 9): nutrients.ts's own PRODUCTS prices
    // are disclosed mock market data — this real, downloadable report
    // must never export a monetary figure built from them.
    expect(lines[0]).not.toMatch(/cost/i);
    expect(lines[1]).not.toMatch(/€/);
  });

  it("zero fields produces a header-only CSV", () => {
    const csv = buildNutrientPlanReportCsv([], [], [], []);
    expect(csv.split("\r\n")).toHaveLength(1);
  });

  // Codex audit CRITICAL (round 9): a fourth independent path computing
  // a fertiliser recommendation without this campaign's own tillage/
  // missing-livestock fail-closed gates — this app has no tillage N/P/K
  // table at all, so a tillage field must never be labelled "Grazing"
  // or export a grassland-based recommendation.
  it("labels a tillage field 'Tillage' and exports NOT_APPLICABLE, never a grazing-based recommendation", () => {
    const tillageField = makeField("f1", { plannedUse: tracked("tillage", "verified", "Farmer") });
    const csv = buildNutrientPlanReportCsv([tillageField], [makeGroup("g1", 20)], [], []);
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain("f1,5,Tillage,NOT_APPLICABLE,NOT_APPLICABLE,NOT_APPLICABLE");
    expect(lines[1]).not.toMatch(/Grazing/);
  });

  // Codex audit HIGH (round 13): `checkNapCompliance` has no knowledge
  // of tillage/missing-livestock at all — it is built from the identical
  // grazing/agronomic ledger the other columns already gate, so a
  // tillage row could still export a real-looking NAP "Yes"/"No"/
  // regulatory classification derived from a fabricated requirement.
  it("exports NOT_APPLICABLE for every NAP compliance column on a tillage row, never a real-looking Yes/No", () => {
    const tillageField = makeField("f1", { plannedUse: tracked("tillage", "verified", "Farmer") });
    const csv = buildNutrientPlanReportCsv([tillageField], [makeGroup("g1", 20)], [], []);
    const lines = csv.split("\r\n");
    const cells = lines[1].split(",");
    // N within NAP ceiling, P within NAP ceiling, Regulatory status,
    // Silage sale evidence — the four NAP-derived columns.
    expect(cells.slice(-5, -1)).toEqual(["NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE"]);
  });

  it("exports INSUFFICIENT_EVIDENCE for every NAP compliance column on a grazing row when the farm has no recorded livestock", () => {
    const field = makeField("f1");
    const csv = buildNutrientPlanReportCsv([field], [], [], []);
    const lines = csv.split("\r\n");
    const cells = lines[1].split(",");
    expect(cells.slice(-5, -1)).toEqual(["INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE"]);
  });

  // Codex audit CRITICAL (round 9): an empty livestockGroups read is
  // genuinely ambiguous between "confirmed zero" and "never entered" —
  // this report must disclose that, never export the clamped,
  // presented-as-real 35 kg N/ha `nGrazingSucklerToBeefKgHa` would
  // otherwise produce.
  it("exports INSUFFICIENT_EVIDENCE for a grazing field when the farm has no recorded livestock", () => {
    const field = makeField("f1");
    const csv = buildNutrientPlanReportCsv([field], [], [], []);
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain("f1,5,Grazing,INSUFFICIENT_EVIDENCE,INSUFFICIENT_EVIDENCE,INSUFFICIENT_EVIDENCE");
  });

  // Codex audit CRITICAL (round 9): this file's own separate, duplicated
  // farmGrasslandAreaHa computation had the identical tillage-inclusive
  // bug round 5 fixed elsewhere — now reuses the one shared, corrected
  // computeFarmGrasslandAggregates.
  it("excludes tillage area from the real grassland stocking-rate denominator, matching computeFarmGrasslandAggregates", () => {
    const grassField = makeField("f1", { areaHa: 10 });
    const tillageField = makeField("f2", { areaHa: 5, plannedUse: tracked("tillage", "verified", "Farmer") });
    const livestockGroups = [makeGroup("g1", 20)];
    const csv = buildNutrientPlanReportCsv([grassField, tillageField], livestockGroups, [], []);

    const directPlan = calculateNutrientPlan({
      field: grassField,
      farmGrasslandAreaHa: 10, // 15 ha total - 5 ha tillage, never 15
      livestockGroups,
      slurryAllocation: undefined,
      silage: undefined,
    });

    const lines = csv.split("\r\n");
    const grassRow = lines.find((l) => l.startsWith("f1,"));
    expect(grassRow).toContain(`f1,10,Grazing,${directPlan.requirement.value.n}`);
  });

  // Codex audit HIGH (round 10): a field with genuinely complete
  // evidence (Index 4, or a commonage legal prohibition) still has a
  // real, correct N/P/K requirement — calculateNutrientPlan's own real
  // number, not fabricated — but purchasedProducts is genuinely empty.
  // The products cell must say so explicitly, never an empty string
  // that reads identically to missing/blocked data.
  it("exports NOT_APPLICABLE for the products cell when real evidence exists but no purchase is currently recommended (commonage)", () => {
    const commonageField = makeField("f1", {
      fertility: { pIndex: tracked(4, "verified", "Farmer"), kIndex: tracked(4, "verified", "Farmer") },
      commonageStatus: tracked("commonage", "verified", "Farmer"),
    });
    const livestockGroups = [makeGroup("g1", 20)];
    const csv = buildNutrientPlanReportCsv([commonageField], livestockGroups, [], []);

    const directPlan = calculateNutrientPlan({
      field: commonageField,
      farmGrasslandAreaHa: commonageField.areaHa,
      livestockGroups,
      slurryAllocation: undefined,
      silage: undefined,
    });
    expect(directPlan.purchasedProducts).toEqual([]);

    const lines = csv.split("\r\n");
    // The real N requirement still stands (genuinely correct, not
    // fabricated) — only the products cell reads NOT_APPLICABLE.
    expect(lines[1]).toContain(`f1,5,Grazing,${directPlan.requirement.value.n},${directPlan.requirement.value.p},${directPlan.requirement.value.k}`);
    expect(lines[1]).toContain(",NOT_APPLICABLE,");
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
