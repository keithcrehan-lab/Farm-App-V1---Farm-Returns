import { describe, expect, it } from "vitest";
import { GOAL_DISPLAY, ADMINISTRATION_WITHDRAWAL_DISPLAY, BLOCKER_DISPLAY, COMPLETION_DISPLAY, GAIN_DISPLAY, IDENTITY_DISPLAY, JOB_STATUS_DISPLAY, LATEST_WEIGHT_DISPLAY, MEMBERSHIP_DISPLAY, OBLIGATION_DISPLAY, PREDICTION_DISPLAY, PRIORITY_DISPLAY, PROGRAMME_DISPLAY, READINESS_DISPLAY, RECOMMENDATION_DISPLAY, TARGET_DISPLAY, TREND_DISPLAY, WITHDRAWAL_DISPLAY, displayOf, reasonSentence, type DisplayState } from "./display-states";
import { ageInMonths, formatAdg, formatDate, formatDayMonth, formatEuro, formatEuroPerKg, formatKg, formatMoney, formatSignedKg } from "./format";
import { OBLIGATION_STATES } from "../regulatory";
import { PROGRAMME_OCCURRENCE_STATES } from "../programmes";
import { SYSTEM_PRIORITY_TIERS } from "../../plan";

const TABLES: Record<string, Readonly<Record<string, DisplayState>>> = {
  IDENTITY_DISPLAY,
  MEMBERSHIP_DISPLAY,
  LATEST_WEIGHT_DISPLAY,
  GAIN_DISPLAY,
  TARGET_DISPLAY,
  TREND_DISPLAY,
  PREDICTION_DISPLAY,
  GOAL_DISPLAY,
  WITHDRAWAL_DISPLAY,
  ADMINISTRATION_WITHDRAWAL_DISPLAY,
  PROGRAMME_DISPLAY,
  OBLIGATION_DISPLAY,
  RECOMMENDATION_DISPLAY,
  BLOCKER_DISPLAY,
  JOB_STATUS_DISPLAY,
  READINESS_DISPLAY,
  COMPLETION_DISPLAY,
  PRIORITY_DISPLAY,
};

/** Upstream states that are NOT resolved: they may never use the favourable `good` tone. */
const UNRESOLVED = /UNKNOWN|INSUFFICIENT|CONFLICT|INVALID|UNSUPPORTED|REVIEW|NO_TARGET$|^NONE$|NOT_PROJECTED|NOT_EVALUATED|UNVERIFIED|NO_POLICY|WAITING_FOR_BLOCKER/;

describe("C10 display states — one deliberate display per frozen state", () => {
  it("every display code is unique and names its upstream state", () => {
    const codes = Object.values(TABLES).flatMap((t) => Object.values(t).map((d) => d.code));
    expect(new Set(codes).size).toBe(codes.length);
    for (const [name, t] of Object.entries(TABLES)) for (const [state, d] of Object.entries(t)) expect(d.code.endsWith(`:${state}`), `${name}.${state}`).toBe(true);
  });

  it("no unresolved state renders as good, and every unknown-like state has the unknown, conflict or review tone", () => {
    for (const [name, t] of Object.entries(TABLES)) {
      for (const [state, d] of Object.entries(t)) {
        if (UNRESOLVED.test(state)) {
          expect(d.tone, `${name}.${state}`).not.toBe("good");
          expect(["unknown", "conflict", "review", "risk"], `${name}.${state}`).toContain(d.tone);
        }
      }
    }
  });

  it("the tables are total over the frozen vocabularies they read (runtime check of the compile-time guarantee)", () => {
    expect(Object.keys(OBLIGATION_DISPLAY).sort()).toEqual([...OBLIGATION_STATES].sort());
    expect(Object.keys(PROGRAMME_DISPLAY).sort()).toEqual([...PROGRAMME_OCCURRENCE_STATES].sort());
    expect(Object.keys(PRIORITY_DISPLAY).sort()).toEqual([...SYSTEM_PRIORITY_TIERS].sort());
  });

  it("the distinctions the product promise depends on are distinct displays", () => {
    // unknown ≠ clear; no recommendation ≠ all good; no target ≠ on track; projection ≠ measurement.
    expect(WITHDRAWAL_DISPLAY.UNKNOWN.code).not.toBe(WITHDRAWAL_DISPLAY.CLEAR.code);
    expect(WITHDRAWAL_DISPLAY.UNKNOWN.tone).toBe("unknown");
    expect(RECOMMENDATION_DISPLAY.NO_RECOMMENDATION.tone).toBe("neutral");
    expect(RECOMMENDATION_DISPLAY.NO_RECOMMENDATION.detail).toMatch(/isn't a health or performance check/);
    expect(TARGET_DISPLAY.NO_TARGET.tone).toBe("unknown");
    expect(PREDICTION_DISPLAY.PROJECTED.detail).toMatch(/prediction, not a weighing/);
    expect(BLOCKER_DISPLAY.UNKNOWN.code).not.toBe(BLOCKER_DISPLAY.ACTIVE.code);
  });

  it("an unrecognised upstream state is shown for review, never hidden or defaulted", () => {
    expect(displayOf(WITHDRAWAL_DISPLAY, "SOMETHING_NEW", "WITHDRAWAL")).toMatchObject({ code: "WITHDRAWAL:SOMETHING_NEW", tone: "review" });
  });

  it("reason codes become farmer sentences; unknown codes stay technical", () => {
    expect(reasonSentence("CATTLE_RECOMMENDATION_TRIGGER_WEIGHT_STALE:2026-09-14T10:00:00.000000000Z")).toBe("The latest weight (14 Sep) is older than the staleness setting.");
    expect(reasonSentence("SOME_OTHER_CODE")).toBeNull();
  });
});

describe("C10 display formatting — documented rounding only", () => {
  it("rounds for display and never changes the meaning", () => {
    expect(formatKg(520.5)).toBe("521 kg");
    expect(formatKg(1234.4)).toBe("1,234 kg");
    expect(formatSignedKg(-3.6)).toBe("−4 kg");
    expect(formatSignedKg(32)).toBe("+32 kg");
    expect(formatAdg(1.0816)).toBe("1.08 kg/day");
    expect(formatEuro("1990.22")).toBe("€1,990");
    expect(formatEuro("-41.6", { signed: true })).toBe("−€42");
    expect(formatEuro("113", { signed: true })).toBe("+€113");
    expect(formatEuroPerKg("3.8249")).toBe("€3.82/kg");
    expect(formatMoney("236.4", "EUR")).toBe("€236");
    expect(formatMoney("1236.4", "GBP")).toBe("GBP 1,236"); // never a € sign on another currency
  });
  it("dates are the UTC calendar date of the supplied value — no zone conversion", () => {
    expect(formatDate("2026-10-16T23:59:59Z")).toBe("16 Oct 2026");
    expect(formatDayMonth("2026-12-04")).toBe("4 Dec");
    expect(ageInMonths("2025-08-12", "2026-10-16T09:00:00Z")).toBe(14);
    expect(ageInMonths("2025-08-17", "2026-10-16T09:00:00Z")).toBe(13);
    expect(ageInMonths("2027-01-01", "2026-10-16")).toBeNull();
  });
});
