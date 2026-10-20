/**
 * Cattle C9 — the defence-in-depth checks of C9's finished canonical records
 * (CAT-INV-028 as clarified 2026-10-15). The primary boundary — admission of
 * every raw predecessor operand before derivation — is tested in
 * `plan-adapters.test.ts` (F004 architecture review 2, Outcome C).
 *
 * - A generated mutation matrix over C9's OWN canonical records (never over
 *   the C2 / C4 / C7 / C8 shapes): every observed field is classified here,
 *   independently of the production predicates, and every class-appropriate
 *   malformation (missing, null, wrong type, malformed id / instant /
 *   fingerprint / shared C0 source reference, unknown vocabulary) is rejected.
 *   C9-derived keys (item key, blocker id) are re-derived after each mutation
 *   so the field's own predicate — not a broken relation — must catch it.
 * - The drift guard: a field added to a canonical record without a predicate
 *   is a type error.
 * - Valid-run invariance: valid frozen-engine outputs give exactly the result
 *   they gave before the admission boundary existed.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EMPTY_GOAL_ROUTING_REGISTRY } from "../goals";
import { evidenceCheck, groupScopeCheck, noProposalCheck, viewpointCheck, workItemCheck, GROUP_SCOPE_FIELDS, WORK_ITEM_FIELDS, type Check, type Fields } from "./plan-admission";
import type { CattlePlanGroupScope, CattlePlanResult, CattlePlanWorkItem } from "./plan-contracts";
import { planCattleWork } from "./plan-interface";
import { A, B, GROUP, OBL_FAIL, TRUSTED, defaultOnly, goalDecl, hash, ledgerOf, oblCatalogue, obligations, planRequest, programmeCompletion, programmeDefinition, programmes, weightObs, type Run } from "./plan-test-fixtures";

const OVERDUE: Run = { obligations: obligations(), effectiveAt: "2026-04-15T00:00:00Z", knowledgeCutoff: "2026-04-16T00:00:00Z" };

/** Valid scenarios covering every C9 record kind and family (C2 hard deadline, blockers, folding, C7, C8, C4, evidence). */
const SCENARIOS: Record<string, Run> = {
  default: {},
  overdue: OVERDUE,
  outstanding: { obligations: obligations(), actions: defaultOnly("RESOLVE_OBLIGATION_EVIDENCE") },
  blockedObligation: { ...OVERDUE, obligations: obligations({ catalogue: oblCatalogue({ implementation: OBL_FAIL }) }) },
  programmes: { programmes: programmes(), effectiveAt: "2026-04-15T00:00:00Z", knowledgeCutoff: "2026-04-16T00:00:00Z" },
  programmeCompleted: { programmes: programmes({ completions: [programmeCompletion("SYNTH-OCC", "2026-03-02T00:00:00Z")] }) },
  weights: { weights: { observations: [weightObs("SYNTH-W", "2026-03-01T00:00:00Z")] }, actions: defaultOnly("RECORD_WEIGHT") },
  goals: { goals: { declarations: [goalDecl("SYNTH-GOAL-1")], routingRegistry: EMPTY_GOAL_ROUTING_REGISTRY }, actions: defaultOnly("DECLARE_PRODUCTION_GOAL") },
  full: {
    ...OVERDUE,
    programmes: programmes({ definition: programmeDefinition({ animalIds: [A, B] }) }),
    weights: { observations: [] },
    ledgers: [ledgerOf(A, [{ id: "ga", value: GROUP }]), ledgerOf(B, [{ id: "gb", value: GROUP }])],
    groupScopes: [{ groupRef: GROUP }],
  },
};

/** SHA-256 of each scenario's complete outcome, captured at b9036b4 (before the admission boundary). */
const GOLDEN_B9036B4: Record<string, string> = {
  default: "44ce7571d3f0ac5c54b24ac2bc8b39d75e893c2f5f085b7780068cbdf70236f1",
  overdue: "3bf67aaa7b20ffae5b8b5c7ca3d1291362deec7bd10401191fdd313330131ebb",
  outstanding: "487fb1f4c6386e79813d254e51f5aa3845506105e1896738420991bbfa691409",
  blockedObligation: "85e476917220dbb1ff15a1ff5c8348adce124944adec0306ef721fa9ff8ff238",
  programmes: "4445f66ca44459e0b6d57d4d3fe5e830cb8e626463f94cc876d271210012802a",
  programmeCompleted: "05e87390b34816a3f30f3e401d7633c373a4352dcf3f3de172686b352ece528b",
  weights: "5ecdddc21a61eaf37a9d0585fac6cbac3243145a760b0ca619b834ee207b1a98",
  goals: "34c9edddc77c53d9b05ce56b4649f084d565a8b62b0252d556e429441da3f1bc",
  full: "68c5022881288fb069f38787fbe85564497d330861d5633e9c7b8823a135f78f",
};

