import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, closedPeriodEntries, milestoneEntries, monthGrid, overlaps, validateCalendarEntry, weekStart,
  type CalendarEntryInput,
} from "./farm-calendar";

describe("date helpers", () => {
  it("finds Monday, adds days and months, builds a month grid", () => {
    expect(weekStart("2026-11-10")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addMonths("2026-11-10", 3)).toBe("2027-02-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
    const grid = monthGrid("2026-11-10");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-10-26");
    expect(overlaps({ startDate: "2026-11-01", endDate: "2026-11-30" }, "2026-11-09", "2026-11-15")).toBe(true);
    expect(overlaps({ startDate: "2026-12-01", endDate: "2026-12-02" }, "2026-11-09", "2026-11-15")).toBe(false);
  });
});

describe("closedPeriodEntries", () => {
  it("adds the zone's closed periods that overlap the range, across the year end", () => {
    const entries = closedPeriodEntries("Co. Clare", "2026-11-01", "2027-03-31");
    const slurry = entries.find((e) => e.title.includes("slurry"))!;
    expect(slurry).toMatchObject({ startDate: "2026-10-01", endDate: "2027-01-15", kind: "season", source: "app" });
    expect(entries).toHaveLength(3);
  });

  it("adds nothing for an unknown county", () => {
    expect(closedPeriodEntries("Atlantis", "2026-01-01", "2026-12-31")).toEqual([]);
    expect(closedPeriodEntries(null, "2026-01-01", "2026-12-31")).toEqual([]);
  });
});

describe("milestoneEntries", () => {
  it("turns cattle targets into deadlines linked to the group", () => {
    expect(milestoneEntries([{ groupId: "g1", groupLabel: "Weanlings", targetDate: "2027-03-01", targetWeightKg: 400 }])[0])
      .toMatchObject({ kind: "deadline", startDate: "2027-03-01", href: "/cattle/groups/g1", title: "Weanlings: production target (400 kg)" });
  });
});

describe("validateCalendarEntry", () => {
  const base: CalendarEntryInput = {
    id: "11111111-1111-4111-8111-111111111111", kind: "job", category: "cattle", title: "Dose weanlings",
    startDate: "2026-11-10", endDate: "2026-11-16", startTime: null, endTime: null, status: "planned",
    assignee: null, notes: null, fieldIds: [],
  };
  it("accepts a job window and an appointment", () => {
    expect(validateCalendarEntry(base)).toBeNull();
    expect(validateCalendarEntry({ ...base, kind: "appointment", category: "vet", endDate: "2026-11-10", startTime: "10:00", endTime: "11:30" })).toBeNull();
  });
  it("rejects bad shapes", () => {
    expect(validateCalendarEntry({ ...base, title: " " })).toMatch(/name/);
    expect(validateCalendarEntry({ ...base, endDate: "2026-11-01" })).toMatch(/before/);
    expect(validateCalendarEntry({ ...base, kind: "appointment" })).toMatch(/start time/);
    expect(validateCalendarEntry({ ...base, startTime: "09:00" })).toMatch(/Only appointments/);
    expect(validateCalendarEntry({ ...base, kind: "deadline" })).toMatch(/single day/);
  });
});
