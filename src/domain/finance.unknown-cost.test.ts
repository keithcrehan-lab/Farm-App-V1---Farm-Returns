import { describe, expect, it, vi } from "vitest";
import { tracked } from "./types";
import type { Field, InputRequirement, LivestockGroup } from "./types";

// Session 3b audit F001: a missing/invalid product price must reach the
// finance outputs as unknown — never €0 or a complete-looking partial total.
// The engine's own price table is always valid, so the plan's cost is
// corrupted here for the fields named in `UNPRICED_FIELDS`.
const UNPRICED_FIELDS = new Set<string>();
vi.mock("./nutrients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./nutrients")>();
  return {
    ...actual,
    calculateNutrientPlan: (input: Parameters<typeof actual.calculateNutrientPlan>[0]) => {
      const plan = actual.calculateNutrientPlan(input);
      if (!UNPRICED_FIELDS.has(input.field.id)) return plan;
      return { ...plan, purchasedProducts: plan.purchasedProducts.map((p) => ({ ...p, costEur: Number.NaN })) };
    },
  };
});

const { calculateFarmFertiliserCostEur, calculateFarmFertiliserRequirement, withRealInputRequirements } = await import("./finance");

function makeField(id: string, areaHa = 5): Field {
  return {
    id,
    farmId: "farm-test",
    name: id,
    areaHa,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "estimated", "Farm Return assumption"),
    fertility: {
      pIndex: tracked(1, "estimated", "Farm Return assumption"),
      kIndex: tracked(1, "estimated", "Farm Return assumption"),
    },
    history: [],
  };
}

const livestockGroups: LivestockGroup[] = [
  {
    id: "g1",
    farmId: "farm-test",
    category: "suckler_cow",
    label: "g1",
    count: tracked(20, "verified", "Farmer"),
    system: "grazing",
    value: tracked(20_000, "estimated", "Farm Return assumption"),
  },
];

function input(fields: Field[]) {
  return { fields, livestockGroups, slurryAllocations: [], silagePlans: [] };
}

describe("finance fertiliser cost with unknown prices (audit F001)", () => {
  it("entirely unknown: every product and the farm total are null, the known subtotal is 0 and the cost is unavailable", () => {
    UNPRICED_FIELDS.clear();
    UNPRICED_FIELDS.add("f1");
    const requirement = calculateFarmFertiliserRequirement(input([makeField("f1")]));
    expect(requirement.byProduct.length).toBeGreaterThan(0);
    expect(requirement.byProduct.every((p) => p.costEur === null)).toBe(true);
    expect(requirement.totalCostEur).toBeNull();
    expect(requirement.knownCostSubtotalEur).toBe(0);
    expect(requirement.productsWithUnknownCost).toEqual(requirement.byProduct.map((p) => p.name));

    const cost = calculateFarmFertiliserCostEur(input([makeField("f1")]));
    expect(cost.value.status).toBe("unavailable");
    expect(cost.productsWithUnknownCost).toEqual(requirement.productsWithUnknownCost);
  });

  it("partially unknown: affected products are null and named, the farm total is null, the input row cost is unavailable", () => {
    UNPRICED_FIELDS.clear();
    const priced = calculateFarmFertiliserRequirement(input([makeField("f1"), makeField("f2", 8)]));
    UNPRICED_FIELDS.add("f2");
    const requirement = calculateFarmFertiliserRequirement(input([makeField("f1"), makeField("f2", 8)]));
    expect(requirement.totalTonnes).toBe(priced.totalTonnes);
    expect(requirement.totalCostEur).toBeNull();
    expect(requirement.productsWithUnknownCost.length).toBeGreaterThan(0);
    for (const p of requirement.byProduct) {
      expect(p.costEur === null).toBe(requirement.productsWithUnknownCost.includes(p.name));
    }
    expect(requirement.knownCostSubtotalEur).toBeLessThan(priced.totalCostEur ?? 0);

    const row = withRealInputRequirements(
      [{ id: "input-fertiliser", stockOnHandQty: 0 } as unknown as InputRequirement],
      requirement,
      { totalTonnes: 0, totalCostEur: 0, sourceGroupLabels: [] },
    )[0];
    expect(row.estCost.status).toBe("unavailable");
  });

  it("all prices known: unchanged complete total, status estimated", () => {
    UNPRICED_FIELDS.clear();
    const requirement = calculateFarmFertiliserRequirement(input([makeField("f1")]));
    expect(requirement.productsWithUnknownCost).toEqual([]);
    expect(requirement.totalCostEur).toBe(requirement.knownCostSubtotalEur);
    expect(requirement.totalCostEur).toBeGreaterThan(0);
    expect(calculateFarmFertiliserCostEur(input([makeField("f1")])).value.status).toBe("estimated");
  });
});
