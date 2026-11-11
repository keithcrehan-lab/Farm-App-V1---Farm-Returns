import { describe, expect, it } from "vitest";
import { prioritisePlanningCards } from "./planning-ui-classifier";
import type { Recommendation } from "./recommendations";

const sample = (key: string, priority: number, statutory = false): Recommendation => ({
  key, farmId: "farm-1", source: "grass", category: "opportunity",
  subject: { type: "field", ids: ["field-1"], names: ["Back field"] },
  title: key, explanation: "From recorded grass cover", why: "Measured cover",
  evidence: [{ label: "Plate meter", value: "Recorded", reliability: "verified" }],
  action: { type: "open", label: "View grass", href: "/grass" },
  reliability: "verified", fingerprint: key, dismissible: true,
  statutory, impact: 10, priority, status: "active",
});

describe("farmer-facing planning classification", () => {
  it("prioritises grounded actions without losing their original links", () => {
    const result = prioritisePlanningCards([sample("low", 10), sample("high", 30)], "2026-11-11");
    expect(result.map(r => r.key)).toEqual(["high", "low"]);
    expect(result[0].action).toEqual({ type: "open", label: "View grass", href: "/grass" });
  });
  it("never presents statutory information as an addable recommendation", () => {
    expect(prioritisePlanningCards([sample("restriction", 50, true)], "2026-11-11")).toEqual([]);
  });
});
