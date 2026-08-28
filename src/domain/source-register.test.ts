import { describe, expect, it } from "vitest";
import { CURRENT_RULESET, SOURCE_REGISTER, type SourceId } from "./source-register";

const ALL_SOURCE_IDS = Object.keys(SOURCE_REGISTER) as SourceId[];

describe("SOURCE_REGISTER", () => {
  it("has an entry for every SourceId, with the entry's own sourceId matching its key", () => {
    for (const id of ALL_SOURCE_IDS) {
      const entry = SOURCE_REGISTER[id];
      expect(entry).toBeDefined();
      expect(entry.sourceId).toBe(id);
    }
  });

  it("has no duplicate source IDs (object keys are inherently unique, this guards the id<->key invariant)", () => {
    const ids = ALL_SOURCE_IDS;
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry a non-empty authority, title and checkedDate", () => {
    for (const id of ALL_SOURCE_IDS) {
      const entry = SOURCE_REGISTER[id];
      expect(entry.authority.length).toBeGreaterThan(0);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.checkedDate.length).toBeGreaterThan(0);
    }
  });

  it("marks exactly one source SUPERSEDED (the pre-2026 dairy clover strategy)", () => {
    const superseded = ALL_SOURCE_IDS.filter((id) => SOURCE_REGISTER[id].effectiveStatus === "SUPERSEDED");
    expect(superseded).toEqual(["TEAGASC_CLOVER_DAIRY_2026"]);
  });

  it("registers the three engine-internal sources distinctly from external Irish sources", () => {
    const engineInternal = ALL_SOURCE_IDS.filter((id) => SOURCE_REGISTER[id].sourceType === "ENGINE_INTERNAL");
    expect(engineInternal.sort()).toEqual(["ENGINE_AUDIT_RULE", "ENGINE_FAIL_CLOSED", "ENGINE_UNIT_RULE"]);
    for (const id of engineInternal) {
      expect(SOURCE_REGISTER[id].authority).toBe("Farm Return");
    }
  });
});

describe("CURRENT_RULESET", () => {
  it("every cited sourceId resolves in SOURCE_REGISTER", () => {
    for (const id of CURRENT_RULESET.sourceIds) {
      expect(SOURCE_REGISTER[id]).toBeDefined();
    }
  });

  it("cites only CURRENT sources, never a SUPERSEDED one", () => {
    for (const id of CURRENT_RULESET.sourceIds) {
      expect(SOURCE_REGISTER[id].effectiveStatus).toBe("CURRENT");
    }
  });

  it("has a non-empty rulesetId and sourceCheckedAt", () => {
    expect(CURRENT_RULESET.rulesetId.length).toBeGreaterThan(0);
    expect(CURRENT_RULESET.sourceCheckedAt.length).toBeGreaterThan(0);
  });
});
