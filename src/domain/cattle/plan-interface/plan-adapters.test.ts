/**
 * Cattle C9 — the predecessor adapter boundary (F004 architecture review 2,
 * Outcome C; CAT-INV-028 as clarified 2026-10-15).
 *
 * Every raw C2 / C4 / C7 / C8 operand C9 relies on is admitted into a C9 DTO
 * BEFORE any derivation. Faults are injected into the real frozen engines'
 * in-process outputs at the delegation seam (test-only module seams), exactly
 * where the strict audit injected them.
 */

import { describe, expect, it, vi } from "vitest";

/** Fault injection deliberately writes outside the typed shapes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type Mutate = ((value: Loose) => Loose) | null;
const faults = vi.hoisted(() => ({ c2Calls: 0, c7Calls: 0, c2: null as Mutate, c7: null as Mutate, c8: null as Mutate, c4: null as Mutate }));

// C8 evaluates C2 / C7 itself first; C9's own delegated call is the second one.
vi.mock("../regulatory", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../regulatory")>();
  return {
    ...mod,
    evaluateHerdObligations: (...args: Parameters<typeof mod.evaluateHerdObligations>) => {
      const r = mod.evaluateHerdObligations(...args);
      faults.c2Calls += 1;
      return faults.c2 === null || faults.c2Calls !== 2 || !r.ok ? r : { ok: true, herd: faults.c2(structuredClone(r.herd)) };
    },
  };
});
vi.mock("../programmes", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../programmes")>();
  return {
    ...mod,
    evaluateHealthProgrammes: (...args: Parameters<typeof mod.evaluateHealthProgrammes>) => {
      const r = mod.evaluateHealthProgrammes(...args);
      faults.c7Calls += 1;
      return faults.c7 === null || faults.c7Calls !== 2 || !r.ok ? r : { ok: true, evaluation: faults.c7(structuredClone(r.evaluation)) };
    },
  };
});
vi.mock("../recommendations", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../recommendations")>();
  return {
    ...mod,
    recommendCattle: (...args: Parameters<typeof mod.recommendCattle>) => {
      const r = mod.recommendCattle(...args);
      return faults.c8 === null || !r.ok ? r : { ok: true, result: faults.c8(structuredClone(r.result)) };
    },
  };
});
vi.mock("../weights", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../weights")>();
  return {
    ...mod,
    resolveGroupScope: (...args: Parameters<typeof mod.resolveGroupScope>) => {
      const r = mod.resolveGroupScope(...args);
      return faults.c4 === null || !r.ok ? r : { ok: true, scope: faults.c4(structuredClone(r.scope)) };
    },
  };
});

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { EMPTY_GOAL_ROUTING_REGISTRY } from "../goals";
import { C2_SPEC, C4_SPEC, C7_SPEC, C8_SPEC, VIEWPOINT_SPEC, type C2CountedDto, type C2Dto, type C8Dto } from "./plan-adapters";
import { operand, type C9Ref, type DtoSpec, type NodeSpec } from "./plan-admission";
import type { CattlePlanOutcome } from "./plan-contracts";
import { planCattleWork } from "./plan-interface";
import { obligationActionKey, obligationFulfilmentRecordId } from "./plan-vocabulary";
import {
  A,
  B,
  GROUP,
  ledgerOf,
  OBL_RULE,
  TRUSTED,
  action,
  defaultOnly,
  fulfilment,
  goalDecl,
  hash,
  obligations,
  planRequest,
  programmeCompletion,
  programmeDefinition,
  programmes,
  registry,
  weightObs,
  type Run,
} from "./plan-test-fixtures";

const run = (r: Run): CattlePlanOutcome => planCattleWork(planRequest(r), hash, TRUSTED);

function faulted(set: Partial<typeof faults>, r: Run): CattlePlanOutcome {
  try {
    Object.assign(faults, { c2Calls: 0, c7Calls: 0 }, set);
    return run(r);
  } finally {
    Object.assign(faults, { c2: null, c7: null, c8: null, c4: null });
  }
}

// ---------------------------------------------------------------------------
// Runs that reach every seam
// ---------------------------------------------------------------------------

const OVERDUE: Run = { obligations: obligations(), effectiveAt: "2026-04-15T00:00:00Z", knowledgeCutoff: "2026-04-16T00:00:00Z" };
const SATISFIED: Run = { obligations: obligations({ evidence: [fulfilment()] }), actions: defaultOnly("RESOLVE_OBLIGATION_EVIDENCE"), effectiveAt: "2026-03-08T00:00:00Z", knowledgeCutoff: "2026-03-09T00:00:00Z" };
const PROGRAMME: Run = { programmes: programmes(), effectiveAt: "2026-04-15T00:00:00Z", knowledgeCutoff: "2026-04-16T00:00:00Z" };
/** A real C7 COMPLETED occurrence: a veterinary declaration completing the occurrence the first run reports DUE. */
function programmeDone(): Run {
  const base: Run = { ...PROGRAMME, actions: registry([]) };
  const first = run(base);
  if (!first.ok) throw new Error(JSON.stringify(first.issues));
  const due = first.result.workItems.find((i) => i.family === "C7_PROGRAMME" && i.consumedState === "DUE");
  if (due === undefined || due.cites === null) throw new Error("fixture: no DUE C7 occurrence");
  const occurrenceId = (JSON.parse(due.cites) as string[])[2];
  return { ...base, effectiveAt: "2026-04-18T00:00:00Z", knowledgeCutoff: "2026-04-18T12:00:00Z", programmes: programmes({ completions: [programmeCompletion(occurrenceId, "2026-04-12T00:00:00Z")] }) };
}
const GATES: Run = {
  ...OVERDUE,
  programmes: programmes({ definition: programmeDefinition({ gates: [OBL_RULE] }) }),
  actions: registry([action("SYNTH-SELL", { prerequisites: { sources: ["C2_OBLIGATION"], gateRuleIds: [] } })]),
};
const OUTSTANDING: Run = { obligations: obligations(), actions: defaultOnly("RESOLVE_OBLIGATION_EVIDENCE") };
const WEIGHTS: Run = { weights: { observations: [weightObs("SYNTH-W", "2026-03-01T00:00:00Z")] }, actions: defaultOnly("RECORD_WEIGHT") };
const GOALS: Run = { goals: { declarations: [goalDecl("SYNTH-GOAL-1")], routingRegistry: EMPTY_GOAL_ROUTING_REGISTRY }, actions: defaultOnly("DECLARE_PRODUCTION_GOAL") };
const PROGRAMME_DONE: Run = programmeDone();
/** A C2 record carrying reason codes (an obligation the catalogue does not support). */
const UNSUPPORTED: Run = { ...OVERDUE, obligations: obligations({ ids: ["SYNTH-NOT-CATALOGUED"] }) };

