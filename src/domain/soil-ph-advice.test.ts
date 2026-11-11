import { describe, expect, it } from "vitest";
import { assessSoilPh, formatPhReading, formatPhTarget, phTargetLandUseForField, TEAGASC_PH_TARGETS } from "./soil-ph-advice";
import { aggregateFarmLimeRequirement } from "./fertiliser-plan";
import { tracked, type Field } from "./types";

function field(overrides: { pH?: number; limeRequirement?: number; organicMatterPct?: number; recordedPh?: number; recordedStatus?: "estimated" | "farmer_adjusted" | "verified" | "unavailable"; tillage?: boolean; peatMapped?: boolean; id?: string } = {}): Field {
  return {
    id: overrides.id ?? "f1",
    farmId: "farm-1",
    name: overrides.id ?? "Field 1",
    areaHa: 8,
    centroid: [0, 0],
    ...(overrides.tillage ? { plannedUse: tracked("tillage" as const, "farmer_adjusted", "Farmer") } : {}),
    mappedSoil: {
      soilAssociation: "test",
      dominantSeries: "test",
      texture: "Loam",
      drainage: "moderately_drained",
      coveragePct: 90,
      datasetVersion: "test",
      source: "test",
      ...(overrides.peatMapped ? { organicCarbonStatus: "peat" as const } : {}),
    },
    fertility: {
      ...(overrides.pH !== undefined
        ? {
            verifiedTest: {
              sampleDate: "2026-02-01",
              laboratory: "Lab",
              sampleRef: "S1",
              p: 4,
              k: 90,
              pH: overrides.pH,
              ...(overrides.limeRequirement !== undefined ? { limeRequirement: overrides.limeRequirement } : {}),
              ...(overrides.organicMatterPct !== undefined ? { organicMatterPct: overrides.organicMatterPct } : {}),
            },
          }
        : {}),
      ...(overrides.recordedPh !== undefined ? { pH: tracked(overrides.recordedPh, overrides.recordedStatus ?? "farmer_adjusted", "Farmer", { sourceDate: "2026-03-01" }) } : {}),
    },
    history: [],
  } as Field;
}

