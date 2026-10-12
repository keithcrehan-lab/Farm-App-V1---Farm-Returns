/**
 * Shared Cattle conformance kit (test support only — no product behaviour).
 *
 * Generic, framework-agnostic checks for the cross-cutting invariants in
 * `docs/farm-return-next/cattle/INVARIANTS.md` (CAT-INV-*). A phase plugs its
 * own record type and engine in through small callbacks; the kit never knows
 * any cattle domain semantics, makes no external call and reads no clock.
 *
 * Every check returns a `ConformanceVerdict` instead of throwing, so a phase
 * test asserts `expect(verdict).toEqual(CONFORMS)` and a failure message
 * names the violated invariant. Production code must never import this
 * module (it lives under `src/tooling/`).
 *
 * Usage: `docs/farm-return-next/cattle/VERIFICATION.md`.
 */

import { addObligationOffset, obligationInstantJustBefore } from "@/domain/cattle/regulatory/obligation-time";
import { isValidAnimalInstant } from "@/domain/cattle/animal-ledger";

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

export type CatInvariantId = `CAT-INV-${string}`;

export type ConformanceVerdict = { ok: true } | { ok: false; violations: string[] };

export const CONFORMS: ConformanceVerdict = Object.freeze({ ok: true });

function verdict(violations: string[]): ConformanceVerdict {
  return violations.length === 0 ? CONFORMS : { ok: false, violations };
}

function violation(invariant: CatInvariantId, label: string, detail: string): string {
  return `${invariant} [${label}]: ${detail}`;
}

/** Merges several verdicts (e.g. one per matrix row). */
export function allConform(verdicts: readonly ConformanceVerdict[]): ConformanceVerdict {
  return verdict(verdicts.flatMap((v) => (v.ok ? [] : v.violations)));
}

// ---------------------------------------------------------------------------
// Structural comparison (test-only; NOT the fingerprint canonicalisation)
// ---------------------------------------------------------------------------

/**
 * Deterministic structural rendering for comparing engine outputs: object
 * keys sorted, Map entries sorted by rendered key, Set members sorted,
 * `undefined` and non-finite numbers rendered distinctly. Array order is
 * significant — output order is part of an authoritative result. Never use
 * this as a fingerprint: fingerprints use C0 `computeCattleFingerprint`.
 */
export function conformanceSnapshot(value: unknown): string {
  return render(value, new Set());
}

function render(value: unknown, seen: Set<unknown>): string {
  if (value === undefined) return "<undefined>";
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : `<number:${String(value)}>`;
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") return `<${typeof value}>`;
  if (seen.has(value)) return "<cycle>";
  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((v) => render(v, seen)).join(",")}]`;
    if (value instanceof Map) {
      const entries = [...value.entries()].map(([k, v]) => `${render(k, seen)}=>${render(v, seen)}`).sort();
      return `Map{${entries.join(",")}}`;
    }
    if (value instanceof Set) return `Set{${[...value].map((v) => render(v, seen)).sort().join(",")}}`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${render(record[k], seen)}`)
      .join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function sameConformanceSnapshot(a: unknown, b: unknown): boolean {
  return conformanceSnapshot(a) === conformanceSnapshot(b);
}