// Selectors over the raw engine outputs (the fault reaches exactly one operand).
const c2Record = (pick: (r: Loose) => boolean, f: (r: Loose) => void) => (herd: Loose) => {
  const r = herd.animals.flatMap((a: Loose) => a.results).find(pick);
  if (r === undefined) throw new Error("fixture: no such C2 record");
  f(r);
  return herd;
};
const c7Record = (pick: (r: Loose) => boolean, f: (r: Loose, p: Loose) => void) => (e: Loose) => {
  for (const p of e.programmes) for (const a of p.animals) for (const r of a.records) if (pick(r)) return (f(r, p), e);
  throw new Error("fixture: no such C7 record");
};
const c8Animal = (f: (a: Loose) => void) => (res: Loose) => (f(res.animals[0]), res);
const satisfied = (r: Loose) => r.state === "SATISFIED";
const windowed = (r: Loose) => r.window !== null;
const completed = (r: Loose) => r.state === "COMPLETED";
const withOccurrence = (r: Loose) => r.occurrence !== null && r.actionId !== null;
const gated = (r: Loose) => r.gates.length > 0;

/** The named regressions of architecture review 2 (one per seam family member). */
const SEAMS: { label: string; set: Partial<typeof faults>; run: Run }[] = [
  // Completion references (the strict-audit F004 and its C7 / C8 equivalents).
  { label: "F004: C2 counted evidenceId missing", set: { c2: c2Record(satisfied, (r) => delete r.evidence.countedEvidence[0].evidenceId) }, run: SATISFIED },
  { label: "C2 counted fulfilledAt null", set: { c2: c2Record(satisfied, (r) => (r.evidence.countedEvidence[0].fulfilledAt = null)) }, run: SATISFIED },
  { label: "C7 counted declarationId missing", set: { c7: c7Record(completed, (r) => delete r.completion.counted[0].declarationId) }, run: PROGRAMME_DONE },
  { label: "C7 counted healthRecordId missing", set: { c7: c7Record(completed, (r) => delete r.completion.counted[0].healthRecordId) }, run: PROGRAMME_DONE },
  { label: "C7 counted completedAt malformed", set: { c7: c7Record(completed, (r) => (r.completion.counted[0].completedAt = "SYNTH-NOT-AN-INSTANT")) }, run: PROGRAMME_DONE },
  { label: "C7 completion collection malformed", set: { c7: c7Record(completed, (r) => (r.completion.counted = { length: 1 })) }, run: PROGRAMME_DONE },
  { label: "C8 weight-series fingerprint digest missing", set: { c8: c8Animal((a) => delete a.context.weights.seriesFingerprint.digest) }, run: WEIGHTS },
  { label: "C8 goal-snapshot fingerprint digest missing", set: { c8: c8Animal((a) => delete a.context.goals.snapshot.fingerprint.digest) }, run: GOALS },
  // Output / occurrence identity (derived ids and evidence keys).
  { label: "C2 obligationId missing on a no-proposal record (output id, evidence key)", set: { c2: c2Record(satisfied, (r) => delete r.obligationId) }, run: SATISFIED },
  { label: "C2 occurrence present without an occurrenceId (occurrence fallback)", set: { c2: c2Record(windowed, (r) => (r.occurrence = {})) }, run: OVERDUE },
  { label: "C7 occurrence without an occurrenceId", set: { c7: c7Record(withOccurrence, (r) => delete r.occurrence.occurrenceId) }, run: PROGRAMME },
  { label: "C7 actionKind missing on a proposal record", set: { c7: c7Record(withOccurrence, (r) => delete r.actionKind) }, run: PROGRAMME },
  // Decisions taken from vocabulary operands (priority, hard deadline, deadline authority, blockers).
  { label: "C2 classification missing (legal priority / hard deadline)", set: { c2: c2Record(windowed, (r) => delete r.classification) }, run: OVERDUE },
  { label: "C2 gateRole outside the published vocabulary", set: { c2: c2Record(windowed, (r) => (r.gateRole = "SYNTH-ROLE")) }, run: OVERDUE },
  { label: "C2 source-check status outside the published vocabulary (deadline authority)", set: { c2: c2Record(windowed, (r) => (r.ruleEvaluation.sourceChecks[0].status = "SYNTH-STATUS")) }, run: OVERDUE },
  { label: "C2 window boundary outside the published vocabulary", set: { c2: c2Record(windowed, (r) => (r.window.boundary = "SYNTH-BOUNDARY")) }, run: OVERDUE },
  { label: "C7 gate source missing", set: { c7: c7Record(gated, (r) => delete r.gates[0].source) }, run: GATES },
  { label: "C7 programme classification missing (priority basis)", set: { c7: c7Record(withOccurrence, (_r, p) => delete p.classification) }, run: PROGRAMME },
  { label: "C8 gate source outside the published vocabulary", set: { c8: c8Animal((a) => (a.candidates.find((c: Loose) => c.gates.checks.length > 0).gates.checks[0].source = "SYNTH-SOURCE")) }, run: GATES },
  // Candidate / action matching.
  {
    label: "C8 proposed action and its candidate both without an actionId",
    set: { c8: c8Animal((a) => (delete a.candidates.find((c: Loose) => c.actionId === a.record.recommendedAction.actionId).actionId, delete a.record.recommendedAction.actionId)) },
    run: OUTSTANDING,
  },
  // B1 structural-equivalence inputs.
  { label: "B1: C8's sealed C2 record fingerprint malformed (same digest)", set: { c8: c8Animal((a) => (a.context.obligations.recordFingerprints[0].algorithm = "MD5")) }, run: OVERDUE },
  { label: "B1: C8's sealed C7 status fingerprint malformed (same digest)", set: { c8: c8Animal((a) => (a.context.programmes.animalStatusFingerprints[0].schemaVersion = 99)) }, run: PROGRAMME },
];

