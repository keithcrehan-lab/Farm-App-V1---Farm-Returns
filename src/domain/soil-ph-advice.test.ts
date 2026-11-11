import { describe, expect, it } from "vitest";
import { assessSoilPh, formatPhTarget, phTargetLandUseForField, TEAGASC_PH_TARGETS } from "./soil-ph-advice";
import { aggregateFarmLimeRequirement } from "./fertiliser-plan";
import { tracked, type Field } from "./types";

function field(overrides: { pH?: number; limeRequirement?: number; organicMatterPct?: number; recordedPh?: number; tillage?: boolean; peatMapped?: boolean; id?: string } = {}): Field {
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
      ...(overrides.recordedPh !== undefined ? { pH: tracked(overrides.recordedPh, "farmer_adjusted", "Farmer") } : {}),
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
    const advice = assessSoilPh(field({ pH: 5.6 }));
    expect(advice).toMatchObject({
      status: "OK",
      evidenceState: "MEASURED",
      value: { ph: 5.6, landUse: "grass", target: { min: 6.3 }, status: "BELOW_TARGET", limeRate: "LABORATORY_LIME_REQUIREMENT_NEEDED" },
    });
  });

  it("never derives a lime rate from pH: the advice carries no t/ha figure", () => {
    const advice = assessSoilPh(field({ pH: 5.2 }));
    if (advice.status !== "OK") throw new Error("expected OK");
    expect(Object.keys(advice.value)).not.toContain("rateTHa");
  });

  it("a laboratory lime requirement on file governs the rate, at any pH", () => {
    expect(assessSoilPh(field({ pH: 5.6, limeRequirement: 5 }))).toMatchObject({ value: { status: "BELOW_TARGET", limeRate: "LABORATORY_LIME_REQUIREMENT_ON_FILE" } });
    expect(assessSoilPh(field({ pH: 6.4, limeRequirement: 2 }))).toMatchObject({ value: { status: "AT_OR_ABOVE_TARGET", limeRate: "LABORATORY_LIME_REQUIREMENT_ON_FILE" } });
  });

  it("at or above target: no lime needed", () => {
    expect(assessSoilPh(field({ pH: 6.3 }))).toMatchObject({ value: { status: "AT_OR_ABOVE_TARGET", limeRate: "NOT_NEEDED" } });
  });

  it("clover swards use the 6.5–6.8 target", () => {
    const advice = assessSoilPh(field({ pH: 6.4 }), { cloverSward: true });
    expect(advice).toMatchObject({ value: { landUse: "grass_clover", status: "BELOW_TARGET" } });
    if (advice.status === "OK") expect(formatPhTarget(advice.value.target)).toBe("6.5–6.8");
  });

  it("tillage uses the cereals target (6.5)", () => {
    expect(assessSoilPh(field({ pH: 6.4, tillage: true }))).toMatchObject({ value: { landUse: "cereals", status: "BELOW_TARGET" } });
  });

  it("peat (>20% organic matter, or mapped peat without a lab figure) uses 5.5–5.8 and overrides land use", () => {
    expect(phTargetLandUseForField(field({ pH: 5.6, organicMatterPct: 25 }), { cloverSward: true })).toBe("peat");
    expect(phTargetLandUseForField(field({ pH: 5.6, organicMatterPct: 20 }))).toBe("grass");
    expect(phTargetLandUseForField(field({ pH: 5.6, peatMapped: true }))).toBe("peat");
    expect(phTargetLandUseForField(field({ pH: 5.6, peatMapped: true, organicMatterPct: 8 }))).toBe("grass");
    expect(assessSoilPh(field({ pH: 5.6, organicMatterPct: 25 }))).toMatchObject({ value: { status: "AT_OR_ABOVE_TARGET" } });
  });

  it("uses a recorded (non-laboratory) pH with its own lower evidence state", () => {
    expect(assessSoilPh(field({ recordedPh: 5.9 }))).toMatchObject({ evidenceState: "IRISH_DEFAULT", value: { status: "BELOW_TARGET" } });
  });

  it("blocks when no pH is recorded — UNKNOWN is never 'no lime needed'", () => {
    expect(assessSoilPh(field())).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_PH" });
  });
});

describe("aggregateFarmLimeRequirement — pH advice", () => {
  it("counts below-target fields that still need a laboratory lime requirement, and attaches the advice per field", () => {
    const result = aggregateFarmLimeRequirement([
      field({ id: "low", pH: 5.6 }),
      field({ id: "lab", pH: 5.6, limeRequirement: 5 }),
      field({ id: "ok", pH: 6.5 }),
      field({ id: "unknown" }),
    ]);
    expect(result.fieldsBelowPhTargetWithoutLimeRate).toBe(1);
    expect(result.farmTotalTonnes).toBe(40);
    expect(result.fields.find((f) => f.fieldId === "low")?.phAdvice).toMatchObject({ status: "BELOW_TARGET", limeRate: "LABORATORY_LIME_REQUIREMENT_NEEDED" });
    expect(result.fields.find((f) => f.fieldId === "unknown")?.phAdvice).toBeUndefined();
  });

  it("applies the clover target to the farm's clover fields", () => {
    const result = aggregateFarmLimeRequirement([field({ id: "c", pH: 6.4 })], { cloverFieldIds: new Set(["c"]) });
    expect(result.fieldsBelowPhTargetWithoutLimeRate).toBe(1);
    expect(result.fields[0].phAdvice?.landUse).toBe("grass_clover");
  });
});