describe("soil pH advice (TEAGASC_PH_LIME targets)", () => {
  it("transcribes the Teagasc targets used: grass 6.3, grass-clover 6.5–6.8, cereals 6.5, peat 5.5–5.8", () => {
    expect(TEAGASC_PH_TARGETS.grass).toMatchObject({ min: 6.3 });
    expect(TEAGASC_PH_TARGETS.grass_clover).toMatchObject({ min: 6.5, max: 6.8 });
    expect(TEAGASC_PH_TARGETS.cereals).toMatchObject({ min: 6.5 });
    expect(TEAGASC_PH_TARGETS.peat).toMatchObject({ min: 5.5, max: 5.8 });
  });

  it("test farm F1: grassland at pH 5.6 is below the 6.3 target — lime likely needed, rate from a laboratory test", () => {
    const advice = assessSoilPh(field({ pH: 5.6 }), "GRASS_GRAZING");
    expect(advice).toMatchObject({
      status: "OK",
      evidenceState: "MEASURED",
      value: { ph: 5.6, landUse: "grass", target: { min: 6.3 }, status: "BELOW_TARGET", limeRate: "LABORATORY_LIME_REQUIREMENT_NEEDED" },
    });
  });

  it("never derives a lime rate from pH: the advice carries no t/ha figure", () => {
    const advice = assessSoilPh(field({ pH: 5.2 }), "GRASS_GRAZING");
    if (advice.status !== "OK") throw new Error("expected OK");
    expect(Object.keys(advice.value)).not.toContain("rateTHa");
  });

  it("a laboratory lime requirement on file governs the rate, at any pH", () => {
    expect(assessSoilPh(field({ pH: 5.6, limeRequirement: 5 }), "GRASS_GRAZING")).toMatchObject({ value: { status: "BELOW_TARGET", limeRate: "LABORATORY_LIME_REQUIREMENT_ON_FILE" } });
    expect(assessSoilPh(field({ pH: 6.4, limeRequirement: 2 }), "GRASS_GRAZING")).toMatchObject({ value: { status: "AT_OR_ABOVE_TARGET", limeRate: "LABORATORY_LIME_REQUIREMENT_ON_FILE" } });
  });

  it("at or above target: no lime needed", () => {
    expect(assessSoilPh(field({ pH: 6.3 }), "GRASS_GRAZING")).toMatchObject({ value: { status: "AT_OR_ABOVE_TARGET", limeRate: "NOT_NEEDED" } });
  });

  it("clover swards use the 6.5–6.8 target", () => {
    const advice = assessSoilPh(field({ pH: 6.4 }), "GRASS_WHITE_CLOVER_GRAZING");
    expect(advice).toMatchObject({ value: { landUse: "grass_clover", status: "BELOW_TARGET" } });
    if (advice.status === "OK") expect(formatPhTarget(advice.value.target)).toBe("6.5–6.8");
  });

  it("takes the target from the canonical crop, never the legacy planned use (audit F006)", () => {
    // A tillage plannedUse with a grass-grazing production cycle is grass.
    expect(assessSoilPh(field({ pH: 6.4, tillage: true }), "GRASS_GRAZING")).toMatchObject({ value: { landUse: "grass", cropSystem: "GRASS_GRAZING", status: "AT_OR_ABOVE_TARGET" } });
    // A grass plannedUse with a clover cycle is grass-clover.
    expect(assessSoilPh(field({ pH: 6.4 }), "GRASS_WHITE_CLOVER_SILAGE")).toMatchObject({ value: { landUse: "grass_clover" } });
  });

  it("fails closed with no production cycle, and for crops whose published target can't be matched (audit F006)", () => {
    expect(assessSoilPh(field({ pH: 6.4, tillage: true }), undefined)).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_FIELD_PRODUCTION_CYCLE" });
    for (const crop of ["CEREAL_OTHER", "FORAGE_RAPE", "FORAGE_KALE", "RED_CLOVER_SILAGE", "HORTICULTURE_OTHER", "OTHER_UNSUPPORTED"] as const) {
      expect(assessSoilPh(field({ pH: 6.4 }), crop), crop).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "PH_TARGET_NOT_PUBLISHED_FOR_CROP" });
    }
  });

  it("peat (>20% organic matter, or mapped peat without a lab figure) uses 5.5–5.8 and overrides the crop", () => {
    expect(phTargetLandUseForField(field({ pH: 5.6, organicMatterPct: 25 }), "GRASS_WHITE_CLOVER_GRAZING")).toMatchObject({ value: "peat" });
    expect(phTargetLandUseForField(field({ pH: 5.6, organicMatterPct: 20 }), "GRASS_GRAZING")).toMatchObject({ value: "grass" });
    expect(phTargetLandUseForField(field({ pH: 5.6, peatMapped: true }), "GRASS_GRAZING")).toMatchObject({ value: "peat" });
    expect(phTargetLandUseForField(field({ pH: 5.6, peatMapped: true, organicMatterPct: 8 }), "GRASS_GRAZING")).toMatchObject({ value: "grass" });
    expect(assessSoilPh(field({ pH: 5.6, organicMatterPct: 25 }), "GRASS_GRAZING")).toMatchObject({ value: { status: "AT_OR_ABOVE_TARGET" } });
  });

  it("keeps the reading's provenance: laboratory, estimated and farmer-adjusted readings are told apart (audit F005)", () => {
    const lab = assessSoilPh(field({ pH: 5.6 }), "GRASS_GRAZING");
    expect(lab).toMatchObject({ evidenceState: "MEASURED", value: { reading: { kind: "LABORATORY_TEST", status: "verified", laboratory: "Lab", date: "2026-02-01", sampleRef: "S1" } } });
    const estimated = assessSoilPh(field({ recordedPh: 5.9, recordedStatus: "estimated" }), "GRASS_GRAZING");
    expect(estimated).toMatchObject({ evidenceState: "IRISH_DEFAULT", value: { status: "BELOW_TARGET", reading: { kind: "RECORDED_VALUE", status: "estimated", source: "Farmer", date: "2026-03-01" } } });
    const adjusted = assessSoilPh(field({ recordedPh: 5.9 }), "GRASS_GRAZING");
    expect(adjusted).toMatchObject({ evidenceState: "IRISH_DEFAULT", value: { reading: { kind: "RECORDED_VALUE", status: "farmer_adjusted" } } });
    if (lab.status !== "OK" || estimated.status !== "OK") throw new Error("expected OK");
    expect(formatPhReading(lab.value.reading)).toBe("lab test, Lab, 2026-02-01");
    expect(formatPhReading(estimated.value.reading)).toBe("estimate, Farmer, 2026-03-01");
    if (adjusted.status !== "OK") throw new Error("expected OK");
    expect(formatPhReading(adjusted.value.reading)).toBe("farmer-adjusted, Farmer, 2026-03-01");
  });

  it("never uses an unavailable pH reading — no advice, directly or in the farm aggregation (audit F011)", () => {
    const unavailable = field({ recordedPh: 5.9, recordedStatus: "unavailable" });
    expect(assessSoilPh(unavailable, "GRASS_GRAZING")).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_PH" });
    const result = aggregateFarmLimeRequirement([{ ...unavailable, id: "u" }], { cropSystemByFieldId: new Map([["u", "GRASS_GRAZING"]] as const) });
    expect(result.fields[0].phAdvice).toBeUndefined();
    expect(result.fieldsBelowPhTargetWithoutLimeRate).toBe(0);
  });

  it("blocks when no pH is recorded — UNKNOWN is never 'no lime needed'", () => {
    expect(assessSoilPh(field(), "GRASS_GRAZING")).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_PH" });
  });
});

