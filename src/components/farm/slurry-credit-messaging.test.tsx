import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NutrientRequirementCard } from "./NutrientRequirementCard";
import { OrganicNutrientsCard } from "./OrganicNutrientsCard";
import { PurchasedFertiliserCard } from "./PurchasedFertiliserCard";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { tracked } from "@/domain/types";
import type { Field, NutrientPlan, SlurryAllocation } from "@/domain/types";
import type { SlurryComposition } from "@/domain/slurry-composition";

afterEach(() => {
  cleanup();
});

/**
 * CC-FU-A — slurry nutrient-credit messaging across every card that
 * discloses it, driven by real `calculateNutrientPlan` output (never a
 * hand-built plan), so the wording is checked against the state the engine
 * actually produces.
 */
const BLANKET = "Slurry nutrient credit not included";
const verified3 = tracked(3 as const, "verified", "Lab");
const field: Field = {
  id: "field-ccfua",
  farmId: "farm-ccfua",
  name: "Test Field",
  areaHa: 6.8,
  centroid: [0, 0],
  plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Keith"),
  mappedSoil: {
    soilAssociation: "Fermoy",
    dominantSeries: "Brown Earth",
    texture: "Loam",
    drainage: "moderately_drained",
    coveragePct: 88,
    datasetVersion: "test",
    source: "test",
  },
  fertility: { pIndex: verified3, kIndex: verified3 },
  history: [],
};
const composition: SlurryComposition = {
  id: "comp-ccfua",
  farmId: field.farmId,
  housingId: "housing-1",
  slurryType: "cattle_slurry",
  status: "verified",
  dmPct: 6,
  sampleDate: "2026-06-10",
  source: "Southern Agri Labs report",
  recordedAt: "2026-06-12T09:00:00.000Z",
};

function plan(fertility: Field["fertility"], method: "LESS" | "other"): NutrientPlan {
  const slurryAllocation: SlurryAllocation = {
    fieldId: field.id,
    housingId: "housing-1",
    priority: "high",
    volumeM3: 33 * field.areaHa,
    score: 90,
    applicationMethod: tracked(method, "farmer_adjusted", "Keith"),
  };
  return calculateNutrientPlan({
    field: { ...field, fertility },
    farmGrasslandAreaHa: 27,
    livestockGroups: [],
    slurryAllocation,
    silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
    slurryComposition: composition,
  });
}

/** Every card the Nutrients page renders that can carry slurry-credit wording. */
function renderCards(p: NutrientPlan): string {
  render(
    <>
      <NutrientRequirementCard plan={p} field={field} />
      <OrganicNutrientsCard organic={p.organicApplication} />
      <PurchasedFertiliserCard
        products={p.purchasedProducts}
        estimatedFieldCostEur={p.estimatedFieldCostEur}
        requirement={p.requirement}
        netRequirement={p.netRequirement}
        deliveredKgHa={p.deliveredKgHa}
        requirementProvisional={p.requirementProvisional}
      />
    </>,
  );
  return document.body.textContent ?? "";
}

describe("CC-FU-A — slurry nutrient-credit messaging", () => {
  it.each<[string, Field["fertility"]]>([
    ["soil P index", { kIndex: verified3 }],
    ["soil K index", { pIndex: verified3 }],
    ["soil P and K indices", {}],
  ])("missing %s with valid slurry N credit: N shown as included, P/K withheld, never 'all credit excluded'", (_, fertility) => {
    const p = plan(fertility, "LESS");
    // Engine state this wording describes: N kept, P/K withheld.
    expect(p.organicApplication.offsetN).toBe(33);
    expect(p.organicApplication.offsetP).toBe(0);
    expect(p.organicApplication.offsetK).toBe(0);

    const text = renderCards(p);
    expect(text).toContain("N credit included");
    expect(text).toContain("Slurry N credit is included. P and K credit isn't counted yet.");
    expect(text).toContain("so the phosphorus and potassium credit from slurry isn't counted");
    expect(text).not.toContain(BLANKET);
    expect(text).not.toContain("Not yet assessed");
    expect(text).not.toContain("Available nutrient contribution not yet assessed");
  });

  it("complete soil-index data: the normal evidenced slurry-credit presentation is unchanged", () => {
    const p = plan({ pIndex: verified3, kIndex: verified3 }, "LESS");
    expect(p.organicApplication.availableNutrientAssessment.status).toBe("OK");
    expect(p.requirementProvisional.isProvisional).toBe(false);

    const text = renderCards(p);
    expect(text).toContain("Scientific basis: Teagasc-backed available nutrient estimate");
    expect(text).not.toContain("N credit included");
    expect(text).not.toContain("Not yet assessed");
    expect(text).not.toContain(BLANKET);
  });

  it("genuinely unavailable slurry credit (unsupported method): still says credit is not included", () => {
    const p = plan({ pIndex: verified3, kIndex: verified3 }, "other");
    expect(p.organicApplication.offsetN).toBe(0);
    expect(p.requirementProvisional.isProvisional).toBe(true);

    const text = renderCards(p);
    expect(text).toContain(BLANKET);
    expect(text).toContain("Not yet assessed");
    expect(text).toContain("Available nutrient contribution not yet assessed for this application context.");
    expect(text).not.toContain("N credit included");
  });
});
