import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NutrientRequirementCard } from "./NutrientRequirementCard";
import { OrganicNutrientsCard } from "./OrganicNutrientsCard";
import { PurchasedFertiliserCard } from "./PurchasedFertiliserCard";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { tracked } from "@/domain/types";
import { formatNumber } from "@/lib/format";
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
      <OrganicNutrientsCard organic={p.organicApplication} fertilityEvidenceByNutrient={p.fertilityEvidenceByNutrient} />
      <PurchasedFertiliserCard
        products={p.purchasedProducts}
        estimatedFieldCostEur={p.estimatedFieldCostEur}
        requirement={p.requirement}
        netRequirement={p.netRequirement}
        deliveredKgHa={p.deliveredKgHa}
        requirementProvisional={p.requirementProvisional}
        purchaseStatus={p.purchaseStatus}
      />
    </>,
  );
  return document.body.textContent ?? "";
}

describe("CC-FU-A — slurry nutrient-credit messaging", () => {
  // Per-nutrient P/K Increment 5a: a field with one index recorded now uses
  // the D3 wording (tested below); the neither-index case keeps CC-FU-A's.
  it("missing soil P and K indices with valid slurry N credit: N shown as included, P/K withheld, never 'all credit excluded'", () => {
    const p = plan({}, "LESS");
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
    // The withheld P/K slurry credit is "—", never 0.
    expect(text).toContain("N33kg/haP—kg/haK—kg/ha");
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

/**
 * Per-nutrient P/K Increment 5a (D3) — the known nutrient shown, the
 * unknown "—", from real `calculateNutrientPlan` output.
 */
describe("Per-nutrient P/K Increment 5a — known P or K on the Nutrients cards", () => {
  const indexed = (i: 1 | 2 | 3 | 4) => tracked(i, "verified", "Lab");
  const arm = (o: { status: string; value?: unknown }) => {
    if (o.status !== "OK") throw new Error("expected an OK arm");
    return o.value as number;
  };
  const kgHa = (o: NutrientPlan["organicApplication"]["availableNutrientByNutrient"]["n"]) => {
    if (o.status !== "OK") throw new Error("expected an OK credit arm");
    return o.value.kgHa;
  };
  const cell = (label: string, value: number | null) => `${label}${value === null ? "—" : formatNumber(value, 0)}kg/ha`;

  function renderRequirement(p: NutrientPlan): string {
    const { container } = render(<NutrientRequirementCard plan={p} field={field} />);
    return container.textContent ?? "";
  }
  function renderOrganic(p: NutrientPlan): string {
    const { container } = render(
      <OrganicNutrientsCard organic={p.organicApplication} fertilityEvidenceByNutrient={p.fertilityEvidenceByNutrient} />,
    );
    return container.textContent ?? "";
  }

  describe.each<["P" | "K", "P" | "K"]>([
    ["P", "K"],
    ["K", "P"],
  ])("%s known / %s missing", (known, missing) => {
    it.each([1, 2, 3, 4] as const)("Index %i: known values, '—' for the unknown, D3 wording, no NPK total", (index) => {
      const fertility: Field["fertility"] = known === "P" ? { pIndex: indexed(index) } : { kIndex: indexed(index) };
      const p = plan(fertility, "LESS");
      const knownKey = known === "P" ? "p" : "k";

      const req = renderRequirement(p);
      const reqN = arm(p.requirementByNutrient.n);
      const reqKnown = arm(p.requirementByNutrient[knownKey]);
      expect(req).toContain(cell("N", reqN));
      expect(req).toContain(cell(known, reqKnown));
      expect(req).toContain(cell(missing, null));
      expect(req).toContain(`${known} shown · ${missing} needs a soil test`);
      expect(req).toContain(
        `${missing} requirement isn't shown because this field's soil ${missing} Index is missing. Add a soil test to complete the plan.`,
      );
      expect(req).not.toMatch(/total for field/i);
      expect(req).not.toMatch(/insufficient evidence/i);
      expect(req).toContain("Teagasc Green Book (5th Ed., 2020)");
      expect(req).not.toContain(BLANKET);
      cleanup();

      const org = renderOrganic(p);
      expect(org).toContain(cell("N", kgHa(p.organicApplication.availableNutrientByNutrient.n)));
      expect(org).toContain(cell(known, kgHa(p.organicApplication.availableNutrientByNutrient[knownKey])));
      expect(org).toContain(cell(missing, null));
      expect(org).toContain(`N and ${known} credit included`);
      expect(org).toContain(`${missing} credit isn't counted until the soil ${missing} Index is recorded.`);
      expect(org).not.toContain("Not yet assessed");
      expect(org).not.toContain("N credit included");
      expect(org).not.toContain("so the phosphorus and potassium credit from slurry isn't counted");
    });
  });

  it("fully indexed: requirement and slurry credit render as before (paired values and total, no '—')", () => {
    const p = plan({ pIndex: verified3, kIndex: verified3 }, "LESS");
    const req = renderRequirement(p);
    const { n, p: rp, k } = p.requirement.value;
    expect(req).toContain(`${cell("N", n)}${cell("P", rp)}${cell("K", k)}`);
    expect(req).toContain(`Total for fieldNPK${formatNumber((n + rp + k) * field.areaHa, 0)} kg`);
    expect(req).not.toContain("—");
    expect(req).not.toContain("needs a soil test");
    cleanup();

    const org = renderOrganic(p);
    const o = p.organicApplication;
    expect(org).toContain(`${cell("N", o.offsetN)}${cell("P", o.offsetP)}${cell("K", o.offsetK)}`);
    expect(org).not.toContain("—");
    expect(org).not.toContain("credit included");
  });

  it("neither index: requirement keeps its insufficient-evidence state", () => {
    const req = renderRequirement(plan({}, "LESS"));
    expect(req).toMatch(/insufficient evidence/i);
    expect(req).not.toContain("needs a soil test");
  });

  it("mixed field with an unsupported method: no D3 credit claim, P/K credit '—', requirement keeps the provisional notice", () => {
    const p = plan({ pIndex: verified3 }, "other");
    const org = renderOrganic(p);
    expect(org).toContain("Not yet assessed");
    expect(org).not.toContain("credit included");
    expect(org).toContain(`${cell("P", null)}${cell("K", null)}`);
    cleanup();

    const req = renderRequirement(p);
    expect(req).toContain("P shown · K needs a soil test");
    expect(req).toContain(BLANKET);
  });
});
