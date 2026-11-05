import { describe, expect, it } from "vitest";
import { groupLiveweightOf, groupLiveweightWords, usableGroupMeanKg } from "./group-liveweight";
import type { GroupAnimalFact } from "./production-advisory";

const animal = (id: string, kg: number | null, at: string | null = "2026-10-01T00:00:00Z"): GroupAnimalFact => ({
  animalId: id,
  dateOfBirth: null,
  sex: null,
  breedKnown: false,
  latestWeightKg: kg,
  latestWeighedAt: kg === null ? null : at,
  weighings: kg === null ? 0 : 1,
});

const STORED = { kg: 999, source: "Farm Return assumption" };

describe("group liveweight — individual records own the group's current weight", () => {
  it("every animal weighed: the mean of their latest weights, with full coverage and the weighing span", () => {
    const w = groupLiveweightOf({ state: "KNOWN", animals: [animal("a", 300, "2026-09-01T00:00:00Z"), animal("b", 340, "2026-10-15T00:00:00Z")] }, STORED);
    expect(w).toEqual({ state: "INDIVIDUAL_FULL", meanKg: 320, weighed: 2, members: 2, oldestAt: "2026-09-01T00:00:00Z", newestAt: "2026-10-15T00:00:00Z" });
    expect(usableGroupMeanKg(w)).toBe(320);
    const words = groupLiveweightWords(w);
    expect(words.value).toBe("320");
    expect(words.detail).toMatch(/all 2 animals weighed/);
  });

  it("the stored legacy group average is ignored once animals are recorded individually (never synchronised)", () => {
    const w = groupLiveweightOf({ state: "KNOWN", animals: [animal("a", 300)] }, STORED);
    expect(usableGroupMeanKg(w)).toBe(300);
    expect(JSON.stringify(w)).not.toMatch(/999/);
  });

  it("partial coverage is a labelled covered average and is NEVER used as the group mean (fail closed)", () => {
    const w = groupLiveweightOf({ state: "KNOWN", animals: [animal("a", 300), animal("b", 320), animal("c", null)] }, STORED);
    expect(w).toMatchObject({ state: "INDIVIDUAL_PARTIAL", coveredMeanKg: 310, weighed: 2, members: 3 });
    expect(usableGroupMeanKg(w)).toBeUndefined();
    const words = groupLiveweightWords(w);
    expect(words.value).toBeNull();
    expect(words.stateLabel).toBe("2 of 3 weighed");
    expect(words.detail).toMatch(/^Partial: the 2 weighed animals average 310 kg/);
    expect(words.detail).toMatch(/isn't the group's average/);
  });

  it("individual animals but none weighed: no figure, and the stored average isn't substituted", () => {
    const w = groupLiveweightOf({ state: "KNOWN", animals: [animal("a", null)] }, STORED);
    expect(w).toEqual({ state: "INDIVIDUAL_NONE", members: 1 });
    expect(usableGroupMeanKg(w)).toBeUndefined();
  });

  it("unreadable animal records: unavailable, never the stored average", () => {
    const w = groupLiveweightOf({ state: "UNAVAILABLE" }, STORED);
    expect(w).toEqual({ state: "INDIVIDUAL_UNAVAILABLE" });
    expect(usableGroupMeanKg(w)).toBeUndefined();
  });

  it("headcount-only groups keep the stored group average as their only fact", () => {
    expect(groupLiveweightOf(undefined, STORED)).toEqual({ state: "GROUP_RECORD", kg: 999, source: "Farm Return assumption" });
    expect(groupLiveweightOf({ state: "KNOWN", animals: [] }, STORED)).toMatchObject({ state: "GROUP_RECORD" });
    expect(groupLiveweightOf(undefined, undefined)).toEqual({ state: "NOT_HELD" });
  });
});
