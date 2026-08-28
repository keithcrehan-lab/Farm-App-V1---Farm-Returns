import { describe, expect, it } from "vitest";
import { computeFarmSnapshotId, nextStepSequence, trackedValueToInputEvidence } from "./audit-trace-adapters";
import { tracked } from "./types";
import { farmerAdjust } from "./provenance";

describe("trackedValueToInputEvidence", () => {
  it("copies raw/normalised value, unit and source document from the TrackedValue", () => {
    const tv = tracked(8.01, "verified", "Soil test lab XYZ", { sourceDate: "2026-06-01" });
    const evidence = trackedValueToInputEvidence("morgan_p_mg_l", tv, "MEASURED", "LAB", { unit: "mg/L" });
    expect(evidence.rawValue).toBe(8.01);
    expect(evidence.normalisedValue).toBe(8.01);
    expect(evidence.unit).toBe("mg/L");
    expect(evidence.sourceDocument).toBe("Soil test lab XYZ");
    expect(evidence.recordedAt).toBe("2026-06-01");
  });

  it("never infers evidenceState/sourceKind — both are exactly whatever the caller passed", () => {
    const tv = tracked(3, "estimated", "Farm Return assumption");
    const evidence = trackedValueToInputEvidence("p_index", tv, "IRISH_DEFAULT", "IRISH_DEFAULT");
    expect(evidence.evidenceState).toBe("IRISH_DEFAULT");
    expect(evidence.sourceKind).toBe("IRISH_DEFAULT");
  });

  it("sets override:true and captures the pre-override value for a farmer-adjusted TrackedValue", () => {
    const original = tracked(2, "estimated", "Farm Return assumption");
    const adjusted = farmerAdjust(original, 3, "Farmer J. Murphy", "2026-08-01");
    const evidence = trackedValueToInputEvidence("p_index", adjusted, "MEASURED", "FARMER");
    expect(evidence.override).toBe(true);
    expect(evidence.originalValueBeforeOverride).toBe(2);
    expect(evidence.rawValue).toBe(3);
  });

  it("sets override:false and no originalValueBeforeOverride for a non-adjusted value", () => {
    const tv = tracked(4, "verified", "Soil test");
    const evidence = trackedValueToInputEvidence("p_index", tv, "MEASURED", "LAB");
    expect(evidence.override).toBe(false);
    expect(evidence.originalValueBeforeOverride).toBeUndefined();
  });

  it("defaults unit to null and normalisedValue to rawValue when not supplied", () => {
    const tv = tracked("waterlogged", "estimated", "Field assessment");
    const evidence = trackedValueToInputEvidence("ground_status", tv, "IRISH_MODEL", "FIELD_OR_WEATHER_ASSESSMENT");
    expect(evidence.unit).toBeNull();
    expect(evidence.normalisedValue).toBe("waterlogged");
  });
});

describe("computeFarmSnapshotId", () => {
  it("is deterministic — the same inputs always hash to the same 64-hex-char id", async () => {
    const idA = await computeFarmSnapshotId({ fieldId: "field-back", pIndex: 3, areaHa: 8.2 });
    const idB = await computeFarmSnapshotId({ fieldId: "field-back", pIndex: 3, areaHa: 8.2 });
    expect(idA).toBe(idB);
    expect(idA).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when any input value changes", async () => {
    const idA = await computeFarmSnapshotId({ fieldId: "field-back", pIndex: 3 });
    const idB = await computeFarmSnapshotId({ fieldId: "field-back", pIndex: 4 });
    expect(idA).not.toBe(idB);
  });

  it("is independent of key insertion order (same canonicalisation as the trace hash)", async () => {
    const idA = await computeFarmSnapshotId({ a: 1, b: 2 });
    const idB = await computeFarmSnapshotId({ b: 2, a: 1 });
    expect(idA).toBe(idB);
  });
});

describe("nextStepSequence", () => {
  it("returns 1 for an empty steps array", () => {
    expect(nextStepSequence([])).toBe(1);
  });

  it("returns one more than the highest existing sequence number", () => {
    expect(nextStepSequence([{ sequence: 1 }, { sequence: 2 }])).toBe(3);
  });

  it("is robust to out-of-order input", () => {
    expect(nextStepSequence([{ sequence: 3 }, { sequence: 1 }, { sequence: 2 }])).toBe(4);
  });
});
