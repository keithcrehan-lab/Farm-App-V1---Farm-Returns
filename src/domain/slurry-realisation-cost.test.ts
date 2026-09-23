import { describe, expect, it } from "vitest";
import {
  createFarmerContractorCostDeclaration,
  validateFarmerContractorCostDeclarationBinding,
  resolveSlurryRealisationCostFromFarmerRate,
  type FarmerContractorCostDeclaration,
  type ContractorCostBindingTarget,
} from "./slurry-realisation-cost";

function field(areaHa: number, id = "f1") {
  return { id, areaHa };
}

const TARGET: ContractorCostBindingTarget = { opportunityRecordId: "record-1", boundAssessmentId: "assessment-1", evaluatedActionId: "action-1", fieldId: "meadow-field" };

function declaration(overrides: Partial<Parameters<typeof createFarmerContractorCostDeclaration>[0]> = {}): FarmerContractorCostDeclaration {
  const outcome = createFarmerContractorCostDeclaration({
    id: "contractor-cost-1",
    opportunityRecordId: TARGET.opportunityRecordId,
    boundAssessmentId: TARGET.boundAssessmentId,
    evaluatedActionId: TARGET.evaluatedActionId,
    fieldId: TARGET.fieldId,
    ratePerHa: "120",
    currency: "EUR",
    declaredAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  });
  if (outcome.status !== "OK") throw new Error(`test fixture itself was rejected: ${outcome.detail}`);
  return outcome.declaration;
}

describe("createFarmerContractorCostDeclaration — validation", () => {
  it("accepts a real positive rate and stamps real FARMER_DECLARATION provenance", () => {
    const outcome = createFarmerContractorCostDeclaration({
      id: "d1",
      opportunityRecordId: "record-1",
      boundAssessmentId: "assessment-1",
      evaluatedActionId: "action-1",
      fieldId: "field-1",
      ratePerHa: "120",
      currency: "EUR",
      declaredAt: "2026-09-20T00:00:00.000Z",
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.declaration.ratePerHa).toBe("120");
      expect(outcome.declaration.provenance).toBe("FARMER_DECLARATION");
      expect(outcome.declaration.declaredByActorId).toBeNull();
    }
  });

  it("rejects a missing/blank required identity field", () => {
    const outcome = createFarmerContractorCostDeclaration({
      id: "d1",
      opportunityRecordId: "",
      boundAssessmentId: "assessment-1",
      evaluatedActionId: "action-1",
      fieldId: "field-1",
      ratePerHa: "120",
      currency: "EUR",
      declaredAt: "2026-09-20T00:00:00.000Z",
    });
    expect(outcome.status).toBe("REJECTED");
  });

  it("rejects a zero rate — a real contractor rate cannot be free", () => {
    const outcome = createFarmerContractorCostDeclaration({ id: "d1", opportunityRecordId: "r1", boundAssessmentId: "a1", evaluatedActionId: "e1", fieldId: "f1", ratePerHa: "0", currency: "EUR", declaredAt: "2026-09-20T00:00:00.000Z" });
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") expect(outcome.reasonCode).toBe("SLURRY_REALISATION_COST_DECLARATION_INVALID_RATE");
  });

  it("rejects a negative rate", () => {
    const outcome = createFarmerContractorCostDeclaration({ id: "d1", opportunityRecordId: "r1", boundAssessmentId: "a1", evaluatedActionId: "e1", fieldId: "f1", ratePerHa: "-50", currency: "EUR", declaredAt: "2026-09-20T00:00:00.000Z" });
    expect(outcome.status).toBe("REJECTED");
  });

  it("rejects NaN/Infinity/malformed rate strings", () => {
    for (const bad of ["NaN", "Infinity", "abc", "", "1.2.3"]) {
      const outcome = createFarmerContractorCostDeclaration({ id: "d1", opportunityRecordId: "r1", boundAssessmentId: "a1", evaluatedActionId: "e1", fieldId: "f1", ratePerHa: bad, currency: "EUR", declaredAt: "2026-09-20T00:00:00.000Z" });
      expect(outcome.status).toBe("REJECTED");
    }
  });
});

describe("validateFarmerContractorCostDeclarationBinding — wrong-field/stale-assessment attacks", () => {
  it("accepts a declaration whose identity exactly matches the target", () => {
    expect(validateFarmerContractorCostDeclarationBinding(declaration(), TARGET).valid).toBe(true);
  });

  it("rejects a declaration made for a different field", () => {
    const d = declaration({ fieldId: "south-field" });
    const result = validateFarmerContractorCostDeclarationBinding(d, TARGET);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("SLURRY_REALISATION_COST_DECLARATION_WRONG_FIELD");
  });

  it("rejects a declaration made for a different opportunity record", () => {
    const d = declaration({ opportunityRecordId: "record-2" });
    expect(validateFarmerContractorCostDeclarationBinding(d, TARGET).valid).toBe(false);
  });

  it("rejects a declaration bound to a superseded (reassessed) assessment", () => {
    const d = declaration({ boundAssessmentId: "assessment-0-old" });
    const result = validateFarmerContractorCostDeclarationBinding(d, TARGET);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("SLURRY_REALISATION_COST_DECLARATION_STALE_ASSESSMENT");
  });

  it("does NOT require an exact evaluatedAt match — deliberately different from FarmerDeclarationEvidence (see module header)", () => {
    // ContractorCostBindingTarget has no evaluatedAt field at all -- this
    // test documents that omission is intentional, not an oversight.
    const target: ContractorCostBindingTarget = { ...TARGET };
    expect("evaluatedAt" in target).toBe(false);
    expect(validateFarmerContractorCostDeclarationBinding(declaration(), target).valid).toBe(true);
  });
});

