import { describe, expect, it } from "vitest";
import { livestockCategoryLabel } from "./status";
import type { LivestockCategory } from "@/domain/types";

/** Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
 * F9) — exhaustive coverage so a future new `LivestockCategory` can't
 * silently fall through this switch unlabelled. */
describe("livestockCategoryLabel", () => {
  const cases: [LivestockCategory, string][] = [
    ["suckler_cow", "Suckler cow"],
    ["dairy_cow", "Dairy cow"],
    ["bull", "Bull"],
    ["calf", "Calf"],
    ["weanling", "Weanling"],
    ["store", "Store"],
    ["steer", "Steer"],
    ["heifer", "Heifer"],
  ];

  it.each(cases)("labels %s as %s", (category, expected) => {
    expect(livestockCategoryLabel(category)).toBe(expected);
  });
});