describe("C9 adapter boundary — named seam regressions (architecture review 2)", () => {
  it.each(SEAMS)("$label ⇒ fails closed at its adapter: no result, no proposals, never a throw", ({ set, run: r }) => {
    expect(run(r).ok, "positive control").toBe(true);
    let out: CattlePlanOutcome | undefined;
    expect(() => (out = faulted(set, r))).not.toThrow();
    expect(out!.ok).toBe(false);
    // Rejected by the adapter of the faulted family, naming the raw operand — never by a later, derived check.
    const where = `${Object.keys(set)[0].toUpperCase()}:`;
    expect(out!.ok ? [] : out!.issues).toEqual([{ code: "CATTLE_PLAN_ADMISSION_FAILED", ref: expect.stringMatching(new RegExp(`^${where}`)) }]);
  });
});

// ---------------------------------------------------------------------------
// The generated mutation matrix — from the adapter specs themselves
// ---------------------------------------------------------------------------

type Seg = string | number;
const DELETE = Symbol("DELETE");
type Mutation = [label: string, value: unknown];
const FP = { schemaVersion: 1, algorithm: "SHA-256", digest: "0".repeat(64) };

/** Class-appropriate malformations of one raw operand (a mutation equal to the sample value is skipped). */
function mutationsOf(n: NodeSpec, v: unknown, inList: boolean): Mutation[] {
  const missing: Mutation[] = inList ? [] : [["missing", DELETE]];
  const o = (v ?? {}) as Record<string, unknown>;
  if (n.kind === "list") return [...missing, ["null", null], ["number", 42], ["object", {}], ["string", "SYNTH"]];
  if (n.kind === "variant") return [...missing, ["null", null], ["number", 42], ["array", []]];
  if (n.kind === "object") return [...missing, ...(n.nullable ? [] : ([["null", null]] as Mutation[])), ["number", 42], ["array", []]];
  switch (n.cls) {
    case "REF": return [...missing, ["null", null], ["number", 42], ["array", []], ["empty", ""], ["padded", " SYNTH-PADDED"]];
    case "NULLABLE_REF": return [...missing, ["number", 42], ["empty", ""], ["padded", " SYNTH-PADDED"]];
    case "TEXT": return [...missing, ["null", null], ["number", 42], ["empty", ""]];
    case "INSTANT": return [...missing, ["null", null], ["number", 42], ["impossible date", "2026-02-30T00:00:00Z"], ["not an instant", "SYNTH-NOT-AN-INSTANT"], ["date only", "2026-03-05"]];
    case "NULLABLE_INSTANT": return [...missing, ["number", 42], ["not an instant", "SYNTH-NOT-AN-INSTANT"]];
    case "FINGERPRINT": return [...missing, ["null", null], ["number", 42], ["empty object", {}], ["malformed digest", { ...o, digest: "SYNTH" }], ["digest missing", { ...o, digest: undefined }], ["extra key", { ...o, extra: 1 }], ["wrong algorithm", { ...o, algorithm: "MD5" }], ["wrong schema", { ...o, schemaVersion: 99 }]];
    case "SOURCE_REF": {
      const { contentFingerprint, ...rest } = o;
      return [...missing, ["null", null], ["number", 42], ["null sourceId", { ...o, sourceId: null }], ["padded sourceId", { ...o, sourceId: " SYNTH" }], ["empty version", { ...o, version: "" }], ["malformed content fingerprint", { ...o, contentFingerprint: { ...(contentFingerprint as object), digest: "x" } }], ["content fingerprint missing", rest], ["extra key", { ...o, extra: 1 }], ["fingerprint only", FP]];
    }
    case "VOCAB": return [...missing, ["null", null], ["number", 42], ["empty", ""], ["unknown vocabulary", "SYNTH-UNKNOWN-VOCABULARY"]];
    case "NULLABLE_VOCAB": return [...missing, ["number", 42], ["unknown vocabulary", "SYNTH-UNKNOWN-VOCABULARY"]];
    case "LITERAL": return [...missing, ["null", null], ["number", 42], ["unknown vocabulary", "SYNTH-UNKNOWN-VOCABULARY"]];
  }
}

