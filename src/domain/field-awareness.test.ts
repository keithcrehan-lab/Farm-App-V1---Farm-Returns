import { describe, expect, it } from "vitest";
import {
  buildFieldAwarenessSnapshot,
  classifyFieldAwarenessAttention,
  classifyFieldAwarenessConfidence,
  classifyFieldAwarenessFreshness,
  FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS,
  type FieldAwarenessInputs,
  type FieldAwarenessRecentActivity,
} from "./field-awareness";
import { ok, blockedInsufficientEvidence, unknown } from "./evidence";
import type { SatelliteFieldCoverage } from "./satellite-field-coverage";

function coverage(acquisitionTimestamp: string, overrides: Partial<SatelliteFieldCoverage> = {}) {
  return ok<SatelliteFieldCoverage>(
    {
      provider: "Copernicus Data Space Ecosystem",
      mission: "sentinel-2c",
      productId: "scene-1",
      acquisitionTimestamp,
      processingLevel: "L2",
      cloudCoverPercent: 5,
      algorithm: "test fixture",
      calculationVersion: "test",
      ...overrides,
    },
    "MEASURED",
  );
}

const NO_COVERAGE = blockedInsufficientEvidence<SatelliteFieldCoverage>("NO_RECENT_SATELLITE_SCENE_AVAILABLE", ["sentinel2ScenesCoveringField"]);

