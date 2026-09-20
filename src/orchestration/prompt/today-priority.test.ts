import { describe, expect, it } from "vitest";
import { countTodayPriorities, priorityForEngineStatus, TODAY_PRIORITY_LABEL, TODAY_PRIORITY_ORDER } from "./today-priority";

describe("priorityForEngineStatus", () => {
  it("maps LEGAL_PROHIBITION to HIGH", () => {
    expect(priorityForEngineStatus("LEGAL_PROHIBITION")).toBe("HIGH");
  });

  it("maps OK to MEDIUM", () => {
    expect(priorityForEngineStatus("OK")).toBe("MEDIUM");
  });

  it("maps AMBIGUOUS and UNKNOWN to LOW", () => {
    expect(priorityForEngineStatus("AMBIGUOUS")).toBe("LOW");
    expect(priorityForEngineStatus("UNKNOWN")).toBe("LOW");
  });

  it("maps BLOCKED_INSUFFICIENT_EVIDENCE to VERY_LOW", () => {
    expect(priorityForEngineStatus("BLOCKED_INSUFFICIENT_EVIDENCE")).toBe("VERY_LOW");
  });

  it("maps NOT_APPLICABLE to undefined — no active item, not a priority", () => {
    expect(priorityForEngineStatus("NOT_APPLICABLE")).toBeUndefined();
  });
});

describe("countTodayPriorities", () => {
  it("counts one active item per category, ignoring categories with no active item", () => {
    const counts = countTodayPriorities(["HIGH", "MEDIUM", undefined, "VERY_LOW"]);
    expect(counts).toEqual({ HIGH: 1, MEDIUM: 1, LOW: 0, VERY_LOW: 1 });
  });

  it("renders an honest all-zero state when nothing is active", () => {
    expect(countTodayPriorities([undefined, undefined, undefined, undefined])).toEqual({ HIGH: 0, MEDIUM: 0, LOW: 0, VERY_LOW: 0 });
  });
});

describe("TODAY_PRIORITY_LABEL", () => {
  it("uses exactly the agreed farmer-facing copy for every band", () => {
    expect(TODAY_PRIORITY_LABEL).toEqual({
      HIGH: "High priority",
      MEDIUM: "Medium priority",
      LOW: "Low priority",
      VERY_LOW: "For later",
    });
  });
});

describe("TODAY_PRIORITY_ORDER", () => {
  it("orders bands from most to least urgent", () => {
    expect(TODAY_PRIORITY_ORDER).toEqual(["HIGH", "MEDIUM", "LOW", "VERY_LOW"]);
  });
});