describe("resolveSlurryRealisationCostFromFarmerRate — exact arithmetic, from a real farmer declaration only", () => {
  it("1 ha x farmer-entered EUR120/ha -> EUR120", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(1, "meadow-field"), TARGET, [declaration()]);
    expect(r.input).toEqual({ status: "quantified", amount: { amount: "120", currency: "EUR" } });
  });

  it("5 ha x farmer-entered EUR120/ha -> EUR600", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(5, "meadow-field"), TARGET, [declaration()]);
    expect(r.input).toEqual({ status: "quantified", amount: { amount: "600", currency: "EUR" } });
  });

  it("7.5 ha -> EUR900, exact decimal, no JS float drift", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(7.5, "meadow-field"), TARGET, [declaration()]);
    expect(r.input).toEqual({ status: "quantified", amount: { amount: "900", currency: "EUR" } });
  });

  it("a different farmer-entered rate (e.g. 95/ha) produces a correspondingly different exact amount", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(5, "meadow-field"), TARGET, [declaration({ ratePerHa: "95" })]);
    expect(r.input).toEqual({ status: "quantified", amount: { amount: "475", currency: "EUR" } });
  });
});

describe("resolveSlurryRealisationCostFromFarmerRate — missing rate stays UNKNOWN, never EUR120, never zero", () => {
  it("no declaration at all -> unknown, never a default €120", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(5, "meadow-field"), TARGET, []);
    expect(r.input).toEqual({ status: "unknown" });
    expect(r.reasonCode).toBe("SLURRY_REALISATION_COST_NO_FARMER_RATE_DECLARED");
    expect(r.declaration).toBeNull();
  });

  it("a declaration exists but is bound to a different field -> unknown, not silently applied", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(5, "meadow-field"), TARGET, [declaration({ fieldId: "south-field" })]);
    expect(r.input).toEqual({ status: "unknown" });
    expect(r.reasonCode).toBe("SLURRY_REALISATION_COST_NO_FARMER_RATE_DECLARED");
  });

  it("a declaration exists but is bound to a superseded assessment -> unknown", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(5, "meadow-field"), TARGET, [declaration({ boundAssessmentId: "assessment-old" })]);
    expect(r.input).toEqual({ status: "unknown" });
  });
});

describe("resolveSlurryRealisationCostFromFarmerRate — missing/invalid area fails closed even with a valid rate", () => {
  it("zero area -> unknown, not a known_zero cost", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(0, "meadow-field"), TARGET, [declaration()]);
    expect(r.input).toEqual({ status: "unknown" });
    expect(r.reasonCode).toBe("SLURRY_REALISATION_COST_FIELD_AREA_NOT_POSITIVE");
  });

  it("negative area -> unknown", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(-3, "meadow-field"), TARGET, [declaration()]);
    expect(r.input).toEqual({ status: "unknown" });
  });

  it("NaN area -> unknown", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(Number.NaN, "meadow-field"), TARGET, [declaration()]);
    expect(r.input).toEqual({ status: "unknown" });
  });

  it("an area with more precision than the real 2-decimal field-boundary rounding rule -> unknown", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(5.23456, "meadow-field"), TARGET, [declaration()]);
    expect(r.input).toEqual({ status: "unknown" });
    expect(r.reasonCode).toBe("SLURRY_REALISATION_COST_FIELD_AREA_UNAVAILABLE");
  });
});

describe("resolveSlurryRealisationCostFromFarmerRate — provenance is fully reconstructable and honestly farmer-sourced", () => {
  it("retains field ID, exact area used, the real declaration, and a human-reconstructible expression", () => {
    const d = declaration();
    const r = resolveSlurryRealisationCostFromFarmerRate(field(5, "meadow-field"), TARGET, [d]);
    expect(r.fieldId).toBe("meadow-field");
    expect(r.fieldAreaHa).toBe("5");
    expect(r.declaration).toBe(d);
    expect(r.declaration?.provenance).toBe("FARMER_DECLARATION");
    expect(r.calculationExpression).toBe("5 ha × €120/ha = €600");
    expect(r.reasonCode).toBeNull();
  });

  it("a reviewer can reconstruct 5ha x EUR120/ha = EUR600 from the resolution object alone", () => {
    const r = resolveSlurryRealisationCostFromFarmerRate(field(5, "meadow-field"), TARGET, [declaration()]);
    expect(r.input.status === "quantified" && r.input.amount.amount).toBe("600");
    expect(r.calculationExpression).toContain("5 ha");
    expect(r.calculationExpression).toContain("€120/ha");
    expect(r.calculationExpression).toContain("€600");
  });

  it("uses the LATEST valid declaration when multiple exist for the same target (re-declaration overrides an earlier one)", () => {
    const older = declaration({ id: "d-old", ratePerHa: "100", declaredAt: "2026-09-19T00:00:00.000Z" });
    const newer = declaration({ id: "d-new", ratePerHa: "150", declaredAt: "2026-09-20T00:00:00.000Z" });
    const r = resolveSlurryRealisationCostFromFarmerRate(field(5, "meadow-field"), TARGET, [older, newer]);
    expect(r.declaration?.id).toBe("d-new");
    expect(r.input).toEqual({ status: "quantified", amount: { amount: "750", currency: "EUR" } });
  });
});