describe("aggregateFarmLimeRequirement — pH advice", () => {
  it("counts below-target fields that still need a laboratory lime requirement, and attaches the advice per field", () => {
    const grass = new Map([["low", "GRASS_GRAZING"], ["lab", "GRASS_GRAZING"], ["ok", "GRASS_GRAZING"], ["unknown", "GRASS_GRAZING"]] as const);
    const result = aggregateFarmLimeRequirement([
      field({ id: "low", pH: 5.6 }),
      field({ id: "lab", pH: 5.6, limeRequirement: 5 }),
      field({ id: "ok", pH: 6.5 }),
      field({ id: "unknown" }),
    ], { cropSystemByFieldId: grass });
    expect(result.fieldsBelowPhTargetWithoutLimeRate).toBe(1);
    expect(result.farmTotalTonnes).toBe(40);
    expect(result.fields.find((f) => f.fieldId === "low")?.phAdvice).toMatchObject({ status: "BELOW_TARGET", limeRate: "LABORATORY_LIME_REQUIREMENT_NEEDED" });
    expect(result.fields.find((f) => f.fieldId === "unknown")?.phAdvice).toBeUndefined();
  });

  it("applies each field's canonical crop target, and gives no advice to a field without a production cycle", () => {
    const result = aggregateFarmLimeRequirement(
      [field({ id: "c", pH: 6.4 }), field({ id: "none", pH: 5.0 })],
      { cropSystemByFieldId: new Map([["c", "GRASS_WHITE_CLOVER_GRAZING"]] as const) },
    );
    expect(result.fieldsBelowPhTargetWithoutLimeRate).toBe(1);
    expect(result.fields[0].phAdvice?.landUse).toBe("grass_clover");
    expect(result.fields[1].phAdvice).toBeUndefined();
  });
});
