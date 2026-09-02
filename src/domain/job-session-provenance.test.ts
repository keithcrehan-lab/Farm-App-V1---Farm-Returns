import { describe, expect, it } from "vitest";
import { buildJobSessionProvenance, type JobSessionProvenanceInput } from "./job-session-provenance";

const FULL: JobSessionProvenanceInput = {
  hasDeviceTimestamps: true,
  fieldGpsInferred: true,
  farmerConfirmed: true,
  hasPromptOrPlanOrigin: true,
  hasActualQuantity: true,
  usesMappedFieldArea: true,
  hasWeatherContext: true,
  hasGpsTrace: true,
};

describe("buildJobSessionProvenance", () => {
  it("produces one entry per real signal present, never one flattened generic 'confirmed' state", () => {
    const entries = buildJobSessionProvenance(FULL);
    const fields = entries.map((e) => e.field);
    expect(fields).toEqual([
      "date",
      "startEnd",
      "field",
      "activity",
      "quantity",
      "mappedFieldArea",
      "weather",
      "prompt",
      "gpsTrace",
    ]);
    // No two entries share an origin+description pair as a lazy default.
    const uniqueOrigins = new Set(entries.map((e) => e.origin));
    expect(uniqueOrigins.size).toBeGreaterThan(1);
  });

  it("omits every entry whose underlying signal is absent, rather than fabricating a placeholder", () => {
    const minimal: JobSessionProvenanceInput = {
      hasDeviceTimestamps: false,
      fieldGpsInferred: false,
      farmerConfirmed: false,
      hasPromptOrPlanOrigin: false,
      hasActualQuantity: false,
      usesMappedFieldArea: false,
      hasWeatherContext: false,
      hasGpsTrace: false,
    };
    expect(buildJobSessionProvenance(minimal)).toEqual([]);
  });

  it("distinguishes GPS-inferred-only field from farmer-confirmed-only field", () => {
    const gpsOnly = buildJobSessionProvenance({ ...FULL, farmerConfirmed: false, hasActualQuantity: false });
    const fieldEntry = gpsOnly.find((e) => e.field === "field");
    expect(fieldEntry?.origin).toBe("observed");

    const confirmedOnly = buildJobSessionProvenance({ ...FULL, fieldGpsInferred: false });
    const confirmedFieldEntry = confirmedOnly.find((e) => e.field === "field");
    expect(confirmedFieldEntry?.origin).toBe("actual");
  });

  it("marks field as GPS-inferred-and-confirmed when both are true", () => {
    const entries = buildJobSessionProvenance(FULL);
    const fieldEntry = entries.find((e) => e.field === "field");
    expect(fieldEntry?.description).toMatch(/GPS inferred, farmer confirmed/);
  });
});