function activity(overrides: Partial<FieldAwarenessRecentActivity> = {}): FieldAwarenessRecentActivity {
  return {
    fieldId: "field-1",
    activityType: "silage",
    completionType: "whole",
    confirmedAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

const NOW = "2026-09-08T12:00:00.000Z";

describe("classifyFieldAwarenessFreshness", () => {
  it("classifies unavailable when no observation age exists", () => {
    expect(classifyFieldAwarenessFreshness(undefined)).toBe("unavailable");
  });

  it("classifies at each real threshold boundary", () => {
    expect(classifyFieldAwarenessFreshness(0)).toBe("current");
    expect(classifyFieldAwarenessFreshness(FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS.currentMaxDays)).toBe("current");
    expect(classifyFieldAwarenessFreshness(FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS.currentMaxDays + 1)).toBe("recent");
    expect(classifyFieldAwarenessFreshness(FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS.recentMaxDays)).toBe("recent");
    expect(classifyFieldAwarenessFreshness(FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS.recentMaxDays + 1)).toBe("ageing");
    expect(classifyFieldAwarenessFreshness(FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS.ageingMaxDays)).toBe("ageing");
    expect(classifyFieldAwarenessFreshness(FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS.ageingMaxDays + 1)).toBe("stale");
    expect(classifyFieldAwarenessFreshness(90)).toBe("stale");
  });
});

describe("classifyFieldAwarenessAttention", () => {
  it("is always normal when the field has no mapped boundary — nothing to monitor yet, not a concern", () => {
    expect(classifyFieldAwarenessAttention(false, "unavailable")).toBe("normal");
    expect(classifyFieldAwarenessAttention(false, "stale")).toBe("normal");
  });

  it("is normal for current/recent freshness with a mapped boundary", () => {
    expect(classifyFieldAwarenessAttention(true, "current")).toBe("normal");
    expect(classifyFieldAwarenessAttention(true, "recent")).toBe("normal");
  });

  it("is worth_watching for ageing freshness", () => {
    expect(classifyFieldAwarenessAttention(true, "ageing")).toBe("worth_watching");
  });

  it("is worth_checking for stale or a confirmed unavailable (not a provider outage) freshness with a mapped boundary", () => {
    expect(classifyFieldAwarenessAttention(true, "stale")).toBe("worth_checking");
    expect(classifyFieldAwarenessAttention(true, "unavailable")).toBe("worth_checking");
    expect(classifyFieldAwarenessAttention(true, "unavailable", false)).toBe("worth_checking");
  });

  // Codex audit MEDIUM (round 2): a genuine provider outage tells a
  // farmer nothing about this field — it must not manufacture
  // field-directed "worth checking" advice out of a request failure.
  it("is normal, not worth_checking, when 'unavailable' is caused by a genuine provider outage", () => {
    expect(classifyFieldAwarenessAttention(true, "unavailable", true)).toBe("normal");
  });

  it("a provider outage never raises attention for any other freshness (the flag is only consulted for 'unavailable')", () => {
    expect(classifyFieldAwarenessAttention(true, "stale", true)).toBe("worth_checking");
    expect(classifyFieldAwarenessAttention(true, "ageing", true)).toBe("worth_watching");
  });
});

describe("classifyFieldAwarenessConfidence", () => {
  it("degrades with freshness for a low/no-cloud observation", () => {
    expect(classifyFieldAwarenessConfidence("current")).toBe("high");
    expect(classifyFieldAwarenessConfidence("recent")).toBe("medium");
    expect(classifyFieldAwarenessConfidence("ageing")).toBe("medium");
    expect(classifyFieldAwarenessConfidence("stale")).toBe("low");
    expect(classifyFieldAwarenessConfidence("unavailable")).toBe("low");
  });

  // Codex audit HIGH (round 2): cloudCoverPercent is real STAC evidence
  // about the whole scene, not a per-pixel field-visibility check — a
  // non-trivial real cloud reading must not still read as "high
  // confidence" merely because it happened to pass the usability
  // ceiling.
  it("caps a 'current' observation at medium confidence when real cloud cover is non-trivial, even though it is still usable", () => {
    expect(classifyFieldAwarenessConfidence("current", 5)).toBe("high");
    expect(classifyFieldAwarenessConfidence("current", 15)).toBe("high");
    expect(classifyFieldAwarenessConfidence("current", 16)).toBe("medium");
    expect(classifyFieldAwarenessConfidence("current", 35)).toBe("medium");
  });

  it("never upgrades an already-degraded confidence based on cloud cover", () => {
    expect(classifyFieldAwarenessConfidence("recent", 0)).toBe("medium");
    expect(classifyFieldAwarenessConfidence("stale", 0)).toBe("low");
  });
});

describe("buildFieldAwarenessSnapshot", () => {
  it("assembles a real snapshot from a current satellite observation", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: true,
      coverage: coverage("2026-09-07T10:00:00.000Z"), // 1 day before NOW
      recentActivity: [],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.observationAgeDays).toBe(1);
    expect(snapshot.freshness).toBe("current");
    expect(snapshot.confidence).toBe("high");
    expect(snapshot.attention).toBe("normal");
    expect(snapshot.warnings).toEqual([]);
  });

  it("never fabricates an observationAgeDays when coverage is unavailable", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: true,
      coverage: NO_COVERAGE,
      recentActivity: [],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.observationAgeDays).toBeUndefined();
    expect(snapshot.freshness).toBe("unavailable");
    expect(snapshot.confidence).toBe("low");
    expect(snapshot.attention).toBe("worth_checking");
    expect(snapshot.warnings).toEqual(["No usable satellite observation found in the last 30 days."]);
  });

  it("gives a distinct, honest warning for a genuine provider outage (UNKNOWN) rather than claiming no observation exists, and does not raise attention", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: true,
      coverage: unknown<SatelliteFieldCoverage>("SATELLITE_PROVIDER_UNAVAILABLE"),
      recentActivity: [],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.observationAgeDays).toBeUndefined();
    expect(snapshot.freshness).toBe("unavailable");
    expect(snapshot.warnings).toEqual(["Could not reach the satellite service to check this field just now."]);
    // Codex audit MEDIUM (round 2): a provider outage is not evidence
    // about the field, so attention must stay normal here, unlike the
    // confirmed-absence case above which is "worth_checking".
    expect(snapshot.attention).toBe("normal");
  });

  it("caps confidence at medium for a current observation with non-trivial real cloud cover", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: true,
      coverage: coverage("2026-09-07T10:00:00.000Z", { cloudCoverPercent: 35 }),
      recentActivity: [],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.freshness).toBe("current");
    expect(snapshot.confidence).toBe("medium");
  });

  it("reports an honest, distinct warning when the field has no mapped boundary — never attempts coverage at all", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: false,
      coverage: NO_COVERAGE,
      recentActivity: [],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.freshness).toBe("unavailable");
    expect(snapshot.attention).toBe("normal");
    expect(snapshot.warnings).toEqual(["Field boundary is not mapped yet — satellite coverage cannot be checked."]);
  });

  it("includes real recent activity for this field, most recent first order preserved from the caller", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: true,
      coverage: coverage("2026-09-07T10:00:00.000Z"),
      recentActivity: [activity({ activityType: "silage", confirmedAt: "2026-09-05T09:00:00.000Z" })],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.recentActivity).toHaveLength(1);
    expect(snapshot.recentActivity[0].activityType).toBe("silage");
  });

  // Codex audit MEDIUM (round 2): the first version had no recency
  // window at all — a confirmed Actual from a year ago could still
  // appear under "Recent confirmed activity".
  it("excludes a confirmed activity older than FIELD_AWARENESS_ACTIVITY_LOOKBACK_DAYS", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: true,
      coverage: coverage("2026-09-07T10:00:00.000Z"),
      recentActivity: [activity({ confirmedAt: "2025-01-01T09:00:00.000Z" })],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.recentActivity).toHaveLength(0);
  });

  it("excludes a confirmedAt timestamp after generatedAt (malformed/future-dated) rather than trusting it", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: true,
      coverage: coverage("2026-09-07T10:00:00.000Z"),
      recentActivity: [activity({ confirmedAt: "2026-09-09T09:00:00.000Z" })], // after NOW
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.recentActivity).toHaveLength(0);
  });

  it("sorts recentActivity most-recent-first, regardless of the caller's own input order", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: true,
      coverage: coverage("2026-09-07T10:00:00.000Z"),
      recentActivity: [
        activity({ activityType: "field_inspection", confirmedAt: "2026-08-20T09:00:00.000Z" }),
        activity({ activityType: "silage", confirmedAt: "2026-09-05T09:00:00.000Z" }),
        activity({ activityType: "fertiliser_spreading", confirmedAt: "2026-08-25T09:00:00.000Z" }),
      ],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.recentActivity.map((a) => a.activityType)).toEqual(["silage", "fertiliser_spreading", "field_inspection"]);
  });

  it("Codex-relevant regression: drops any recentActivity entry whose own fieldId does not match this snapshot's field, rather than trusting the caller's own pre-filtering", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: true,
      coverage: coverage("2026-09-07T10:00:00.000Z"),
      recentActivity: [activity({ fieldId: "field-1" }), activity({ fieldId: "field-2" })],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.recentActivity).toHaveLength(1);
    expect(snapshot.recentActivity[0].fieldId).toBe("field-1");
  });

  it("never claims a vegetation trend or biomass figure — the snapshot shape has no such field", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-1",
      farmId: "farm-1",
      hasMappedBoundary: true,
      coverage: coverage("2026-09-07T10:00:00.000Z"),
      recentActivity: [],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(Object.keys(snapshot)).not.toContain("vegetationTrend");
    expect(Object.keys(snapshot)).not.toContain("biomassKgDmHa");
  });

  it("carries the real farmId/fieldId through unchanged", () => {
    const inputs: FieldAwarenessInputs = {
      fieldId: "field-9",
      farmId: "farm-9",
      hasMappedBoundary: true,
      coverage: NO_COVERAGE,
      recentActivity: [],
    };
    const snapshot = buildFieldAwarenessSnapshot(inputs, NOW);
    expect(snapshot.fieldId).toBe("field-9");
    expect(snapshot.farmId).toBe("farm-9");
  });
});
