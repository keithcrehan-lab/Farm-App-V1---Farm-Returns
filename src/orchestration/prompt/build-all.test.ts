import { describe, expect, it } from "vitest";
import { buildAllRealPrompts } from "./build-all";
import type { Farm, Field } from "@/domain/types";

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

describe("buildAllRealPrompts", () => {
  it("returns no prompts for an empty field list", () => {
    expect(buildAllRealPrompts(farm, [], "2026-09-01T09:00:00Z")).toEqual([]);
  });

  it("returns exactly four real prompts per field — one per shipped producer", () => {
    const fields = [field({ id: "field-1" }), field({ id: "field-2", name: "River Field" })];
    const prompts = buildAllRealPrompts(farm, fields, "2026-09-01T09:00:00Z");
    expect(prompts).toHaveLength(8);
    const kinds = new Set(prompts.map((p) => p.kind));
    expect(kinds).toEqual(new Set(["spreading_window", "soil_test_age", "commonage_status", "local_buffer_override"]));
  });

  it("every prompt carries the real farmId/fieldId it was built for, never a mismatched one", () => {
    const fields = [field({ id: "field-1", farmId: "farm-1" })];
    const prompts = buildAllRealPrompts(farm, fields, "2026-09-01T09:00:00Z");
    for (const p of prompts) {
      expect(p.farmId).toBe("farm-1");
      expect(p.fieldId).toBe("field-1");
    }
  });
});
