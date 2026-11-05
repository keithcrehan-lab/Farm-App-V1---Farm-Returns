import { describe, expect, it } from "vitest";
import type { SupportProfile } from "../support-profile";
import { composeSchemeDataSnapshot } from "./data-snapshot";
import { SCHEME_DATA_KEYS } from "./data-keys";
import { schemeDataAdaptersFromSupportProfile } from "./support-profile-adapter";

function profile(): SupportProfile {
  return {
    farmId: "farm-1",
    version: "support-profile-v1",
    derived: {
      countyLocation: "Galway",
      primaryEnterprises: ["suckler_beef"],
      totalMappedAreaHa: 24,
      forageAreaHa: null,
      fieldsWithUnresolvedUse: 2,
      totalLivestockUnits: 18.4,
    },
    knownFacts: [],
    farmerFacts: {
      date_of_birth: {
        key: "date_of_birth",
        value: "1990-05-01",
        status: "farmer_confirmed",
        source: "farmer_entered",
        updatedAt: "2026-11-05T00:00:00.000Z",
      },
      biss_participant_2026: {
        key: "biss_participant_2026",
        value: true,
        status: "farmer_confirmed",
        source: "farmer_entered",
        updatedAt: "2026-11-05T00:00:00.000Z",
      },
    },
    gaps: [],
  };
}

describe("schemeDataAdaptersFromSupportProfile", () => {
  it("reuses existing facts under their new canonical owners without duplicating them", () => {
    const snapshot = composeSchemeDataSnapshot(
      schemeDataAdaptersFromSupportProfile(profile()),
    );

    expect(snapshot.get(SCHEME_DATA_KEYS.FARMER_DATE_OF_BIRTH.key)).toMatchObject({
      owner: "farm_profile",
      state: "KNOWN",
      value: "1990-05-01",
    });
    expect(snapshot.get(SCHEME_DATA_KEYS.BISS_PARTICIPATION.key)).toMatchObject({
      owner: "schemes",
      state: "KNOWN",
      value: true,
    });
    expect(snapshot.get(SCHEME_DATA_KEYS.LIVESTOCK_TOTAL_LU.key)).toMatchObject({
      owner: "livestock",
      state: "KNOWN",
      value: 18.4,
    });
  });

  it("keeps unresolved field use as missing field data rather than zero forage area", () => {
    const snapshot = composeSchemeDataSnapshot(
      schemeDataAdaptersFromSupportProfile(profile()),
    );

    expect(snapshot.get(SCHEME_DATA_KEYS.FIELD_FORAGE_AREA_HA.key)).toMatchObject({
      owner: "fields",
      state: "MISSING",
    });
    expect(snapshot.get(SCHEME_DATA_KEYS.FIELD_FORAGE_AREA_HA.key)?.value).toBeUndefined();
  });

  it("does not treat physical mapped area as declared area", () => {
    const snapshot = composeSchemeDataSnapshot(
      schemeDataAdaptersFromSupportProfile(profile()),
    );

    expect(snapshot.get(SCHEME_DATA_KEYS.FIELD_TOTAL_MAPPED_AREA_HA.key)?.value).toBe(24);
    expect(snapshot.get(SCHEME_DATA_KEYS.HOLDING_DECLARED_AREA_HA.key)).toMatchObject({
      state: "MISSING",
      owner: "farm_profile",
    });
  });
});
