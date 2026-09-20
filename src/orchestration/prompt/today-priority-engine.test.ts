import { describe, expect, it } from "vitest";
import { resolveFarmPriority, type PrioritySituation } from "./today-priority-engine";

describe("resolveFarmPriority — the shared precedence table", () => {
  const cases: Array<[PrioritySituation, string]> = [
    ["evidence_gap", "VERY_LOW"],
    ["healthy", "LOW"],
    ["weak_evidence", "LOW"],
    ["blocked", "MEDIUM"],
    ["actionable", "MEDIUM"],
    ["actionable_time_sensitive", "HIGH"],
  ];

  for (const [situation, expected] of cases) {
    it(`maps "${situation}" to ${expected}`, () => {
      expect(resolveFarmPriority(situation, [], []).priority).toBe(expected);
    });
  }

  it("a pure evidence gap always resolves VERY_LOW regardless of any reasons/blockers passed in", () => {
    const resolution = resolveFarmPriority("evidence_gap", ["some reason"], ["some blocker"]);
    expect(resolution.priority).toBe("VERY_LOW");
  });

  it("carries the caller's real reasons, blockers and evidence summary through unchanged", () => {
    const resolution = resolveFarmPriority("blocked", ["Real requirement exists"], ["Currently in the closed period"], "Official model");
    expect(resolution.reasons).toEqual(["Real requirement exists"]);
    expect(resolution.blockers).toEqual(["Currently in the closed period"]);
    expect(resolution.evidenceSummary).toBe("Official model");
  });

  it("returns the exact agreed farmer-facing label for each priority", () => {
    expect(resolveFarmPriority("actionable_time_sensitive", [], []).priorityLabel).toBe("High priority");
    expect(resolveFarmPriority("actionable", [], []).priorityLabel).toBe("Medium priority");
    expect(resolveFarmPriority("healthy", [], []).priorityLabel).toBe("Low priority");
    expect(resolveFarmPriority("evidence_gap", [], []).priorityLabel).toBe("For later");
  });

  it("evidenceSummary is undefined when the caller has no real evidence tier to report", () => {
    expect(resolveFarmPriority("evidence_gap", [], []).evidenceSummary).toBeUndefined();
  });
});
