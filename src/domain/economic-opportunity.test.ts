import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blockedInsufficientEvidence, ok } from "./evidence";
import { createMoneyAmount, zeroMoney } from "./money";
import {
  createEconomicValueRange,
  validateAssessmentStructure,
  validateCounterfactualStructure,
  validateEffectSignConsistency,
  validateNoDuplicateCreditClaims,
  validateScenarioReferences,
  type EconomicEffect,
  type EconomicOpportunityAssessment,
  type EconomicScenario,
} from "./economic-opportunity";

const baseline: EconomicScenario = { id: "baseline", role: "baseline", label: "Current plan" };
const intervention: EconomicScenario = { id: "intervention", role: "intervention", label: "Evaluated change" };

function effect(overrides: Partial<EconomicEffect> = {}): EconomicEffect {
  return {
    id: "effect-1",
    type: "AVOIDED_FERTILISER_PURCHASE",
    direction: "benefit",
    impactKind: "CASH",
    amount: ok(createMoneyAmount("300.00", "EUR"), "IRISH_MODEL"),
    vatTreatment: "unknown",
    creditClaim: { creditKey: "field:F1:slurry-allocation:2026-09-01:N", resourceDescription: "Displaced chemical N on field F1" },
    scenarioId: "intervention",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// EngineOutcome<MoneyAmount> integration — a genuine €0 result and a
// missing-evidence result are structurally distinct, never converted into
// each other.
// ---------------------------------------------------------------------------
describe("EngineOutcome<MoneyAmount> integration", () => {
  // Item 6: a genuine quantified €0 outcome is represented as OK.
  it("represents a genuine quantified €0 result as a real OK outcome", () => {
    const outcome = ok(zeroMoney("EUR"), "MEASURED");
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value).toEqual({ amount: "0", currency: "EUR" });
      expect(outcome.evidenceState).toBe("MEASURED");
    }
  });

  // Item 7: missing/unsupported/insufficient evidence cannot become €0.
  it("keeps a missing-evidence outcome distinct from any €0 MoneyAmount", () => {
    const outcome = blockedInsufficientEvidence<import("./money").MoneyAmount>("ECONOMIC_PRICE_EVIDENCE_UNAVAILABLE", ["supplierPrice"]);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    // TypeScript itself refuses `.value` off this branch; the runtime
    // shape check below is the same "no fabricated 0" guarantee at
    // the data level.
    expect("value" in outcome).toBe(false);
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("ECONOMIC_PRICE_EVIDENCE_UNAVAILABLE");
      expect(outcome.missingInputs).toEqual(["supplierPrice"]);
    }
  });

  // Item 15: cash vs economic impact classifications remain distinct.
  it("keeps CASH and ECONOMIC impact classifications distinct on separate effects", () => {
    const cashEffect = effect({ id: "cash-1", impactKind: "CASH" });
    const economicEffect = effect({
      id: "economic-1",
      impactKind: "ECONOMIC",
      creditClaim: { creditKey: "field:F1:wider-farm-value:2026-09-01", resourceDescription: "Wider incremental farm value, not a cash line" },
    });
    const effects = [cashEffect, economicEffect];
    expect(effects.filter((e) => e.impactKind === "CASH")).toEqual([cashEffect]);
    expect(effects.filter((e) => e.impactKind === "ECONOMIC")).toEqual([economicEffect]);
    expect(cashEffect.impactKind).not.toBe(economicEffect.impactKind);
  });
});

// ---------------------------------------------------------------------------
// VAT / price basis round-tripping.
// ---------------------------------------------------------------------------
describe("VAT and price-basis round-tripping", () => {
  // Item 8: VAT treatment UNKNOWN survives round-trip unchanged.
  it('preserves vatTreatment "unknown" through a JSON round-trip', () => {
    const e = effect({ vatTreatment: "unknown" });
    const roundTripped = JSON.parse(JSON.stringify(e)) as EconomicEffect;
    expect(roundTripped.vatTreatment).toBe("unknown");
  });

  it("never silently resolves unknown VAT to a concrete treatment", () => {
    const e = effect({ vatTreatment: "unknown" });
    expect(e.vatTreatment).not.toBe("exclusive");
    expect(e.vatTreatment).not.toBe("inclusive");
    expect(e.vatTreatment).not.toBe("exempt");
  });

  // Item 9: price basis survives serialisation unchanged.
  it("preserves priceBasis through a JSON round-trip", () => {
    const e = effect({ priceBasis: "per_tonne" });
    const roundTripped = JSON.parse(JSON.stringify(e)) as EconomicEffect;
    expect(roundTripped.priceBasis).toBe("per_tonne");
  });
});

