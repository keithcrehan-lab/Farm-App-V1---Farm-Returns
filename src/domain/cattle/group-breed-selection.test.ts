import { describe, expect, it } from "vitest";
import {
  COMMON_CATTLE_BREEDS, groupBreedDraft, groupBreedValue,
  individualBreedSummary, MIXED_BREEDS_VALUE, type BreedDraft,
} from "./group-breed-selection";

describe("group breed descriptions", () => {
  it("offers common Irish beef and dairy options without hard-coded breed restrictions", () => {
    expect(COMMON_CATTLE_BREEDS.slice(0, 5)).toEqual(["Angus", "Hereford", "Limousin", "Charolais", "Simmental"]);
    expect(COMMON_CATTLE_BREEDS).toContain("Holstein-Friesian");
    expect(groupBreedValue({ mode: "single", first: "Irish Moiled", second: "", complex: "" })).toBe("Irish Moiled");
    expect(groupBreedValue({ mode: "single", first: "Unlisted local breed", second: "", complex: "" })).toBe("Unlisted local breed");
  });

  it("captures a two-breed cross without claiming a 50/50 genetic composition", () => {
    const draft: BreedDraft = { mode: "cross", first: "Limousin", second: "Angus", complex: "" };
    expect(groupBreedValue(draft)).toBe("Limousin × Angus");
    expect(groupBreedDraft("Limousin × Angus")).toEqual(draft);
    expect(groupBreedDraft("Limousin x Angus")).toEqual(draft);
    expect(groupBreedValue({ ...draft, second: "Limousin" })).toBeUndefined();
    expect(groupBreedValue({ ...draft, second: "" })).toBeUndefined();
  });

  it("supports complex crosses and handles length validation", () => {
    const draft = { mode: "complex" as const, first: "", second: "", complex: "Angus × Limousin × Hereford" };
    expect(groupBreedValue(draft)).toBe("Complex cross: Angus × Limousin × Hereford");
    expect(groupBreedDraft("Complex cross: Angus × Limousin × Hereford")).toEqual(draft);
    expect(groupBreedValue({ ...draft, complex: "x".repeat(90) })).toBeUndefined();
    expect(groupBreedValue({ mode: "single", first: "a".repeat(81), second: "", complex: "" })).toBeUndefined();
  });

  it("explicitly distinguishes mixed from unknown, including clearing stale group data", () => {
    expect(groupBreedValue({ mode: "mixed", first: "", second: "", complex: "" })).toBe(MIXED_BREEDS_VALUE);
    expect(groupBreedDraft(MIXED_BREEDS_VALUE).mode).toBe("mixed");
    expect(groupBreedValue({ mode: "unknown", first: "", second: "", complex: "" })).toBeNull();
    expect(groupBreedDraft(null).mode).toBe("unknown");
  });

  it("derives a group summary from individual identities without assigning a breed to unknown animals", () => {
    const members = [
      { breed: "Angus" }, { breed: "Hereford" }, { breed: null }, { breed: "Angus" },
    ];
    expect(groupBreedDraft("Charolais", members).mode).toBe("mixed");
    expect(individualBreedSummary(members)).toBe("2 Angus · 1 Hereford · 1 not recorded");
    expect(groupBreedDraft("Angus", [{ breed: "Limousin" }, { breed: "Limousin" }])).toMatchObject({ mode: "single", first: "Limousin" });
    expect(groupBreedDraft("Angus", [{ breed: null }, { breed: "Limousin" }])).toMatchObject({ mode: "single", first: "Angus" });
  });
});