const joinPath = (base: string, from: readonly string[]) => from.reduce((acc, k) => (acc === "" ? k : `${acc}.${k}`), base);

/** Every spec node with its normalised path (indices → `[]`, variants → `<STATE>`) — the coverage target. */
function specPaths(fields: Readonly<Record<string, NodeSpec>>): string[] {
  const out: string[] = [];
  const walk = (n: NodeSpec, base: string) => {
    const p = joinPath(base, n.from);
    out.push(p);
    if (n.kind === "list") walk(n.item, `${p}[]`);
    else if (n.kind === "object") for (const f of Object.values(n.fields)) walk(f, p);
    else if (n.kind === "variant") for (const [tag, fs] of Object.entries(n.variants)) for (const f of Object.values(fs)) walk(f, `${p}<${tag}>`);
  };
  for (const f of Object.values(fields)) walk(f, "");
  return [...new Set(out)].sort();
}

interface Reached {
  node: NodeSpec;
  path: Seg[];
  norm: string;
  value: unknown;
  inList: boolean;
}

/** The nodes a raw sample actually reaches, with their concrete raw path and value. */
function* reached(fields: Readonly<Record<string, NodeSpec>>, raw: unknown, path: Seg[] = [], norm = ""): Generator<Reached> {
  for (const n of Object.values(fields)) yield* reachNode(n, raw, path, norm, false);
}
function* reachNode(n: NodeSpec, raw: unknown, path: Seg[], norm: string, element: boolean): Generator<Reached> {
  let v = raw;
  for (const k of n.from) v = (v as Record<string, unknown>)[k];
  const p = [...path, ...n.from];
  const q = joinPath(norm, n.from);
  yield { node: n, path: p, norm: q, value: v, inList: element && n.from.length === 0 };
  if (n.kind === "list" && Array.isArray(v)) for (const [i, x] of v.entries()) yield* reachNode(n.item, x, [...p, i], `${q}[]`, true);
  else if (n.kind === "object" && v !== null && typeof v === "object") yield* reached(n.fields, v, p, q);
  else if (n.kind === "variant" && v !== null && typeof v === "object") {
    const tag = (v as { state: string }).state;
    yield* reached(n.variants[tag], v, p, `${q}<${tag}>`);
  }
}

