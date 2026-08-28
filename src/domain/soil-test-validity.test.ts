import { describe, expect, it } from "vitest";
import {
  checkSoilOmValidity,
  checkSoilTestAgeValidity,
  checkSoilTestGeorefRequirement,
  SOIL_GEOREF_REQUIREMENT_EFFECTIVE_DATE,
  SOIL_OM_MAX_AGE_YEARS,
  SOIL_TEST_MAX_AGE_YEARS,
} from "./soil-test-validity";

describe("checkSoilTestAgeValidity", () => {
  it("real statutory thresholds", () => {
    expect(SOIL_TEST_MAX_AGE_YEARS).toBe(4);
  });

  it("GFT011: 3.99 years old, P Index 2 -> VALID", () => {
    const outcome = checkSoilTestAgeValidity({ ageYears: 3.99, pIndex: 2 });
    expect(outcome).toEqual({ status: "OK", value: "VALID", evidenceState: "MEASURED" });
  });

  it("GFT012: exactly 4.0 years old, P Index 2 -> DISREGARD", () => {
    const outcome = checkSoilTestAgeValidity({ ageYears: 4.0, pIndex: 2 });
    expect(outcome).toEqual({ status: "OK", value: "DISREGARD", evidenceState: "MEASURED" });
  });

  it("GFT013: exactly 4.0 years old, P Index 4 -> INDEX4_PERSISTED (the exception checked before the disregard)", () => {
    const outcome = checkSoilTestAgeValidity({ ageYears: 4.0, pIndex: 4 });
    expect(outcome).toEqual({ status: "OK", value: "INDEX4_PERSISTED", evidenceState: "MEASURED" });
  });

  it("GFT014: 6.0 years old (long-old), P Index 4 -> still INDEX4_PERSISTED, never expires further", () => {
    const outcome = checkSoilTestAgeValidity({ ageYears: 6.0, pIndex: 4 });
    expect(outcome).toEqual({ status: "OK", value: "INDEX4_PERSISTED", evidenceState: "MEASURED" });
  });

  it("GFT015: undated test -> UNKNOWN_BLOCK, never treated as valid or disregardable", () => {
    const outcome = checkSoilTestAgeValidity({ ageYears: undefined, pIndex: 2 });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(outcome.reasonCode).toBe("UNKNOWN_BLOCK");
  });
});

describe("checkSoilTestGeorefRequirement", () => {
  it("real effective date: 2025-09-14", () => {
    expect(SOIL_GEOREF_REQUIREMENT_EFFECTIVE_DATE).toBe("2025-09-14");
  });

  it("GFT016: report issued exactly ON the effective date -> NOT_TRIGGERED_BY_DATE_ALONE (strictly AFTER, not on)", () => {
    const outcome = checkSoilTestGeorefRequirement({ georefOrLpisProvided: false, reportIssueDate: "2025-09-14" });
    expect(outcome).toEqual({ status: "OK", value: "NOT_TRIGGERED_BY_DATE_ALONE", evidenceState: "DERIVED" });
  });

  it("GFT017: report issued the day AFTER, with no georef/LPIS -> MISSING_GEOREF_OR_LPIS", () => {
    const outcome = checkSoilTestGeorefRequirement({ georefOrLpisProvided: false, reportIssueDate: "2025-09-15" });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(outcome.reasonCode).toBe("MISSING_GEOREF_OR_LPIS");
  });

  it("a report issued after the effective date WITH georef/LPIS provided passes", () => {
    const outcome = checkSoilTestGeorefRequirement({ georefOrLpisProvided: true, reportIssueDate: "2026-01-01" });
    expect(outcome).toEqual({ status: "OK", value: "GEOREF_PROVIDED", evidenceState: "MEASURED" });
  });
});

describe("checkSoilOmValidity", () => {
  it("real statutory threshold: 12 years", () => {
    expect(SOIL_OM_MAX_AGE_YEARS).toBe(12);
  });

  it("GFT018: OM analysis 12.1 years old -> INVALID_FOR_CURRENT_OM_DETERMINATION", () => {
    const outcome = checkSoilOmValidity(12.1);
    expect(outcome).toEqual({ status: "OK", value: "INVALID_FOR_CURRENT_OM_DETERMINATION", evidenceState: "DERIVED" });
  });

  it("an OM analysis exactly 12 years old is still valid (>, not >=)", () => {
    const outcome = checkSoilOmValidity(12.0);
    expect(outcome).toEqual({ status: "OK", value: "VALID", evidenceState: "DERIVED" });
  });
});
