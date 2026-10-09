import { describe, expect, it } from "vitest";
import { computeAssessmentFingerprint } from "../assessment-integrity";
import { computeCattleFingerprint } from "./integrity";
import { checkSourceBinding, computeSourceContentFingerprint, findSourceVersion, sourceVersionRef } from "./source";
import { CATALOGUE, LEGAL_SOURCE, hash, synthSource } from "./test-fixtures";

describe("cattle source fingerprinting", () => {
  it("is deterministic for semantically identical material", () => {
    const a = computeSourceContentFingerprint({ clause: "synthetic", items: ["x", "y"] }, hash);
    const b = computeSourceContentFingerprint({ clause: "synthetic", items: ["x", "y"] }, hash);
    expect(a).toEqual(b);
    expect(a.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores object-key insertion order (reused canonicalizeValue contract)", () => {
    const a = computeSourceContentFingerprint({ a: 1, b: { c: "x", d: "y" } }, hash);
    const b = computeSourceContentFingerprint({ b: { d: "y", c: "x" }, a: 1 }, hash);
    expect(a).toEqual(b);
  });

  it("changes on material mutation, including array order and value type", () => {
    const base = computeSourceContentFingerprint({ clause: "synthetic", items: ["x", "y"], n: 1 }, hash);
    expect(computeSourceContentFingerprint({ clause: "synthetic!", items: ["x", "y"], n: 1 }, hash).digest).not.toBe(base.digest);
    expect(computeSourceContentFingerprint({ clause: "synthetic", items: ["y", "x"], n: 1 }, hash).digest).not.toBe(base.digest);
    expect(computeSourceContentFingerprint({ clause: "synthetic", items: ["x", "y"], n: "1" }, hash).digest).not.toBe(base.digest);
  });

  it("fails closed on undefined/NaN material instead of dropping it", () => {
    expect(() => computeSourceContentFingerprint({ clause: undefined }, hash)).toThrow();
    expect(() => computeSourceContentFingerprint({ n: Number.NaN }, hash)).toThrow();
  });

  it("never collides with the same payload fingerprinted as a different kind", () => {
    const src = computeSourceContentFingerprint({ a: 1 }, hash);
    expect(src.digest).not.toBe(computeCattleFingerprint("CATTLE_EVIDENCE_PACK", { a: 1 }, hash).digest);
    expect(src.digest).not.toBe(computeAssessmentFingerprint({ a: 1 }, hash).digest);
  });
});

describe("checkSourceBinding", () => {
  const bound = sourceVersionRef(LEGAL_SOURCE);

  it("is CURRENT only on exact id + version + fingerprint with one ACTIVE entry", () => {
    expect(checkSourceBinding(bound, CATALOGUE).status).toBe("CURRENT");
  });

  it("detects a content change under the same version label", () => {
    const changed = synthSource({}, { text: "synthetic clause A (amended)" });
    expect(checkSourceBinding(bound, [changed]).status).toBe("SOURCE_CONTENT_CHANGED");
  });

  it("detects a new version and keeps the old version addressable", () => {
    const old = { ...LEGAL_SOURCE, lifecycle: "SUPERSEDED" as const, supersededByVersion: "v2" };
    const next = synthSource({ version: "v2" }, { text: "synthetic clause A v2" });
    const check = checkSourceBinding(bound, [old, next]);
    expect(check.status).toBe("SOURCE_VERSION_CHANGED");
    expect(check.current?.version).toBe("v2");
    expect(findSourceVersion(bound, [old, next])).toBe(old);
  });

  it("fails closed on missing, review-required, no-active and multiple-active states", () => {
    expect(checkSourceBinding(bound, []).status).toBe("SOURCE_NOT_FOUND");
    expect(checkSourceBinding(bound, [{ ...LEGAL_SOURCE, lifecycle: "REVIEW_REQUIRED" }]).status).toBe("SOURCE_REVIEW_REQUIRED");
    expect(checkSourceBinding(bound, [{ ...LEGAL_SOURCE, lifecycle: "HISTORICAL" }]).status).toBe("SOURCE_NO_ACTIVE_VERSION");
    expect(checkSourceBinding(bound, [LEGAL_SOURCE, synthSource({ version: "v2" })]).status).toBe("SOURCE_MULTIPLE_ACTIVE_VERSIONS");
  });

  it("does not depend on retrieval/check timestamps", () => {
    const rechecked = { ...LEGAL_SOURCE, checkedAt: "2026-06-01T00:00:00Z", retrievedAt: "2026-06-01T00:00:00Z" };
    expect(checkSourceBinding(bound, [rechecked]).status).toBe("CURRENT");
  });
});
