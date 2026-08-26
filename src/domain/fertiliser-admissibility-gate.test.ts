import { describe, expect, it } from "vitest";
import { checkFertiliserProductAdmissibility, UNINHIBITED_UREA_EXCLUSION_UREIC_N_THRESHOLD_PCT } from "./fertiliser-admissibility-gate";
import { requireFertiliserFormulation } from "./input-gates";
import { tracked } from "./types";

function formulation(f: { physicalForm: "solid" | "liquid" | "unknown"; ureicNPercent?: number; inhibitorStatus: "inhibited" | "uninhibited" | "unknown" }) {
  return requireFertiliserFormulation({ formulation: tracked(f, "verified", "Product label") });
}

describe("checkFertiliserProductAdmissibility", () => {
  it("real statutory threshold: 1% ureic N", () => {
    expect(UNINHIBITED_UREA_EXCLUSION_UREIC_N_THRESHOLD_PCT).toBe(1);
  });

  it("excludes an uninhibited solid product with ureic N >=1% (the audit's own 'Protected Urea' scenario, named explicitly, not inferred)", () => {
    const outcome = checkFertiliserProductAdmissibility(formulation({ physicalForm: "solid", ureicNPercent: 46, inhibitorStatus: "uninhibited" }));
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.reasonCode).toBe("FERTILISER_UNINHIBITED_SOLID_UREA_EXCLUDED");
    }
  });

  it("admits an INHIBITED solid product with ureic N >=1% (a genuine, explicitly-labelled protected urea)", () => {
    const outcome = checkFertiliserProductAdmissibility(formulation({ physicalForm: "solid", ureicNPercent: 46, inhibitorStatus: "inhibited" }));
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("ADMISSIBLE");
  });

  it("admits a liquid product regardless of ureic N/inhibitor status (the exclusion's own stated exception)", () => {
    const outcome = checkFertiliserProductAdmissibility(formulation({ physicalForm: "liquid", ureicNPercent: 46, inhibitorStatus: "uninhibited" }));
    expect(outcome.status).toBe("OK");
  });

  it("admits a solid product with ureic N below the 1% threshold, uninhibited or not", () => {
    const outcome = checkFertiliserProductAdmissibility(formulation({ physicalForm: "solid", ureicNPercent: 0.5, inhibitorStatus: "uninhibited" }));
    expect(outcome.status).toBe("OK");
  });

  it("never infers inhibitor status — a solid, high-ureic-N product with UNKNOWN inhibitor status is UNKNOWN, not admitted", () => {
    const outcome = checkFertiliserProductAdmissibility(formulation({ physicalForm: "solid", ureicNPercent: 46, inhibitorStatus: "unknown" }));
    expect(outcome.status).toBe("UNKNOWN");
    if (outcome.status === "UNKNOWN") expect(outcome.reasonCode).toBe("FERTILISER_INHIBITOR_STATUS_UNKNOWN");
  });

  it("unknown physical form is UNKNOWN, not assumed liquid or solid", () => {
    const outcome = checkFertiliserProductAdmissibility(formulation({ physicalForm: "unknown", inhibitorStatus: "unknown" }));
    expect(outcome.status).toBe("UNKNOWN");
    if (outcome.status === "UNKNOWN") expect(outcome.reasonCode).toBe("FERTILISER_FORM_UNKNOWN");
  });

  it("unknown ureic N% on a solid product is UNKNOWN, not assumed below threshold", () => {
    const outcome = checkFertiliserProductAdmissibility(formulation({ physicalForm: "solid", inhibitorStatus: "uninhibited" }));
    expect(outcome.status).toBe("UNKNOWN");
    if (outcome.status === "UNKNOWN") expect(outcome.reasonCode).toBe("FERTILISER_UREIC_N_UNKNOWN");
  });

  it("fails closed when formulation was never captured at all", () => {
    const outcome = checkFertiliserProductAdmissibility(requireFertiliserFormulation({}));
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_FERTILISER_FORMULATION");
    }
  });
});
