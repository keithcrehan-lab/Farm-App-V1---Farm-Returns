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
    expect(cells.slice(-6, -2)).toEqual(["NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE"]);
  });

  // Codex audit HIGH (round 16): round 14 threaded the real farm-level
  // Article 17(6) evidence (`Farm.pBuildUpCompliance`) through every
  // other real `calculateNutrientPlan` call site in this vertical, but
  // missed this report's own builder — its NAP P column silently
  // understated a farm's real Table 15b eligibility as Table 15a's
  // lower ceiling. Empirically-derived fixture: a silage cut not
  // intended for sale (so the ordinary grazing-style P ceiling gate
  // applies, not the sale-route Table 16/17 one) with a real statutory
  // GSR of 460 kg N/ha and a P requirement of 50 kg/ha — squarely
  // between Table 15a's 39 kg/ha and Table 15b's enhanced 69 kg/ha.
  it("exports 'P within NAP ceiling: Yes' when the farm's real recorded Article 17(6) evidence unlocks the enhanced Table 15b ceiling, not Table 15a's lower one", () => {
    const field = makeField("f1", {
      areaHa: 10,
      fertility: {
        pIndex: tracked(1, "verified", "Soil test"),
        kIndex: tracked(1, "verified", "Soil test"),
        verifiedTest: { sampleDate: "2026-01-01", laboratory: "Test Lab", sampleRef: "ref-1", p: 3, k: 3, pH: 6.2, organicMatterPct: 10 },
      },
    });
    // A small tillage field purely to push the farm's real non-grass-
    // area % (`computeFarmGrasslandAggregates`) above the 5% threshold
    // `PBUILD_HIGH_GSR`'s own conditional footnote requires — without
    // it, `evaluatePBuildUpEligibility` fails closed on that condition
    // regardless of the farmer's own recorded adviser/NMP/training
    // evidence, and the enhanced ceiling never applies either way.
    const tillageField = makeField("f2", { areaHa: 0.6, plannedUse: tracked("tillage", "verified", "Farmer") });
    const dairyGroup: LivestockGroup = {
      id: "g1",
      farmId: "farm-test",
      category: "dairy_cow",
      label: "Cows",
      count: tracked(50, "verified", "Farmer"),
      system: "grazing",
      avgAgeMonths: 48,
      sex: "female",
      value: tracked(60000, "estimated", "Farm Return estimate"),
      avgMilkYieldKgPerYear: tracked(6000, "verified", "Farmer"),
    };
    const silagePlan = {
      id: "silage-1",
      fieldId: "f1",
      cutNumber: 1 as const,
      harvestSystem: "pit" as const,
      targetCutWindow: tracked({ start: "2026-05-01", end: "2026-05-15" }, "estimated", "Farm Return assumption"),
      expectedYieldTDMha: tracked(7.5, "estimated", "Farm Return assumption"),
      intendedUse: "own_livestock" as const,
      productionCost: { fertiliserSlurry: 0, contractor: 0, wrapBales: 0, other: 0 },
      chemicalFertiliserKgNpk: 0,
      estimatedFieldCost: 0,
    };

    const withoutEvidence = buildNutrientPlanReportCsv([field, tillageField], [dairyGroup], [], [silagePlan]);
    const withEvidence = buildNutrientPlanReportCsv([field, tillageField], [dairyGroup], [], [silagePlan], {
      adviserEngaged: true,
      nmpSubmitted: true,
      trainingCompleted: true,
    });

    const cellsWithout = withoutEvidence.split("\r\n")[1].split(",");
    const cellsWith = withEvidence.split("\r\n")[1].split(",");
    // [N within, P within, Regulatory status, Silage sale evidence]
    expect(cellsWithout.slice(-6, -2)[1]).toBe("No");
    expect(cellsWith.slice(-6, -2)[1]).toBe("Yes");
  });

  it("exports INSUFFICIENT_EVIDENCE for every NAP compliance column on a grazing row when the farm has no recorded livestock", () => {
    const field = makeField("f1");
    const csv = buildNutrientPlanReportCsv([field], [], [], []);
    const lines = csv.split("\r\n");
    const cells = lines[1].split(",");
    expect(cells.slice(-6, -2)).toEqual(["INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE"]);
  });

  // Codex audit HIGH (round 23): the missing-livestock exclusion above
  // was applied blanket to every non-tillage field, including a silage
  // field with its own real, matching SilagePlan — but silage N/P/K
  // never depends on livestockGroups at all, the same real distinction
  // finance.ts's own calculateFarmFertiliserRequirement and
  // RecommendationAuditTrailCard.tsx both already apply. A real,
  // complete-evidence silage field with genuinely no recorded livestock
  // had its real N/P/K requirement, organic offsets, purchased
  // products, and every NAP column overwritten with
  // "INSUFFICIENT_EVIDENCE" in this exported report.
  it("still exports a real silage field's own N/P/K requirement and products when the farm has no recorded livestock — silage never depends on livestockGroups", () => {
    const field = makeField("f1");
    const silagePlan = {
      id: "silage-1",
      fieldId: "f1",
      cutNumber: 1 as const,
      harvestSystem: "pit" as const,
      targetCutWindow: tracked({ start: "2026-05-01", end: "2026-05-15" }, "estimated", "Farm Return assumption"),
      expectedYieldTDMha: tracked(5, "estimated", "Farm Return assumption"),
      intendedUse: "own_livestock" as const,
      productionCost: { fertiliserSlurry: 0, contractor: 0, wrapBales: 0, other: 0 },
      chemicalFertiliserKgNpk: 0,
      estimatedFieldCost: 0,
    };
    const csv = buildNutrientPlanReportCsv([field], [], [], [silagePlan]);
    const lines = csv.split("\r\n");
    const cells = lines[1].split(",");
    expect(cells[2]).toBe("Silage cut 1");
    expect(cells.slice(3, 9)).not.toContain("INSUFFICIENT_EVIDENCE");
    expect(cells.slice(-6, -2)).not.toContain("INSUFFICIENT_EVIDENCE");
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

  // Codex audit CRITICAL (round 27): round 26's own new silage-evidence
  // gate (a real silage-cut field with no real, matching `SilagePlan`)
  // was never checked here — the land-use column showed "Grazing" and
  // the N/P/K columns exported the engine's own forced `0` as if it were
  // a real value, the same "blocked evidence exported as a real zero"
  // failure round 9/10 already fixed for the tillage/fertility cases.
  it("labels a real silage-cut field with no real cut/yield plan honestly, and never exports its blocked zero as a real requirement", () => {
    const silageField = makeField("f1", { plannedUse: tracked("silage_1st_cut", "verified", "Farmer") });
    const livestockGroups = [makeGroup("g1", 20)];
    const csv = buildNutrientPlanReportCsv([silageField], livestockGroups, [], []);
    const lines = csv.split("\r\n");
    expect(lines[1]).not.toMatch(/^f1,5,Grazing/);
    expect(lines[1]).toContain("f1,5,Silage (no real cut/yield plan),INSUFFICIENT_EVIDENCE,INSUFFICIENT_EVIDENCE,INSUFFICIENT_EVIDENCE");
  });

  it("exports the real silage-cut requirement once a matching real SilagePlan is supplied", () => {
    const silageField = makeField("f1", { plannedUse: tracked("silage_1st_cut", "verified", "Farmer") });
    const livestockGroups = [makeGroup("g1", 20)];
    const silagePlan = {
      id: "sp1",
      fieldId: "f1",
      cutNumber: 1 as const,
      harvestSystem: "bale" as const,
      targetCutWindow: tracked({ start: "2026-05-01", end: "2026-05-10" }, "estimated", "x"),
      expectedYieldTDMha: tracked(5, "estimated", "x"),
      intendedUse: "own_livestock" as const,
      productionCost: { fertiliserSlurry: 0, contractor: 0, wrapBales: 0, other: 0 },
      chemicalFertiliserKgNpk: 0,
      estimatedFieldCost: 0,
    };
    const csv = buildNutrientPlanReportCsv([silageField], livestockGroups, [], [silagePlan]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain("f1,5,Silage cut 1,");
    expect(lines[1]).not.toMatch(/INSUFFICIENT_EVIDENCE/);
  });

  // Codex audit MEDIUM (round 29): a field whose plannedUse was never
  // recorded still read "Grazing" here — contradicting the "Regulatory
  // status" column's own correct "planning_advice" — and no column
  // carried the real, specific reason for the downgrade.
  it("labels a field with unrecorded plannedUse as an assumption, and discloses the real regulatory-note reason", () => {
    const unresolvedField = makeField("f1", { plannedUse: undefined });
    const livestockGroups = [makeGroup("g1", 20)];
    const csv = buildNutrientPlanReportCsv([unresolvedField], livestockGroups, [], []);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Regulatory note");
    expect(lines[1]).toContain("f1,5,Grazing (assumed — land use not recorded)");
    expect(lines[1]).toContain("planning_advice");
    expect(lines[1]).toMatch(/hasn.t been recorded yet/i);
  });

  it("never adds the 'assumed' qualifier when plannedUse is explicitly recorded as grazing", () => {
    const grazingField = makeField("f1"); // plannedUse: "grazing", explicitly set by makeField's own default
    const livestockGroups = [makeGroup("g1", 20)];
    const csv = buildNutrientPlanReportCsv([grazingField], livestockGroups, [], []);
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain("f1,5,Grazing,");
    expect(lines[1]).not.toMatch(/assumed/i);
    expect(lines[1]).toContain("compliance_value");
  });

  // Codex audit HIGH (round 30): the "N/P within NAP ceiling" columns
  // still published a definitive "Yes"/"No" regardless of `regulatory`
  // — an unresolved-land-use row could say "N within NAP ceiling: No"
  // right beside a "Regulatory status" column correctly saying
  // "planning_advice".
  it("exports 'Unknown' for the N/P within-ceiling columns, never a definitive Yes/No, when the classification is unconfirmed", () => {
    const unresolvedField = makeField("f1", { plannedUse: undefined });
    const livestockGroups = [makeGroup("g1", 20)];
    const csv = buildNutrientPlanReportCsv([unresolvedField], livestockGroups, [], []);
    const line = csv.split("\r\n")[1];
    // The regulatory-note text (round 29) contains its own commas inside
    // a quoted field, so a naive comma-split would misalign columns —
    // asserted as substrings of the raw line instead.
    expect(line).toContain(",Unknown,Unknown,planning_advice,");
  });

  it("still exports a definitive Yes/No when the classification is confirmed", () => {
    const grazingField = makeField("f1");
    const livestockGroups = [makeGroup("g1", 20)];
    const csv = buildNutrientPlanReportCsv([grazingField], livestockGroups, [], []);
    const line = csv.split("\r\n")[1];
    expect(line).not.toMatch(/,Unknown,/);
    expect(line).toMatch(/,(Yes|No),(Yes|No),compliance_value,/);
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
