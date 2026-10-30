import { describe, expect, it } from "vitest";
import { COUNTY_NAMES, FARM_TYPES, countyFromGeocode, enterprisesForFarmTypes, isIrishPoint, onboardingStage, ownerNameFromEmail } from "./onboarding";
import { humanAuthError } from "./auth-errors";

describe("onboarding stage (resume from what exists)", () => {
  it("a new account with no farm starts by locating the farm", () => {
    expect(onboardingStage({ hasFarm: false, completed: false, fieldCount: 0 })).toBe("LOCATE");
  });
  it("a farm with no field yet resumes at mapping the first field", () => {
    expect(onboardingStage({ hasFarm: true, completed: false, fieldCount: 0 })).toBe("FIRST_FIELD");
  });
  it("a farm with a field but not finished resumes at the next-steps choice (never re-asked for its field)", () => {
    expect(onboardingStage({ hasFarm: true, completed: false, fieldCount: 2 })).toBe("NEXT_STEPS");
  });
  it("a completed farmer is never sent back through onboarding — with or without fields", () => {
    expect(onboardingStage({ hasFarm: true, completed: true, fieldCount: 0 })).toBe("DONE");
    expect(onboardingStage({ hasFarm: true, completed: true, fieldCount: 10 })).toBe("DONE");
  });
});

describe("farm types map exactly onto the existing enterprise model", () => {
  it("records multiple concrete farm types without inventing a generic mixed value", () => {
    expect(FARM_TYPES.map((t) => t.label)).toEqual(["Dairy", "Suckler", "Dairy calf-to-beef", "Sheep", "Tillage", "Mixed", "Other"]);
    expect(enterprisesForFarmTypes(["suckler", "sheep", "tillage"])).toEqual(["suckler_beef", "sheep", "tillage"]);
  });

  it("keeps Mixed and Other as standalone fallback choices and rejects unknown combinations", () => {
    expect(enterprisesForFarmTypes(["other"])).toEqual([]);
    expect(enterprisesForFarmTypes(["mixed"])).toEqual(["mixed"]);
    expect(enterprisesForFarmTypes(["mixed", "dairy"])).toBeNull();
    expect(enterprisesForFarmTypes(["other", "sheep"])).toBeNull();
    expect(enterprisesForFarmTypes([])).toBeNull();
    expect(enterprisesForFarmTypes(["cattle-ranch"])).toBeNull();
  });
});

describe("county from the confirmed map point", () => {
  it("reads Mapbox's region answer ('County Galway', 'Co. Cork')", () => {
    expect(countyFromGeocode({ features: [{ text: "County Galway", place_name: "County Galway, Ireland" }] })).toBe("Galway");
    expect(countyFromGeocode({ features: [{ text: "Co. Cork" }] })).toBe("Cork");
  });
  it("anything that isn't one of the 26 counties is unknown (the farmer chooses) — never a nearest guess", () => {
    expect(countyFromGeocode({ features: [{ text: "County Antrim" }] })).toBeNull();
    expect(countyFromGeocode({ features: [] })).toBeNull();
    expect(countyFromGeocode(null)).toBeNull();
    expect(COUNTY_NAMES).toHaveLength(26);
  });
  it("only points in or near Ireland are accepted as a farm location", () => {
    expect(isIrishPoint(-8.7, 53.3)).toBe(true);
    expect(isIrishPoint(0, 0)).toBe(false);
    expect(isIrishPoint(Number.NaN, 53)).toBe(false);
  });
  it("the required owner name comes from the account email", () => {
    expect(ownerNameFromEmail("mary.walsh@example.ie")).toBe("mary.walsh");
    expect(ownerNameFromEmail("")).toBe("Farm owner");
  });
});

describe("auth errors are human — Supabase's own wording never reaches the farmer", () => {
  it("maps the common cases", () => {
    expect(humanAuthError({ code: "invalid_credentials", message: "Invalid login credentials" }, "SIGN_IN")).toMatch(/don't match an account/);
    expect(humanAuthError({ message: "User already registered" }, "SIGN_UP")).toMatch(/already an account/);
    expect(humanAuthError({ code: "email_not_confirmed" }, "SIGN_IN")).toMatch(/Confirm your email/);
    expect(humanAuthError({ status: 429, message: "x" }, "SIGN_UP")).toMatch(/Too many attempts/);
  });
  it("anything unknown gets a plain fallback, never the raw message", () => {
    const out = humanAuthError({ message: "AuthApiError: duplicate key value violates unique constraint \"users_pkey\"" }, "SIGN_UP");
    expect(out).toBe("We couldn't create your account just now. Please try again.");
    expect(out).not.toMatch(/AuthApiError|constraint/);
  });
});
