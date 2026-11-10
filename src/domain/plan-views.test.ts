import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "./farm-calendar";
import { activeSeasons, grassWalkSuggestion, nowNextLater, promptCategory, seasonTransitions, yearLanes } from "./plan-views";

const e = (over: Partial<CalendarEntry>): CalendarEntry => ({
  id: over.id ?? "x", kind: "job", category: "cattle", title: "Job", startDate: "2026-11-10", endDate: "2026-11-10",
  startTime: null, endTime: null, status: "planned", assignee: null, notes: null, fieldIds: [], source: "farmer", ...over,
});

const closed = e({ id: "c", kind: "season", category: "nutrients", title: "Closed period: slurry and soiled water", startDate: "2026-10-01", endDate: "2027-01-15", source: "app" });

describe("seasons", () => {
  it("finds the seasons running today and when they change", () => {
    expect(activeSeasons([closed], "2026-11-10").map((s) => s.id)).toEqual(["c"]);
    expect(seasonTransitions([closed], "2026-11-01", "2027-03-01")).toEqual([
      { id: "c-end", title: "Spreading reopens: slurry and soiled water", date: "2027-01-16", category: "nutrients" },
    ]);
  });
});

describe("nowNextLater", () => {
  it("buckets open jobs by horizon and keeps overdue jobs in now", () => {
    const h = nowNextLater([
      e({ id: "now", startDate: "2026-11-12", endDate: "2026-11-12" }),
      e({ id: "late", startDate: "2026-11-01", endDate: "2026-11-03" }),
      e({ id: "next", startDate: "2026-11-25", endDate: "2026-11-25" }),
      e({ id: "later", startDate: "2027-02-01", endDate: "2027-02-05" }),
      e({ id: "done", startDate: "2026-11-12", endDate: "2026-11-12", status: "done" }),
      closed,
    ], "2026-11-10");
    expect(h.now.entries.map((x) => x.id).sort()).toEqual(["late", "now"]);
    expect(h.next.entries.map((x) => x.id)).toEqual(["next"]);
    expect(h.later.entries.map((x) => x.id)).toEqual(["later"]);
    expect(h.later.transitions[0].date).toBe("2027-01-16");
  });
});

describe("yearLanes", () => {
  it("packs overlapping seasons into rows and keeps deadlines as markers", () => {
    const lanes = yearLanes([
      e({ id: "housed", kind: "season", title: "Housed", startDate: "2026-11-01", endDate: "2027-03-15" }),
      e({ id: "calving", kind: "season", title: "Calving", startDate: "2027-01-20", endDate: "2027-04-01" }),
      e({ id: "target", kind: "deadline", startDate: "2027-05-01", endDate: "2027-05-01" }),
      e({ id: "short", startDate: "2026-11-12", endDate: "2026-11-13" }),
      closed,
    ], "2026-11-01", "2027-10-31");
    expect(lanes.map((l) => l.category)).toEqual(["cattle", "nutrients"]);
    const cattle = lanes[0];
    expect(cattle.rows).toBe(2);
    expect(cattle.bars.find((b) => b.entry.id === "calving")?.row).toBe(1);
    expect(cattle.bars.find((b) => b.entry.id === "target")?.marker).toBe(true);
    expect(cattle.bars.some((b) => b.entry.id === "short")).toBe(false);
    expect(lanes[1].bars[0].startPct).toBe(0);
  });
});

describe("suggestions", () => {
  it("suggests a grass walk once the last one is a week old, in season", () => {
    expect(grassWalkSuggestion("2026-11-08", "2026-11-10")).toBeNull();
    expect(grassWalkSuggestion("2026-10-22", "2026-11-10")?.detail).toBe("Last walked 19 days ago");
    expect(grassWalkSuggestion(null, "2026-03-02")?.detail).toBe("No grass walk recorded yet");
    expect(grassWalkSuggestion(null, "2026-12-10")).toBeNull();
  });
  it("files app prompts under a category", () => {
    expect(promptCategory("spreading_window", "Best spreading window")).toBe("nutrients");
    expect(promptCategory("soil_test_age", "Soil test due")).toBe("fields");
    expect(promptCategory("x", "Something else")).toBe("other");
  });
});