function result(r: Run): CattlePlanResult {
  const o = planCattleWork(planRequest(r), hash, TRUSTED);
  if (!o.ok) throw new Error(JSON.stringify(o.issues));
  return structuredClone(o.result);
}
const RESULTS = Object.values(SCENARIOS).map(result);

// ---------------------------------------------------------------------------
// The C9 field classification (test-owned, independent of the production predicates)
// ---------------------------------------------------------------------------

type Cls =
  | "ID" | "NULLABLE_ID" | "OPTIONAL_ID" | "TEXT" | "DIGEST" | "INSTANT" | "FINGERPRINT" | "SOURCE_REF" | "VOCAB" | "LITERAL"
  | "DERIVED" | "CITES" | "ARRAY" | "TUPLE" | "OBJECT" | "NULLABLE_OBJECT" | "EMPTY";

const DELETE = Symbol("DELETE");
type Mutation = [label: string, value: unknown];

function mutationsOf(cls: Cls, v: unknown): Mutation[] {
  const o = v as Record<string, unknown>;
  const fp = { schemaVersion: 1, algorithm: "SHA-256", digest: "0".repeat(64) };
  switch (cls) {
    case "ID": return [["missing", DELETE], ["null", null], ["number", 42], ["array", []], ["empty", ""], ["padded id", " SYNTH-PADDED"]];
    case "NULLABLE_ID": return [["number", 42], ["empty", ""], ["padded id", " SYNTH-PADDED"]];
    case "OPTIONAL_ID": return [["null", null], ["number", 42], ["empty", ""]];
    case "TEXT": return [["missing", DELETE], ["null", null], ["number", 42], ["empty", ""]];
    case "DIGEST": return [["number", 42], ["empty", ""], ["not hex", "SYNTH-NOT-HEX"], ["upper hex", "A".repeat(64)]];
    case "INSTANT": return [["missing", DELETE], ["null", null], ["number", 42], ["impossible date", "2026-02-30T00:00:00Z"], ["not an instant", "SYNTH-NOT-AN-INSTANT"], ["date only", "2026-03-05"]];
    case "FINGERPRINT": return [["missing", DELETE], ["null", null], ["number", 42], ["empty object", {}], ["malformed digest", { ...o, digest: "SYNTH" }], ["extra key", { ...o, extra: 1 }], ["wrong algorithm", { ...o, algorithm: "MD5" }]];
    case "SOURCE_REF": {
      const { contentFingerprint, ...rest } = o;
      return [["missing", DELETE], ["null", null], ["number", 42], ["null sourceId", { ...o, sourceId: null }], ["padded sourceId", { ...o, sourceId: " SYNTH" }], ["empty version", { ...o, version: "" }], ["malformed content fingerprint", { ...o, contentFingerprint: { ...(contentFingerprint as object), digest: "x" } }], ["missing content fingerprint", rest], ["extra key", { ...o, extra: 1 }], ["fingerprint only", fp]];
    }
    case "VOCAB": return [["missing", DELETE], ["null", null], ["number", 42], ["unknown vocabulary", "SYNTH-UNKNOWN-VOCABULARY"]];
    case "LITERAL": return [["null", null], ["number", 42], ["other subject type", "ANIMAL"]];
    case "DERIVED": return [["missing", DELETE], ["null", null], ["number", 42], ["mismatch", "SYNTH-MISMATCH"]];
    case "CITES": return [["missing", DELETE], ["null", null], ["number", 42], ["not json", "SYNTH-NOT-JSON"], ["wrong arity", JSON.stringify(["SYNTH"])], ["padded id", JSON.stringify([" SYNTH", null])]];
    case "ARRAY": return [["missing", DELETE], ["null", null], ["number", 42], ["object", {}], ["string", "SYNTH"]];
    case "TUPLE": return [["missing", DELETE], ["null", null], ["number", 42], ["shortened", (v as unknown[]).slice(0, -1)], ["extended", [...(v as unknown[]), "SYNTH"]]];
    case "OBJECT": return [["missing", DELETE], ["null", null], ["number", 42], ["array", []], ["undeclared key", { ...o, undeclared: "SYNTH" }]];
    case "NULLABLE_OBJECT": return [["missing", DELETE], ["number", 42], ["array", []], ["undeclared key", { ...o, undeclared: "SYNTH" }]];
    case "EMPTY": return [["null", null], ["number", 42], ["any entry", { SYNTH: { status: "UNAVAILABLE", reason: "SYNTH" } }]];
  }
}

