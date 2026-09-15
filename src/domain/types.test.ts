import { describe, expect, it } from "vitest";
import { activeFields } from "./types";
import type { Field } from "./types";

/** Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
 * F2) — `activeFields` is the one shared filter every real farm-wide
 * aggregation server-side now applies, matching `useFields()`
 * (farm-store.tsx)'s own client-side default. Direct coverage here,
 * since it's now relied on from several independent call sites. */
function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Field",
    areaHa: 1,
    centroid: [0, 0],
    fertility: {},
    ...overrides,
  } as Field;
}

describe("activeFields", () => {
  it("excludes a real archived field", () => {
    const active = field({ id: "a" });
    const archived = field({ id: "b", archivedAt: "2026-09-01T00:00:00Z" });
    expect(activeFields([active, archived])).toEqual([active]);
  });

  it("keeps every field with no archivedAt at all", () => {
    const fields = [field({ id: "a" }), field({ id: "b" }), field({ id: "c" })];
    expect(activeFields(fields)).toEqual(fields);
  });

  it("returns an empty array, never fabricates a field, when every real field is archived", () => {
    const fields = [field({ id: "a", archivedAt: "2026-01-01T00:00:00Z" }), field({ id: "b", archivedAt: "2026-02-01T00:00:00Z" })];
    expect(activeFields(fields)).toEqual([]);
  });

  it("never mutates the input array", () => {
    const fields = [field({ id: "a" }), field({ id: "b", archivedAt: "2026-09-01T00:00:00Z" })];
    const originalLength = fields.length;
    activeFields(fields);
    expect(fields).toHaveLength(originalLength);
  });
});