/** True when the value and everything reachable from it is frozen. */
export function isDeepFrozen(value: unknown, seen: Set<unknown> = new Set()): boolean {
  if (value === null || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  if (value instanceof Map) return [...value.entries()].every(([k, v]) => isDeepFrozen(k, seen) && isDeepFrozen(v, seen));
  if (value instanceof Set) return [...value].every((v) => isDeepFrozen(v, seen));
  return Object.keys(value).every((k) => isDeepFrozen((value as Record<string, unknown>)[k], seen));
}

// ---------------------------------------------------------------------------
// Time matrices (CAT-INV-003/004/005/010)
// ---------------------------------------------------------------------------

export interface CutoffMatrix {
  /** One nanosecond before the instant (record NOT yet known). */
  before: string;
  /** Exactly the instant (record known: cutoffs are inclusive). */
  at: string;
  /** One hour after the instant (record known). */
  after: string;
}

/**
 * Before / at / after cutoffs around a record's knowledge time, built with
 * C2's exact UTC instant arithmetic. Throws on an invalid instant (a test
 * construction error, never an engine input).
 */
export function cutoffMatrix(knowledgeTime: string): CutoffMatrix {
  const before = isValidAnimalInstant(knowledgeTime) ? obligationInstantJustBefore(knowledgeTime) : null;
  const after = isValidAnimalInstant(knowledgeTime) ? addObligationOffset(knowledgeTime, { amount: 1, unit: "HOUR" }) : null;
  if (before === null || after === null) {
    throw new Error(`cattle conformance: invalid knowledge time ${knowledgeTime}`);
  }
  return { before, at: knowledgeTime, after };
}

/**
 * Equivalent strict-UTC spellings of one instant (fractional-second padding
 * only — the only equivalence the C1 instant contract admits). Each is a
 * valid C1 instant and denotes the same admitted instant (CAT-INV-010).
 */
export function equivalentInstantSpellings(instant: string): string[] {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(instant);
  if (!m || !isValidAnimalInstant(instant)) throw new Error(`cattle conformance: invalid instant ${instant}`);
  const digits = (m[2] ?? "").replace(/0+$/, "");
  const spellings = new Set<string>();
  if (digits === "") spellings.add(`${m[1]}Z`);
  for (let width = Math.max(digits.length, 1); width <= 9; width++) spellings.add(`${m[1]}.${digits.padEnd(width, "0")}Z`);
  return [...spellings];
}

/**
 * Values that are NOT strict UTC instants under the C1 contract
 * (`isValidAnimalInstant`). Used as malformed knowledge/effective times
 * (CAT-INV-005): an engine must fail closed, never guess.
 */
export const MALFORMED_INSTANTS: readonly { label: string; value: unknown }[] = Object.freeze([
  { label: "offset instead of Z", value: "2026-03-01T10:00:00+00:00" },
  { label: "no zone designator", value: "2026-03-01T10:00:00" },
  { label: "lower-case z", value: "2026-03-01T10:00:00z" },
  { label: "impossible calendar date", value: "2026-02-30T10:00:00Z" },
  { label: "hour 24", value: "2026-03-01T24:00:00Z" },
  { label: "leap second", value: "2026-03-01T23:59:60Z" },
  { label: "ten fractional digits", value: "2026-03-01T10:00:00.0000000000Z" },
  { label: "calendar date only", value: "2026-03-01" },
  { label: "space separator", value: "2026-03-01 10:00:00Z" },
  { label: "empty string", value: "" },
  { label: "epoch number", value: 1_772_359_200_000 },
  { label: "null", value: null },
  { label: "missing", value: undefined },
]);

// ---------------------------------------------------------------------------
// Ordering (CAT-INV-012)
// ---------------------------------------------------------------------------

/**
 * A small deterministic set of input orders: identity, reversed, every
 * rotation and the interleaving of odd/even positions (no factorial blow-up).
 */
export function inputPermutations<T>(items: readonly T[]): T[][] {
  const out = new Map<string, T[]>();
  const add = (order: number[]) => out.set(order.join(","), order.map((i) => items[i]));
  const idx = items.map((_, i) => i);
  add(idx);
  add([...idx].reverse());
  for (let r = 1; r < idx.length; r++) add([...idx.slice(r), ...idx.slice(0, r)]);
  add([...idx.filter((i) => i % 2 === 1), ...idx.filter((i) => i % 2 === 0)]);
  return [...out.values()];
}

/** CAT-INV-012: every permutation of the input yields the same authoritative output. */
export function checkOrderIndependence<T>(label: string, items: readonly T[], evaluate: (items: T[]) => unknown): ConformanceVerdict {
  const [first, ...rest] = inputPermutations(items);
  const expected = conformanceSnapshot(evaluate(first));
  const violations: string[] = [];
  rest.forEach((order, i) => {
    if (conformanceSnapshot(evaluate(order)) !== expected) {
      violations.push(violation("CAT-INV-012", label, `permutation #${i + 1} changed the output`));
    }
  });
  return verdict(violations);
}

// ---------------------------------------------------------------------------
// Knowledge cutoff (CAT-INV-003/004/005/006/013/021)
// ---------------------------------------------------------------------------

export interface CutoffStabilityCase<R> {
  label: string;
  /** Records known by the cutoff. */
  known: readonly R[];
  /** Records first known strictly after the cutoff (well-formed or malformed in content). */
  later: readonly R[];
  knowledgeCutoff: string;
}

/**
 * CAT-INV-004/006/021: appending records first known after the cutoff never
 * changes the evaluation at that cutoff — neither its output nor its
 * relevance/membership. `evaluate` must run the phase's full authoritative
 * path (ingestion + projection), not just a filter.
 */
export function checkFutureKnowledgeInvisible<R>(
  cases: readonly CutoffStabilityCase<R>[],
  evaluate: (records: readonly R[], knowledgeCutoff: string) => unknown,
): ConformanceVerdict {
  const violations: string[] = [];
  for (const c of cases) {
    const baseline = conformanceSnapshot(evaluate(c.known, c.knowledgeCutoff));
    for (const order of [[...c.known, ...c.later], [...c.later, ...c.known]]) {
      if (conformanceSnapshot(evaluate(order, c.knowledgeCutoff)) !== baseline) {
        violations.push(violation("CAT-INV-004", c.label, "a record first known after the cutoff changed the historical evaluation"));
        break;
      }
    }
  }
  return verdict(violations);
}

/**
 * CAT-INV-005: a relevant record whose knowledge time cannot be read is never
 * guessed into or out of history. For each malformed time, `withKnowledgeTime`
 * builds the record carrying it and `failsClosed` must accept the engine's
 * result (rejection / INVALID / UNKNOWN — the phase defines which).
 */
export function checkMalformedKnowledgeTimeFailsClosed<R, Out>(
  label: string,
  context: readonly R[],
  withKnowledgeTime: (value: unknown) => R,
  evaluate: (records: readonly R[]) => Out,
  failsClosed: (result: Out) => boolean,
  malformed: readonly { label: string; value: unknown }[] = MALFORMED_INSTANTS,
): ConformanceVerdict {
  const violations: string[] = [];
  for (const m of malformed) {
    let result: Out;
    try {
      result = evaluate([...context, withKnowledgeTime(m.value)]);
    } catch (error) {
      violations.push(violation("CAT-INV-005", `${label}: ${m.label}`, `engine threw instead of failing closed (${String(error)})`));
      continue;
    }
    if (!failsClosed(result)) violations.push(violation("CAT-INV-005", `${label}: ${m.label}`, "malformed knowledge time did not fail closed"));
  }
  return verdict(violations);
}

/**
 * CAT-INV-013/021: after a correction is appended, the evaluation at an
 * earlier cutoff is unchanged, the evaluation at a later cutoff reflects the
 * correction, and the corrected record's id is still present in history.
 */
export function checkCorrectionPreservesHistory<R, Out>(
  label: string,
  original: readonly R[],
  correction: R,
  cutoffs: { beforeCorrection: string; afterCorrection: string },
  evaluate: (records: readonly R[], knowledgeCutoff: string) => Out,
  historyIds: (result: Out) => readonly string[],
  correctedId: string,
): ConformanceVerdict {
  const violations: string[] = [];
  const earlierBefore = conformanceSnapshot(evaluate(original, cutoffs.beforeCorrection));
  const appended = [...original, correction];
  if (conformanceSnapshot(evaluate(appended, cutoffs.beforeCorrection)) !== earlierBefore) {
    violations.push(violation("CAT-INV-013", label, "correction changed the evaluation at an earlier cutoff"));
  }
  const later = evaluate(appended, cutoffs.afterCorrection);
  if (conformanceSnapshot(later) === conformanceSnapshot(evaluate(original, cutoffs.afterCorrection))) {
    violations.push(violation("CAT-INV-013", label, "correction had no effect at a cutoff after it was known"));
  }
  if (!historyIds(later).includes(correctedId)) {
    violations.push(violation("CAT-INV-013", label, `corrected record ${correctedId} disappeared from history`));
  }
  return verdict(violations);
}

// ---------------------------------------------------------------------------
// Identity (CAT-INV-008)
// ---------------------------------------------------------------------------

/**
 * CAT-INV-008 and the append-only identity rule: an identical duplicate is
 * idempotent (same output as without it); the same identity with different
 * content fails closed, including when the competing copy is otherwise
 * invalid (identity is checked before validity).
 */
export function checkDuplicateIdentity<R, Out>(
  label: string,
  records: readonly R[],
  duplicate: R,
  conflictingCopies: readonly { label: string; record: R }[],
  evaluate: (records: readonly R[]) => Out,
  failsClosed: (result: Out) => boolean,
): ConformanceVerdict {
  const violations: string[] = [];
  if (conformanceSnapshot(evaluate([...records, duplicate])) !== conformanceSnapshot(evaluate(records))) {
    violations.push(violation("CAT-INV-008", label, "identical duplicate was not idempotent"));
  }
  for (const c of conflictingCopies) {
    if (!failsClosed(evaluate([...records, c.record]))) {
      violations.push(violation("CAT-INV-008", `${label}: ${c.label}`, "same identity with different content did not fail closed"));
    }
  }
  return verdict(violations);
}

// ---------------------------------------------------------------------------
// Evidence precedence (CAT-INV-009/022)
// ---------------------------------------------------------------------------

/**
 * Resolved-looking states named by the shared invariant. A phase passes the
 * subset meaningful for its own vocabulary (plus any phase-specific ones);
 * the kit never decides a phase's status semantics.
 */
export const RESOLVED_LOOKING_STATES: readonly string[] = Object.freeze([
  "NOT_APPLICABLE",
  "SATISFIED",
  "ELIGIBLE",
  "ON_TRACK",
  "ACTIONABLE",
  "CLEAR",
  "CLEARED",
  "COMPLETED",
]);

export interface UnresolvedEvidenceCase<Out> {
  /** e.g. "required DOB UNKNOWN", "withdrawal period conflicting". */
  label: string;
  result: Out;
}

/**
 * CAT-INV-009/022: when REQUIRED evidence is unknown, conflicting or invalid,
 * the authoritative status must not be a resolved-looking state.
 */
export function checkUnresolvedEvidenceNotMasked<Out>(
  cases: readonly UnresolvedEvidenceCase<Out>[],
  statusOf: (result: Out) => readonly string[],
  forbidden: readonly string[],
): ConformanceVerdict {
  const violations: string[] = [];
  for (const c of cases) {
    const masked = statusOf(c.result).filter((s) => forbidden.includes(s));
    if (masked.length > 0) violations.push(violation("CAT-INV-009", c.label, `unresolved required evidence surfaced as ${masked.join(", ")}`));
  }
  return verdict(violations);
}

// ---------------------------------------------------------------------------
// Detachment and frozen outputs (CAT-INV-002)
// ---------------------------------------------------------------------------

/**
 * CAT-INV-002: an evaluation result is detached from caller-owned input —
 * mutating the input after the call never changes the result already
 * returned — and the result is deep-frozen.
 */
export function checkDetachedResult<In, Out>(
  label: string,
  makeInput: () => In,
  evaluate: (input: In) => Out,
  mutateInput: (input: In) => void,
): ConformanceVerdict {
  const violations: string[] = [];
  const input = makeInput();
  const result = evaluate(input);
  const before = conformanceSnapshot(result);
  mutateInput(input);
  if (conformanceSnapshot(result) !== before) violations.push(violation("CAT-INV-002", label, "result changed after the caller mutated its input"));
  if (!isDeepFrozen(result)) violations.push(violation("CAT-INV-002", label, "result is not deep-frozen"));
  if (conformanceSnapshot(evaluate(makeInput())) !== before) {
    violations.push(violation("CAT-INV-021", label, "re-evaluating identical input produced a different result"));
  }
  return verdict(violations);
}

// ---------------------------------------------------------------------------
// Fingerprints (FINGERPRINTS.md)
// ---------------------------------------------------------------------------

export interface FingerprintVariant<P> {
  label: string;
  payload: P;
}

/**
 * Semantic/result fingerprint stability: every `equivalent` variant (same
 * meaning: key order, equivalent instant spelling, input order) yields the
 * baseline fingerprint; every `material` variant yields a different one.
 * `fingerprint` returns the digest (or any comparable rendering).
 */
export function checkFingerprintStability<P>(
  label: string,
  baseline: P,
  equivalent: readonly FingerprintVariant<P>[],
  material: readonly FingerprintVariant<P>[],
  fingerprint: (payload: P) => string,
): ConformanceVerdict {
  const violations: string[] = [];
  const base = fingerprint(baseline);
  if (fingerprint(baseline) !== base) violations.push(violation("CAT-INV-021", label, "fingerprint is not deterministic"));
  for (const v of equivalent) {
    if (fingerprint(v.payload) !== base) violations.push(violation("CAT-INV-010", `${label}: ${v.label}`, "semantically equivalent payload changed the fingerprint"));
  }
  for (const v of material) {
    if (fingerprint(v.payload) === base) violations.push(violation("CAT-INV-021", `${label}: ${v.label}`, "material change did not change the fingerprint"));
  }
  return verdict(violations);
}