const SUPPORT: Record<string, Cls> = {
  "": "OBJECT", ".family": "VOCAB", ".origin": "VOCAB", ".outputId": "ID", ".outputFingerprint": "FINGERPRINT", ".actionKind": "ID", ".consumedState": "ID", ".reasonCodes": "ARRAY", ".reasonCodes[]": "TEXT",
};
const prefixed = (prefix: string, t: Record<string, Cls>) => Object.fromEntries(Object.entries(t).map(([k, c]) => [prefix + k, c]));

const WORK_ITEM: Record<string, Cls> = {
  ".key": "DERIVED", ".family": "VOCAB", ".origin": "VOCAB", ".outputId": "ID", ".outputFingerprint": "FINGERPRINT", ".animalId": "ID", ".cites": "CITES", ".consumedState": "ID",
  ".reasonCodes": "ARRAY", ".reasonCodes[]": "TEXT", ".vocabularyRow": "VOCAB", ".actionKey": "DERIVED",
  ".timing": "OBJECT", ".timing.window": "OBJECT", ".timing.window.opensAt": "INSTANT", ".timing.window.dueAt": "INSTANT", ".timing.window.boundary": "ID", ".timing.windowBasis": "TEXT",
  ".timing.hardDeadline": "NULLABLE_OBJECT", ".timing.hardDeadline.dueIso": "INSTANT", ".timing.hardDeadline.authority": "SOURCE_REF",
  ".timing.sourceChecks": "ARRAY", ".timing.sourceChecks[]": "OBJECT", ".timing.sourceChecks[].bound": "SOURCE_REF", ".timing.sourceChecks[].status": "ID",
  ".blockers": "ARRAY", ".blockers[]": "OBJECT", ".blockers[].id": "DERIVED", ".blockers[].identity": "TUPLE",
  ".blockers[].identity[0]": "ID", ".blockers[].identity[1]": "ID", ".blockers[].identity[2]": "DIGEST", ".blockers[].identity[3]": "ID", ".blockers[].identity[4]": "LITERAL", ".blockers[].identity[5]": "ID", ".blockers[].identity[6]": "NULLABLE_ID",
  ".blockers[].kind": "VOCAB", ".blockers[].status": "VOCAB", ".blockers[].gateState": "ID", ".blockers[].description": "TEXT",
  ".priority": "OBJECT", ".priority.tier": "VOCAB", ".priority.basis": "TEXT",
  ".supporting": "ARRAY", ...prefixed(".supporting[]", SUPPORT),
};
const NO_PROPOSAL: Record<string, Cls> = { ".family": "VOCAB", ".outputId": "ID", ".outputFingerprint": "FINGERPRINT", ".animalId": "ID", ".consumedState": "ID", ".reason": "TEXT" };
const GROUP_SCOPE: Record<string, Cls> = {
  ".groupRef": "ID", ".scopeFingerprint": "FINGERPRINT",
  ".members": "ARRAY", ".members[]": "ID", ".notMembers": "ARRAY", ".notMembers[]": "ID", ".unknown": "ARRAY", ".unknown[]": "ID", ".conflict": "ARRAY", ".conflict[]": "ID", ".invalid": "ARRAY", ".invalid[]": "ID",
};
const SUBJECT = { "": "OBJECT", ".type": "LITERAL", ".id": "ID" } as const;
const EVIDENCE: Record<string, Cls> = {
  ".dataPresence": "OBJECT", ".records": "OBJECT",
  ".dataPresence.*": "OBJECT", ".dataPresence.*.status": "VOCAB", ".dataPresence.*.members": "ARRAY", ".dataPresence.*.members[]": "OBJECT",
  ...prefixed(".dataPresence.*.members[].subject", SUBJECT), ".dataPresence.*.members[].state": "VOCAB", ".dataPresence.*.members[].sourceRecordId": "OPTIONAL_ID",
  ".records.*": "OBJECT", ".records.*.status": "VOCAB", ".records.*.reason": "TEXT", ".records.*.records": "ARRAY", ".records.*.records[]": "OBJECT",
  ".records.*.records[].recordId": "ID", ".records.*.records[].recordKind": "TEXT", ".records.*.records[].subjects": "ARRAY", ...prefixed(".records.*.records[].subjects[]", SUBJECT), ".records.*.records[].occurredAt": "INSTANT",
  ".decisions": "EMPTY",
};
const VIEWPOINT: Record<string, Cls> = { ".effectiveAt": "INSTANT", ".knowledgeCutoff": "INSTANT" };

