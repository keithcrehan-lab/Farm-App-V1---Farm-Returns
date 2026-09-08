import { describe, expect, it } from "vitest";
import { SUBJECT_TYPE_NOTES, isSameSubject, subjectRef, type SubjectType } from "./subject";

describe("subjectRef", () => {
  it("constructs a plain {type, id} reference", () => {
    expect(subjectRef("FIELD", "field-1")).toEqual({ type: "FIELD", id: "field-1" });
  });

  it("never carries a farmId — resolving a subject against real storage is the only place ownership is checked", () => {
    const ref = subjectRef("ANIMAL", "animal-1");
    expect(Object.keys(ref).sort()).toEqual(["id", "type"]);
  });
});

describe("isSameSubject", () => {
  it("is true only when both type and id match", () => {
    expect(isSameSubject(subjectRef("FIELD", "f1"), subjectRef("FIELD", "f1"))).toBe(true);
  });

  it("is false when the id matches but the type differs — a FIELD and an ANIMAL never collide just because a future id space overlaps", () => {
    expect(isSameSubject(subjectRef("FIELD", "1"), subjectRef("ANIMAL", "1"))).toBe(false);
  });

  it("is false when the type matches but the id differs", () => {
    expect(isSameSubject(subjectRef("FIELD", "f1"), subjectRef("FIELD", "f2"))).toBe(false);
  });
});

describe("SUBJECT_TYPE_NOTES", () => {
  it("documents every SubjectType, so a future variant can't be added without a note explaining its real backing entity", () => {
    const types: SubjectType[] = ["FARM", "FIELD", "ANIMAL", "ANIMAL_GROUP", "MACHINE", "BUILDING", "INPUT", "STORAGE"];
    for (const type of types) {
      expect(SUBJECT_TYPE_NOTES[type]).toBeTruthy();
    }
  });
});