function setAt(root: unknown, path: Seg[], value: unknown): unknown {
  const copy = structuredClone(root) as Record<Seg, unknown>;
  let parent = copy;
  for (const seg of path.slice(0, -1)) parent = parent[seg] as Record<Seg, unknown>;
  const last = path[path.length - 1];
  if (value === DELETE) delete parent[last];
  else parent[last] = value;
  return copy;
}

const capture = (into: unknown[]) => (raw: Loose) => (into.push(structuredClone(raw)), raw);

interface Adapter {
  name: string;
  slot: "c2" | "c7" | "c8" | "c4";
  where: string;
  fields: Readonly<Record<string, NodeSpec>>;
  /** The adapter's input as built from the slot's raw result (C4 pairs it with the request's group ref). */
  wrap: (raw: unknown) => unknown;
  unwrap: (wrapped: unknown) => unknown;
  runs: Run[];
}

const GROUP_RUN: Run = { ledgers: [ledgerOf(A, [{ id: "ga", value: GROUP }]), ledgerOf(B)], groupScopes: [{ groupRef: GROUP }], actions: registry([]) };
const ADAPTERS: Adapter[] = [
  { name: "viewpoint", slot: "c8", where: "VIEWPOINT", fields: VIEWPOINT_SPEC, wrap: (r) => r, unwrap: (r) => r, runs: [{}] },
  { name: "C2 obligation records", slot: "c2", where: "C2", fields: C2_SPEC, wrap: (r) => r, unwrap: (r) => r, runs: [OVERDUE, SATISFIED, UNSUPPORTED] },
  { name: "C7 programme records", slot: "c7", where: "C7", fields: C7_SPEC, wrap: (r) => r, unwrap: (r) => r, runs: [PROGRAMME, PROGRAMME_DONE, GATES] },
  { name: "C8 recommendations and sealed context", slot: "c8", where: "C8", fields: C8_SPEC, wrap: (r) => r, unwrap: (r) => r, runs: [{}, OVERDUE, PROGRAMME, GATES, OUTSTANDING, WEIGHTS, GOALS] },
  { name: "C4 group scope", slot: "c4", where: `C4:${GROUP}`, fields: C4_SPEC, wrap: (scope) => ({ groupRef: GROUP, scope }), unwrap: (w) => (w as { scope: unknown }).scope, runs: [GROUP_RUN] },
];

