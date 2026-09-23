import { describe, expect, it } from "vitest";
import { resolveSlurryRealisationCostV1, SLURRY_REALISATION_COST_IE_V1 } from "./slurry-realisation-cost";

function field(areaHa: number, id = "f1") {
  return { id, areaHa };
}

describe("SLURRY_REALISATION_COST_IE_V1 benchmark contract", () => {
  it("has exactly the documented pilot-benchmark fields", () => {
    expect(SLURRY_REALISATION_COST_IE_V1).toEqual({
      benchmarkId: "SLURRY_REALISATION_COST_IE_V1",
      value: "120",
      currency: "EUR",
      unit: "EUR_PER_HECTARE",
      benchmarkYear: 2026,
      sourceType: "FARM_RETURN_PILOT_BENCHMARK",
      basis: "FCI_2026_CONTRACTOR_RATES_DERIVED",
      methodBasis: "LESS_TRAILING_SHOE",
      liveQuote: false,
      farmerSpecific: false,
    });
  });
});

describe("resolveSlurryRealisationCostV1 — exact arithmetic", () => {
  it("1 ha -> EUR120", () => {
    const r = resolveSlurryRealisationCostV1(field(1));
    expect(r.input).toEqual({ status: "quantified", amount: { amount: "120", currency: "EUR" } });
  });

  it("5 ha -> EUR600", () => {
    const r = resolveSlurryRealisationCostV1(field(5));
    expect(r.input).toEqual({ status: "quantified", amount: { amount: "600", currency: "EUR" } });
  });

  it("7.5 ha -> EUR900, exact decimal, no JS float drift", () => {
    const r = resolveSlurryRealisationCostV1(field(7.5));
    expect(r.input).toEqual({ status: "quantified", amount: { amount: "900", currency: "EUR" } });
  });

  it("a realistic non-round area produces an exact, non-approximated amount", () => {
    const r = resolveSlurryRealisationCostV1(field(5.2));
    expect(r.input).toEqual({ status: "quantified", amount: { amount: "624", currency: "EUR" } });
  });
});

describe("resolveSlurryRealisationCostV1 — missing/invalid area fails closed, never a fabricated zero", () => {
  it("zero area -> unknown, not a known_zero cost", () => {
    const r = resolveSlurryRealisationCostV1(field(0));
    expect(r.input).toEqual({ status: "unknown" });
    expect(r.reasonCode).toBe("SLURRY_REALISATION_COST_FIELD_AREA_NOT_POSITIVE");
  });

  it("negative area -> unknown", () => {
    const r = resolveSlurryRealisationCostV1(field(-3));
    expect(r.input).toEqual({ status: "unknown" });
    expect(r.reasonCode).toBe("SLURRY_REALISATION_COST_FIELD_AREA_UNAVAILABLE");
  });

  it("NaN area -> unknown", () => {
    const r = resolveSlurryRealisationCostV1(field(Number.NaN));
    expect(r.input).toEqual({ status: "unknown" });
  });

  it("Infinity area -> unknown", () => {
    const r = resolveSlurryRealisationCostV1(field(Number.POSITIVE_INFINITY));
    expect(r.input).toEqual({ status: "unknown" });
  });

  it("an area needing more precision than the real 2-decimal-place field-boundary rounding boundary -> unknown (floating-point-contaminated area rejected, never silently truncated)", () => {
    const r = resolveSlurryRealisationCostV1(field(5.23456));
    expect(r.input).toEqual({ status: "unknown" });
    expect(r.reasonCode).toBe("SLURRY_REALISATION_COST_FIELD_AREA_UNAVAILABLE");
  });

  it("never produces a fabricated area — fieldAreaHa is null whenever the input itself could not even be parsed as exact", () => {
    const r = resolveSlurryRealisationCostV1(field(Number.NaN));
    expect(r.fieldAreaHa).toBeNull();
    expect(r.calculationExpression).toBeNull();
  });
});

describe("resolveSlurryRealisationCostV1 — provenance is fully reconstructable", () => {
  it("retains field ID, exact area used, benchmark, and a human-reconstructible calculation expression", () => {
    const r = resolveSlurryRealisationCostV1(field(5, "meadow-field"));
    expect(r.fieldId).toBe("meadow-field");
    expect(r.fieldAreaHa).toBe("5");
    expect(r.benchmark).toBe(SLURRY_REALISATION_COST_IE_V1);
    expect(r.calculationExpression).toBe("5 ha × €120/ha = €600");
    expect(r.reasonCode).toBeNull();
  });

  it("a reviewer can reconstruct 5ha x EUR120/ha = EUR600 from the resolution object alone, without reading source code", () => {
    const r = resolveSlurryRealisationCostV1(field(5));
    expect(r.input.status === "quantified" && r.input.amount.amount).toBe("600");
    expect(r.calculationExpression).toContain("5 ha");
    expect(r.calculationExpression).toContain("€120/ha");
    expect(r.calculationExpression).toContain("€600");
  });
});
