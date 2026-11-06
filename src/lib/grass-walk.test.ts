import { describe, expect, it } from "vitest";
import { grassWalkProgress, moveGrassWalkTo, recordGrassWalkReading, skipGrassWalkField, startGrassWalk } from "./grass-walk";

describe("grass walk", () => {
  it("starts on the first field with nothing measured", () => {
    const walk = startGrassWalk(["a", "b", "c"]);
    expect(walk.currentFieldId).toBe("a");
    expect(grassWalkProgress(walk)).toMatchObject({ total: 3, measured: 0, remaining: 3, complete: false });
  });

  it("has no current field for a farm with no fields", () => {
    expect(startGrassWalk([]).currentFieldId).toBeNull();
  });

  it("advances to the next unmeasured field after a reading, then completes", () => {
    let walk = startGrassWalk(["a", "b"]);
    walk = recordGrassWalkReading(walk, "a");
    expect(walk.currentFieldId).toBe("b");
    expect(grassWalkProgress(walk)).toMatchObject({ measured: 1, remaining: 1, remainingFieldIds: ["b"] });
    walk = recordGrassWalkReading(walk, "b");
    expect(walk.currentFieldId).toBeNull();
    expect(grassWalkProgress(walk).complete).toBe(true);
  });

  it("wraps round to an earlier unmeasured field", () => {
    const walk = moveGrassWalkTo(startGrassWalk(["a", "b", "c"]), "c");
    expect(recordGrassWalkReading(walk, "c").currentFieldId).toBe("a");
  });

  it("prefers the GPS field next, unless it has just been measured or is already done", () => {
    const walk = startGrassWalk(["a", "b", "c"]);
    expect(recordGrassWalkReading(walk, "a", "c").currentFieldId).toBe("c");
    expect(recordGrassWalkReading(walk, "a", "a").currentFieldId).toBe("b");
    const afterB = recordGrassWalkReading(moveGrassWalkTo(walk, "b"), "b");
    expect(recordGrassWalkReading(afterB, "c", "b").currentFieldId).toBe("a");
  });

  it("doesn't count a reading twice for the same field", () => {
    const walk = recordGrassWalkReading(recordGrassWalkReading(startGrassWalk(["a", "b"]), "a"), "a");
    expect(grassWalkProgress(walk).measured).toBe(1);
  });

  it("skips a field without counting it, and brings it back once the others are measured", () => {
    let walk = skipGrassWalkField(startGrassWalk(["a", "b"]));
    expect(walk.currentFieldId).toBe("b");
    expect(grassWalkProgress(walk)).toMatchObject({ measured: 0, remaining: 2 });
    walk = recordGrassWalkReading(walk, "b");
    expect(walk.currentFieldId).toBe("a");
    expect(grassWalkProgress(walk).complete).toBe(false);
  });

  it("has no current field when every remaining field is skipped, and a skipped field can be reopened", () => {
    let walk = skipGrassWalkField(skipGrassWalkField(startGrassWalk(["a", "b"])));
    expect(walk.currentFieldId).toBeNull();
    expect(grassWalkProgress(walk).complete).toBe(false);
    walk = moveGrassWalkTo(walk, "a");
    expect(walk.currentFieldId).toBe("a");
    expect(walk.skippedIds).toEqual(["b"]);
  });

  it("won't move to a measured field or one outside the walk", () => {
    const walk = recordGrassWalkReading(startGrassWalk(["a", "b"]), "a");
    expect(moveGrassWalkTo(walk, "a").currentFieldId).toBe("b");
    expect(moveGrassWalkTo(walk, "z").currentFieldId).toBe("b");
  });
});
