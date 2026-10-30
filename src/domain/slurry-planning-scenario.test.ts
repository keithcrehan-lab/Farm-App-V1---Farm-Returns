import { describe, expect, it } from "vitest";
import { buildSlurryPlanningScenario } from "./slurry-planning-scenario";

const base = {
  planningDate: "2027-01-30",
  expectedAvailableM3: 300,
  source: "FARMER_FORECAST" as const,
  candidates: [
    { fieldId: "f1", housingId: "h1", volumeM3: 100, applicationMethod: "LESS" as const, applicationDate: "2027-02-01" },
    { fieldId: "f2", housingId: "h1", volumeM3: 150, applicationMethod: "LESS" as const, applicationDate: "2027-02-02" },
  ],
};

describe("buildSlurryPlanningScenario", () => {
  it("keeps future forecast supply separate from physical storage and conserves finite volume", () => {
    expect(buildSlurryPlanningScenario(base)).toMatchObject({ status: "READY", expectedAvailableM3: 300, allocatedM3: 250, unallocatedM3: 50, source: "FARMER_FORECAST" });
  });
  it("fails closed when proposed allocations exceed forecast supply", () => {
    const result = buildSlurryPlanningScenario({ ...base, expectedAvailableM3: 200 });
    expect(result).toMatchObject({ status: "INVALID" });
    if (result.status === "INVALID") expect(result.issues).toContain("FORECAST_VOLUME_EXCEEDED");
  });
  it("rejects duplicate field/store candidates so the same forecast action cannot be counted twice", () => {
    const result = buildSlurryPlanningScenario({ ...base, candidates: [base.candidates[0], base.candidates[0]] });
    expect(result).toMatchObject({ status: "INVALID" });
    if (result.status === "INVALID") expect(result.issues).toContain("DUPLICATE_FIELD_STORE_CANDIDATE");
  });
  it("fails closed on two proposed stores for one field because P3 resolves one field allocation only", () => {
    const result = buildSlurryPlanningScenario({
      ...base,
      candidates: [base.candidates[0], { ...base.candidates[0], housingId: "h2" }],
    });
    expect(result).toMatchObject({ status: "INVALID" });
    if (result.status === "INVALID") expect(result.issues).toContain("MULTIPLE_CANDIDATES_FOR_FIELD_UNSUPPORTED");
  });
  it("rejects an unsupported spreading method rather than letting it reach nutrient crediting", () => {
    const result = buildSlurryPlanningScenario({
      ...base,
      candidates: [{ ...base.candidates[0], applicationMethod: "bogus" as never }],
    });
    expect(result).toMatchObject({ status: "INVALID" });
    if (result.status === "INVALID") expect(result.issues).toContain("CANDIDATE_METHOD_INVALID");
  });
  it("fails closed on multiple variants for one field until the P3-compatible optimiser is built", () => {
    const result = buildSlurryPlanningScenario({
      ...base,
      candidates: [
        base.candidates[0],
        { ...base.candidates[0], housingId: "h2", volumeM3: 80 },
      ],
    });
    expect(result).toMatchObject({ status: "INVALID" });
    if (result.status === "INVALID") expect(result.issues).toContain("MULTIPLE_CANDIDATES_FOR_FIELD_UNSUPPORTED");
  });
});
