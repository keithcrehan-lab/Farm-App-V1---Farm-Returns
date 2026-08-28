import { describe, expect, it } from "vitest";
import {
  applyCloverNLegalCap,
  blockRawDairyCloverPercentage,
  blockRawDrystockCloverPercentage,
  checkCloverFertilityContext,
  dairyCloverAnnualTotalKgNHa,
  distinguishPaddockRateFromWholeFarmAllowance,
  drystockCloverAnnualTotalKgNHa,
  DRYSTOCK_CLOVER_REFERENCE_GSR_KG_N_HA,
  lookupDairyCloverN,
  lookupDrystockCloverN,
  selectCloverSchedule,
} from "./clover-n";

describe("lookupDairyCloverN — advisory_teagasc/clover_n_dairy_2026.csv", () => {
  it("GFT125: grass_sward_no_clover, mid_May -> 32", () => {
    expect(lookupDairyCloverN("grass_sward_no_clover", "mid_May")).toEqual({ status: "OK", value: 32, evidenceState: "IRISH_DEFAULT" });
  });

  it("GFT126: class 5, mid_Jul -> 20", () => {
    expect(lookupDairyCloverN("5", "mid_Jul")).toEqual({ status: "OK", value: 20, evidenceState: "IRISH_DEFAULT" });
  });

  it("GFT127: class 10, mid_Jul -> 10", () => {
    expect(lookupDairyCloverN("10", "mid_Jul")).toEqual({ status: "OK", value: 10, evidenceState: "IRISH_DEFAULT" });
  });

  it("GFT128: class 15, mid_Jul -> 'SW' (soiled water, a real published value, never coerced to 0)", () => {
    expect(lookupDairyCloverN("15", "mid_Jul")).toEqual({ status: "OK", value: "SW", evidenceState: "IRISH_DEFAULT" });
  });

  it("GFT129: class 20, mid_Jun -> 'SW'", () => {
    expect(lookupDairyCloverN("20", "mid_Jun")).toEqual({ status: "OK", value: "SW", evidenceState: "IRISH_DEFAULT" });
  });

  it("GFT130: class 20, mid_Sep -> 15", () => {
    expect(lookupDairyCloverN("20", "mid_Sep")).toEqual({ status: "OK", value: 15, evidenceState: "IRISH_DEFAULT" });
  });

  it("real annual whole-farm totals per class (never confused with a paddock-level footnote — GFT133's own caveat)", () => {
    expect(dairyCloverAnnualTotalKgNHa("grass_sward_no_clover")).toBe(212);
    expect(dairyCloverAnnualTotalKgNHa("5")).toBe(175);
    expect(dairyCloverAnnualTotalKgNHa("10")).toBe(150);
    expect(dairyCloverAnnualTotalKgNHa("15")).toBe(130);
    expect(dairyCloverAnnualTotalKgNHa("20")).toBe(105);
  });
});