// ---------------------------------------------------------------------------
// Matrix machinery
// ---------------------------------------------------------------------------

type Path = (string | number)[];
const LEAF_OBJECTS = new Set<Cls>(["FINGERPRINT", "SOURCE_REF", "EMPTY"]);

function normalise(path: Path, dynamicAt: number | null): string {
  return path
    .map((seg, i) => (typeof seg === "number" ? (path[i - 1] === "identity" ? `[${seg}]` : "[]") : dynamicAt !== null && i === dynamicAt ? ".*" : `.${seg}`))
    .join("");
}

function* fieldsOf(v: unknown, table: Record<string, Cls>, dynamicAt: number | null, path: Path = []): Generator<{ path: Path; key: string; cls: Cls; value: unknown }> {
  if (path.length > 0) {
    const key = normalise(path, dynamicAt);
    const cls = table[key];
    if (cls === undefined) throw new Error(`unclassified C9 field ${key}`);
    yield { path, key, cls, value: v };
    if (LEAF_OBJECTS.has(cls)) return;
  }
  if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* fieldsOf(v[i], table, dynamicAt, [...path, i]);
  else if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) yield* fieldsOf(x, table, dynamicAt, [...path, k]);
}

function setAt(root: unknown, path: Path, value: unknown): unknown {
  const copy = structuredClone(root) as Record<string | number, unknown>;
  let parent = copy as Record<string | number, unknown>;
  for (const seg of path.slice(0, -1)) parent = parent[seg] as Record<string | number, unknown>;
  const last = path[path.length - 1];
  if (value === DELETE) {
    if (Array.isArray(parent)) parent.splice(last as number, 1);
    else delete parent[last];
  } else parent[last] = value;
  return copy;
}

/** Re-derives C9's own derived keys (except the mutated one), so only the mutated field's predicate can reject. */
function rederive(item: unknown, mutated: string): unknown {
  const i = item as Record<string, unknown>;
  if (i === null || typeof i !== "object") return i;
  if (mutated !== ".key" && typeof i.family === "string") i.key = JSON.stringify([i.family, i.outputId]);
  if (Array.isArray(i.blockers)) for (const b of i.blockers as Record<string, unknown>[]) if (b && typeof b === "object" && mutated !== ".blockers[].id") b.id = `CATTLE_PLAN_BLOCKER:${JSON.stringify(b.identity)}`;
  return i;
}

