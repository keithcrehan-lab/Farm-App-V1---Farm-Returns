import { describe, expect, it } from "vitest";
import {
  bulkCropSystemEvidence,
  carriedForwardEvidence,
  carryForwardEligibility,
  countBulkOutcomes,
} from "./bulk-production-cycle";
import type { FieldProductionCycle } from "./fertiliser-field-evidence";

const AT = "2026-11-06T10:00:00.000Z";

function cycle(evidence: FieldProductionCycle["evidence"], cropSystem: FieldProductionCycle["cropSystem"] = "GRASS_FIRST_CUT_SILAGE") {
  return { season: "2026", cropSystem, evidence };
}

describe("carryForwardEligibility", () => {
  it("separates fields that can carry, already have a target cycle, or have nothing to copy", () => {
    expect(carryForwardEligibility({ id: "current" }, null)).toBe("CAN_CARRY");
    expect(carryForwardEligibility({ id: "current" }, { id: "target" })).toBe("HAS_TARGET_CYCLE");
    expect(carryForwardEligibility(null, { id: "target" })).toBe("HAS_TARGET_CYCLE");
    expect(carryForwardEligibility(null, null)).toBe("NO_CURRENT_CYCLE");
  });
});

describe("bulkCropSystemEvidence", () => {
  it("changes only the crop system and keeps the old crop and all other evidence", () => {
    const previousCrop = { value: "GRASS_GRAZING" as const, method: "FARMER_DECLARED" as const, source: "Keith" };
    const target = { value: 5, method: "FARMER_DECLARED" as const, source: "Keith" };
    const nitrogen = { value: 40, method: "RECORDED" as const, source: "Job" };
    const evidence = bulkCropSystemEvidence({ cropSystem: previousCrop, productionTargetTDMHa: target, chemicalNAppliedKgHa: nitrogen }, "GRASS_HAY", "Keith", AT);
    expect(evidence.cropSystem).toEqual({ value: "GRASS_HAY", method: "FARMER_DECLARED", source: "Keith", observedAt: AT, previous: previousCrop });
    expect(evidence.productionTargetTDMHa).toBe(target);
    expect(evidence.chemicalNAppliedKgHa).toBe(nitrogen);
  });
});

describe("carriedForwardEvidence", () => {
  const crop = { value: "GRASS_FIRST_CUT_SILAGE" as const, method: "FARMER_DECLARED" as const, source: "Keith" };

  it("copies recorded settings with the original evidence kept on the chain", () => {
    const target = { value: 5, method: "FARMER_DECLARED" as const, source: "Keith" };
    const evidence = carriedForwardEvidence(cycle({ cropSystem: crop, productionTargetTDMHa: target }), "Keith", AT);
    expect(evidence.productionTargetTDMHa).toEqual({ value: 5, method: "FARMER_DECLARED", source: "Carried forward from 2026 · Keith", observedAt: AT, previous: target });
    expect(evidence.cropSystem?.previous).toBe(crop);
  });

  it("never upgrades the strength of the evidence it copies", () => {
    const assumed = { value: 30, method: "ASSUMED" as const, source: "Sward estimate" };
    const evidence = carriedForwardEvidence(cycle({ cropSystem: crop, whiteCloverPct: assumed }), "Keith", AT);
    expect(evidence.whiteCloverPct?.method).toBe("ASSUMED");
  });

  it("never copies fertiliser already applied or a reseed date", () => {
    const applied = { value: 40, method: "FARMER_DECLARED" as const, source: "Keith" };
    const evidence = carriedForwardEvidence(
      cycle({
        cropSystem: crop,
        chemicalNAppliedKgHa: applied,
        chemicalPAppliedKgHa: applied,
        chemicalKAppliedKgHa: applied,
        reseededOn: { value: "2026-04-01", method: "FARMER_DECLARED", source: "Keith" },
      }),
      "Keith",
      AT,
    );
    expect(Object.keys(evidence)).toEqual(["cropSystem"]);
  });

  it("does not fill in missing evidence", () => {
    const evidence = carriedForwardEvidence(cycle({ cropSystem: crop }), "Keith", AT);
    expect(evidence.productionTargetTDMHa).toBeUndefined();
    expect(evidence.whiteCloverPct).toBeUndefined();
  });

  it("drops out-of-range recorded numbers instead of copying them", () => {
    const evidence = carriedForwardEvidence(
      cycle({
        cropSystem: crop,
        productionTargetTDMHa: { value: -1, method: "FARMER_DECLARED", source: "Keith" },
        whiteCloverPct: { value: 140, method: "FARMER_DECLARED", source: "Keith" },
      }),
      "Keith",
      AT,
    );
    expect(evidence.productionTargetTDMHa).toBeUndefined();
    expect(evidence.whiteCloverPct).toBeUndefined();
  });

  it("keeps a field grazing exception recognisable, and leaves a farm baseline to the farm setting", () => {
    const exception = { value: "OTHER_DRYSTOCK" as const, method: "FARMER_DECLARED" as const, source: "Field exception · Keith" };
    const kept = carriedForwardEvidence(cycle({ grazingProductionSystem: exception }, "GRASS_GRAZING"), "Keith", AT);
    expect(kept.grazingProductionSystem?.source).toBe("Field exception · Carried forward from 2026 · Keith");

    const baseline = { value: "OTHER_DRYSTOCK" as const, method: "FARMER_DECLARED" as const, source: "Keith" };
    const dropped = carriedForwardEvidence(cycle({ grazingProductionSystem: baseline }, "GRASS_GRAZING"), "Keith", AT);
    expect(dropped.grazingProductionSystem).toBeUndefined();
  });

  it("records the confirmed crop when the source cycle has no crop evidence", () => {
    const evidence = carriedForwardEvidence(cycle({}), "Keith", AT);
    expect(evidence.cropSystem).toEqual({ value: "GRASS_FIRST_CUT_SILAGE", method: "FARMER_DECLARED", source: "Carried forward from 2026 · Keith", observedAt: AT });
  });
});

describe("countBulkOutcomes", () => {
  it("counts every outcome so a partial result can't read as a full success", () => {
    expect(
      countBulkOutcomes([{ outcome: "saved" }, { outcome: "saved" }, { outcome: "unchanged" }, { outcome: "skipped_has_target" }, { outcome: "skipped_no_current" }, { outcome: "failed" }]),
    ).toEqual({ total: 6, saved: 2, unchanged: 1, skipped: 2, failed: 1 });
  });
});
