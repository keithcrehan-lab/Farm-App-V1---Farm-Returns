import { describe, expect, it } from "vitest";
import type { Prompt } from "@/orchestration/prompt";
import { partitionPlanningPrompts } from "./planning-prompt-adapter";
const make = (id: string, kind: string, fieldId: string, material = "chemical_fertiliser"): Prompt => ({
  id, kind, fieldId, farmId: "farm-1", title: "Spreading window status needs review", description: "Technical evidence", createdAt: "2026-11-10T00:00:00Z",
  regulatory: "compliance_value", basis: { status: "BLOCKED", reasonCode: "closed_period", detail: "closed" },
  inputsSnapshot: { zone: "B", material, asOfDate: "2026-11-10" },
} as unknown as Prompt);
describe("Planning prompt adapter", () => {
  it("consolidates repeated field checks without losing source evidence", () => {
    const result = partitionPlanningPrompts([make("a","spreading_window","f1"), make("b","spreading_window","f2")]);
    expect(result.actionable).toHaveLength(0);
    expect(result.spreadingCompliance).toHaveLength(1);
    expect(result.spreadingCompliance[0].prompts.map(p => p.id)).toEqual(["a","b"]);
  });
  it("keeps different materials separate and other prompts actionable", () => {
    const result = partitionPlanningPrompts([make("a","spreading_window","f1"), make("b","spreading_window","f2","slurry"), make("c","soil_test_age","f3")]);
    expect(result.spreadingCompliance).toHaveLength(2);
    expect(result.actionable.map(p => p.id)).toEqual(["c"]);
  });
});