describe("C9 adapter boundary — generated mutation matrix over every raw operand the adapter specs name", () => {
  const sizes: Record<string, number> = {};
  it.each(ADAPTERS)("$name: every class-appropriate malformation of every reached operand fails closed at the adapter; every spec path is reached", { timeout: 600_000 }, (ad) => {
    const seen = new Set<string>();
    const accepted: string[] = [];
    let count = 0;
    for (const r of ad.runs) {
      const samples: unknown[] = [];
      expect(faulted({ [ad.slot]: capture(samples) }, r).ok, "positive control").toBe(true);
      expect(samples.length, "one delegated result per slot").toBe(1);
      const sample = ad.wrap(samples[0]);
      const once = new Set<string>();
      for (const f of reached(ad.fields, sample)) {
        seen.add(f.norm);
        if (ad.name === "C4 group scope" && f.norm === "groupRef") continue; // the request's admitted group ref, not predecessor output
        if (once.has(f.norm)) continue; // one concrete occurrence per operand path per run
        once.add(f.norm);
        for (const [label, value] of mutationsOf(f.node, f.value, f.inList)) {
          if (value !== DELETE && JSON.stringify(value) === JSON.stringify(f.value)) continue;
          count += 1;
          const mutated = ad.unwrap(setAt(sample, f.path, value));
          let out: CattlePlanOutcome | undefined;
          try {
            out = faulted({ [ad.slot]: () => structuredClone(mutated) }, r);
          } catch (e) {
            accepted.push(`${f.norm} ${label}: THREW ${String(e)}`);
            continue;
          }
          const issue = out.ok ? null : out.issues[0];
          if (out.ok || out.issues.length !== 1 || issue!.code !== "CATTLE_PLAN_ADMISSION_FAILED" || !String(issue!.ref).startsWith(`${ad.where}:`)) {
            accepted.push(`${f.norm} ${label}: ${JSON.stringify(out.ok ? "ACCEPTED" : out.issues)}`);
          }
        }
      }
    }
    expect(accepted).toEqual([]);
    const target = specPaths(ad.fields);
    expect([...seen].sort()).toEqual(target);
    sizes[ad.name] = count;
    expect(count).toBeGreaterThan(target.length);
  });

  it("matrix size is recorded", () => {
    // Printed for the evidence record (run after the matrix cases).
    process.stderr.write(`C9_ADAPTER_MATRIX ${JSON.stringify(sizes)}\n`);
    expect(Object.keys(sizes).length).toBe(ADAPTERS.length);
  });
});

// ---------------------------------------------------------------------------
// Derived-identifier scanner over valid results
// ---------------------------------------------------------------------------

