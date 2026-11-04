import { describe, expect, it } from "vitest";
import { livestockLabelCategoryConflict } from "./livestock-label-category";

describe("livestockLabelCategoryConflict", () => {
  it("flags the audited case: a group labelled weanlings stored as suckler cows", () => {
    expect(
      livestockLabelCategoryConflict({ label: "weanlings", category: "suckler_cow" }),
    ).toEqual({ label: "weanlings", category: "suckler_cow" });
  });

  it.each([
    ["Spring weanlings", "weanling"],
    ["Suckler cows", "suckler_cow"],
    ["Bullocks for finishing", "steer"],
    ["Replacement heifers", "heifer"],
    ["Suckler calves", "calf"],
    ["Stock bull", "bull"],
    ["Group A", "suckler_cow"],
  ] as const)("does not flag %s stored as %s", (label, category) => {
    expect(livestockLabelCategoryConflict({ label, category })).toBeNull();
  });

  it.each([
    ["Cows", "weanling"],
    ["Bullocks", "suckler_cow"],
    ["Calves", "dairy_cow"],
  ] as const)("flags %s stored as %s", (label, category) => {
    expect(livestockLabelCategoryConflict({ label, category })).not.toBeNull();
  });

  it("does not read 'bullock' as a bull", () => {
    expect(livestockLabelCategoryConflict({ label: "bullocks", category: "bull" })).not.toBeNull();
  });
});