function matrix(name: string, check: Check, samples: readonly unknown[], table: Record<string, Cls>, dynamicAt: number | null, derive: (v: unknown, mutated: string) => unknown = (v) => v) {
  const seen = new Set<string>();
  const accepted: string[] = [];
  let count = 0;
  for (const sample of samples) {
    expect(check(sample), `${name}: positive control`).toBeNull();
    for (const f of fieldsOf(sample, table, dynamicAt)) {
      seen.add(f.key);
      for (const [label, value] of mutationsOf(f.cls, f.value)) {
        if (value !== DELETE && JSON.stringify(value) === JSON.stringify(f.value)) continue; // not a mutation of this sample
        if (value === DELETE && (f.key.endsWith("[]") || f.key.endsWith(".*"))) continue; // dropping a list element / map entry leaves a valid, smaller collection
        count += 1;
        if (check(derive(setAt(sample, f.path, value), f.key)) === null) accepted.push(`${f.key} (${f.cls}) ${label}`);
      }
    }
  }
  return { seen, accepted, count };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("C9 admission — generated mutation matrix over C9's own canonical records", () => {
  const items = RESULTS.flatMap((r) => r.workItems);
  const scopes = RESULTS.flatMap((r) => r.scopes);
  const extraScope: CattlePlanGroupScope = { ...scopes[0], notMembers: [A], unknown: [B], conflict: [A], invalid: [B] }; // every list populated
  const totals: Record<string, number> = {};

  it("the samples cover every C9 family, a hard deadline, blockers, a folded restatement, scopes and evidence", () => {
    expect(new Set(items.map((i) => i.family))).toEqual(new Set(["C2_OBLIGATION", "C7_PROGRAMME", "C8_RECOMMENDATION"]));
    expect(items.some((i) => i.timing.hardDeadline !== null)).toBe(true);
    expect(items.some((i) => i.blockers.length > 0)).toBe(true);
    expect(items.some((i) => i.supporting.length > 0)).toBe(true);
    expect(RESULTS.some((r) => r.withoutProposal.length > 0)).toBe(true);
    expect(scopes.length).toBeGreaterThan(0);
  });

  const cases: [string, Check, () => readonly unknown[], Record<string, Cls>, number | null, ((v: unknown, m: string) => unknown) | undefined][] = [
    ["work item", workItemCheck, () => items, WORK_ITEM, null, rederive],
    ["no-proposal record", noProposalCheck, () => RESULTS.flatMap((r) => r.withoutProposal), NO_PROPOSAL, null, undefined],
    ["group scope", groupScopeCheck, () => [...scopes, extraScope], GROUP_SCOPE, null, undefined],
    ["canonical evidence", evidenceCheck, () => RESULTS.map((r) => r.evidence), EVIDENCE, 1, undefined],
    ["viewpoint", viewpointCheck, () => RESULTS.map((r) => ({ effectiveAt: r.effectiveAt, knowledgeCutoff: r.knowledgeCutoff })), VIEWPOINT, null, undefined],
  ];
  it.each(cases)("%s: every class-appropriate malformation of every field is rejected; every classified field is observed", (name, check, samples, table, dynamicAt, derive) => {
    const { seen, accepted, count } = matrix(name, check, samples(), table, dynamicAt, derive);
    expect(accepted).toEqual([]);
    expect([...seen].sort()).toEqual(Object.keys(table).filter((k) => k !== "").sort());
    totals[name] = count;
    expect(count).toBeGreaterThan(Object.keys(table).length);
  });

  it("an undeclared key on any canonical record is rejected at runtime", () => {
    expect(workItemCheck({ ...items[0], undeclared: "SYNTH" })).toBe("undeclared");
    expect(groupScopeCheck({ ...scopes[0], undeclared: "SYNTH" })).toBe("undeclared");
  });
});

describe("C9 admission — drift guard over C9's own canonical contract", () => {
  it("a field added to a canonical record without an admission predicate fails the type gate", () => {
    // @ts-expect-error — `addedField` has no admission predicate: the field tables are exhaustive over the record type.
    const missing: Fields<CattlePlanWorkItem & { addedField: string }> = WORK_ITEM_FIELDS;
    // @ts-expect-error — the same for the group-scope record.
    const missingScope: Fields<CattlePlanGroupScope & { addedField: string[] }> = GROUP_SCOPE_FIELDS;
    // @ts-expect-error — and a predicate for a field the record does not have is rejected too (exact tables).
    const extra = { ...WORK_ITEM_FIELDS, ghost: () => null } satisfies Fields<CattlePlanWorkItem>;
    expect([missing, missingScope, extra].every((t) => typeof t === "object")).toBe(true);
  });
});

describe("C9 admission — valid-run invariance", () => {
  it.each(Object.keys(SCENARIOS))("%s: the complete outcome is byte-identical to b9036b4's", (name) => {
    const out = planCattleWork(planRequest(SCENARIOS[name]), hash, TRUSTED);
    expect(createHash("sha256").update(JSON.stringify(out)).digest("hex")).toBe(GOLDEN_B9036B4[name]);
  });
});
