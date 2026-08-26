import { describe, expect, it } from "vitest";
import {
  checkConcentratePCompliance,
  checkFeedCpLegalGate,
  CONCENTRATE_CP_MAX_PCT,
  CONCENTRATE_P_THRESHOLD_KG_PER_92KG_MANURE_N,
  CONCENTRATE_P_THRESHOLD_MANURE_N_REFERENCE_KG,
} from "./concentrate-gates";

describe("checkFeedCpLegalGate", () => {
  it("real statutory cap: 14%", () => {
    expect(CONCENTRATE_CP_MAX_PCT).toBe(14);
  });

  it("GFT026: dairy_cow, at_grass, 15% CP, mid-season -> NON_COMPLIANT (LEGAL_PROHIBITION)", () => {
    const outcome = checkFeedCpLegalGate({ animal: "dairy_cow", atGrass: true, concentrateCpPct: 15, date: "2026-06-15" });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.reasonCode).toBe("CONCENTRATE_CP_SEASONAL_CAP_EXCEEDED");
    }
  });

  it("GFT027: dairy_cow, NOT at grass, mid-winter -> NOT_APPLICABLE_TO_SEASONAL_RULE", () => {
    const outcome = checkFeedCpLegalGate({ animal: "dairy_cow", atGrass: false, concentrateCpPct: 15, date: "2026-12-15" });
    expect(outcome.status).toBe("NOT_APPLICABLE");
    if (outcome.status === "NOT_APPLICABLE") expect(outcome.reasonCode).toBe("NOT_APPLICABLE_TO_SEASONAL_RULE");
  });

  it("GFT143: cattle_2plus, at grass, exactly 14% CP -> COMPLIANT", () => {
    const outcome = checkFeedCpLegalGate({ animal: "cattle_2plus", atGrass: true, concentrateCpPct: 14, date: "2026-05-01" });
    expect(outcome.status).toBe("OK");
  });

  it("GFT144: cattle_2plus, at grass, 14.1% CP -> NON_COMPLIANT", () => {
    const outcome = checkFeedCpLegalGate({ animal: "cattle_2plus", atGrass: true, concentrateCpPct: 14.1, date: "2026-05-01" });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
  });

  it("GFT145: cattle_1_2 (under-2 scope), at grass, 16% CP -> NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE", () => {
    const outcome = checkFeedCpLegalGate({ animal: "cattle_1_2", atGrass: true, concentrateCpPct: 16, date: "2026-05-01" });
    expect(outcome.status).toBe("NOT_APPLICABLE");
    if (outcome.status === "NOT_APPLICABLE") expect(outcome.reasonCode).toBe("NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE");
  });

  it("outside the 15 Apr-30 Sep season window even at grass -> NOT_APPLICABLE_TO_SEASONAL_RULE", () => {
    const outcome = checkFeedCpLegalGate({ animal: "dairy_cow", atGrass: true, concentrateCpPct: 20, date: "2026-04-14" });
    expect(outcome.status).toBe("NOT_APPLICABLE");
  });

  it("season boundary: 15 Apr is IN season, 14 Apr is not", () => {
    expect(checkFeedCpLegalGate({ animal: "dairy_cow", atGrass: true, concentrateCpPct: 14, date: "2026-04-15" }).status).toBe("OK");
    expect(checkFeedCpLegalGate({ animal: "dairy_cow", atGrass: true, concentrateCpPct: 14, date: "2026-04-14" }).status).toBe("NOT_APPLICABLE");
  });
});

describe("checkConcentratePCompliance", () => {
  it("real ratio: 300 kg concentrate per 92 kg manure-N", () => {
    expect(CONCENTRATE_P_THRESHOLD_KG_PER_92KG_MANURE_N).toBe(300);
    expect(CONCENTRATE_P_THRESHOLD_MANURE_N_REFERENCE_KG).toBe(92);
  });

  it("GFT146: concentrate exactly at threshold (300kg @ 92kgN) -> 0 excess P", () => {
    const outcome = checkConcentratePCompliance({ livestockManureNKg: 92, concentrateKg: 300, pContentKgPer100kg: 0.5 });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.thresholdConcentrateKg).toBe(300);
      expect(outcome.value.excessConcentrateKg).toBe(0);
      expect(outcome.value.availablePKg).toBe(0);
    }
  });

  it("GFT147: 100kg excess at the statutory 0.5 kg/100kg default -> 0.5 kg available P", () => {
    const outcome = checkConcentratePCompliance({ livestockManureNKg: 92, concentrateKg: 400, pContentKgPer100kg: 0.5 });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.excessConcentrateKg).toBe(100);
      expect(outcome.value.availablePKg).toBeCloseTo(0.5, 10);
    }
  });

  it("GFT148: threshold scales with manure N (184 kgN -> 600kg threshold)", () => {
    const outcome = checkConcentratePCompliance({ livestockManureNKg: 184, concentrateKg: 700, pContentKgPer100kg: 0.5 });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.thresholdConcentrateKg).toBe(600);
      expect(outcome.value.excessConcentrateKg).toBe(100);
      expect(outcome.value.availablePKg).toBeCloseTo(0.5, 10);
    }
  });

  it("GFT149: known/supplier P content (0.7) outranks the statutory default and scales the excess-P figure", () => {
    const outcome = checkConcentratePCompliance({ livestockManureNKg: 92, concentrateKg: 400, pContentKgPer100kg: 0.7 });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value.availablePKg).toBeCloseTo(0.7, 10);
  });

  it("GFT150: missing manure N blocks the threshold calculation, never assumed zero", () => {
    const outcome = checkConcentratePCompliance({ livestockManureNKg: null, concentrateKg: 400, pContentKgPer100kg: 0.5 });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(outcome.reasonCode).toBe("BLOCK_MISSING_MANURE_N");
  });

  it("concentrate below the threshold contributes zero excess P (never negative)", () => {
    const outcome = checkConcentratePCompliance({ livestockManureNKg: 92, concentrateKg: 200, pContentKgPer100kg: 0.5 });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.excessConcentrateKg).toBe(0);
      expect(outcome.value.availablePKg).toBe(0);
    }
  });
});
