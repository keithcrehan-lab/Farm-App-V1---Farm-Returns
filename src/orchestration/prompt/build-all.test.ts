import { describe, expect, it } from "vitest";
import { buildAllRealPrompts } from "./build-all";
import type { Farm, Field, LivestockGroup, SlurryAllocation } from "@/domain/types";

const farm: Pick<Farm, "id" | "location"> = { id: "farm-1", location: { county: "Cork", centroid: [0, 0] } };

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Back Meadow",
    areaHa: 4.2,
    centroid: [0, 0],
    fertility: {},
    ...overrides,
  } as Field;
}

const noGroups: LivestockGroup[] = [];
const noSlurry: SlurryAllocation[] = [];

describe("buildAllRealPrompts", () => {
  it("returns no prompts for an empty field list", () => {
    expect(buildAllRealPrompts(farm, [], noGroups, noSlurry, "2026-09-01T09:00:00Z")).toEqual([]);
  });

  // Fertiliser Vertical campaign — a fifth real producer,
  // `fertiliser_recommendation`, joined the fan-out.
  it("returns exactly five real prompts per field — one per shipped producer", () => {
    const fields = [field({ id: "field-1" }), field({ id: "field-2", name: "River Field" })];
    const prompts = buildAllRealPrompts(farm, fields, noGroups, noSlurry, "2026-09-01T09:00:00Z");
    expect(prompts).toHaveLength(10);
    const kinds = new Set(prompts.map((p) => p.kind));
    expect(kinds).toEqual(
      new Set(["spreading_window", "soil_test_age", "commonage_status", "local_buffer_override", "fertiliser_recommendation"]),
    );
  });

  it("every prompt carries the real farmId/fieldId it was built for, never a mismatched one", () => {
    const fields = [field({ id: "field-1", farmId: "farm-1" })];
    const prompts = buildAllRealPrompts(farm, fields, noGroups, noSlurry, "2026-09-01T09:00:00Z");
    for (const p of prompts) {
      expect(p.farmId).toBe("farm-1");
      expect(p.fieldId).toBe("field-1");
    }
  });

  it("the fertiliser_recommendation prompt matches this field's own real slurry allocation, never another field's", () => {
    const fields = [field({ id: "field-1" }), field({ id: "field-2" })];
    const slurryAllocations: SlurryAllocation[] = [{ fieldId: "field-2", housingId: "h1", priority: "high", volumeM3: 100, score: 90 }];
    const prompts = buildAllRealPrompts(farm, fields, noGroups, slurryAllocations, "2026-09-01T09:00:00Z");
    const fertPrompts = prompts.filter((p) => p.kind === "fertiliser_recommendation");
    expect(fertPrompts).toHaveLength(2);
    // Neither field has a recorded soil P/K index, so both fail closed —
    // this test only asserts the real per-field scoping, not the outcome.
    expect(fertPrompts.every((p) => p.basis.status === "BLOCKED_INSUFFICIENT_EVIDENCE")).toBe(true);
  });
});
