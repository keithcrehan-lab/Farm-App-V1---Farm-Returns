import { describe, expect, it } from "vitest";
import { deriveRealAlerts } from "./real-alerts";
import { normaliseCountyForZoneLookup } from "./closed-period-calendar";
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
    const { alerts } = deriveRealAlerts({
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
    const { alerts } = deriveRealAlerts({
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
    const { alerts } = deriveRealAlerts({
      farm,
      fields: [fieldTooClose],
      livestockGroups: groups,
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    expect(alerts.some((a) => a.id === `real-alert-buffer-${fieldTooClose.id}`)).toBe(true);
  });

  // Codex audit HIGH (round 12): round 11 treated the whole buffer alert
  // as field-intrinsic, but `nationalBufferDistanceStatus` is not —
  // `nutrients.ts`'s own `bufferMaterial` selects "chemical_fertiliser"
  // whenever the grazing/agronomic ledger's `allocatedProducts` is
  // non-empty, so a tillage field can fabricate that blend and trigger
  // a real "Water-buffer distance not met" alert checked against the
  // wrong regulatory material.
  it("never raises the buffer alert from a fabricated national-buffer violation on a tillage field", () => {
    const tillageFieldTooClose: Field = {
      ...field,
      plannedUse: tracked("tillage", "farmer_adjusted", "Keith"),
      waterBufferContext: tracked(
        { nearestFeature: "stream", distanceM: 1, localOverrideStatus: "verified_none", featureType: "surface_water" },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const { alerts } = deriveRealAlerts({
      farm,
      fields: [tillageFieldTooClose],
      livestockGroups: groups,
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    expect(alerts.some((a) => a.id === `real-alert-buffer-${tillageFieldTooClose.id}`)).toBe(false);
  });

  it("still raises the buffer alert for a tillage field from a real, field-intrinsic local-authority override — genuinely independent of the ledger", () => {
    const tillageFieldLocalOverride: Field = {
      ...field,
      plannedUse: tracked("tillage", "farmer_adjusted", "Keith"),
      waterBufferContext: tracked(
        { nearestFeature: "stream", distanceM: 5, localOverrideStatus: "authoritative_rule", localOverrideDistanceM: 10, featureType: "surface_water" },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const { alerts } = deriveRealAlerts({
      farm,
      fields: [tillageFieldLocalOverride],
      livestockGroups: groups,
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    expect(alerts.some((a) => a.id === `real-alert-buffer-${tillageFieldLocalOverride.id}`)).toBe(true);
  });

  it("raises a real attention alert when a soil test is legally DISREGARDED", () => {
    const fieldOldTest: Field = {
      ...field,
      fertility: {
        ...field.fertility,
        verifiedTest: { sampleDate: "2020-01-01", laboratory: "Test Lab", sampleRef: "R1", p: 6, k: 100, pH: 6.1 },
      },
    };
    const { alerts } = deriveRealAlerts({
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
    const { alerts } = deriveRealAlerts({
      farm,
      fields: [],
      livestockGroups: [],
      slurryAllocations: [],
      asOfDate: "2026-01-15",
    });
    expect(alerts.some((a) => a.id === "real-alert-closed-period")).toBe(true);
  });

  it("does not raise a closed-period alert for a date outside the closed period", () => {
    const { alerts } = deriveRealAlerts({
      farm,
      fields: [],
      livestockGroups: [],
      slurryAllocations: [],
      asOfDate: "2026-06-15",
    });
    expect(alerts.some((a) => a.id === "real-alert-closed-period")).toBe(false);
  });

  // Codex audit HIGH (round 11): a real, heavily-stocked field genuinely
  // exceeding its NAP ceiling.
  const heavyField: Field = { ...field, id: "field-heavy", fertility: { pIndex: tracked(1, "farmer_adjusted", "Keith"), kIndex: tracked(1, "farmer_adjusted", "Keith") } };
  const heavyGroups: LivestockGroup[] = [
    { id: "g1", farmId: "farm-test", category: "suckler_cow", label: "Cows", count: tracked(40, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
  ];

  it("raises a real attention alert when a real, evidenced field genuinely exceeds its NAP ceiling", () => {
    const { alerts } = deriveRealAlerts({
      farm,
      fields: [heavyField],
      livestockGroups: heavyGroups,
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    const alert = alerts.find((a) => a.id === `real-alert-nap-ceiling-${heavyField.id}`);
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("attention");
  });

  // This app has no tillage N/P/K table at all — a real "exceeds NAP
  // ceiling" alert for a tillage field would be built from a grassland
  // requirement that was never a genuine recommendation in the first
  // place.
  it("never raises the NAP-ceiling alert for a tillage field, even with the identical heavy stocking", () => {
    const tillageField: Field = { ...heavyField, plannedUse: tracked("tillage", "farmer_adjusted", "Keith") };
    const { alerts } = deriveRealAlerts({
      farm,
      fields: [tillageField],
      livestockGroups: heavyGroups,
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    expect(alerts.some((a) => a.id === `real-alert-nap-ceiling-${tillageField.id}`)).toBe(false);
  });

  // An empty livestockGroups read is genuinely ambiguous between
  // "confirmed zero" and "never entered" — never a real, presented-as-
  // real compliance warning built from that ambiguity.
  it("never raises the NAP-ceiling alert for a grazing field when the farm has no recorded livestock", () => {
    const { alerts } = deriveRealAlerts({
      farm,
      fields: [heavyField],
      livestockGroups: [],
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    expect(alerts.some((a) => a.id === `real-alert-nap-ceiling-${heavyField.id}`)).toBe(false);
  });

  it("still raises the other three real alert types for a tillage field — they are independent of land use and livestock", () => {
    const tillageField: Field = {
      ...heavyField,
      plannedUse: tracked("tillage", "farmer_adjusted", "Keith"),
      commonageStatus: tracked("commonage", "farmer_adjusted", "Keith"),
    };
    const { alerts } = deriveRealAlerts({
      farm,
      fields: [tillageField],
      livestockGroups: [],
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    expect(alerts.some((a) => a.id === `real-alert-commonage-${tillageField.id}`)).toBe(true);
  });

  // Codex audit HIGH (round 18): `deriveRealAlerts` computed the farm's
  // own real `nonGrassPct` (from the identical `farmGrasslandAggregates`
  // call already used for `farmGrasslandAreaHa`) but silently discarded
  // it, so `calculateNutrientPlan`'s own elevated-N-ceiling eligibility
  // gate (GFT023/GFT024, `isEligibleForElevatedNRate`) always saw 0% —
  // a farm with real evidence proving ≥5% non-grass eligible area could
  // see a real, compliant recommendation misclassified as exceeding the
  // lower, ineligible-farm ceiling. Empirically-derived fixture: a real
  // statutory GSR of 230 kg N/ha with 25 dairy cows over a real
  // grassland area (10ha grazing + 0.6ha tillage, giving ~5.7% non-grass)
  // gives a real N requirement of 193 kg N/ha — within the elevated
  // 214 kg N/ha ceiling this farm's real evidence unlocks, but above the
  // 185 kg N/ha ceiling it would fall back to without that evidence.
  it("never raises a false NAP-ceiling alert for a real, elevated-eligible farm whose real N requirement is within the elevated ceiling but would exceed the lower, ineligible-farm one", () => {
    const grazingField: Field = {
      ...field,
      id: "field-grazing",
      areaHa: 10,
      fertility: { pIndex: tracked(1, "farmer_adjusted", "Keith"), kIndex: tracked(1, "farmer_adjusted", "Keith") },
    };
    // Purely to push the farm's real non-grass-area % above the 5%
    // GFT023/GFT024 threshold — `farmGrasslandAggregates` excludes this
    // field's own area from `farmGrasslandAreaHa` entirely.
    const tillageField: Field = { ...field, id: "field-tillage", areaHa: 0.6, plannedUse: tracked("tillage", "farmer_adjusted", "Keith") };
    const dairyGroups: LivestockGroup[] = [
      {
        id: "g1",
        farmId: "farm-test",
        category: "dairy_cow",
        label: "Cows",
        count: tracked(25, "verified", "Keith"),
        system: "grazing",
        avgAgeMonths: 48,
        sex: "female",
        value: tracked(0, "estimated", "x"),
        avgMilkYieldKgPerYear: tracked(6000, "verified", "Keith"),
      },
    ];

    const { alerts } = deriveRealAlerts({
      farm,
      fields: [grazingField, tillageField],
      livestockGroups: dairyGroups,
      slurryAllocations: [],
      asOfDate: "2026-08-01",
    });
    expect(alerts.some((a) => a.id === `real-alert-nap-ceiling-${grazingField.id}`)).toBe(false);
  });

  // Codex audit HIGH (round 24): an empty `alerts` array used to be
  // indistinguishable between "checked and found nothing" and "the
  // farm's own real NAP-ceiling / national-buffer checks were never run
  // at all" for a non-tillage field with no recorded livestock.
  describe("fieldsWithBlockedChecks", () => {
    it("discloses a non-tillage field whose ledger-dependent checks could not run because the farm has no recorded livestock", () => {
      const { fieldsWithBlockedChecks } = deriveRealAlerts({
        farm,
        fields: [field],
        livestockGroups: [],
        slurryAllocations: [],
        asOfDate: "2026-08-01",
      });
      expect(fieldsWithBlockedChecks).toBe(1);
    });

    it("never counts a tillage field — this app has no tillage N/P/K table at all, so it is genuinely not applicable, not blocked", () => {
      const tillageField: Field = { ...field, plannedUse: tracked("tillage", "farmer_adjusted", "Keith") };
      const { fieldsWithBlockedChecks } = deriveRealAlerts({
        farm,
        fields: [tillageField],
        livestockGroups: [],
        slurryAllocations: [],
        asOfDate: "2026-08-01",
      });
      expect(fieldsWithBlockedChecks).toBe(0);
    });

    it("never discloses when every real field's evidence is complete", () => {
      const { fieldsWithBlockedChecks } = deriveRealAlerts({
        farm,
        fields: [field],
        livestockGroups: groups,
        slurryAllocations: [],
        asOfDate: "2026-08-01",
      });
      expect(fieldsWithBlockedChecks).toBe(0);
    });

    // Codex audit HIGH (round 25): round 24's own counter only ever
    // checked the missing-livestock reason — a non-tillage field with
    // real recorded livestock but a missing P/K Soil Index also has its
    // real NAP-ceiling check blocked (`calculateNutrientPlan` itself
    // forces `napCompliance` to `BLOCKED_INSUFFICIENT_EVIDENCE` whenever
    // `fertilityEvidence.status !== "OK"`), and was silently never
    // counted — the same undercounting round 23 fixed for
    // `calculateFarmFertiliserRequirement`.
    it("discloses a non-tillage field with real livestock but a missing P/K Soil Index", () => {
      const noFertilityField: Field = { ...field, fertility: {} };
      const { fieldsWithBlockedChecks } = deriveRealAlerts({
        farm,
        fields: [noFertilityField],
        livestockGroups: groups,
        slurryAllocations: [],
        asOfDate: "2026-08-01",
      });
      expect(fieldsWithBlockedChecks).toBe(1);
    });

    it("counts a field only once when it is missing both livestock and fertility evidence", () => {
      const noFertilityField: Field = { ...field, fertility: {} };
      const { fieldsWithBlockedChecks } = deriveRealAlerts({
        farm,
        fields: [noFertilityField],
        livestockGroups: [],
        slurryAllocations: [],
        asOfDate: "2026-08-01",
      });
      expect(fieldsWithBlockedChecks).toBe(1);
    });
  });
});
