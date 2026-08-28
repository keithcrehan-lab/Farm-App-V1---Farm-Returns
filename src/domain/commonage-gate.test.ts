import { describe, expect, it } from "vitest";
import {
  COMMONAGE_ORGANIC_N_MAX_KG_HA,
  checkCommonageFertiliserGate,
  checkCommonageOrganicNAllowanceKgHa,
} from "./commonage-gate";
import { requireCommonageStatus } from "./input-gates";
import { tracked } from "./types";

describe("checkCommonageFertiliserGate", () => {
  it("GFT081: commonage=true, chemical_fertiliser -> PROHIBITED", () => {
    const commonageStatus = requireCommonageStatus({ commonageStatus: tracked("commonage", "verified", "Farmer declaration") });
    const outcome = checkCommonageFertiliserGate(commonageStatus, "chemical_fertiliser");
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.reasonCode).toBe("COMMONAGE_NO_CHEMICAL_FERTILISER");
    }
  });

  it("GFT082: commonage=false, chemical_fertiliser -> commonage_gate NOT_APPLICABLE", () => {
    const commonageStatus = requireCommonageStatus({ commonageStatus: tracked("not_commonage", "verified", "Farmer declaration") });
    const outcome = checkCommonageFertiliserGate(commonageStatus, "chemical_fertiliser");
    expect(outcome.status).toBe("NOT_APPLICABLE");
  });

  it("commonage=true, organic fertiliser -> NOT_APPLICABLE (not prohibited outright — capped separately)", () => {
    const commonageStatus = requireCommonageStatus({ commonageStatus: tracked("commonage", "verified", "Farmer declaration") });
    const outcome = checkCommonageFertiliserGate(commonageStatus, "organic_fertiliser_or_soiled_water");
    expect(outcome.status).toBe("NOT_APPLICABLE");
  });

  it("fails closed (propagates BLOCKED_INSUFFICIENT_EVIDENCE) when commonage status was never captured", () => {
    const commonageStatus = requireCommonageStatus({});
    const outcome = checkCommonageFertiliserGate(commonageStatus, "chemical_fertiliser");
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("UNKNOWN_COMMONAGE_STATUS");
    }
  });
});

describe("checkCommonageOrganicNAllowanceKgHa", () => {
  it("real statutory cap is 50 kg organic N/ha", () => {
    expect(COMMONAGE_ORGANIC_N_MAX_KG_HA).toBe(50);
  });

  it("flags a planned application exceeding the 50 kg/ha allowance on commonage land", () => {
    const commonageStatus = requireCommonageStatus({ commonageStatus: tracked("commonage", "verified", "Farmer declaration") });
    const outcome = checkCommonageOrganicNAllowanceKgHa(commonageStatus, 65);
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.withinAllowance).toBe(false);
      expect(outcome.value.maxAllowanceKgHa).toBe(50);
    }
  });

  it("passes a planned application within the allowance on commonage land", () => {
    const commonageStatus = requireCommonageStatus({ commonageStatus: tracked("commonage", "verified", "Farmer declaration") });
    const outcome = checkCommonageOrganicNAllowanceKgHa(commonageStatus, 40);
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value.withinAllowance).toBe(true);
  });

  it("is NOT_APPLICABLE on ordinary (non-commonage) land", () => {
    const commonageStatus = requireCommonageStatus({ commonageStatus: tracked("not_commonage", "verified", "Farmer declaration") });
    const outcome = checkCommonageOrganicNAllowanceKgHa(commonageStatus, 200);
    expect(outcome.status).toBe("NOT_APPLICABLE");
  });

  it("fails closed when commonage status was never captured", () => {
    const outcome = checkCommonageOrganicNAllowanceKgHa(requireCommonageStatus({}), 40);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });
});
