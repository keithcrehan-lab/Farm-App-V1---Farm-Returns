import { describe, expect, it } from "vitest";
import { farmConditionsSummary, spreadingCalendarEntry, spreadingCalendarStatusLine } from "./farm-conditions-summary";

describe("farm conditions summary", () => {
  it("keeps the existing closed / open wording for each material", () => {
    const closed = spreadingCalendarEntry({ id: "chemical", label: "Chemical fertiliser", openCount: 0, assessedCount: 3 });
    const partly = spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 1, assessedCount: 3 });
    const open = spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 2, assessedCount: 2 });
    expect(spreadingCalendarStatusLine(closed)).toBe("Chemical fertiliser · Closed period");
    expect(spreadingCalendarStatusLine(partly)).toBe("Slurry · Open 1/3");
    expect(spreadingCalendarStatusLine(open)).toBe("Slurry · Open 2/2");
    expect([closed?.restricted, partly?.restricted, open?.restricted]).toEqual([true, true, false]);
  });

  it("never reports a material with no assessed field — absent, not open and not zero", () => {
    expect(spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 0, assessedCount: 0 })).toBeUndefined();
    expect(spreadingCalendarStatusLine(undefined)).toBeUndefined();
  });

  it("derives the restriction count from the real entries, never a fixed number", () => {
    const chemical = spreadingCalendarEntry({ id: "chemical", label: "Chemical fertiliser", openCount: 0, assessedCount: 2 });
    const slurryClosed = spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 0, assessedCount: 2 });
    const slurryOpen = spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 2, assessedCount: 2 });
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
});
