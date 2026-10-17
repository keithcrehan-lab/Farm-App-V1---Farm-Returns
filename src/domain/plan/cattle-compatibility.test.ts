/**
 * Plan compatibility amendment (C8P1, cattle campaign). Pins the additive
 * Plan kernel vocabulary C9 needs — cattle subject types, FARM_RETURN
 * OBLIGATION / RECOMMENDATION / COMPOSITE reasons, the ROUTINE_MANAGEMENT
 * tier and the VERSIONED_SOURCE hard-deadline authority — and that every
 * existing member keeps its meaning. Plan imports no cattle module.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AssessmentFingerprint } from "../assessment-integrity";
import { isSameSubject, SUBJECT_TYPE_NOTES, subjectRef, type SubjectRef, type SubjectType } from "../subject";
import { NO_DEPENDENCIES } from "./dependencies";
import { addSupportingReason, createPlanJob, planJobIdentityKey, type PlanCreationSource, type PlanJobInput } from "./job";
import { compareSystemPriority, SYSTEM_PRIORITY_TIERS, systemPriorityRank, type SystemPriorityTier } from "./priority";
import { normaliseSubjects, scopeIdentityKey, subjectKey } from "./scope";
import { makeJob, NOW } from "./test-fixtures";
import { hardDeadline, NO_TIMING, recommendedWindow, type HardDeadlineAuthority } from "./timing";
import { PLAN_KERNEL_VERSION } from "./version";

const FINGERPRINT: AssessmentFingerprint = { schemaVersion: 1, algorithm: "SHA-256", digest: "a".repeat(64) };

function input(overrides: Partial<PlanJobInput> = {}): PlanJobInput {
  return {
    id: "c1",
    actionKey: "TEST_ACTION",
    title: "Test job",
    creationSource: { kind: "FARM_RETURN", reason: "DATA_GAP" },
    scope: { kind: "STATIC", members: [subjectRef("CATTLE_ANIMAL", "fr-1")] },
    completionContract: { kind: "MANUAL" },
    timing: NO_TIMING,
    dependencies: NO_DEPENDENCIES,
    systemPriority: { tier: "ROUTINE_MANAGEMENT", basis: "test" },
    route: { kind: "NONE", reason: "MANUAL_TASK" },
    ...overrides,
  };
}

/** Compile-time exhaustiveness fixture: adding a SubjectType without a case fails typecheck. */
function subjectTypeCase(type: SubjectType): string {
  switch (type) {
    case "FARM":
    case "FIELD":
    case "ANIMAL":
    case "ANIMAL_GROUP":
    case "CATTLE_ANIMAL":
    case "CATTLE_GROUP":
    case "MACHINE":
    case "BUILDING":
    case "INPUT":
    case "STORAGE":
      return type;
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
}

const ALL_SUBJECT_TYPES: SubjectType[] = [
  "FARM", "FIELD", "ANIMAL", "ANIMAL_GROUP", "CATTLE_ANIMAL", "CATTLE_GROUP", "MACHINE", "BUILDING", "INPUT", "STORAGE",
];

describe("cattle subject types", () => {
  const pairs: Array<[SubjectRef, SubjectRef]> = [
    [subjectRef("CATTLE_ANIMAL", "x1"), subjectRef("ANIMAL", "x1")],
    [subjectRef("CATTLE_GROUP", "x1"), subjectRef("ANIMAL_GROUP", "x1")],
    [subjectRef("CATTLE_ANIMAL", "x1"), subjectRef("CATTLE_GROUP", "x1")],
  ];

  it("a cattle ref and a V1 ref with the same id are different subjects", () => {
    for (const [a, b] of pairs) {
      expect(isSameSubject(a, b)).toBe(false);
      expect(subjectKey(a)).not.toBe(subjectKey(b));
      expect(normaliseSubjects([a, b])).toHaveLength(2);
      expect(scopeIdentityKey({ kind: "STATIC", members: [a] })).not.toBe(scopeIdentityKey({ kind: "STATIC", members: [b] }));
      expect(
        scopeIdentityKey({ kind: "DYNAMIC", selector: { kind: "MEMBERS_OF", parent: a, memberType: "CATTLE_ANIMAL" }, additions: "FOLLOW_ON_WORK" }),
      ).not.toBe(
        scopeIdentityKey({ kind: "DYNAMIC", selector: { kind: "MEMBERS_OF", parent: b, memberType: "CATTLE_ANIMAL" }, additions: "FOLLOW_ON_WORK" }),
      );
    }
  });

  it("positive control: the same cattle type and id is the same subject and deduplicates", () => {
    const a = subjectRef("CATTLE_ANIMAL", "x1");
    const b = subjectRef("CATTLE_ANIMAL", "x1");
    expect(isSameSubject(a, b)).toBe(true);
    expect(subjectKey(a)).toBe(subjectKey(b));
    expect(normaliseSubjects([a, b])).toEqual([a]);
  });

  it("documents every SubjectType; cattle notes name the C1 identity and disclaim the V1 one", () => {
    expect(Object.keys(SUBJECT_TYPE_NOTES).sort()).toEqual([...ALL_SUBJECT_TYPES].sort());
    for (const type of ALL_SUBJECT_TYPES) {
      expect(subjectTypeCase(type)).toBe(type);
      expect(SUBJECT_TYPE_NOTES[type]).toBeTruthy();
    }
    expect(SUBJECT_TYPE_NOTES.CATTLE_ANIMAL).toContain("FarmReturnAnimalId");
    expect(SUBJECT_TYPE_NOTES.CATTLE_ANIMAL).toContain("not IndividualAnimal.id");
    expect(SUBJECT_TYPE_NOTES.CATTLE_GROUP).toContain("MANAGEMENT_GROUP");
    expect(SUBJECT_TYPE_NOTES.CATTLE_GROUP).toContain("not LivestockGroup.id");
  });

  it("existing V1 subject notes are unchanged", () => {
    expect(SUBJECT_TYPE_NOTES.ANIMAL).toBe("IndividualAnimal (src/domain/types.ts)");
    expect(SUBJECT_TYPE_NOTES.ANIMAL_GROUP).toBe("LivestockGroup (src/domain/types.ts) — already the AnimalGroup anchor");
  });
});

describe("FARM_RETURN creation reasons", () => {
  const sources: PlanCreationSource[] = [
    { kind: "FARM_RETURN", reason: "OBLIGATION" },
    { kind: "FARM_RETURN", reason: "RECOMMENDATION" },
    { kind: "FARM_RETURN", reason: "COMPOSITE" },
  ];

  it("each new reason round-trips through createPlanJob and JOB_CREATED unchanged", () => {
    for (const source of sources) {
      const { job, events } = createPlanJob(input({ creationSource: source }), NOW);
      expect(job.creationSource).toEqual(source);
      expect(events).toEqual([{ jobId: "c1", at: NOW, kernelVersion: PLAN_KERNEL_VERSION, type: "JOB_CREATED", source }]);
    }
  });

  it("existing reasons and kinds still round-trip unchanged", () => {
    const existing: PlanCreationSource[] = [
      { kind: "FARM_RETURN", reason: "ROUTINE" },
      { kind: "FARM_RETURN", reason: "SEASONAL" },
      { kind: "FARM_RETURN", reason: "DATA_GAP" },
      { kind: "FARM_RETURN", reason: "PROGRAMME" },
      { kind: "ADVISER_APPROVED", recommendationRef: "r1" },
      { kind: "FARMER_MANUAL" },
      { kind: "FOLLOW_ON", sourceJobId: "j0" },
    ];
    for (const source of existing) {
      const { job, events } = createPlanJob(input({ creationSource: source }), NOW);
      expect(job.creationSource).toEqual(source);
      expect(events[0]).toMatchObject({ type: "JOB_CREATED", source });
    }
  });

  it("a COMPOSITE job keeps every supporting reason it was given; the source carries no origins", () => {
    const reasons = ["origin:obligation:o1", "origin:recommendation:r1", "origin:recommendation:r2"];
    const { job, events } = createPlanJob(
      input({ creationSource: { kind: "FARM_RETURN", reason: "COMPOSITE" }, supportingReasons: [...reasons].reverse() }),
      NOW,
    );
    expect(job.supportingReasons).toEqual(reasons);
    expect(Object.keys(job.creationSource).sort()).toEqual(["kind", "reason"]);
    expect(events[0]).toMatchObject({ source: { kind: "FARM_RETURN", reason: "COMPOSITE" } });
    expect(addSupportingReason(job, "origin:obligation:o2").supportingReasons).toEqual([...reasons, "origin:obligation:o2"].sort());
  });

  it("a recommendation-origin job is never adviser-approved", () => {
    const { job } = createPlanJob(input({ creationSource: { kind: "FARM_RETURN", reason: "RECOMMENDATION" } }), NOW);
    expect(job.creationSource.kind).toBe("FARM_RETURN");
    expect(job.creationSource.kind).not.toBe("ADVISER_APPROVED");
  });
});

describe("ROUTINE_MANAGEMENT tier", () => {
  const ORIGINAL: SystemPriorityTier[] = ["HARD_OBLIGATION", "AVOID_MATERIAL_LOSS", "EXPECTED_NET_RETURN", "INFORMATION_VALUE"];

  it("orders last, after INFORMATION_VALUE", () => {
    expect(SYSTEM_PRIORITY_TIERS).toHaveLength(5);
    expect(systemPriorityRank("ROUTINE_MANAGEMENT")).toBe(4);
    for (const tier of ORIGINAL) {
      expect(compareSystemPriority({ tier, basis: "x" }, { tier: "ROUTINE_MANAGEMENT", basis: "y" })).toBeLessThan(0);
      expect(compareSystemPriority({ tier: "ROUTINE_MANAGEMENT", basis: "y" }, { tier, basis: "x" })).toBeGreaterThan(0);
    }
    expect(compareSystemPriority({ tier: "ROUTINE_MANAGEMENT", basis: "a" }, { tier: "ROUTINE_MANAGEMENT", basis: "b" })).toBe(0);
  });

  it("regression: the four original tiers keep ranks 0–3 and their relative order", () => {
    ORIGINAL.forEach((tier, i) => expect(systemPriorityRank(tier)).toBe(i));
    expect(SYSTEM_PRIORITY_TIERS.slice(0, 4)).toEqual(ORIGINAL);
    for (let i = 0; i < ORIGINAL.length - 1; i++) {
      expect(compareSystemPriority({ tier: ORIGINAL[i], basis: "" }, { tier: ORIGINAL[i + 1], basis: "" })).toBeLessThan(0);
    }
  });
});

describe("VERSIONED_SOURCE hard-deadline authority", () => {
  const authority: HardDeadlineAuthority = { kind: "VERSIONED_SOURCE", sourceId: "src-1", version: "v2", contentFingerprint: FINGERPRINT };

  it("round-trips through hardDeadline() and createPlanJob intact", () => {
    const d = hardDeadline("2026-11-01T00:00:00Z", authority);
    expect(d).toEqual({ ok: true, value: { kind: "HARD_DEADLINE", dueIso: "2026-11-01T00:00:00Z", authority } });
    if (!d.ok) throw new Error();
    const { job } = createPlanJob(input({ timing: { recommendedWindow: null, hardDeadline: d.value } }), NOW);
    expect(job.timing.hardDeadline?.authority).toEqual({
      kind: "VERSIONED_SOURCE",
      sourceId: "src-1",
      version: "v2",
      contentFingerprint: { schemaVersion: 1, algorithm: "SHA-256", digest: "a".repeat(64) },
    });
  });

  it("still rejects an invalid due instant", () => {
    expect(hardDeadline("2026-02-30T00:00:00Z", authority)).toEqual({ ok: false, error: "INVALID_DEADLINE" });
    expect(hardDeadline("soon", authority)).toEqual({ ok: false, error: "INVALID_DEADLINE" });
  });
});

describe("existing inputs are unaffected", () => {
  it("dedup identity is unchanged for existing inputs and ignores creation source", () => {
    expect(planJobIdentityKey(makeJob())).toBe("TEST_ACTION|DYNAMIC[ANIMAL_GROUP:g1>ANIMAL]|NO_WINDOW");
    const w = recommendedWindow("2026-10-01T00:00:00Z", null, "b");
    if (!w.ok) throw new Error();
    const staticJob = makeJob({
      scope: { kind: "STATIC", members: [subjectRef("ANIMAL", "a2"), subjectRef("ANIMAL", "a1")] },
      timing: { recommendedWindow: w.value, hardDeadline: null },
    });
    expect(planJobIdentityKey(staticJob)).toBe("TEST_ACTION|STATIC[ANIMAL:a1,ANIMAL:a2]|2026-10-01T00:00:00Z..-");
    expect(planJobIdentityKey(makeJob({ creationSource: { kind: "FARM_RETURN", reason: "COMPOSITE" } }))).toBe(planJobIdentityKey(makeJob()));
  });

  it("a cattle-scoped job and a V1-scoped job with the same ids do not deduplicate", () => {
    const v1 = makeJob({ scope: { kind: "STATIC", members: [subjectRef("ANIMAL", "x1")] } });
    const cattle = makeJob({ scope: { kind: "STATIC", members: [subjectRef("CATTLE_ANIMAL", "x1")] } });
    expect(planJobIdentityKey(v1)).not.toBe(planJobIdentityKey(cattle));
  });
});

describe("dependency rule", () => {
  it("Plan and subject modules import no cattle module", () => {
    const planDir = path.resolve(__dirname);
    const files = [
      ...readdirSync(planDir).filter((f) => f.endsWith(".ts")).map((f) => path.join(planDir, f)),
      path.resolve(planDir, "../subject.ts"),
    ];
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const imports = [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      expect(imports.filter((s) => /(^|\/)cattle(\/|$)/.test(s)), file).toEqual([]);
    }
  });
});
