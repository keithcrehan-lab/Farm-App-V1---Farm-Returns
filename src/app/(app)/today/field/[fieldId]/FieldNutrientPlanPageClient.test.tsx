import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { roundKgUpToDisplayTonnes } from "@/domain/fertiliser-plan";
import { tracked, type Farm, type Field, type LivestockGroup, type SlurryAllocation } from "@/domain/types";
import { farmerAdjust, verify } from "@/domain/provenance";
import type { SlurryComposition } from "@/domain/slurry-composition";
import { FieldNutrientPlanPageClient } from "./FieldNutrientPlanPageClient";

/**
 * Farm Spatial V2 Phase 4 — the real engine output reaches the field
 * nutrient plan end to end: farm-store records → shared assembly →
 * `calculateNutrientPlan` → presentation → screen, checked against an
 * independent engine call.
 */

afterEach(cleanup);

const FARM: Farm = { id: "farm-1", name: "Test Farm", location: { county: "Cork", centroid: [0, 0] }, primaryEnterprises: ["suckler_beef"], units: "metric", ownerName: "Farmer" };
const HERD = [
  { id: "g1", farmId: "farm-1", category: "suckler_cow", label: "Cows", count: { value: 20, status: "verified", source: "Farmer" }, system: "grazing", value: { value: 30000, status: "estimated", source: "Farm Return estimate" } },
] as LivestockGroup[];

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Long Field",
    areaHa: 4,
    centroid: [0, 0],
    fertility: { pIndex: tracked(1, "verified", "Soil test"), kIndex: tracked(1, "verified", "Soil test") },
    ...overrides,
  } as Field;
}

const SPLASH: SlurryAllocation = { fieldId: "field-1", housingId: "h1", volumeM3: 100, priority: "high", applicationMethod: tracked("splashplate", "farmer_adjusted", "Farmer") };

function renderPlan(fields: Field[], slurryAllocations: SlurryAllocation[] = [SPLASH], livestockGroups: LivestockGroup[] = HERD, fieldId = "field-1", slurryCompositionRecords: SlurryComposition[] = []) {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields, livestockGroups, housing: [], slurryAllocations, slurryCompositionRecords }}>
      <FieldNutrientPlanPageClient fieldId={fieldId} />
    </FarmProvider>,
  );
}

function cellText(container: HTMLElement, row: string, nutrient: string): string {
  return container.querySelector(`tr[data-row="${row}"] td[data-nutrient="${nutrient}"]`)!.textContent ?? "";
}