const ARTEFACTS = /undefined|\[object Object\]|NaN|::|:$|:null$|""/;
function* strings(v: unknown, at = ""): Generator<[string, string]> {
  if (typeof v === "string") yield [at, v];
  else if (Array.isArray(v)) for (const [i, x] of v.entries()) yield* strings(x, `${at}[${i}]`);
  else if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) yield* strings(x, `${at}.${k}`);
}
/** Prefix → the JSON segment's required (non-null string) positions; other positions may be null. */
const JSON_IDS: Record<string, number[]> = {
  "CATTLE_OBLIGATION_STATE:": [0, 1],
  "CATTLE_PROGRAMME_OCCURRENCE:": [0, 1],
  "CATTLE_PROGRAMME:": [0, 1],
};
const PLAIN_IDS = ["CATTLE_OBLIGATION:", "CATTLE_RECOMMENDATION:", "CATTLE_OBLIGATION_FULFILMENT:", "CATTLE_PROGRAMME_COMPLETION_DECLARATION:", "CATTLE_HEALTH_RECORD:", "CATTLE_WEIGHT_OBSERVATION:"];

describe("C9 adapter boundary — no derived identifier carries a coercion artefact", () => {
  const SCAN: Run[] = [{}, OVERDUE, SATISFIED, UNSUPPORTED, PROGRAMME, PROGRAMME_DONE, GATES, OUTSTANDING, WEIGHTS, GOALS, GROUP_RUN];
  it.each(SCAN.map((r, i) => [i, r] as const))("valid run #%i: every derived id / key / reference is clean", (_, r) => {
    const out = run(r);
    if (!out.ok) throw new Error(JSON.stringify(out.issues));
    const dirty: string[] = [];
    for (const [at, s] of strings(out.result)) {
      if (ARTEFACTS.test(s.replace(/"[^"]*"/g, (m) => (m === '""' ? m : '"x"')))) dirty.push(`${at}: ${s}`);
      for (const [prefix, required] of Object.entries(JSON_IDS)) {
        if (!s.startsWith(prefix)) continue;
        // The id's JSON segment (a key may continue after it, e.g. an identity key built on an action key).
        const m = /^\[(?:"(?:[^"\\]|\\.)*"|null|,)*\]/.exec(s.slice(prefix.length));
        if (m === null) {
          dirty.push(`${at}: ${s}`);
          continue;
        }
        const seg = JSON.parse(m[0]) as unknown[];
        for (const i of required) if (typeof seg[i] !== "string" || seg[i] === "") dirty.push(`${at}: ${s}`);
      }
      for (const prefix of PLAIN_IDS) if (s.startsWith(prefix) && !/^[^\s]+$/.test(s.slice(prefix.length))) dirty.push(`${at}: ${s}`);
      for (const prefix of ["CATTLE_WEIGHT_SERIES:", "CATTLE_GOAL_SNAPSHOT:"]) if (s.startsWith(prefix) && !/^[0-9a-f]{64}$/.test(s.slice(prefix.length))) dirty.push(`${at}: ${s}`);
    }
    expect(dirty).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Compile-time guards: DTO drift, unmintable primitives, constructor narrowing
// ---------------------------------------------------------------------------

describe("C9 adapter boundary — DTO drift guard and admitted primitives", () => {
  it("a DTO field without an admission node, or a node for no field, fails the type gate; nested specs are exhaustive too", () => {
    // @ts-expect-error — `added` has no admission node: DTO specs are exhaustive over the DTO type.
    const missing: DtoSpec<C2Dto & { added: C9Ref }> = C2_SPEC;
    // @ts-expect-error — and a node for a field the DTO does not have is rejected (exact specs).
    const extra = { ...C8_SPEC, ghost: operand.ref("ghost") } satisfies DtoSpec<C8Dto>;
    // @ts-expect-error — a nested DTO object is exhaustive as well (`fulfilledAt` missing).
    const nested = operand.object<C2CountedDto>([], { evidenceId: operand.ref("evidenceId") });
    expect([missing, extra, nested].every((t) => typeof t === "object")).toBe(true);
  });

  it("C9 primitives cannot be minted outside admission, and identifier constructors refuse raw values", () => {
    // @ts-expect-error — a raw string is not an admitted reference.
    const notMinted: C9Ref = "SYNTH-RAW";
    // @ts-expect-error — the F004 shape: an unvalidated optional value cannot reach a completion-reference constructor.
    const f004 = obligationFulfilmentRecordId(undefined as string | undefined);
    // @ts-expect-error — nor a raw string an action key constructor.
    const key = obligationActionKey("SYNTH-RAW");
    expect([notMinted, f004, key].length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Static boundary: raw predecessor results stay inside delegation / admission
// ---------------------------------------------------------------------------

describe("C9 adapter boundary — static predecessor-access guard", () => {
  const dir = path.resolve(__dirname);
  const production = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "plan-test-fixtures.ts");
  /** The only modules that may hold or read a raw C2 / C4 / C7 / C8 result. */
  const BOUNDARY = new Set(["plan-delegation.ts", "plan-adapters.ts", "plan-admission.ts"]);
  /** Modules whose exports include predecessor results or engines. */
  const PREDECESSOR = /^\.\.\/(regulatory|programmes|recommendations|weights|goals|health|performance|evaluation|evidence-pack|rule|source)(\/|$)/;
  /** What a downstream module may import from them: published vocabularies, the request / trusted-input types, the shared C0 source ref, and C7's own gate-rule identity function over admitted operands. */
  const ALLOWED = new Set([
    "ObligationState",
    "ProgrammeOccurrenceState",
    "RecommendationOutcome",
    "CattleEvaluationState",
    "GoalProjectionStatus",
    "BenefitClaim",
    "RecommendationPriorityTier",
    "LatestWeightState",
    "ScopeMembershipState",
    "OBLIGATION_STATES",
    "PROGRAMME_OCCURRENCE_STATES",
    "CattleRecommendationRequest",
    "RecommendationTrustedInputs",
    "SourceVersionRef",
    "compareSourceVersionRefs",
    "programmeGateRuleId",
  ]);
  const imports = (src: string) => [...src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)].map((m) => ({ names: m[2].split(",").map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean), from: m[3] }));
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("the boundary modules exist and downstream modules exist", () => {
    for (const f of BOUNDARY) expect(production).toContain(f);
    expect(production.filter((f) => !BOUNDARY.has(f)).sort()).toEqual(["index.ts", "plan-contracts.ts", "plan-evidence.ts", "plan-integrity.ts", "plan-interface.ts", "plan-merge.ts", "plan-vocabulary.ts", "plan-work-items.ts"]);
  });

  it.each(["index.ts", "plan-contracts.ts", "plan-evidence.ts", "plan-integrity.ts", "plan-interface.ts", "plan-merge.ts", "plan-vocabulary.ts", "plan-work-items.ts"])(
    "%s imports no predecessor result type or engine, and applies no optional chaining / nullish default",
    (f) => {
      const src = readFileSync(path.join(dir, f), "utf8");
      const leaked = imports(src)
        .filter((i) => PREDECESSOR.test(i.from))
        .flatMap((i) => i.names.filter((n) => !ALLOWED.has(n)).map((n) => `${n} from ${i.from}`));
      expect(leaked).toEqual([]);
      expect(src).not.toMatch(/export \* from "\.\.\/(regulatory|programmes|recommendations|weights)/);
      expect(code(src)).not.toMatch(/\?\.|\?\?/);
    },
  );

  it("the delegated value handed downstream holds admitted DTOs only", () => {
    const src = readFileSync(path.join(dir, "plan-delegation.ts"), "utf8");
    const block = /export interface Delegated \{([\s\S]*?)\n\}/.exec(src)![1];
    const types = [...code(block).matchAll(/:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(types.length).toBe(5);
    for (const t of types) expect(t).toMatch(/^(ViewpointDto|C2Dto \| null|C7Dto \| null|C8Dto|C4ScopeDto\[\])$/);
  });
});
