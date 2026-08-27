import { describe, expect, it } from "vitest";
import { deriveRealAlerts, normaliseCountyForZoneLookup } from "./real-alerts";
import { tracked } from "./types";
import type { Farm, Field, LivestockGroup } from "./types";

const farm: Farm = {
  id: "farm-test",
  name: "Test Farm",
  location: { county: "Co. Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Keith",
};

const field: Field = {
  id: "field-1",
  farmId: "farm-test",
  name: "Home Field",
  areaHa: 10,
  centroid: [0, 0],
  plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
  mappedSoil: {
    soilAssociation: "Fermoy",
    dominantSeries: "Brown Earth",
    texture: "Loam",
    drainage: "moderately_drained",
    coveragePct: 88,
    datasetVersion: "test",
    source: "test",
  },
  fertility: {
    pIndex: tracked(3, "farmer_adjusted", "Keith"),
    kIndex: tracked(3, "farmer_adjusted", "Keith"),
  },
  history: [],
};

const groups: LivestockGroup[] = [
  { id: "g1", farmId: "farm-test", category: "suckler_cow", label: "Cows", count: tracked(10, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
];

describe("normaliseCountyForZoneLookup", () => {
  it("strips a 'Co. ' prefix so the real farm.location.county format matches closed-period-calendar.ts's COUNTY_ZONE keys", () => {
    expect(normaliseCountyForZoneLookup("Co. Cork")).toBe("Cork");
    expect(normaliseCountyForZoneLookup("Co.Cork")).toBe("Cork");
    expect(normaliseCountyForZoneLookup("Cork")).toBe("Cork");
  });
});

describe("deriveRealAlerts", () => {
  it("returns no alerts for a clean field with no captured compliance issues (this app's real fail-closed defaults)", () => {
    const alerts = deriveRealAlerts({
      farm,
      fields: [field],
      livestockGroups: groups,
      slurryAllocations: [],
      asOfDate: "2026-08-01", // outside every zone's chemical-fertiliser closed period
    });
    expect(alerts).toEqual([]);
  });

  it("raises a real risk alert for a commonage field with chemical fertiliser prohibited (not a fixed mock entry)", () => {
    const commonageField: Field = { ...field, commonageStatus: tracked("commonage", "farmer_adjusted", "Keith") };
    const alerts = deriveRealAlerts({
      farm,
      fields: [commonageField],
      livestockGroups: groups,
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    const alert = alerts.find((a) => a.id === `real-alert-commonage-${commonageField.id}`);
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("risk");
    expect(alert?.subtitle).toBe(field.name);
  });

  it("raises a real risk alert for a field too close to surface water for its needed chemical fertiliser", () => {
    const fieldTooClose: Field = {
      ...field,
      waterBufferContext: tracked(
        { nearestFeature: "stream", distanceM: 1, localOverrideStatus: "verified_none", featureType: "surface_water" },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const alerts = deriveRealAlerts({
      farm,
      fields: [fieldTooClose],
      livestockGroups: groups,
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    expect(alerts.some((a) => a.id === `real-alert-buffer-${fieldTooClose.id}`)).toBe(true);
  });

  it("raises a real attention alert when a soil test is legally DISREGARDED", () => {
    const fieldOldTest: Field = {
      ...field,
      fertility: {
        ...field.fertility,
        verifiedTest: { sampleDate: "2020-01-01", laboratory: "Test Lab", sampleRef: "R1", p: 6, k: 100, pH: 6.1 },
      },
    };
    const alerts = deriveRealAlerts({
      farm,
      fields: [fieldOldTest],
      livestockGroups: groups,
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    const alert = alerts.find((a) => a.id === `real-alert-soil-test-${fieldOldTest.id}`);
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("attention");
  });

  it("raises a farm-wide risk alert when today falls inside the real statutory closed period for this farm's own county", () => {
    // Zone A (Cork) chemical-fertiliser closed period includes late January.
    const alerts = deriveRealAlerts({
      farm,
      fields: [],
      livestockGroups: [],
      slurryAllocations: [],
      asOfDate: "2026-01-15",
    });
    expect(alerts.some((a) => a.id === "real-alert-closed-period")).toBe(true);
  });

  it("does not raise a closed-period alert for a date outside the closed period", () => {
    const alerts = deriveRealAlerts({
      farm,
      fields: [],
      livestockGroups: [],
      slurryAllocations: [],
      asOfDate: "2026-06-15",
    });
    expect(alerts.some((a) => a.id === "real-alert-closed-period")).toBe(false);
  });
});
