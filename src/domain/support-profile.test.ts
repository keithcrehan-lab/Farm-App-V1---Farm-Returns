import { describe, expect, it } from "vitest";
import { buildSupportProfile, validateSupportProfileFactValue, type SupportProfileFact } from "./support-profile";
import { tracked, type Farm, type Field, type LivestockGroup } from "./types";

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [-8.5, 51.9] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Test Owner",
};

function field(overrides: Partial<Field>): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Back Field",
    areaHa: 10,
    centroid: [-8.5, 51.9],
    fertility: {},
    history: [],
    ...overrides,
  } as Field;
}

const GROUPS: LivestockGroup[] = [
  {
    id: "g1",
    farmId: "farm-1",
    category: "suckler_cow",
    label: "Suckler cows",
    count: tracked(20, "verified", "Farmer count"),
    system: "grazing",
    value: tracked(20000, "estimated", "n/a"),
  },
];

describe("buildSupportProfile", () => {
  it("derives real known facts from farm evidence without asking for them", () => {
    const fields = [field({ areaHa: 10, plannedUse: tracked("grazing", "verified", "s") })];
    const profile = buildSupportProfile(FARM, fields, GROUPS, []);

    expect(profile.derived.totalMappedAreaHa).toBe(10);
    expect(profile.derived.forageAreaHa).toBe(10);
    expect(profile.derived.fieldsWithUnresolvedUse).toBe(0);
    expect(profile.derived.totalLivestockUnits).toBeCloseTo(18); // 20 * 0.9 LU
    expect(profile.knownFacts.some((f) => f.label === "County" && f.value === "Cork")).toBe(true);
  });

  it("reports forage area as unknown (null), not zero, when a field's use is unresolved", () => {
    const fields = [field({ areaHa: 10, plannedUse: undefined })];
    const profile = buildSupportProfile(FARM, fields, GROUPS, []);

    expect(profile.derived.forageAreaHa).toBeNull();
    expect(profile.derived.fieldsWithUnresolvedUse).toBe(1);
    expect(profile.knownFacts.some((f) => f.label === "Forage area")).toBe(false);
  });

  it("lists every genuine gap when no farmer facts are recorded", () => {
    const profile = buildSupportProfile(FARM, [], GROUPS, []);
    const gapKeys = profile.gaps.map((g) => g.key).sort();
    expect(gapKeys).toEqual(["agricultural_qualification_level", "biss_participant_2026", "date_of_birth", "head_of_holding_since", "land_declared_for_schemes"].sort());
  });

  it("never re-asks a fact the farmer has already answered", () => {
    const facts: SupportProfileFact[] = [
      { key: "date_of_birth", value: "1998-04-01", status: "farmer_confirmed", source: "farmer_entered", updatedAt: "2026-09-04" },
    ];
    const profile = buildSupportProfile(FARM, [], GROUPS, facts);
    expect(profile.gaps.some((g) => g.key === "date_of_birth")).toBe(false);
    expect(profile.farmerFacts.date_of_birth?.value).toBe("1998-04-01");
    expect(profile.gaps).toHaveLength(4);
  });
});

describe("validateSupportProfileFactValue", () => {
  const TODAY = "2026-09-04T00:00:00.000Z";

  it("accepts a real, past calendar date for date_of_birth", () => {
    expect(validateSupportProfileFactValue("date_of_birth", "1998-04-01", TODAY).valid).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(validateSupportProfileFactValue("date_of_birth", "not-a-date", TODAY).valid).toBe(false);
  });

  it("rejects an impossible calendar date (e.g. 30 February)", () => {
    expect(validateSupportProfileFactValue("head_of_holding_since", "2026-02-30", TODAY).valid).toBe(false);
  });

  it("rejects a future date", () => {
    expect(validateSupportProfileFactValue("date_of_birth", "2030-01-01", TODAY).valid).toBe(false);
  });

  it("accepts an in-range integer qualification level", () => {
    expect(validateSupportProfileFactValue("agricultural_qualification_level", 6, TODAY).valid).toBe(true);
  });

  it("rejects a fractional or out-of-range qualification level", () => {
    expect(validateSupportProfileFactValue("agricultural_qualification_level", 6.5, TODAY).valid).toBe(false);
    expect(validateSupportProfileFactValue("agricultural_qualification_level", 11, TODAY).valid).toBe(false);
    expect(validateSupportProfileFactValue("agricultural_qualification_level", -1, TODAY).valid).toBe(false);
  });

  it("rejects a non-boolean value for a boolean fact", () => {
    expect(validateSupportProfileFactValue("biss_participant_2026", "yes", TODAY).valid).toBe(false);
    expect(validateSupportProfileFactValue("land_declared_for_schemes", 1, TODAY).valid).toBe(false);
  });

  it("accepts a real boolean value", () => {
    expect(validateSupportProfileFactValue("biss_participant_2026", true, TODAY).valid).toBe(true);
    expect(validateSupportProfileFactValue("land_declared_for_schemes", false, TODAY).valid).toBe(true);
  });
});
