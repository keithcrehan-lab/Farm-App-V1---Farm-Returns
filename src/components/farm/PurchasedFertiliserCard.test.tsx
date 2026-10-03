import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PurchasedFertiliserCard } from "./PurchasedFertiliserCard";
import { tracked } from "@/domain/types";
import type { NutrientPlan } from "@/domain/types";
import { calculateNutrientPlan } from "@/domain/nutrients";
import type { Field, LivestockGroup } from "@/domain/types";

afterEach(() => {
  cleanup();
});

const PRODUCTS: NutrientPlan["purchasedProducts"] = [
  { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 200, totalKg: 1000, costEur: 620, formulation: tracked({ physicalForm: "solid", ureicNPercent: 0, inhibitorStatus: "inhibited" }, "verified", "Product catalogue") },
];
const RECOMMENDED: NutrientPlan["purchaseStatus"] = { status: "RECOMMENDED" };
const UNKNOWN_INDEX: NutrientPlan["purchaseStatus"] = { status: "UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: ["fertility.pIndex", "fertility.kIndex"] };

// Codex audit CRITICAL (round 26): this card used to gate only on
// `fertilityEvidence` — a field blocked for the new silage-evidence
// reason (a real silage-cut field with no real cut/yield plan) had
// fertilityEvidence.status === "OK" but products: [], rendering an
// empty table with "Estimated field cost €0" as if genuinely nothing
// were needed.
describe("PurchasedFertiliserCard", () => {
  it("shows the real product table when the requirement is genuinely calculable", () => {
    render(<PurchasedFertiliserCard purchaseStatus={RECOMMENDED} products={PRODUCTS} estimatedFieldCostEur={620} requirement={tracked({ n: 125, p: 20, k: 125 }, "estimated", "Teagasc Green Book")} />);
    expect(screen.getAllByText("18-6-12").length).toBeGreaterThan(0);
    expect(screen.getByText(/estimated field cost/i)).toBeTruthy();
  });

  it("discloses the real reason instead of a false zero when the P/K Soil Index is missing", () => {
    render(
      <PurchasedFertiliserCard
        purchaseStatus={UNKNOWN_INDEX}
        products={[]}
        estimatedFieldCostEur={0}
        requirement={tracked({ n: 125, p: 0, k: 0 }, "unavailable", "This field's P/K Soil Index has not been recorded — add a soil test or a farmer estimate to unlock a fertiliser plan.")}
      />,
    );
    expect(screen.queryByText("18-6-12")).toBeNull();
    expect(screen.getByText(/insufficient evidence/i)).toBeTruthy();
    expect(screen.getByText(/p\/k soil index has not been recorded/i)).toBeTruthy();
  });

  it("discloses the real silage-evidence reason instead of a false zero for a silage field with no real cut/yield plan", () => {
    render(
      <PurchasedFertiliserCard
        purchaseStatus={{ status: "UNKNOWN", reasonCode: "MISSING_SILAGE_PLAN_DATA", missingInputs: ["plannedUse"] }}
        products={[]}
        estimatedFieldCostEur={0}
        requirement={tracked(
          { n: 0, p: 0, k: 0 },
          "unavailable",
          "This field is recorded as a silage cut but has no real cut/yield plan to calculate its silage-specific N/P/K requirement from.",
        )}
      />,
    );
    expect(screen.getByText(/insufficient evidence/i)).toBeTruthy();
    expect(screen.getByText(/silage cut but has no real cut\/yield plan/i)).toBeTruthy();
    // Never the P/K-specific copy for this different real reason.
    expect(screen.queryByText(/p\/k soil index has not been recorded/i)).toBeNull();
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F7/F9) — this table's own "kg/ha" column header previously sat over
  // `product.totalKg` (the real whole-field total), not the real per-ha
  // rate — a farmer reading "kg/ha" was actually seeing kg/field.
  it("labels the real per-ha rate and the real whole-field total with their own correct, distinct headings — never 'kg/ha' over a field total", () => {
    render(<PurchasedFertiliserCard purchaseStatus={RECOMMENDED} products={PRODUCTS} estimatedFieldCostEur={620} requirement={tracked({ n: 125, p: 20, k: 125 }, "estimated", "Teagasc Green Book")} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toContain("kg/ha");
    expect(headers).toContain("kg/field");
    // The real per-ha rate (200) sits under "kg/ha"; the real
    // whole-field total (1000) sits under "kg/field" — never the
    // reverse, and never the same column claiming both.
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("1,000")).toBeTruthy();
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F1) — the real total N/P/K this blend delivers, reconciled against
  // the real net requirement it was sized against, must be visible —
  // never an apparently complete total that silently omits a real
  // byproduct (e.g. 18-6-12's own real K).
  it("shows the real delivered-vs-net-requirement reconciliation, including a genuine byproduct excess, when both are supplied", () => {
    render(
      <PurchasedFertiliserCard
        purchaseStatus={RECOMMENDED}
        products={PRODUCTS}
        estimatedFieldCostEur={620}
        requirement={tracked({ n: 125, p: 20, k: 125 }, "estimated", "Teagasc Green Book")}
        netRequirement={tracked({ n: 100, p: 12, k: 0 }, "estimated", "Teagasc Green Book")}
        deliveredKgHa={{ n: 36, p: 12, k: 24 }}
      />,
    );
    expect(screen.getByText(/real supply vs net requirement/i)).toBeTruthy();
    // K: net requirement 0, real delivered 24 — a genuine byproduct
    // excess, disclosed honestly, never hidden.
    expect(screen.getByText(/\+24 excess/)).toBeTruthy();
  });

  it("omits the reconciliation section entirely when the real delivered/net-requirement figures aren't supplied — never a broken partial render", () => {
    render(<PurchasedFertiliserCard purchaseStatus={RECOMMENDED} products={PRODUCTS} estimatedFieldCostEur={620} requirement={tracked({ n: 125, p: 20, k: 125 }, "estimated", "Teagasc Green Book")} />);
    expect(screen.queryByText(/real supply vs net requirement/i)).toBeNull();
  });
});

// Fertiliser Vertical Completion, Session 2b — driven by real
// `calculateNutrientPlan` output: a grazing field whose purchase is UNKNOWN
// (no usable farm grassland area) keeps an "estimated" paired requirement
// (LEGACY_COMPATIBILITY_PATH) but must never render an empty table with €0.
describe("PurchasedFertiliserCard — Session 2b purchase status", () => {
  const field: Field = {
    id: "field-2b",
    farmId: "farm-2b",
    name: "2b Field",
    areaHa: 5,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Farmer"),
    mappedSoil: { soilAssociation: "Fermoy", dominantSeries: "Brown Earth", texture: "Loam", drainage: "moderately_drained", coveragePct: 88, datasetVersion: "test", source: "test" },
    fertility: { pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(2, "verified", "Lab") },
    history: [],
  };
  const livestock: LivestockGroup[] = [
    { id: "g1", farmId: "farm-2b", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
  ];
  const render2b = (plan: NutrientPlan) =>
    render(
      <PurchasedFertiliserCard
        purchaseStatus={plan.purchaseStatus}
        products={plan.purchasedProducts}
        estimatedFieldCostEur={plan.estimatedFieldCostEur}
        requirement={plan.requirement}
        netRequirement={plan.netRequirement}
        deliveredKgHa={plan.deliveredKgHa}
        requirementProvisional={plan.requirementProvisional}
      />,
    );

  it("UNKNOWN (no usable grassland area): shows the reason, never a table or €0", () => {
    const plan = calculateNutrientPlan({ field, farmGrasslandAreaHa: 0, livestockGroups: livestock, asOfDate: "2026-10-03" });
    expect(plan.requirement.status).toBe("estimated");
    expect(plan.purchaseStatus).toEqual({ status: "UNKNOWN", reasonCode: "MISSING_GRASSLAND_AREA", missingInputs: ["farmGrasslandAreaHa"] });
    render2b(plan);
    expect(screen.getByText(/insufficient evidence/i)).toBeTruthy();
    expect(screen.getByText(/no usable grassland area/i)).toBeTruthy();
    expect(screen.queryByText(/estimated field cost/i)).toBeNull();
  });

  it("RECOMMENDED_CREDIT_NOT_COUNTED: renders the products and the provisional disclosure", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 20,
      livestockGroups: livestock,
      slurryAllocation: {
        fieldId: field.id,
        housingId: "h1",
        priority: "high",
        volumeM3: 100,
        score: 90,
        applicationMethod: tracked("LESS", "farmer_adjusted", "Farmer"),
        applicationDate: tracked("2026-09-10", "farmer_adjusted", "Farmer"),
      },
      asOfDate: "2026-10-03",
    });
    expect(plan.purchaseStatus.status).toBe("RECOMMENDED_CREDIT_NOT_COUNTED");
    render2b(plan);
    expect(screen.getByText(/estimated field cost/i)).toBeTruthy();
    expect(screen.getByText(/slurry nutrient credit not included/i)).toBeTruthy();
  });
});
