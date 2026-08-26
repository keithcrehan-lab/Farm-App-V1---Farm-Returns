import { describe, expect, it } from "vitest";
import { checkSpreadingLegalGate } from "./spreading-legal-gate";

describe("checkSpreadingLegalGate", () => {
  it("permits an open-calendar date with no ground/weather issues", () => {
    const outcome = checkSpreadingLegalGate({ county: "Carlow", date: "2026-07-01", material: "chemical_fertiliser" });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("PERMITTED");
  });

  it("GFT057-style: a closed-calendar date is PROHIBITED regardless of ground conditions", () => {
    const outcome = checkSpreadingLegalGate({ county: "Carlow", date: "2026-01-29", material: "chemical_fertiliser" });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") expect(outcome.reasonCode).toBe("CLOSED_PERIOD_CALENDAR");
  });

  it("GFT063/GFT071/GFT079: open calendar but waterlogged ground -> PROHIBITED (calendar alone is not permission)", () => {
    const outcome = checkSpreadingLegalGate({
      county: "Carlow",
      date: "2026-03-01",
      material: "chemical_fertiliser",
      ground: { waterlogged: true },
    });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") expect(outcome.reasonCode).toBe("GROUND_WATERLOGGED");
  });

  it("GFT064/GFT072/GFT080: favourable weather never invents an exception on a closed date — no such input exists to override it", () => {
    // The calendar-closed date alone determines the result; there is no
    // "weather: favourable" parameter anywhere on this function's input.
    const outcome = checkSpreadingLegalGate({ county: "Carlow", date: "2026-01-29", material: "chemical_fertiliser" });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
  });

  it("each of the five statutory ground/weather stops independently prohibits an otherwise-open date", () => {
    const base = { county: "Carlow", date: "2026-07-01", material: "chemical_fertiliser" as const };
    expect(checkSpreadingLegalGate({ ...base, ground: { floodedOrLikelyToFlood: true } }).status).toBe("LEGAL_PROHIBITION");
    expect(checkSpreadingLegalGate({ ...base, ground: { frozenOrSnowCovered: true } }).status).toBe("LEGAL_PROHIBITION");
    expect(checkSpreadingLegalGate({ ...base, ground: { heavyRainForecast48h: true } }).status).toBe("LEGAL_PROHIBITION");
    expect(checkSpreadingLegalGate({ ...base, ground: { steepSlopeSignificantPollutionRisk: true } }).status).toBe("LEGAL_PROHIBITION");
  });

  it("propagates a calendar-level BLOCKED_INSUFFICIENT_EVIDENCE for an unrecognised county", () => {
    const outcome = checkSpreadingLegalGate({ county: "Atlantis", date: "2026-07-01", material: "chemical_fertiliser" });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });
});
