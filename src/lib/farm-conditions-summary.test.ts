import { describe, expect, it } from "vitest";
import { farmConditionsSummary, spreadingCalendarEntry, spreadingCalendarStatusLine } from "./farm-conditions-summary";

describe("farm conditions summary", () => {
  it("keeps the existing closed / open wording for each material", () => {
    const closed = spreadingCalendarEntry({ id: "chemical", label: "Chemical fertiliser", openCount: 0, prohibitedCount: 3, assessedCount: 3 });
    const partly = spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 1, prohibitedCount: 2, assessedCount: 3 });
    const open = spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 2, prohibitedCount: 0, assessedCount: 2 });
    expect(spreadingCalendarStatusLine(closed)).toBe("Chemical fertiliser · Closed period");
    expect(spreadingCalendarStatusLine(partly)).toBe("Slurry · Open 1/3");
    expect(spreadingCalendarStatusLine(open)).toBe("Slurry · Open 2/2");
    expect([closed?.restricted, partly?.restricted, open?.restricted]).toEqual([true, true, false]);
  });

  it("never reports a material with no assessed field — absent, not open and not zero", () => {
    expect(spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 0, prohibitedCount: 0, assessedCount: 0 })).toBeUndefined();
    expect(spreadingCalendarStatusLine(undefined)).toBeUndefined();
  });

  it("derives the restriction count from the real entries, never a fixed number", () => {
    const chemical = spreadingCalendarEntry({ id: "chemical", label: "Chemical fertiliser", openCount: 0, prohibitedCount: 2, assessedCount: 2 });
    const slurryClosed = spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 0, prohibitedCount: 2, assessedCount: 2 });
    const slurryOpen = spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 2, prohibitedCount: 0, assessedCount: 2 });
    expect(farmConditionsSummary([chemical, slurryClosed]).restrictionLabel).toBe("2 restrictions");
    expect(farmConditionsSummary([chemical, slurryOpen]).restrictionLabel).toBe("1 restriction");
    expect(farmConditionsSummary([slurryOpen]).restrictionLabel).toBe("Calendar open");
  });

  it("states honestly when no calendar status exists rather than claiming zero restrictions", () => {
    const summary = farmConditionsSummary([undefined, undefined]);
    expect(summary.entries).toEqual([]);
    expect(summary.restrictionLabel).toBe("Calendar not assessed");
    expect(summary.restrictionLabel).not.toMatch(/0|no restriction/i);
  });

  it("missing county: BLOCKED_INSUFFICIENT_EVIDENCE for both materials is never counted as a restriction", () => {
    // Every field's Prompt is BLOCKED_INSUFFICIENT_EVIDENCE / MISSING_COUNTY_ZONE — neither OK nor LEGAL_PROHIBITION.
    const chemical = spreadingCalendarEntry({ id: "chemical", label: "Chemical fertiliser", openCount: 0, prohibitedCount: 0, assessedCount: 3 });
    const slurry = spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 0, prohibitedCount: 0, assessedCount: 3 });
    const summary = farmConditionsSummary([chemical, slurry]);
    expect(summary.restrictedCount).toBe(0);
    expect(summary.restrictionLabel).toBe("Calendar evidence missing");
    expect(summary.restrictionLabel).not.toMatch(/restriction|open/i);
    expect(spreadingCalendarStatusLine(chemical)).toBe("Chemical fertiliser · Not enough evidence");
    expect([chemical?.restricted, chemical?.unevidenced]).toEqual([false, true]);
  });

  it("counts only evidenced prohibitions when some fields lack evidence", () => {
    const partial = spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 0, prohibitedCount: 1, assessedCount: 3 });
    expect(spreadingCalendarStatusLine(partial)).toBe("Slurry · Closed 1/3 · 2 not enough evidence");
    expect(farmConditionsSummary([partial]).restrictionLabel).toBe("1 restriction");
  });
});