describe("lookupDrystockCloverN — advisory_teagasc/clover_n_drystock_2026.csv", () => {
  it("real reference stocking rate: 170 kg N/ha", () => {
    expect(DRYSTOCK_CLOVER_REFERENCE_GSR_KG_N_HA).toBe(170);
  });

  it("GFT135: low_or_none, GSR170, Jun -> 18", () => {
    expect(lookupDrystockCloverN("low_or_none", "Jun", 170)).toEqual({ status: "OK", value: 18, evidenceState: "IRISH_DEFAULT" });
  });

  it("GFT136: april_5pct class (GFT's 'medium'), GSR170, Jun -> 11", () => {
    expect(lookupDrystockCloverN("april_5pct_approx_10pct_annual", "Jun", 170)).toEqual({ status: "OK", value: 11, evidenceState: "IRISH_DEFAULT" });
  });

  it("GFT137: april_10pct_high class, GSR170, Jun -> 0", () => {
    expect(lookupDrystockCloverN("april_10pct_high_approx_15pct_annual", "Jun", 170)).toEqual({ status: "OK", value: 0, evidenceState: "IRISH_DEFAULT" });
  });

  it("GFT138: april_10pct_high class, GSR170, Jul -> 10", () => {
    expect(lookupDrystockCloverN("april_10pct_high_approx_15pct_annual", "Jul", 170)).toEqual({ status: "OK", value: 10, evidenceState: "IRISH_DEFAULT" });
  });

  it("GFT140: wrong GSR scope (120, not the table's 170 reference) -> DO_NOT_APPLY_170_REFERENCE_TABLE_UNQUALIFIED, never silently applied", () => {
    const outcome = lookupDrystockCloverN("april_10pct_high_approx_15pct_annual", "Jun", 120);
    expect(outcome.status).toBe("NOT_APPLICABLE");
    if (outcome.status === "NOT_APPLICABLE") expect(outcome.reasonCode).toBe("DO_NOT_APPLY_170_REFERENCE_TABLE_UNQUALIFIED");
  });

  it("real annual whole-farm totals per class", () => {
    expect(drystockCloverAnnualTotalKgNHa("low_or_none")).toBe(150);
    expect(drystockCloverAnnualTotalKgNHa("april_5pct_approx_10pct_annual")).toBe(112);
    expect(drystockCloverAnnualTotalKgNHa("april_10pct_high_approx_15pct_annual")).toBe(75);
  });
});

describe("applyCloverNLegalCap", () => {
  it("GFT132: legal max (185) overrides a higher advisory strategy figure (212)", () => {
    expect(applyCloverNLegalCap(212, 185)).toBe(185);
  });

  it("an advisory figure already below the legal cap passes through unchanged", () => {
    expect(applyCloverNLegalCap(105, 185)).toBe(105);
  });
});

describe("no-interpolation guards for a raw clover percentage", () => {
  it("GFT131: dairy 12% has no validated classification protocol", () => {
    const outcome = blockRawDairyCloverPercentage();
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("BLOCK_NO_VALIDATED_CLASSIFICATION_PROTOCOL");
    }
  });

  it("GFT139: drystock 7% has no sourced interpolation rule", () => {
    const outcome = blockRawDrystockCloverPercentage();
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("BLOCK_NO_INTERPOLATION");
    }
  });
});

describe("checkCloverFertilityContext — GFT134", () => {
  it("GFT134: P Index 1 and K Index 1 flags fertility context as not ideal", () => {
    const outcome = checkCloverFertilityContext(1, 1);
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("FLAG_FERTILITY_CONTEXT_NOT_IDEAL");
  });

  it("a good fertility context (P/K Index 3) does not flag", () => {
    const outcome = checkCloverFertilityContext(3, 3);
    if (outcome.status === "OK") expect(outcome.value).toBe("FERTILITY_CONTEXT_OK");
    else throw new Error("expected OK");
  });

  it("only flags when BOTH P and K are Index 1 — one poor index alone does not", () => {
    const outcome = checkCloverFertilityContext(1, 3);
    if (outcome.status === "OK") expect(outcome.value).toBe("FERTILITY_CONTEXT_OK");
    else throw new Error("expected OK");
  });
});

describe("selectCloverSchedule — GFT141", () => {
  it("GFT141: a red-clover sward never silently uses the white-clover schedule", () => {
    const outcome = selectCloverSchedule("red_clover");
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("BLOCK_UNSUPPORTED_SCENARIO");
    }
  });

  it("a white-clover sward correctly resolves to the real white-clover schedule", () => {
    const outcome = selectCloverSchedule("white_clover");
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("white_clover");
  });
});

describe("distinguishPaddockRateFromWholeFarmAllowance — GFT133", () => {
  it("GFT133: the 230 kg/ha paddock note and a 212 kg/ha whole-farm total are preserved as two distinct figures, never merged", () => {
    const outcome = distinguishPaddockRateFromWholeFarmAllowance(230, 212);
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.paddockRateKgNHa).toBe(230);
    expect(outcome.value.wholeFarmTotalKgNHa).toBe(212);
    // Never summed, never substituted for one another.
    expect(outcome.value.paddockRateKgNHa).not.toBe(outcome.value.wholeFarmTotalKgNHa);
  });
});
