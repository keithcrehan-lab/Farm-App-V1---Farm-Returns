import { describe, expect, it } from "vitest";
import { checkSpreadingWindowGate } from "./spreading-window-gate";

// Cork is Zone A. Zone A chemical_fertiliser closed period: 09-15 -> 01-29.
const OPEN_DATE = "2026-06-15";
const CLOSED_DATE = "2026-10-01";

describe("checkSpreadingWindowGate", () => {
  it("BASELINE_OPEN: calendar open", () => {
    const outcome = checkSpreadingWindowGate({ county: "Cork", date: OPEN_DATE, material: "chemical_fertiliser" });
    expect(outcome).toEqual({ status: "OK", value: "BASELINE_OPEN", evidenceState: "DERIVED" });
  });

  it("LEGAL_PROHIBITION: the closed-period calendar, real reason unmodified from checkClosedPeriodCalendar", () => {
    const outcome = checkSpreadingWindowGate({ county: "Cork", date: CLOSED_DATE, material: "chemical_fertiliser" });
    expect(outcome).toEqual({
      status: "LEGAL_PROHIBITION",
      reasonCode: "CLOSED_PERIOD_CALENDAR",
      consequence: expect.stringContaining(CLOSED_DATE),
    });
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: delegates an unrecognised county unmodified", () => {
    const outcome = checkSpreadingWindowGate({ county: "Atlantis", date: OPEN_DATE, material: "chemical_fertiliser" });
    expect(outcome).toEqual({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_COUNTY_ZONE", missingInputs: ["county"] });
  });

  // Codex audit HIGH (audit-logs/20260829T135101Z.md): checkClosedPeriodCalendar
  // only ever reads date.slice(5, 10) — it never validates the date is real.
  it("fails closed (UNKNOWN_BLOCK) for a non-YYYY-MM-DD date, never reaching the frozen calendar", () => {
    const outcome = checkSpreadingWindowGate({ county: "Cork", date: "15 June 2026", material: "chemical_fertiliser" });
    expect(outcome).toEqual({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "UNKNOWN_BLOCK", missingInputs: ["date"] });
  });

  it("fails closed (UNKNOWN_BLOCK) for a calendar-invalid date JavaScript's Date silently rolls over (2026-02-30 -> 2 March)", () => {
    const outcome = checkSpreadingWindowGate({ county: "Cork", date: "2026-02-30", material: "chemical_fertiliser" });
    expect(outcome).toEqual({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "UNKNOWN_BLOCK", missingInputs: ["date"] });
  });

  it("fails closed (UNKNOWN_BLOCK) for an empty date string", () => {
    const outcome = checkSpreadingWindowGate({ county: "Cork", date: "", material: "chemical_fertiliser" });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("accepts a real, valid calendar date whose month/day both need zero-padding", () => {
    // 2026-01-05: Zone A chemical_fertiliser closed period wraps 09-15 -> 01-29, so still closed.
    const outcome = checkSpreadingWindowGate({ county: "Cork", date: "2026-01-05", material: "chemical_fertiliser" });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
  });

  it("different materials produce different closed-period answers for the same date", () => {
    // Zone A: chemical_fertiliser closed 09-15 -> 01-29 (already closed on 09-20);
    // organic_fertiliser_other_than_FYM closed 10-01 -> 01-12 (not yet).
    const date = "2026-09-20";
    const chemical = checkSpreadingWindowGate({ county: "Cork", date, material: "chemical_fertiliser" });
    const organic = checkSpreadingWindowGate({ county: "Cork", date, material: "organic_fertiliser_other_than_FYM" });
    expect(chemical.status).toBe("LEGAL_PROHIBITION");
    expect(organic.status).toBe("OK");
  });

  // A year-range guard was built, audited, narrowed, and finally
  // reverted across four real Codex audit rounds
  // (audit-logs/20260829T140705Z.md through 20260829T150329Z.md) — see
  // spreading-window-gate.ts's own doc comment (point 3) for the
  // complete, honest account of why: no real source in this app actually
  // measures which calendar year(s) the extracted closed-period table
  // applies to (source-register.ts's checkedDate measures something
  // else — when the *statute* was last verified current, not the
  // *table's* own year-applicability), and this codebase's own repeated
  // framing elsewhere is that NAP closed periods are a recurring annual
  // pattern by statutory design, not a year-specific one-off table. This
  // test intentionally proves the reverted (real, current) behaviour, not
  // a regression: a query far outside any plausible verification year
  // still reaches the frozen calendar and gets a real, unmodified answer
  // — the same, already-live characteristic real-alerts.ts/
  // spreading/page.tsx already have.
  it("a far-future date still reaches the frozen calendar and gets a real answer — the year-boundary gap is deliberately deferred, not silently patched with an unevidenced guess", () => {
    const outcome = checkSpreadingWindowGate({ county: "Cork", date: "2035-09-20", material: "chemical_fertiliser" });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    expect(outcome).toMatchObject({ reasonCode: "CLOSED_PERIOD_CALENDAR" });
  });
});
