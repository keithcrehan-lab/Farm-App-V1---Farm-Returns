import { describe, expect, it } from "vitest";
import { CLOSED_PERIOD_CALENDAR_VERSION } from "@/domain/closed-period-calendar";
import { SPREADING_WINDOW_GATE_VERSION } from "@/domain/spreading-window-gate";
import { describeBlockedBasis } from "./index";
import {
  promptForSpreadingWindow,
  SPREADING_WINDOW_PROMPT_KIND,
  type SpreadingWindowFarm,
  type SpreadingWindowField,
} from "./spreading-window";

const createdAt = "2026-08-29T09:00:00Z";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPECTED_CALCULATION_VERSION = `${SPREADING_WINDOW_GATE_VERSION}+${CLOSED_PERIOD_CALENDAR_VERSION}`;

function farm(county: string, id = "farm-1"): SpreadingWindowFarm {
  return { id, location: { county, centroid: [0, 0] } };
}

function field(id = "field-1", farmId = "farm-1", name = "Home Field"): SpreadingWindowField {
  return { id, farmId, name };
}

// Cork is Zone A. Zone A chemical_fertiliser closed period: 09-15 -> 01-29.
const OPEN_DATE_ZONE_A_CHEMICAL = "2026-06-15"; // well outside the closed window
const CLOSED_DATE_ZONE_A_CHEMICAL = "2026-10-01"; // inside 09-15 -> 01-29

