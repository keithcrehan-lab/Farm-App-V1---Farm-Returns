import { describe, expect, it } from "vitest";
import { checkClosedPeriodCalendar, COUNTY_ZONE } from "./closed-period-calendar";

function expectProhibited(county: string, date: string, material: "chemical_fertiliser" | "organic_fertiliser_other_than_FYM" | "farmyard_manure") {
  const outcome = checkClosedPeriodCalendar({ county, date, material });
  expect(outcome.status).toBe("LEGAL_PROHIBITION");
}
function expectOpen(county: string, date: string, material: "chemical_fertiliser" | "organic_fertiliser_other_than_FYM" | "farmyard_manure") {
  const outcome = checkClosedPeriodCalendar({ county, date, material });
  expect(outcome.status).toBe("OK");
  if (outcome.status === "OK") expect(outcome.value).toBe("BASELINE_OPEN");
}

describe("COUNTY_ZONE", () => {
  it("every county the golden tests exercise resolves to the expected zone", () => {
    expect(COUNTY_ZONE.Carlow).toBe("A");
    expect(COUNTY_ZONE.Cork).toBe("A");
    expect(COUNTY_ZONE.Galway).toBe("B");
    expect(COUNTY_ZONE.Limerick).toBe("B");
    expect(COUNTY_ZONE.Cavan).toBe("C");
    expect(COUNTY_ZONE.Donegal).toBe("C");
  });

  it("has all 26 counties (Farm Return's own scope — 26-county closed-period register) across the 3 zones", () => {
    expect(Object.keys(COUNTY_ZONE)).toHaveLength(26);
  });
});

describe("checkClosedPeriodCalendar — Zone A (GFT057-GFT064)", () => {
  it("GFT057/GFT058: chemical fertiliser closes 09-15 through 01-29", () => {
    expectProhibited("Carlow", "2026-01-29", "chemical_fertiliser");
    expectOpen("Carlow", "2026-01-30", "chemical_fertiliser");
  });

  it("GFT059/GFT060: organic fertiliser (other than FYM) closes 10-01 through 01-12", () => {
    expectProhibited("Carlow", "2026-01-12", "organic_fertiliser_other_than_FYM");
    expectOpen("Carlow", "2026-01-13", "organic_fertiliser_other_than_FYM");
  });

  it("GFT061/GFT062: farmyard manure closes 11-01 through 01-12", () => {
    expectProhibited("Carlow", "2026-01-12", "farmyard_manure");
    expectOpen("Carlow", "2026-01-13", "farmyard_manure");
  });
});

describe("checkClosedPeriodCalendar — Zone B (GFT065-GFT072)", () => {
  it("GFT065/GFT066: chemical fertiliser closes 09-15 through 01-29 (same as Zone A)", () => {
    expectProhibited("Galway", "2026-01-29", "chemical_fertiliser");
    expectOpen("Galway", "2026-01-30", "chemical_fertiliser");
  });

  it("GFT067/GFT068: organic fertiliser closes 10-01 through 01-15 (later than Zone A's 01-12)", () => {
    expectProhibited("Galway", "2026-01-15", "organic_fertiliser_other_than_FYM");
    expectOpen("Galway", "2026-01-16", "organic_fertiliser_other_than_FYM");
  });

  it("GFT069/GFT070: farmyard manure closes 11-01 through 01-15", () => {
    expectProhibited("Galway", "2026-01-15", "farmyard_manure");
    expectOpen("Galway", "2026-01-16", "farmyard_manure");
  });
});

describe("checkClosedPeriodCalendar — Zone C (GFT073-GFT080)", () => {
  it("GFT073/GFT074: chemical fertiliser closes 09-15 through 02-14 (latest of all 3 zones)", () => {
    expectProhibited("Cavan", "2026-02-14", "chemical_fertiliser");
    expectOpen("Cavan", "2026-02-15", "chemical_fertiliser");
  });

  it("GFT075/GFT076: organic fertiliser closes 10-01 through 01-31", () => {
    expectProhibited("Cavan", "2026-01-31", "organic_fertiliser_other_than_FYM");
    expectOpen("Cavan", "2026-02-01", "organic_fertiliser_other_than_FYM");
  });

  it("GFT077/GFT078: farmyard manure closes 11-01 through 01-31", () => {
    expectProhibited("Cavan", "2026-01-31", "farmyard_manure");
    expectOpen("Cavan", "2026-02-01", "farmyard_manure");
  });
});

describe("checkClosedPeriodCalendar — edge cases", () => {
  it("a mid-summer date is open in every zone/material", () => {
    expectOpen("Carlow", "2026-07-15", "chemical_fertiliser");
    expectOpen("Galway", "2026-07-15", "organic_fertiliser_other_than_FYM");
    expectOpen("Cavan", "2026-07-15", "farmyard_manure");
  });

  it("a mid-winter date (e.g. Christmas) is closed everywhere", () => {
    expectProhibited("Carlow", "2026-12-25", "chemical_fertiliser");
    expectProhibited("Galway", "2026-12-25", "organic_fertiliser_other_than_FYM");
    expectProhibited("Cavan", "2026-12-25", "farmyard_manure");
  });

  it("fails closed for an unrecognised county rather than guessing a zone", () => {
    const outcome = checkClosedPeriodCalendar({ county: "Atlantis", date: "2026-07-01", material: "chemical_fertiliser" });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_COUNTY_ZONE");
    }
  });
});
