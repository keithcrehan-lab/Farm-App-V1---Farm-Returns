import { describe, expect, it } from "vitest";
import { tracked, type Field } from "./types";
import {
  createFarmerEvidence,
  type FieldProductionCycle,
} from "./fertiliser-field-evidence";
import { calculateGrassFertiliserV2 } from "./grass-fertiliser-engine-v2";

const field = (
  p: 1 | 2 | 3 | 4 = 2,
  k: 1 | 2 | 3 | 4 = 2,
): Pick<Field, "id" | "fertility"> => ({
  id: "f1",
  fertility: {
    pIndex: tracked(p, "verified", "Lab"),
    kIndex: tracked(k, "verified", "Lab"),
    verifiedTest: {
      sampleDate: "2026-01-10",
      laboratory: "Lab",
      sampleRef: "S1",
      p: 4,
      k: 90,
      pH: 6.2,
    },
  },
});
const cycle = (
  cropSystem: FieldProductionCycle["cropSystem"],
  evidence: FieldProductionCycle["evidence"] = {},
): FieldProductionCycle => ({
  id: "c1",
  fieldId: "f1",
  season: "2026",
  cropSystem,
  status: "active",
  evidence: {
    cropSystem: createFarmerEvidence(cropSystem, "Farmer"),
    chemicalNAppliedKgHa: createFarmerEvidence(0, "Farmer"),
    chemicalPAppliedKgHa: createFarmerEvidence(0, "Farmer"),
    chemicalKAppliedKgHa: createFarmerEvidence(0, "Farmer"),
    ...evidence,
  },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("grass fertiliser engine v2", () => {
  it("uses organic-N stocking directly for grazing and never a chemical-N output as the P/K input", () => {
    const result = calculateGrassFertiliserV2({
      field: field(2, 1),
      cycle: cycle("GRASS_GRAZING"),
      grazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
      annualOrganicNStockingRateKgHa: 118,
    });
    expect(result.status).toBe("READY");
    expect(result.grossRequirementKgHa).toEqual({ n: 75, p: 17, k: 68.5 });
    expect(result.traces.n?.inputs.annualOrganicNStockingRateKgHa).toBe(118);
    expect(result.traces.k?.inputs.annualOrganicNStockingRateKgHa).toBe(118);
  });

  it("uses Teagasc Table 12-2 for suckler calf-to-weaning grazing", () => {
    const result = calculateGrassFertiliserV2({
      field: field(4, 1),
      cycle: cycle("GRASS_GRAZING"),
      grazingProductionSystem: "SUCKLER_CALF_TO_WEANING",
      annualOrganicNStockingRateKgHa: 92,
    });
    expect(result.status).toBe("READY");
    // v2.1.0: P Index 4 gets no Table 13-3 maintenance (Green Book §13);
    // v2.0.0 returned p: 4 here.
    expect(result.grossRequirementKgHa).toEqual({ n: 47, p: 0, k: 65.25 });
    expect(result.traces.n?.ruleId).toBe(
      "TEAGASC_GREEN_BOOK_2020_TABLE_12_2_SUCKLER_CALF_TO_WEANING",
    );
  });

  it("interpolates grazing N only between published organic-N rows and discloses the fraction", () => {
    const result = calculateGrassFertiliserV2({
      field: field(3, 3),
      cycle: cycle("GRASS_GRAZING"),
      grazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
      annualOrganicNStockingRateKgHa: 128,
    });
    expect(result.status).toBe("READY");
    expect(result.grossRequirementKgHa!.n).toBeCloseTo(89, 6);
    expect(result.traces.n?.method).toMatch(/interpolation/i);
  });

  it("requires an explicit grazing production system instead of borrowing another system's table", () => {
    const result = calculateGrassFertiliserV2({
      field: field(),
      cycle: cycle("GRASS_GRAZING"),
      annualOrganicNStockingRateKgHa: 118,
    });
    expect(result.status).toBe("UNSUPPORTED_PATHWAY");
    expect(result.missingInputs).toContain("grazingProductionSystem");
  });

  it("uses the current 2026 first-cut 5 t DM/ha table", () => {
    const result = calculateGrassFertiliserV2({
      field: field(1, 2),
      cycle: cycle("GRASS_FIRST_CUT_SILAGE", {
        productionTargetTDMHa: createFarmerEvidence(5, "Farmer"),
      }),
    });
    expect(result.status).toBe("READY");
    expect(result.grossRequirementKgHa).toEqual({ n: 100, p: 40, k: 155 });
  });

  it("does not invent first-cut N scaling outside the published 5 t DM/ha target", () => {
    const result = calculateGrassFertiliserV2({
      field: field(),
      cycle: cycle("GRASS_FIRST_CUT_SILAGE", {
        productionTargetTDMHa: createFarmerEvidence(6, "Farmer"),
      }),
    });
    expect(result.status).toBe("UNSUPPORTED_PATHWAY");
  });

  it("fails closed on the unresolved later-cut source conflict", () => {
    const result = calculateGrassFertiliserV2({
      field: field(),
      cycle: cycle("GRASS_SECOND_CUT_SILAGE", {
        productionTargetTDMHa: createFarmerEvidence(3, "Farmer"),
      }),
    });
    expect(result.status).toBe("SOURCE_CONFLICT");
  });

  it("subtracts organic and already-applied chemical nutrients only after gross agronomic requirement is established", () => {
    const c = cycle("GRASS_FIRST_CUT_SILAGE", {
      productionTargetTDMHa: createFarmerEvidence(5, "Farmer"),
      chemicalNAppliedKgHa: createFarmerEvidence(10, "Farmer"),
      chemicalPAppliedKgHa: createFarmerEvidence(5, "Farmer"),
      chemicalKAppliedKgHa: createFarmerEvidence(20, "Farmer"),
    });
    const result = calculateGrassFertiliserV2({
      field: field(3, 3),
      cycle: c,
      organicCreditsKgHa: { n: 20, p: 5, k: 30 },
    });
    expect(result.remainingRequirementKgHa).toEqual({ n: 70, p: 10, k: 75 });
  });
});

describe("grass fertiliser engine v2.1.0 — fertiliser close-out", () => {
  it("advises no P at Index 4 for grazing, beef or weaning tables alike (Green Book §13; NAP Index 4 maximum 0)", () => {
    for (const system of ["SUCKLER_CALF_TO_BEEF", "SUCKLER_CALF_TO_WEANING"] as const) {
      const result = calculateGrassFertiliserV2({
        field: field(4, 3),
        cycle: cycle("GRASS_GRAZING"),
        grazingProductionSystem: system,
        annualOrganicNStockingRateKgHa: 140,
      });
      expect(result.status).toBe("READY");
      expect(result.grossRequirementKgHa?.p).toBe(0);
      expect(result.traces.p?.inputs.maintenanceKgHa).toBe(0);
    }
  });

  it("still adds Table 13-3 maintenance below Index 4", () => {
    const result = calculateGrassFertiliserV2({
      field: field(3, 3),
      cycle: cycle("GRASS_GRAZING"),
      grazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
      annualOrganicNStockingRateKgHa: 140,
    });
    expect(result.grossRequirementKgHa?.p).toBe(10);
  });

  it("refuses grazing advice above the last published Table 12-3 row instead of holding it", () => {
    const atLastRow = calculateGrassFertiliserV2({
      field: field(2, 2),
      cycle: cycle("GRASS_GRAZING"),
      grazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
      annualOrganicNStockingRateKgHa: 235,
    });
    expect(atLastRow.status).toBe("READY");
    expect(atLastRow.grossRequirementKgHa?.n).toBe(241);
    const above = calculateGrassFertiliserV2({
      field: field(2, 2),
      cycle: cycle("GRASS_GRAZING"),
      grazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
      annualOrganicNStockingRateKgHa: 236,
    });
    expect(above.status).toBe("UNSUPPORTED_PATHWAY");
    expect(above.grossRequirementKgHa).toBeUndefined();
    expect(above.limitations.join(" ")).toMatch(/above the last row Teagasc publishes/);
  });

  it("refuses above the last calf-to-weaning (Table 12-2) row too", () => {
    const result = calculateGrassFertiliserV2({
      field: field(2, 2),
      cycle: cycle("GRASS_GRAZING"),
      grazingProductionSystem: "SUCKLER_CALF_TO_WEANING",
      annualOrganicNStockingRateKgHa: 239,
    });
    expect(result.status).toBe("UNSUPPORTED_PATHWAY");
  });

  it("uses the printed first row for low stocking (≤80 kg organic N/ha → 35 kg N/ha)", () => {
    const result = calculateGrassFertiliserV2({
      field: field(2, 2),
      cycle: cycle("GRASS_GRAZING"),
      grazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
      annualOrganicNStockingRateKgHa: 60,
    });
    expect(result.status).toBe("READY");
    expect(result.grossRequirementKgHa?.n).toBe(35);
  });

  describe("white-clover grazing (Teagasc drystock clover strategy, 170 kg organic N/ha)", () => {
    const clover = (pct: number | undefined) =>
      cycle("GRASS_WHITE_CLOVER_GRAZING", pct === undefined ? {} : { whiteCloverPct: createFarmerEvidence(pct, "Farmer") });

    it.each([
      [0, 150],
      [5, 112],
      [10, 75],
    ])("April clover %i%% at the reference stocking rate → %i kg N/ha (published annual total)", (pct, n) => {
      const result = calculateGrassFertiliserV2({ field: field(3, 3), cycle: clover(pct), annualOrganicNStockingRateKgHa: 170 });
      expect(result.status).toBe("READY");
      expect(result.grossRequirementKgHa?.n).toBe(n);
      expect(result.traces.n?.ruleId).toBe("TEAGASC_CLOVER_BEEF_2026_TABLE_1_DRYSTOCK");
    });

    it("carries the published timing schedule in the trace (10% class: Feb/Mar 20, Apr 20, May 10, Jun 0, Jul 10, Aug/Sep 15)", () => {
      const result = calculateGrassFertiliserV2({ field: field(3, 3), cycle: clover(10), annualOrganicNStockingRateKgHa: 170 });
      expect(result.traces.n?.inputs).toMatchObject({ n_Feb_Mar: 20, n_Apr: 20, n_May: 10, n_Jun: 0, n_Jul: 10, n_Aug_Sep: 15 });
    });

    it("uses the same Green Book drystock P and K as grass (Tables 13-2, 13-3, 14-1)", () => {
      const result = calculateGrassFertiliserV2({ field: field(2, 2), cycle: clover(5), annualOrganicNStockingRateKgHa: 170 });
      expect(result.grossRequirementKgHa).toMatchObject({ p: 20, k: 45 });
    });

    it("gives no clover N rate away from the 170 kg organic N/ha reference, and never substitutes the grass-only table", () => {
      const result = calculateGrassFertiliserV2({ field: field(3, 3), cycle: clover(5), annualOrganicNStockingRateKgHa: 109 });
      expect(result.status).toBe("UNSUPPORTED_PATHWAY");
      expect(result.grossRequirementKgHa).toBeUndefined();
      expect(result.limitations.join(" ")).toMatch(/only for farms stocked at 170 kg organic N\/ha/);
    });

    it("refuses clover N just either side of 170 kg organic N/ha — the canonical gate gets the actual rate, never a rounded one (audit F004, GFT140)", () => {
      for (const rate of [169.6, 169.99, 170.01, 170.4]) {
        const result = calculateGrassFertiliserV2({ field: field(3, 3), cycle: clover(10), annualOrganicNStockingRateKgHa: rate });
        expect(result.status, String(rate)).toBe("UNSUPPORTED_PATHWAY");
        expect(result.grossRequirementKgHa, String(rate)).toBeUndefined();
      }
      expect(calculateGrassFertiliserV2({ field: field(3, 3), cycle: clover(10), annualOrganicNStockingRateKgHa: 170 }).status).toBe("READY");
    });

    it("never interpolates between clover classes (GFT139)", () => {
      const result = calculateGrassFertiliserV2({ field: field(3, 3), cycle: clover(7), annualOrganicNStockingRateKgHa: 170 });
      expect(result.status).toBe("UNSUPPORTED_PATHWAY");
      expect(result.limitations.join(" ")).toMatch(/never interpolated/);
    });

    it("asks for the clover content when it is missing", () => {
      const result = calculateGrassFertiliserV2({ field: field(3, 3), cycle: clover(undefined), annualOrganicNStockingRateKgHa: 170 });
      expect(result.status).toBe("INCOMPLETE_EVIDENCE");
      expect(result.missingInputs).toEqual(["whiteCloverPct"]);
    });

    it("flags very low fertility (P1 K1) for clover persistence", () => {
      const result = calculateGrassFertiliserV2({ field: field(1, 1), cycle: clover(5), annualOrganicNStockingRateKgHa: 170 });
      expect(result.limitations.join(" ")).toMatch(/not ideal for clover/);
    });

    it("advises no P on a clover field at Index 4", () => {
      const result = calculateGrassFertiliserV2({ field: field(4, 3), cycle: clover(5), annualOrganicNStockingRateKgHa: 170 });
      expect(result.grossRequirementKgHa?.p).toBe(0);
    });
  });
});
