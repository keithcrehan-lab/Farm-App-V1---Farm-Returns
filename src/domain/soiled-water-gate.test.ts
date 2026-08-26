import { describe, expect, it } from "vitest";
import {
  checkSoiledWaterApplicationGate,
  SOILED_WATER_42_DAY_LIMIT_LITRES_PER_HA,
  SOILED_WATER_MAX_RATE_MM_PER_HOUR,
} from "./soiled-water-gate";

describe("checkSoiledWaterApplicationGate", () => {
  it("real statutory limits: 50,000 litres/ha per 42 days, 5 mm/hour", () => {
    expect(SOILED_WATER_42_DAY_LIMIT_LITRES_PER_HA).toBe(50000);
    expect(SOILED_WATER_MAX_RATE_MM_PER_HOUR).toBe(5);
  });

  it("permits a proposed event that keeps the rolling total within the 42-day limit", () => {
    const outcome = checkSoiledWaterApplicationGate({
      areaHa: 1,
      priorApplicationsLitresInWindow: 20000,
      proposedVolumeLitres: 10000,
      applicationRateMmPerHour: 3,
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value.cumulativeLitresPerHa).toBe(30000);
  });

  it("prohibits when the proposed event would push the rolling 42-day total over the limit — checks history, not the event in isolation (AF005)", () => {
    const outcome = checkSoiledWaterApplicationGate({
      areaHa: 1,
      priorApplicationsLitresInWindow: 45000,
      proposedVolumeLitres: 10000,
      applicationRateMmPerHour: 3,
    });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.reasonCode).toBe("SOILED_WATER_42_DAY_LIMIT_EXCEEDED");
    }
  });

  it("prohibits when the application rate alone exceeds 5 mm/hour, even if the volume total is fine", () => {
    const outcome = checkSoiledWaterApplicationGate({
      areaHa: 1,
      priorApplicationsLitresInWindow: 0,
      proposedVolumeLitres: 1000,
      applicationRateMmPerHour: 6,
    });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.reasonCode).toBe("SOILED_WATER_RATE_LIMIT_EXCEEDED");
    }
  });

  it("returns UNKNOWN, never assumes zero, when prior 42-day application history is not known", () => {
    const outcome = checkSoiledWaterApplicationGate({
      areaHa: 1,
      priorApplicationsLitresInWindow: undefined,
      proposedVolumeLitres: 1000,
      applicationRateMmPerHour: 3,
    });
    expect(outcome.status).toBe("UNKNOWN");
    if (outcome.status === "UNKNOWN") expect(outcome.reasonCode).toBe("SOILED_WATER_HISTORY_UNKNOWN");
  });

  it("fails closed on a zero/negative area", () => {
    const outcome = checkSoiledWaterApplicationGate({
      areaHa: 0,
      priorApplicationsLitresInWindow: 0,
      proposedVolumeLitres: 1000,
      applicationRateMmPerHour: 3,
    });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("boundary: exactly 50,000 litres/ha is permitted (<=, not <)", () => {
    const outcome = checkSoiledWaterApplicationGate({
      areaHa: 1,
      priorApplicationsLitresInWindow: 40000,
      proposedVolumeLitres: 10000,
      applicationRateMmPerHour: 5,
    });
    expect(outcome.status).toBe("OK");
  });
});
