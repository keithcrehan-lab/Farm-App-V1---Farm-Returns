import { describe, expect, it } from "vitest";
import {
  identicalGroupMembers, parseGroupBreedBulk,
} from "./group-breed-bulk";

const G = "6a000000-0000-4000-8000-000000000001";
const A = "a1000000-0000-4000-8000-000000000001";
const B = "a1000000-0000-4000-8000-000000000002";

describe("bulk breed correction request", () => {
  it("only accepts explicit specific breeds for a known member list", () => {
    expect(parseGroupBreedBulk({ groupId: G, breed: "Limousin × Angus", expectedAnimalIds: [A, B] })).toEqual({
      groupId: G, breed: "Limousin × Angus", expectedAnimalIds: [A, B],
    });
    expect(parseGroupBreedBulk({ groupId: G, breed: "Mixed breeds", expectedAnimalIds: [A] })).toBeNull();
    expect(parseGroupBreedBulk({ groupId: G, breed: "Not known", expectedAnimalIds: [A] })).toBeNull();
    expect(parseGroupBreedBulk({ groupId: G, breed: "Angus", expectedAnimalIds: [] })).toBeNull();
    expect(parseGroupBreedBulk({ groupId: G, breed: "Angus", expectedAnimalIds: [A, A] })).toBeNull();
    expect(parseGroupBreedBulk({ groupId: G, breed: "a".repeat(81), expectedAnimalIds: [A] })).toBeNull();
    expect(parseGroupBreedBulk({ groupId: B, breed: "Angus", expectedAnimalIds: [A], farmId: G })).toBeNull();
  });

  it("requires exact current membership, not merely the same headcount", () => {
    expect(identicalGroupMembers([A, B], [B, A])).toBe(true);
    expect(identicalGroupMembers([A, B], [A, G])).toBe(false);
    expect(identicalGroupMembers([A], [A, B])).toBe(false);
  });
});