describe("FieldNutrientPlanPageClient — real engine output, end to end", () => {
  it("renders requirement → organic contribution → remaining → products exactly as the engine computed them", () => {
    const { container } = renderPlan([field()]);
    const plan = calculateNutrientPlan({ field: field(), farmGrasslandAreaHa: 4, livestockGroups: HERD, slurryAllocation: SPLASH, nonGrassPct: 0 });

    for (const key of ["n", "p", "k"] as const) {
      const req = plan.fieldRequirement[key];
      const credit = plan.organicApplication.availableNutrientByNutrient[key];
      const rem = plan.fieldRemainingRequirement[key];
      if (req.status !== "KNOWN" || credit.status !== "OK" || rem.status !== "KNOWN") throw new Error("fixture must be fully known");
      expect(cellText(container, "requirement", key)).toBe(String(Math.round(req.kgHa)));
      expect(cellText(container, "organic", key)).toBe(String(Math.round(credit.value.kgHa)));
      expect(cellText(container, "remaining", key)).toBe(String(Math.round(rem.kgHa)));
    }

    const solution = screen.getByRole("region", { name: "Fertiliser solution" });
    expect(plan.purchasedProducts.length).toBeGreaterThan(0);
    for (const product of plan.purchasedProducts) {
      const row = solution.querySelector(`[data-product="${product.name}"]`) as HTMLElement;
      expect(within(row).getByText(`${product.npkAnalysis} · ${Math.round(product.rateKgHa)} kg/ha`)).toBeTruthy();
      expect(row.textContent).toContain(`${roundKgUpToDisplayTonnes(product.totalKg)}t`);
    }

    const organic = screen.getByRole("region", { name: "Organic application" });
    expect(organic.textContent).toContain("100m³");
    expect(organic.textContent).toContain("Splash plate");
    expect(organic.textContent).toContain("Not available yet");
    expect(screen.getByRole("region", { name: "Evidence chain" }).textContent).toContain(plan.calculationVersion);
    expect(screen.getByText(/Long Field on the farm map/).closest("a")!.getAttribute("href")).toBe("/today?lens=nutrients&field=field-1");
    expect(screen.getByRole("link", { name: /whole-farm nutrient plan/i }).getAttribute("href")).toBe("/fertiliser-plan");
  });

  it("keeps a missing K Index Unknown in every row and withholds products, never showing 0", () => {
    const f = field({ fertility: { pIndex: tracked(2, "verified", "Soil test") } });
    const { container } = renderPlan([f]);
    for (const row of ["requirement", "organic", "remaining"]) expect(cellText(container, row, "k")).toBe("Unknown");
    expect(screen.getByRole("region", { name: "Fertiliser solution" }).textContent).toContain("Withheld");
    expect(container.textContent).toContain("K unknown");
  });

  it("states an unavailable plan honestly with no figures", () => {
    const { container } = renderPlan([field()], [SPLASH], []);
    expect(screen.getByText(/Add a livestock group/)).toBeTruthy();
    expect(container.querySelector("tr[data-row]")).toBeNull();
    expect(container.textContent).toContain("NOT CALCULATED");
  });

  it("shows an unavailable multi-store slurry composition as Not resolved, never the engine's fallback DM%", () => {
    const composition = (id: string, housingId: string, dmPct: number): SlurryComposition => ({
      id,
      farmId: "farm-1",
      housingId,
      slurryType: "cattle_slurry",
      status: "verified",
      dmPct,
      sampleDate: "2026-02-10",
      source: "Laboratory report",
      recordedAt: "2026-02-11T09:00:00Z",
    });
    renderPlan([field()], [SPLASH, { ...SPLASH, housingId: "h2" }], HERD, "field-1", [composition("c1", "h1", 4), composition("c2", "h2", 7)]);
    const evidence = screen.getByRole("region", { name: "Evidence chain" });
    const dm = within(evidence).getByText("Slurry dry matter").nextElementSibling!.textContent ?? "";
    expect(dm).toContain("Not resolved · unavailable");
    expect(dm).not.toMatch(/\d+(\.\d)?%/);
  });

  it("surfaces the engine's LESS prohibition and commonage prohibition in Legal status", () => {
    const { container } = renderPlan([field({ commonageStatus: tracked("commonage", "farmer_adjusted", "Farmer") })]);
    const plan = calculateNutrientPlan({ field: field({ commonageStatus: tracked("commonage", "farmer_adjusted", "Farmer") }), farmGrasslandAreaHa: 4, livestockGroups: HERD, slurryAllocation: SPLASH, nonGrassPct: 0 });
    expect(plan.lessMethodCompliance).toMatchObject({ status: "LEGAL_PROHIBITION", reasonCode: "LESS_REQUIRED_GSR100" });
    expect(plan.commonageFertiliserGate.status).toBe("LEGAL_PROHIBITION");
    const less = container.querySelector('[data-legal-gate="less"]') as HTMLElement;
    expect(less.dataset.gateState).toBe("prohibited");
    expect(less.textContent).toContain("less required gsr100");
    expect((container.querySelector('[data-legal-gate="commonage"]') as HTMLElement).dataset.gateState).toBe("prohibited");
  });

  it("keeps missing buffer evidence visible as Cannot determine", () => {
    const { container } = renderPlan([field()]);
    const gate = container.querySelector('[data-legal-gate="local_buffer"]') as HTMLElement;
    expect(gate.dataset.gateState).toBe("blocked");
    expect(gate.textContent).toContain("Cannot determine");
  });

  it("identifies a farmer soil-index override and keeps the laboratory evidence beside it", () => {
    const labK = verify<1 | 2 | 3 | 4>(undefined, 2, "Teagasc Johnstown", { sourceDate: "2025-11-04" });
    const f = field({ fertility: { pIndex: tracked(1, "verified", "Soil test"), kIndex: farmerAdjust<1 | 2 | 3 | 4>(labK, 4, "Farmer", "2026-01-15") } });
    const { container } = renderPlan([f]);
    expect(container.textContent).toContain("K4 (farmer override)");
    const evidence = screen.getByRole("region", { name: "Evidence chain" });
    const soil = within(evidence).getByText("Soil index").nextElementSibling!.textContent ?? "";
    expect(soil).toContain("K4 · farmer override (Farmer, 2026-01-15) of laboratory K2 (Teagasc Johnstown, 2025-11-04)");
  });

  it("gives a field that isn't on the farm a route back, not a blank page", () => {
    renderPlan([field()], [SPLASH], HERD, "missing");
    expect(screen.getByText(/isn't on your farm/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /farm map/i }).getAttribute("href")).toBe("/today");
  });
});
