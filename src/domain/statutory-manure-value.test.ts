import { describe, expect, it } from "vitest";
import {
  statutoryManureNutrientValue,
  statutoryManureNutrientValuePerHa,
} from "./statutory-manure-value";

describe("statutoryManureNutrientValue — organic_manure_total_np_2026.csv x nutrient_availability_2026.csv", () => {
  it("cattle_slurry: real total N/P content per m3 (2.4 kgN, 0.5 kgP)", () => {
    const outcome = statutoryManureNutrientValue("cattle_slurry", 10, 3);
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.totalNKg).toBeCloseTo(24, 5);
    expect(outcome.value.totalPKg).toBeCloseTo(5, 5);
  });

  it("cattle_slurry availability: 40% N, 100% P at Index 3/4 (cattle_and_other_livestock_manure category)", () => {
    const outcome = statutoryManureNutrientValue("cattle_slurry", 10, 3);
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.nAvailabilityPct).toBe(40);
    expect(outcome.value.pAvailabilityPct).toBe(100);
    expect(outcome.value.availableNKg).toBeCloseTo(24 * 0.4, 5);
    expect(outcome.value.availablePKg).toBeCloseTo(5 * 1.0, 5);
  });

  it("cattle_slurry at P Index 1/2 uses the lower 50% P availability factor, not the Index 3/4 figure", () => {
    const outcome = statutoryManureNutrientValue("cattle_slurry", 10, 1);
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.pAvailabilityPct).toBe(50);
    expect(outcome.value.availablePKg).toBeCloseTo(5 * 0.5, 5);
  });

  it("pig_slurry: real total N/P (4.2 kgN, 0.8 kgP per m3) and pig_and_poultry_manure availability (50% N)", () => {
    const outcome = statutoryManureNutrientValue("pig_slurry", 5, 3);
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.totalNKg).toBeCloseTo(21, 5);
    expect(outcome.value.nAvailabilityPct).toBe(50);
  });

  it("farmyard_manure: real total N/P (4.5 kgN, 1.2 kgP per tonne), farmyard_manure category (30% N availability)", () => {
    const outcome = statutoryManureNutrientValue("farmyard_manure", 20, 3);
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.basis).toBe("per_tonne");
    expect(outcome.value.totalNKg).toBeCloseTo(90, 5);
    expect(outcome.value.nAvailabilityPct).toBe(30);
  });

  it("sheep_slurry maps onto the cattle_and_other_livestock_manure availability category (the source's own 'and other livestock' wording)", () => {
    const outcome = statutoryManureNutrientValue("sheep_slurry", 1, 3);
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.nAvailabilityPct).toBe(40);
  });

  it("turkey_litter maps onto the pig_and_poultry_manure availability category", () => {
    const outcome = statutoryManureNutrientValue("turkey_litter", 1, 3);
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.nAvailabilityPct).toBe(50);
  });

  it("spent_mushroom_compost: its own dedicated 20% N availability category", () => {
    const outcome = statutoryManureNutrientValue("spent_mushroom_compost", 10, 3);
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.nAvailabilityPct).toBe(20);
  });

  it("non-positive quantity fails closed as NOT_APPLICABLE, not a false zero result", () => {
    const outcome = statutoryManureNutrientValue("cattle_slurry", 0, 3);
    expect(outcome.status).toBe("NOT_APPLICABLE");
  });

  it("evidenceState is DERIVED, never MEASURED — this is a calculated statutory ledger value, not a lab measurement", () => {
    const outcome = statutoryManureNutrientValue("cattle_slurry", 10, 3);
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.evidenceState).toBe("DERIVED");
  });
});

describe("statutoryManureNutrientValuePerHa", () => {
  it("divides the real statutory ledger value by field area, not by farm area", () => {
    // 20 m3/ha cattle slurry over a 5 ha field = 100 m3 total.
    const outcome = statutoryManureNutrientValuePerHa("cattle_slurry", 100, 5, 3);
    if (outcome.status !== "OK") throw new Error("expected OK");
    // total N = 240 kg, available N = 96 kg -> 19.2 kg/ha
    expect(outcome.value.availableNKgHa).toBeCloseTo(19.2, 5);
  });

  it("fails closed for non-positive area rather than dividing by zero", () => {
    const outcome = statutoryManureNutrientValuePerHa("cattle_slurry", 100, 0, 3);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });
});
