import { describe, expect, it } from "vitest";
import {
  StandardRepresentativeSamplingStrategy,
  assessSamplingTimingReadiness,
  HARD_MAX_ZONE_AREA_HA,
  IDEAL_MAX_ZONE_AREA_HA,
  MIN_CORES_PER_COMPOSITE_SAMPLE,
} from "./soil-sampling-plan";

const NOW = "2026-09-12T10:00:00.000Z";

describe("StandardRepresentativeSamplingStrategy.buildPlan", () => {
  it("fails closed when the field has no real mapped area", () => {
    const outcome = StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa: 0, now: NOW });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_FIELD_AREA");
    }
  });

  it("fails closed for a negative/NaN area rather than silently coercing it", () => {
    expect(StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa: -2, now: NOW }).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa: Number.NaN, now: NOW }).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("produces one zone for a field within the ideal per-sample area", () => {
    const outcome = StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa: 3.2, now: NOW });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.zones).toHaveLength(1);
    expect(outcome.value.zones[0].zoneId).toBe("A");
    expect(outcome.value.zones[0].areaHa).toBe(3.2);
    expect(outcome.value.zones[0].minCores).toBe(MIN_CORES_PER_COMPOSITE_SAMPLE);
    expect(outcome.value.totalAreaHa).toBe(3.2);
    expect(outcome.evidenceState).toBe("IRISH_MODEL");
  });

  it("splits a field larger than the ideal per-sample area into multiple zones", () => {
    const outcome = StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa: 9, now: NOW });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    // 9 / 4 = 2.25 -> 3 zones, each <= the ideal ceiling.
    expect(outcome.value.zones).toHaveLength(3);
    expect(outcome.value.zones.map((z) => z.zoneId)).toEqual(["A", "B", "C"]);
    for (const zone of outcome.value.zones) {
      expect(zone.areaHa).toBeLessThanOrEqual(IDEAL_MAX_ZONE_AREA_HA);
    }
    const totalZoneArea = outcome.value.zones.reduce((sum, z) => sum + z.areaHa, 0);
    expect(totalZoneArea).toBeCloseTo(9, 6);
  });

  it("never lets one zone exceed the hard per-sample ceiling", () => {
    for (const areaHa of [1, 4, 4.9, 5, 5.1, 12.7, 40]) {
      const outcome = StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa, now: NOW });
      expect(outcome.status).toBe("OK");
      if (outcome.status !== "OK") continue;
      for (const zone of outcome.value.zones) {
        expect(zone.areaHa).toBeLessThanOrEqual(HARD_MAX_ZONE_AREA_HA);
      }
    }
  });

  it("forces at least two zones when the field is flagged as agronomically non-uniform, even if small", () => {
    const outcome = StandardRepresentativeSamplingStrategy.buildPlan({
      fieldId: "f1",
      areaHa: 2,
      heterogeneity: { differentSoilType: true },
      now: NOW,
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.zones.length).toBeGreaterThanOrEqual(2);
  });

  it("does not force extra zones when heterogeneity signals are all absent/undefined", () => {
    const outcome = StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa: 2, now: NOW });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.zones).toHaveLength(1);
  });

  it("discloses a georeference/LPIS advisory only when the report date is after the statutory effective date and no LPIS ref is known", () => {
    const missingLpisAfter = StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa: 3, now: "2026-01-01T00:00:00.000Z" });
    expect(missingLpisAfter.status).toBe("OK");
    if (missingLpisAfter.status === "OK") {
      expect(missingLpisAfter.value.reasons.some((r) => r.includes("LPIS"))).toBe(true);
    }

    const beforeEffectiveDate = StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa: 3, now: "2025-01-01T00:00:00.000Z" });
    expect(beforeEffectiveDate.status).toBe("OK");
    if (beforeEffectiveDate.status === "OK") {
      expect(beforeEffectiveDate.value.reasons.some((r) => r.includes("LPIS"))).toBe(false);
    }

    const withLpis = StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa: 3, lpisRef: "1234567", now: "2026-01-01T00:00:00.000Z" });
    expect(withLpis.status).toBe("OK");
    if (withLpis.status === "OK") {
      expect(withLpis.value.reasons.some((r) => r.includes("LPIS"))).toBe(false);
    }
  });

  it("cites the verified Teagasc source, never an unsourced claim", () => {
    const outcome = StandardRepresentativeSamplingStrategy.buildPlan({ fieldId: "f1", areaHa: 3, now: NOW });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.explain?.sourceIds).toContain("TEAGASC_SOIL_SAMPLING");
    }
  });
});

describe("assessSamplingTimingReadiness", () => {
  it("reports UNKNOWN, not READY, when no application history is known at all", () => {
    const result = assessSamplingTimingReadiness({ sampleDate: "2026-09-12" });
    expect(result.status).toBe("UNKNOWN");
  });

  it("flags too-soon-after-PK inside the 3-month minimum window", () => {
    const result = assessSamplingTimingReadiness({ lastPkApplicationDate: "2026-08-01", sampleDate: "2026-09-12" });
    expect(result.status).toBe("TOO_SOON_AFTER_PK");
  });

  it("is READY once the PK application is more than 3 months in the past", () => {
    const result = assessSamplingTimingReadiness({ lastPkApplicationDate: "2026-01-01", sampleDate: "2026-09-12" });
    expect(result.status).toBe("READY");
  });

  it("flags too-soon-after-lime inside the 2-year minimum window", () => {
    const result = assessSamplingTimingReadiness({ lastLimeApplicationDate: "2025-09-12", sampleDate: "2026-09-12" });
    expect(result.status).toBe("TOO_SOON_AFTER_LIME");
  });

  it("is READY once the lime application is more than 2 years in the past", () => {
    const result = assessSamplingTimingReadiness({ lastLimeApplicationDate: "2023-01-01", sampleDate: "2026-09-12" });
    expect(result.status).toBe("READY");
  });

  it("checks lime before PK, since a recent lime application is the longer-lived concern", () => {
    const result = assessSamplingTimingReadiness({
      lastLimeApplicationDate: "2026-08-01",
      lastPkApplicationDate: "2026-01-01",
      sampleDate: "2026-09-12",
    });
    expect(result.status).toBe("TOO_SOON_AFTER_LIME");
  });
});