describe("promptForSpreadingWindow", () => {
  it("OK/BASELINE_OPEN: an open-calendar date produces the calendar-only claim, naming the evaluated date rather than 'currently'", () => {
    const prompt = promptForSpreadingWindow(farm("Cork"), field(), "chemical_fertiliser", OPEN_DATE_ZONE_A_CHEMICAL, createdAt);

    expect(prompt.id).toMatch(UUID_RE);
    expect(prompt.farmId).toBe("farm-1");
    expect(prompt.fieldId).toBe("field-1");
    expect(prompt.kind).toBe(SPREADING_WINDOW_PROMPT_KIND);
    expect(prompt.createdAt).toBe(createdAt);
    expect(prompt.regulatory).toBe("compliance_value");
    expect(prompt.calculationVersion).toBe(EXPECTED_CALCULATION_VERSION);
    expect(prompt.basis).toEqual({ status: "OK", value: "BASELINE_OPEN", evidenceState: "DERIVED" });
    expect(prompt.title).toBe("Calendar open — Home Field");
    // Codex audit HIGH (audit-logs/20260829T142810Z.md): asOfDate is a
    // caller-supplied, possibly historical/future date.
    expect(prompt.description).toContain(`As of ${OPEN_DATE_ZONE_A_CHEMICAL}, `);
    expect(prompt.description).not.toContain("currently");
    expect(prompt.description).toContain("is not inside the statutory closed period");
    // Codex audit HIGH (audit-logs/20260829T143333Z.md): this producer
    // has no ground input at all and must never claim ground was checked.
    expect(prompt.description).toContain("check ground conditions before spreading");
    expect(prompt.description).toContain("ground/weather conditions, buffer distances, commonage restrictions");
  });

  it("LEGAL_PROHIBITION: a date inside the closed period is prohibited, with the real reason from checkClosedPeriodCalendar", () => {
    const prompt = promptForSpreadingWindow(farm("Cork"), field(), "chemical_fertiliser", CLOSED_DATE_ZONE_A_CHEMICAL, createdAt);

    expect(prompt.basis.status).toBe("LEGAL_PROHIBITION");
    expect(prompt.basis).toMatchObject({ reasonCode: "CLOSED_PERIOD_CALENDAR" });
    expect(prompt.fieldId).toBe("field-1");
    expect(prompt.title).toBe("Spreading window status needs review — Home Field");
    expect(prompt.description).toBe(
      describeBlockedBasis(prompt.basis as Exclude<typeof prompt.basis, { status: "OK" }>),
    );
    expect(prompt.description).toMatch(/^Not permitted:/);
    expect(prompt.description).toContain("closed period");
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: an unrecognised county fails closed rather than assuming a zone", () => {
    const prompt = promptForSpreadingWindow(farm("Atlantis"), field(), "chemical_fertiliser", OPEN_DATE_ZONE_A_CHEMICAL, createdAt);

    expect(prompt.basis).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "MISSING_COUNTY_ZONE",
      missingInputs: ["county"],
    });
    expect(prompt.description).toBe(
      describeBlockedBasis(prompt.basis as Exclude<typeof prompt.basis, { status: "OK" }>),
    );
  });

  it("normalises a 'Co. ' county prefix the same way real-alerts.ts/spreading/page.tsx already do — no spurious MISSING_COUNTY_ZONE", () => {
    const withPrefix = promptForSpreadingWindow(farm("Co. Cork"), field(), "chemical_fertiliser", OPEN_DATE_ZONE_A_CHEMICAL, createdAt);
    const withoutPrefix = promptForSpreadingWindow(farm("Cork"), field(), "chemical_fertiliser", OPEN_DATE_ZONE_A_CHEMICAL, createdAt);

    expect(withPrefix.basis).toEqual(withoutPrefix.basis);
    expect(withPrefix.basis.status).toBe("OK");
  });

  it("inputsSnapshot carries the real raw inputs the domain call was actually fed, including the resolved zone", () => {
    const prompt = promptForSpreadingWindow(farm("Co. Cork"), field(), "chemical_fertiliser", OPEN_DATE_ZONE_A_CHEMICAL, createdAt);

    expect(prompt.inputsSnapshot).toEqual({
      county: "Co. Cork",
      normalisedCounty: "Cork",
      zone: "A",
      material: "chemical_fertiliser",
      asOfDate: OPEN_DATE_ZONE_A_CHEMICAL,
      rule: expect.stringContaining("GFT057-GFT080"),
    });
  });

  it("each call produces a distinct id, even for the same field/date", () => {
    const first = promptForSpreadingWindow(farm("Cork"), field(), "chemical_fertiliser", OPEN_DATE_ZONE_A_CHEMICAL, createdAt);
    const second = promptForSpreadingWindow(farm("Cork"), field(), "chemical_fertiliser", OPEN_DATE_ZONE_A_CHEMICAL, createdAt);
    expect(first.id).not.toBe(second.id);
  });

  it("fieldId/farmId always come from the same field/farm the evidence was read off — a different field's prompt carries that field's own ids", () => {
    const homePrompt = promptForSpreadingWindow(farm("Cork", "farm-1"), field("field-1", "farm-1", "Home Field"), "chemical_fertiliser", OPEN_DATE_ZONE_A_CHEMICAL, createdAt);
    const otherPrompt = promptForSpreadingWindow(farm("Clare", "farm-2"), field("field-2", "farm-2", "Back Meadow"), "chemical_fertiliser", OPEN_DATE_ZONE_A_CHEMICAL, createdAt);

    expect(homePrompt.farmId).toBe("farm-1");
    expect(homePrompt.fieldId).toBe("field-1");
    expect(otherPrompt.farmId).toBe("farm-2");
    expect(otherPrompt.fieldId).toBe("field-2");
  });

  it("throws rather than silently attaching an unrelated farm's county to a field from a different farm", () => {
    expect(() =>
      promptForSpreadingWindow(farm("Cork", "farm-1"), field("field-2", "farm-2", "Back Meadow"), "chemical_fertiliser", OPEN_DATE_ZONE_A_CHEMICAL, createdAt),
    ).toThrow(/belongs to farm "farm-2", not the farm "farm-1"/);
  });

  it("different materials produce different closed-period answers for the same date (chemical_fertiliser's Zone A window opens earlier, 09-15, than organic's, 10-01)", () => {
    // Zone A: chemical_fertiliser closed 09-15 -> 01-29 (already closed);
    // organic_fertiliser_other_than_FYM closed 10-01 -> 01-12 (not yet).
    const date = "2026-09-20";
    const chemical = promptForSpreadingWindow(farm("Cork"), field(), "chemical_fertiliser", date, createdAt);
    const organic = promptForSpreadingWindow(farm("Cork"), field(), "organic_fertiliser_other_than_FYM", date, createdAt);

    expect(chemical.basis.status).toBe("LEGAL_PROHIBITION");
    expect(organic.basis.status).toBe("OK");
  });

  // Codex audit HIGH (audit-logs/20260829T143333Z.md): the default must
  // be the real Irish calendar date (Europe/Dublin), not plain UTC —
  // this test can't control the real clock, but it can assert the
  // default matches the same real-timezone formatter the producer itself
  // uses, not `new Date().toISOString().slice(0, 10)` (which would only
  // coincidentally match, and would diverge for roughly the first hour
  // of each Irish calendar day during Irish Summer Time).
  it("defaults asOfDate to today's real Irish calendar date when not supplied", () => {
    const prompt = promptForSpreadingWindow(farm("Cork"), field(), "chemical_fertiliser", undefined, createdAt);
    const expectedToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(new Date());
    expect(prompt.basis.status).toMatch(/^(OK|LEGAL_PROHIBITION)$/);
    expect(prompt.inputsSnapshot?.asOfDate).toBe(expectedToday);
  });

  // Codex audit HIGH (audit-logs/20260829T135101Z.md): checkClosedPeriodCalendar
  // only ever reads date.slice(5, 10) and never validates the date is real —
  // a malformed/calendar-invalid asOfDate must fail closed before reaching it.
  it("BLOCKED_INSUFFICIENT_EVIDENCE: a calendar-invalid asOfDate (2026-02-30, silently rolled over by Date) fails closed rather than yielding a fabricated OK", () => {
    const prompt = promptForSpreadingWindow(farm("Cork"), field(), "chemical_fertiliser", "2026-02-30", createdAt);

    expect(prompt.basis).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "UNKNOWN_BLOCK",
      missingInputs: ["date"],
    });
    expect(prompt.description).toBe(
      describeBlockedBasis(prompt.basis as Exclude<typeof prompt.basis, { status: "OK" }>),
    );
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: a non-YYYY-MM-DD asOfDate fails closed", () => {
    const prompt = promptForSpreadingWindow(farm("Cork"), field(), "chemical_fertiliser", "15 June 2026", createdAt);
    expect(prompt.basis).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "UNKNOWN_BLOCK",
      missingInputs: ["date"],
    });
  });
});