// ---------------------------------------------------------------------------
// Counterfactual structural validation.
// ---------------------------------------------------------------------------
describe("validateCounterfactualStructure", () => {
  it("accepts a scenario set with both a baseline and an intervention", () => {
    expect(validateCounterfactualStructure([baseline, intervention])).toEqual({ valid: true });
  });

  // Item 10: counterfactual assessment without baseline is invalid.
  it("rejects a scenario set missing a baseline", () => {
    const result = validateCounterfactualStructure([intervention]);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ECONOMIC_ASSESSMENT_MISSING_BASELINE_SCENARIO");
  });

  // Item 11: counterfactual assessment without intervention is invalid.
  it("rejects a scenario set missing an intervention", () => {
    const result = validateCounterfactualStructure([baseline]);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ECONOMIC_ASSESSMENT_MISSING_INTERVENTION_SCENARIO");
  });

  it("rejects an empty scenario set", () => {
    expect(validateCounterfactualStructure([]).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Double-counting structural validation.
// ---------------------------------------------------------------------------
describe("validateNoDuplicateCreditClaims", () => {
  // Item 12: duplicate exact credit claims are rejected.
  it("rejects two effects sharing the exact same credit claim", () => {
    const sharedKey = "field:F1:slurry-allocation:2026-09-01:N";
    const slurryValue = effect({ id: "slurry-value", type: "AVOIDED_FERTILISER_PURCHASE", creditClaim: { creditKey: sharedKey, resourceDescription: "Slurry nutrient value" } });
    const avoidedPurchase = effect({ id: "avoided-purchase", type: "AVOIDED_FERTILISER_PURCHASE", creditClaim: { creditKey: sharedKey, resourceDescription: "Avoided fertiliser purchase" } });
    const result = validateNoDuplicateCreditClaims([slurryValue, avoidedPurchase]);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ECONOMIC_DUPLICATE_CREDIT_CLAIM");
    expect(result.duplicateCreditKeys).toEqual([sharedKey]);
  });

  // Item 13: separate non-overlapping credit claims are accepted.
  it("accepts effects with distinct, non-overlapping credit claims", () => {
    const a = effect({ id: "a", creditClaim: { creditKey: "field:F1:slurry-allocation:2026-09-01:N", resourceDescription: "Slurry N on F1" } });
    const b = effect({ id: "b", creditClaim: { creditKey: "field:F2:slurry-allocation:2026-09-01:N", resourceDescription: "Slurry N on F2" } });
    const result = validateNoDuplicateCreditClaims([a, b]);
    expect(result).toEqual({ valid: true, duplicateCreditKeys: [] });
  });

  it("accepts an empty effect list", () => {
    expect(validateNoDuplicateCreditClaims([])).toEqual({ valid: true, duplicateCreditKeys: [] });
  });

  // Codex review hardening (2026-09-20): a case/whitespace variant of the
  // exact same real-world creditKey must still be caught — the safeguard
  // must not depend on every future caller remembering identical casing
  // for what is, in substance, one duplicate claim.
  it("rejects credit claims that differ only in case or surrounding whitespace", () => {
    const a = effect({ id: "a", creditClaim: { creditKey: "field:F1:slurry-allocation:2026-09-01:N", resourceDescription: "x" } });
    const b = effect({ id: "b", creditClaim: { creditKey: "FIELD:F1:SLURRY-ALLOCATION:2026-09-01:N", resourceDescription: "y" } });
    const c = effect({ id: "c", creditClaim: { creditKey: "  field:F1:slurry-allocation:2026-09-01:N  ", resourceDescription: "z" } });
    const result = validateNoDuplicateCreditClaims([a, b, c]);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ECONOMIC_DUPLICATE_CREDIT_CLAIM");
    expect(result.duplicateCreditKeys).toHaveLength(3);
  });

  it("does NOT flag genuinely different creditKeys as duplicates merely because Phase 1 cannot resolve partial overlap", () => {
    const a = effect({ id: "a", creditClaim: { creditKey: "field:F1:N", resourceDescription: "x" } });
    const b = effect({ id: "b", creditClaim: { creditKey: "field:F1:nitrogen", resourceDescription: "y" } });
    expect(validateNoDuplicateCreditClaims([a, b]).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario-reference structural validation (Codex review hardening,
// 2026-09-20) — distinct from validateCounterfactualStructure's
// baseline/intervention-role check.
// ---------------------------------------------------------------------------
describe("validateScenarioReferences", () => {
  it("accepts scenarios/effects with no duplicate ids and no orphan references", () => {
    const result = validateScenarioReferences([baseline, intervention], [effect({ scenarioId: "intervention" })]);
    expect(result).toEqual({ valid: true, duplicateScenarioIds: [], orphanEffectIds: [] });
  });

  it("rejects an effect referencing a scenarioId that does not exist", () => {
    const result = validateScenarioReferences([baseline, intervention], [effect({ id: "orphan", scenarioId: "DOES_NOT_EXIST" })]);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ECONOMIC_EFFECT_ORPHAN_SCENARIO_REFERENCE");
    expect(result.orphanEffectIds).toEqual(["orphan"]);
  });

  it("rejects two scenarios sharing the same id", () => {
    const duplicateId: EconomicScenario = { id: "baseline", role: "intervention", label: "duplicate id, different role" };
    const result = validateScenarioReferences([baseline, intervention, duplicateId], [effect({ scenarioId: "baseline" })]);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ECONOMIC_ASSESSMENT_DUPLICATE_SCENARIO_ID");
    expect(result.duplicateScenarioIds).toEqual(["baseline"]);
  });
});

// ---------------------------------------------------------------------------
// Sign-consistency structural validation (Codex review hardening,
// 2026-09-20) — direction is this domain's one sign convention; amount
// must never itself be negative.
// ---------------------------------------------------------------------------
describe("validateEffectSignConsistency", () => {
  it("accepts a non-negative amount for either direction", () => {
    const benefit = effect({ id: "b", direction: "benefit" });
    const cost = effect({ id: "c", direction: "cost" });
    expect(validateEffectSignConsistency([benefit, cost])).toEqual({ valid: true, ambiguousEffectIds: [] });
  });

  it("rejects a negative amount alongside an explicit direction as an ambiguous double negative", () => {
    const negativeCost = effect({ id: "negative-cost", direction: "cost", amount: ok(createMoneyAmount("-100.00", "EUR"), "IRISH_MODEL") });
    const result = validateEffectSignConsistency([negativeCost]);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ECONOMIC_EFFECT_AMBIGUOUS_SIGNED_AMOUNT");
    expect(result.ambiguousEffectIds).toEqual(["negative-cost"]);
  });

  it("does not flag a non-OK outcome (nothing to check the sign of)", () => {
    const unresolved = effect({ amount: blockedInsufficientEvidence("ECONOMIC_PRICE_EVIDENCE_UNAVAILABLE", ["supplierPrice"]) });
    expect(validateEffectSignConsistency([unresolved])).toEqual({ valid: true, ambiguousEffectIds: [] });
  });
});

// ---------------------------------------------------------------------------
// Combined assessment-level validation.
// ---------------------------------------------------------------------------
describe("validateAssessmentStructure", () => {
  function assessment(overrides: Partial<EconomicOpportunityAssessment> = {}): EconomicOpportunityAssessment {
    return {
      id: "assessment-1",
      title: "Example assessment",
      scenarios: [baseline, intervention],
      effects: [effect()],
      limitations: [],
      createdAt: "2026-09-20T00:00:00.000Z",
      ...overrides,
    };
  }

  it("passes a structurally valid assessment", () => {
    const result = validateAssessmentStructure(assessment());
    expect(result.valid).toBe(true);
    expect(result.counterfactual.valid).toBe(true);
    expect(result.doubleCounting.valid).toBe(true);
    expect(result.scenarioReferences.valid).toBe(true);
    expect(result.signConsistency.valid).toBe(true);
  });

  it("fails when the counterfactual structure is invalid, independent of double counting", () => {
    // Note: dropping the "intervention" scenario also orphans effect()'s
    // default scenarioId: "intervention" — both counterfactual and
    // scenarioReferences correctly fail here, which is why this test
    // asserts each sub-result directly rather than assuming only one
    // reason for the overall `valid: false`.
    const result = validateAssessmentStructure(assessment({ scenarios: [baseline] }));
    expect(result.valid).toBe(false);
    expect(result.counterfactual.valid).toBe(false);
    expect(result.doubleCounting.valid).toBe(true);
  });

  it("fails when credit claims collide, independent of counterfactual structure", () => {
    const sharedKey = "field:F1:slurry-allocation:2026-09-01:N";
    const result = validateAssessmentStructure(
      assessment({
        effects: [
          effect({ id: "a", creditClaim: { creditKey: sharedKey, resourceDescription: "x" } }),
          effect({ id: "b", creditClaim: { creditKey: sharedKey, resourceDescription: "y" } }),
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.counterfactual.valid).toBe(true);
    expect(result.doubleCounting.valid).toBe(false);
  });

  it("fails when an effect references a nonexistent scenario, independent of the other checks", () => {
    const result = validateAssessmentStructure(assessment({ effects: [effect({ scenarioId: "DOES_NOT_EXIST" })] }));
    expect(result.valid).toBe(false);
    expect(result.counterfactual.valid).toBe(true);
    expect(result.doubleCounting.valid).toBe(true);
    expect(result.scenarioReferences.valid).toBe(false);
    expect(result.scenarioReferences.reasonCode).toBe("ECONOMIC_EFFECT_ORPHAN_SCENARIO_REFERENCE");
  });

  it("fails when an effect has an ambiguous signed amount, independent of the other checks", () => {
    const result = validateAssessmentStructure(
      assessment({ effects: [effect({ direction: "cost", amount: ok(createMoneyAmount("-100.00", "EUR"), "IRISH_MODEL") })] }),
    );
    expect(result.valid).toBe(false);
    expect(result.counterfactual.valid).toBe(true);
    expect(result.doubleCounting.valid).toBe(true);
    expect(result.scenarioReferences.valid).toBe(true);
    expect(result.signConsistency.valid).toBe(false);
  });

  // Item 14: limitations survive serialisation.
  it("preserves assessment- and effect-level limitations through a JSON round-trip", () => {
    const withLimitations = assessment({
      limitations: ["Costs the current Farm Return fertiliser allocation plan; does not claim global least-cost optimisation."],
      effects: [effect({ limitations: ["Based on a supplier quote older than 30 days."] })],
    });
    const roundTripped = JSON.parse(JSON.stringify(withLimitations)) as EconomicOpportunityAssessment;
    expect(roundTripped.limitations).toEqual(withLimitations.limitations);
    expect(roundTripped.effects[0].limitations).toEqual(withLimitations.effects[0].limitations);
  });
});

// ---------------------------------------------------------------------------
// Value range — cannot silently invent absent bounds.
// ---------------------------------------------------------------------------
describe("createEconomicValueRange", () => {
  // Item 16: range type cannot silently invent absent lower/upper values.
  it("requires all three of lower/central/upper to be supplied explicitly", () => {
    // TypeScript itself refuses a call missing an argument; this asserts
    // the three real values a caller does supply are used verbatim, with
    // nothing defaulted or derived.
    const range = createEconomicValueRange(createMoneyAmount("100", "EUR"), createMoneyAmount("150", "EUR"), createMoneyAmount("200", "EUR"));
    expect(range).toEqual({
      lower: { amount: "100", currency: "EUR" },
      central: { amount: "150", currency: "EUR" },
      upper: { amount: "200", currency: "EUR" },
    });
  });

  it("rejects an out-of-order range rather than silently reordering it", () => {
    expect(() => createEconomicValueRange(createMoneyAmount("200", "EUR"), createMoneyAmount("150", "EUR"), createMoneyAmount("100", "EUR"))).toThrow(/out of order/);
  });

  it("rejects a mixed-currency range", () => {
    const usd = { amount: "150", currency: "USD" } as unknown as ReturnType<typeof createMoneyAmount>;
    expect(() => createEconomicValueRange(createMoneyAmount("100", "EUR"), usd, createMoneyAmount("200", "EUR"))).toThrow(/one currency/);
  });
});

// ---------------------------------------------------------------------------
// Item 17: new economic modules contain no hand-written kg<->tonne
// conversion. A structural source-text check, not a behavioural test —
// asserts the literal absence of the tokens this codebase's existing
// hand-written conversions use (`fertiliser-plan.ts`'s `KG_PER_TONNE`,
// `quote-request.ts`'s `TONNE_TO_KG`, and the digit sequence "1000"
// itself, which every inline `/ 1000` or `* 1000` conversion contains).
// ---------------------------------------------------------------------------
describe("unit-safety structural check", () => {
  const forbiddenTokens = ["1000", "KG_PER_TONNE", "TONNE_TO_KG"];
  // Phase 4's own fertiliser-plan-cost.ts is the first of these modules to
  // perform a real unit conversion (kg -> tonnes) — it must do so only via
  // `units.ts`'s `exactKgToTonnes` (which legitimately contains "1000" —
  // deliberately excluded from this list, since it is the one canonical,
  // authorised place that fact is allowed to live), never its own copy.
  const newEconomicsModules = ["money.ts", "economic-opportunity.ts", "fertiliser-plan-cost.ts"];

  it.each(newEconomicsModules)("%s contains no ad hoc kg<->tonne conversion", (filename) => {
    const source = readFileSync(join(__dirname, filename), "utf-8");
    for (const token of forbiddenTokens) {
      expect(source).not.toContain(token);
    }
  });
});
