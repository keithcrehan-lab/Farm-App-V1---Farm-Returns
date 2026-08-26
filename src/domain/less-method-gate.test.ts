import { describe, expect, it } from "vitest";
import { checkLessMethodGate, LESS_ARABLE_INCORPORATION_WINDOW_HOURS, LESS_GSR_TRIGGER_KG_N_HA } from "./less-method-gate";

describe("checkLessMethodGate", () => {
  it("real statutory thresholds: GSR trigger 100 kg N/ha, arable incorporation window 24h", () => {
    expect(LESS_GSR_TRIGGER_KG_N_HA).toBe(100);
    expect(LESS_ARABLE_INCORPORATION_WINDOW_HOURS).toBe(24);
  });

  it("GFT052: LESS required at GSR100, method splashplate -> NON_COMPLIANT (LEGAL_PROHIBITION)", () => {
    const outcome = checkLessMethodGate({ material: "cattle_slurry", gsrKgNHa: 100, landUse: "grass", method: "splashplate" });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.reasonCode).toBe("LESS_REQUIRED_GSR100");
    }
  });

  it("GFT053: GSR99 does not trigger the GSR-based rule -> NOT_APPLICABLE", () => {
    const outcome = checkLessMethodGate({ material: "cattle_slurry", gsrKgNHa: 99, landUse: "grass", method: "splashplate" });
    expect(outcome.status).toBe("NOT_APPLICABLE");
  });

  it("GFT054: pig slurry always triggers LESS regardless of GSR -> NON_COMPLIANT with splashplate", () => {
    const outcome = checkLessMethodGate({ material: "pig_slurry", gsrKgNHa: 50, landUse: "grass", method: "splashplate" });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.reasonCode).toBe("LESS_REQUIRED_PIG_SLURRY");
    }
  });

  it("GFT055: arable land, 20h incorporation -> COMPLIANT_ALTERNATIVE", () => {
    const outcome = checkLessMethodGate({ material: "cattle_slurry", landUse: "arable", method: "incorporate_24h", incorporatedWithinHours: 20 });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.result).toBe("COMPLIANT_ALTERNATIVE");
      expect(outcome.value.triggeredBy).toEqual(["LESS_ARABLE"]);
    }
  });

  it("arable land, incorporation beyond 24h does NOT satisfy the alternative -> NON_COMPLIANT", () => {
    const outcome = checkLessMethodGate({ material: "cattle_slurry", landUse: "arable", method: "incorporate_24h", incorporatedWithinHours: 30 });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.reasonCode).toBe("LESS_REQUIRED_ARABLE");
    }
  });

  it("method LESS satisfies any trigger -> COMPLIANT", () => {
    const outcome = checkLessMethodGate({ material: "pig_slurry", landUse: "grass", method: "LESS" });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value.result).toBe("COMPLIANT");
  });

  it("steep-slope H&S exception satisfies the GSR trigger ONLY when both records are confirmed", () => {
    const confirmed = checkLessMethodGate({
      material: "cattle_slurry",
      gsrKgNHa: 120,
      landUse: "grass",
      method: "splashplate",
      steepSlopeHealthSafetyException: { lpisParcelRecorded: true, spreadingDatesRecorded: true },
    });
    expect(confirmed.status).toBe("OK");
    if (confirmed.status === "OK") expect(confirmed.value.result).toBe("COMPLIANT_ALTERNATIVE");

    const unrecorded = checkLessMethodGate({
      material: "cattle_slurry",
      gsrKgNHa: 120,
      landUse: "grass",
      method: "splashplate",
      steepSlopeHealthSafetyException: { lpisParcelRecorded: true, spreadingDatesRecorded: false },
    });
    expect(unrecorded.status).toBe("LEGAL_PROHIBITION");
  });

  it("no material/land-use/GSR trigger at all -> NOT_APPLICABLE regardless of method", () => {
    const outcome = checkLessMethodGate({ material: "sheep_slurry", landUse: "grass", method: "other" });
    expect(outcome.status).toBe("NOT_APPLICABLE");
  });

  it("undefined gsrKgNHa never triggers the GSR rule on its own (cannot assume the threshold is met)", () => {
    const outcome = checkLessMethodGate({ material: "cattle_slurry", landUse: "grass", method: "splashplate" });
    expect(outcome.status).toBe("NOT_APPLICABLE");
  });
});
