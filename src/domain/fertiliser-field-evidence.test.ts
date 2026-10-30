import { describe, expect, it } from "vitest";
import { tracked, type Field } from "./types";
import {
  createFarmerEvidence,
  evaluateFertiliserInputGate,
  type FieldProductionCycle,
} from "./fertiliser-field-evidence";

const field = (overrides: Partial<Field> = {}): Field => ({
  id: "field-1",
  farmId: "farm-1",
  name: "Back Meadow",
  areaHa: 4,
  centroid: [-8, 53],
  fertility: {
    pIndex: tracked(2, "verified", "Lab"),
    kIndex: tracked(3, "verified", "Lab"),
    verifiedTest: {
      sampleDate: "2026-01-10",
      laboratory: "Lab",
      sampleRef: "S1",
      p: 4,
      k: 90,
      pH: 6.3,
    },
  },
  history: [],
  ...overrides,
});

const cycle = (overrides: Partial<FieldProductionCycle> = {}): FieldProductionCycle => ({
  id: "cycle-1",
  fieldId: "field-1",
  season: "2026",
  cropSystem: "GRASS_GRAZING",
  status: "active",
  evidence: {
    cropSystem: createFarmerEvidence("GRASS_GRAZING", "Farmer"),
    chemicalNAppliedKgHa: createFarmerEvidence(0, "Farmer"),
    chemicalPAppliedKgHa: createFarmerEvidence(0, "Farmer"),
    chemicalKAppliedKgHa: createFarmerEvidence(0, "Farmer"),
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("Fertiliser P2 field evidence gate", () => {
  it("makes a fully evidenced grazing cycle ready without inventing a yield target", () => {
    expect(evaluateFertiliserInputGate(field(), cycle())).toEqual({
      status: "READY_FOR_CALCULATION",
      cropSystem: "GRASS_GRAZING",
      cropFamily: "grassland",
      missingInputs: [],
      assumptions: [],
    });
  });

  it("requires a production target for a cut system", () => {
    const result = evaluateFertiliserInputGate(
      field(),
      cycle({ cropSystem: "GRASS_FIRST_CUT_SILAGE", evidence: { ...cycle().evidence, cropSystem: createFarmerEvidence("GRASS_FIRST_CUT_SILAGE", "Farmer") } }),
    );
    expect(result.status).toBe("INCOMPLETE_EVIDENCE");
    expect(result.missingInputs).toContain("productionTargetTDMHa");
  });

  it("never treats absence of previous chemical fertiliser as zero", () => {
    const result = evaluateFertiliserInputGate(
      field(),
      cycle({ evidence: { cropSystem: createFarmerEvidence("GRASS_GRAZING", "Farmer") } }),
    );
    expect(result.missingInputs).toEqual([
      "chemicalNAppliedKgHa",
      "chemicalPAppliedKgHa",
      "chemicalKAppliedKgHa",
    ]);
  });

  it("requires P, K and a dated real soil test rather than a silent fertility default", () => {
    const result = evaluateFertiliserInputGate(
      field({ fertility: {} }),
      cycle(),
    );
    expect(result.missingInputs).toEqual([
      "fertility.pIndex",
      "fertility.kIndex",
      "fertility.verifiedTest.sampleDate",
    ]);
  });

  it("requires explicit white-clover evidence for the clover pathway", () => {
    const result = evaluateFertiliserInputGate(
      field(),
      cycle({ cropSystem: "GRASS_WHITE_CLOVER_GRAZING", evidence: { ...cycle().evidence, cropSystem: createFarmerEvidence("GRASS_WHITE_CLOVER_GRAZING", "Farmer") } }),
    );
    expect(result.status).toBe("INCOMPLETE_EVIDENCE");
    expect(result.missingInputs).toContain("whiteCloverPct");
  });

  it.each(["FORAGE_KALE", "FORAGE_RAPE", "CEREAL_OTHER", "HORTICULTURE_OTHER"] as const)(
    "%s is recordable but unsupported and never falls back to grass maths",
    (cropSystem) => {
      const result = evaluateFertiliserInputGate(field(), cycle({ cropSystem, evidence: { cropSystem: createFarmerEvidence(cropSystem, "Farmer") } }));
      expect(result).toEqual({
        status: "UNSUPPORTED_PATHWAY",
        cropSystem,
        cropFamily:
          cropSystem === "FORAGE_KALE" || cropSystem === "FORAGE_RAPE"
            ? "forage_brassica"
            : cropSystem === "CEREAL_OTHER"
              ? "cereal"
              : "horticulture",
        missingInputs: [],
        assumptions: [],
      });
    },
  );
});
