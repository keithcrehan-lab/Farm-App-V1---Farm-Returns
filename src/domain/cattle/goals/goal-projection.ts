/**
 * Cattle C6 — the production-goal projection and the `GoalSnapshotRef`.
 *
 * `projectProductionGoals` answers "what production intent was declared for
 * this subject at `effectiveAt`, as known at `knowledgeCutoff`?" No clock is
 * read; no goal is ever inferred or defaulted (CAT-INV-022/027).
 *
 * Order:
 * 1. The complete request is checked with `toCanonicalPlainData`;
 *    non-canonical input is rejected (`CATTLE_GOAL_NON_CANONICAL_INPUT`) and
 *    only the detached, deep-frozen copy is used (CAT-INV-001/002).
 * 2. Query (subject, `effectiveAt`, `knowledgeCutoff`) — malformed ⇒ `ok: false`.
 * 3. Declarations admitted at the cutoff (`goal-declaration.ts`): later
 *    knowledge invisible, malformed fails closed, identity before validity,
 *    supersession without precedence.
 * 4. Per goal of the subject: in force at `effectiveAt` when its single live
 *    version is not a withdrawal and its period `[validFrom, validTo)` covers
 *    `effectiveAt`.
 * 5. Status, snapshot and output rebuilt, sorted, fingerprinted, deep-frozen.
 *
 * REQUIRED inputs (ARCHITECTURE.md §Status and evidence precedence): a fully
 * admissible declaration ledger at the cutoff (every admitted record valid,
 * no identity collision, no invalid supersession link) and, for each goal of
 * the subject whose versions could be in force, a single resolved live
 * version. Status precedence (first match wins):
 *   INVALID          any admitted record malformed (incl. an unreadable
 *                    knowledge time), an identity collision, an identity-scope
 *                    mismatch or an invalid supersession link anywhere in the
 *                    supplied ledger — fail closed, no goal reported;
 *   INTENT_CONFLICT  a declared goal whose competing versions could be in
 *                    force (COMPETING_VERSIONS), or a STRUCTURAL conflict
 *                    among the declared goals in force — no winner chosen;
 *   ACTIVE           at least one declared goal in force;
 *   NONE             no declared goal in force (never a default goal).
 * Unresolved required evidence therefore never surfaces as ACTIVE or NONE
 * (CAT-INV-009).
 *
 * The built-in compatibility matrix is STRUCTURAL ONLY (brief §2): two
 * declared goals in force for the identical subject at the same instant
 * conflict when (a) their types are mutually exclusive by definition —
 * exactly `SALE` vs `RETAIN` (`MUTUALLY_EXCLUSIVE_GOAL_TYPE_PAIRS`) — or (b)
 * they have the identical type but different declared outcome fields (two
 * values for one declared outcome). Every other combination is reported as
 * declared; judging it is a product decision outside this phase.
 *
 * SYSTEM records are suggestions: listed under `suggestions`, never in force,
 * never ACTIVE, never in the snapshot.
 */

import { canonicalizeValue, type AssessmentFingerprint } from "../../assessment-integrity";
import { deepFreezeAnimalValue, intervalCovers, isValidAnimalInstant } from "../animal-ledger";
import { compareStrings, type CattleHash } from "../integrity";
import { toCanonicalPlainData } from "../regulatory/canonical-input";
import { canonicalObligationInstant } from "../regulatory/obligation-time";
import { hasOnlyFields, isRecord, type Raw } from "../health/health-input";
import {
  admitGoalDeclarations,
  compareGoalVersionRefs,
  goalOutcomeKey,
  goalRecordKey,
  goalStanding,
  goalSubjectKey,
  goalSubjectOf,
  goalVersionRef,
  type GoalRecordIssue,
  type GoalStanding,
  type GoalSubject,
  type GoalVersionRef,
  type ProductionGoalDeclaration,
  type ProductionGoalType,
} from "./goal-declaration";
import { CATTLE_GOAL_PAYLOAD_VERSION, computeGoalFingerprint } from "./goal-integrity";

/** The only built-in incompatibility: mutually exclusive by definition (keep the animal vs sell it). */
export const MUTUALLY_EXCLUSIVE_GOAL_TYPE_PAIRS: readonly (readonly [ProductionGoalType, ProductionGoalType])[] = Object.freeze([Object.freeze(["RETAIN", "SALE"] as const)]);

export interface GoalQuery {
  subject: GoalSubject;
  /** VALID time. */
  effectiveAt: string;
  /** KNOWLEDGE time. */
  knowledgeCutoff: string;
}

/** Every part must be canonical plain data (CAMPAIGN.md, "Canonical input contract"). */
export interface GoalProjectionRequest {
  /** Supplied `ProductionGoalDeclaration` records (the whole append-only ledger). */
  declarations: readonly unknown[];
  query: GoalQuery;
}

export type GoalProjectionStatus = "ACTIVE" | "NONE" | "INTENT_CONFLICT" | "INVALID";

/** A goal record as projected: always INTENT, never FACT. */
export interface ProjectedGoal {
  informationClass: "INTENT";
  standing: GoalStanding;
  /** RESOLVED: the goal's single live version; VERSION_CONFLICT: one of its competing versions. */
  versionState: "RESOLVED" | "VERSION_CONFLICT";
  declaration: ProductionGoalDeclaration;
}

export type IntentConflictKind = "COMPETING_VERSIONS" | "MUTUALLY_EXCLUSIVE_GOAL_TYPES" | "SAME_TYPE_DIFFERENT_OUTCOME";

export interface IntentConflict {
  kind: IntentConflictKind;
  /** Involved goal versions (sorted); no winner. */
  goals: GoalVersionRef[];
  declarations: ProductionGoalDeclaration[];
}

export interface GoalHistoryEntry {
  informationClass: "INTENT";
  standing: GoalStanding;
  recordState: "LIVE" | "SUPERSEDED";
  /** Known versions superseding this one (sorted). */
  supersededBy: GoalVersionRef[];
  declaration: ProductionGoalDeclaration;
}

/**
 * The deterministic reference C5 / C7 / C8 bind to. `goals` are the declared
 * goal versions in force (resolved), `conflicts` the unresolved intent; the
 * fingerprint covers the subject, both times, the status, the complete
 * content of every goal version referenced and any issues, so a later goal
 * change can never alter a snapshot taken at an earlier cutoff.
 */
export interface GoalSnapshotRef {
  goalPayloadVersion: typeof CATTLE_GOAL_PAYLOAD_VERSION;
  subject: GoalSubject;
  /** Canonical spellings. */
  effectiveAt: string;
  knowledgeCutoff: string;
  status: GoalProjectionStatus;
  goals: GoalVersionRef[];
  conflicts: { kind: IntentConflictKind; goals: GoalVersionRef[] }[];
  fingerprint: AssessmentFingerprint;
}

export interface GoalProjection {
  goalPayloadVersion: typeof CATTLE_GOAL_PAYLOAD_VERSION;
  subject: GoalSubject;
  effectiveAt: string;
  knowledgeCutoff: string;
  status: GoalProjectionStatus;
  /** Declared goals in force with a resolved version (any status but INVALID), sorted. */
  inForce: ProjectedGoal[];
  /** `inForce` when ACTIVE; empty otherwise (never a default). */
  activeGoals: ProjectedGoal[];
  conflicts: IntentConflict[];
  /** SYSTEM suggestions in force (never active). */
  suggestions: ProjectedGoal[];
  /** Every known version for the subject, incl. superseded, ended, withdrawn and out-of-period ones. */
  history: GoalHistoryEntry[];
  /** Ledger issues (INVALID only). */
  issues: GoalRecordIssue[];
  snapshot: GoalSnapshotRef;
  fingerprint: AssessmentFingerprint;
}

export type GoalRequestIssueCode =
  | "CATTLE_GOAL_NON_CANONICAL_INPUT"
  | "CATTLE_GOAL_INVALID_REQUEST"
  | "CATTLE_GOAL_INVALID_SUBJECT"
  | "CATTLE_GOAL_INVALID_EFFECTIVE_AT"
  | "CATTLE_GOAL_INVALID_KNOWLEDGE_CUTOFF";

export interface GoalRequestIssue {
  code: GoalRequestIssueCode;
  /** Non-canonical path when applicable. */
  ref: string | null;
}

export type GoalProjectionResult = { ok: true; projection: GoalProjection } | { ok: false; issues: GoalRequestIssue[] };

// ---------------------------------------------------------------------------
// Request reading (already-canonical data; module-internal)
// ---------------------------------------------------------------------------

export interface ValidGoalQuery {
  subject: GoalSubject;
  effectiveAt: string;
  knowledgeCutoff: string;
}

const QUERY_FIELDS = ["subject", "effectiveAt", "knowledgeCutoff"];

/** Reads `{declarations, query, ...extra}` from an already-canonical request. */
export function readGoalRequest(
  req: unknown,
  extraFields: readonly string[],
): { ok: true; req: Raw; declarations: unknown[]; query: ValidGoalQuery } | { ok: false; issues: GoalRequestIssue[] } {
  if (!isRecord(req) || !hasOnlyFields(req, ["declarations", "query", ...extraFields]) || !Array.isArray(req.declarations) || !isRecord(req.query) || !hasOnlyFields(req.query, QUERY_FIELDS)) {
    return { ok: false, issues: [{ code: "CATTLE_GOAL_INVALID_REQUEST", ref: null }] };
  }
  const issues: GoalRequestIssue[] = [];
  const subject = goalSubjectOf(req.query.subject);
  const effectiveAt = isValidAnimalInstant(req.query.effectiveAt) ? canonicalObligationInstant(req.query.effectiveAt) : null;
  const knowledgeCutoff = isValidAnimalInstant(req.query.knowledgeCutoff) ? canonicalObligationInstant(req.query.knowledgeCutoff) : null;
  if (subject === null) issues.push({ code: "CATTLE_GOAL_INVALID_SUBJECT", ref: null });
  if (effectiveAt === null) issues.push({ code: "CATTLE_GOAL_INVALID_EFFECTIVE_AT", ref: null });
  if (knowledgeCutoff === null) issues.push({ code: "CATTLE_GOAL_INVALID_KNOWLEDGE_CUTOFF", ref: null });
  if (issues.length > 0 || subject === null || effectiveAt === null || knowledgeCutoff === null) return { ok: false, issues };
  return { ok: true, req, declarations: req.declarations as unknown[], query: { subject, effectiveAt, knowledgeCutoff } };
}

// ---------------------------------------------------------------------------
// Projection (module-internal core)
// ---------------------------------------------------------------------------

const projected = (declaration: ProductionGoalDeclaration, versionState: ProjectedGoal["versionState"]): ProjectedGoal => ({
  informationClass: "INTENT",
  standing: goalStanding(declaration),
  versionState,
  declaration,
});

const byRef = (a: ProductionGoalDeclaration, b: ProductionGoalDeclaration) => compareGoalVersionRefs(a, b);

function inForceAt(r: ProductionGoalDeclaration, effectiveAt: string): boolean {
  return r.action !== "WITHDRAW" && intervalCovers(r, effectiveAt);
}

function conflict(kind: IntentConflictKind, declarations: readonly ProductionGoalDeclaration[]): IntentConflict {
  const sorted = [...declarations].sort(byRef);
  return { kind, goals: sorted.map(goalVersionRef), declarations: sorted };
}

function structuralConflicts(inForce: readonly ProductionGoalDeclaration[]): IntentConflict[] {
  const out: IntentConflict[] = [];
  for (const [a, b] of MUTUALLY_EXCLUSIVE_GOAL_TYPE_PAIRS) {
    const left = inForce.filter((g) => g.goalType === a);
    const right = inForce.filter((g) => g.goalType === b);
    if (left.length > 0 && right.length > 0) out.push(conflict("MUTUALLY_EXCLUSIVE_GOAL_TYPES", [...left, ...right]));
  }
  const byType = new Map<ProductionGoalType, ProductionGoalDeclaration[]>();
  for (const g of inForce) byType.set(g.goalType, [...(byType.get(g.goalType) ?? []), g]);
  for (const goals of byType.values()) {
    if (new Set(goals.map(goalOutcomeKey)).size > 1) out.push(conflict("SAME_TYPE_DIFFERENT_OUTCOME", goals));
  }
  return out;
}

const compareConflicts = (a: IntentConflict, b: IntentConflict) => compareStrings(a.kind, b.kind) || compareStrings(canonicalizeValue(a.goals), canonicalizeValue(b.goals));

/** Projects already-canonical declarations for a valid query (module-internal; not frozen). */
export function projectCanonicalGoals(declarations: readonly unknown[], query: ValidGoalQuery, hash: CattleHash): GoalProjection {
  const { subject, effectiveAt, knowledgeCutoff } = query;
  const admission = admitGoalDeclarations(declarations, knowledgeCutoff);
  const subjectKey = goalSubjectKey(subject);
  let inForce: ProjectedGoal[] = [];
  let conflicts: IntentConflict[] = [];
  let suggestions: ProjectedGoal[] = [];
  let history: GoalHistoryEntry[] = [];
  let issues: GoalRecordIssue[] = [];
  let status: GoalProjectionStatus;
  if (!admission.ok) {
    issues = admission.issues;
    status = "INVALID";
  } else {
    const { known, supersededBy, byGoalId } = admission.admission;
    const mine = known.filter((r) => goalSubjectKey(r.subject) === subjectKey);
    history = mine.map((declaration) => {
      const by = [...(supersededBy.get(goalRecordKey(declaration.goalId, declaration.version)) ?? [])].sort(compareGoalVersionRefs);
      return { informationClass: "INTENT", standing: goalStanding(declaration), recordState: by.length > 0 ? "SUPERSEDED" : "LIVE", supersededBy: by, declaration };
    });
    const declared: ProductionGoalDeclaration[] = [];
    for (const goalId of [...new Set(mine.map((r) => r.goalId))].sort(compareStrings)) {
      const resolution = byGoalId.get(goalId)!;
      if (resolution.state === "RESOLVED") {
        const r = resolution.record;
        if (!inForceAt(r, effectiveAt)) continue;
        if (goalStanding(r) === "DECLARED") declared.push(r);
        else suggestions.push(projected(r, "RESOLVED"));
        continue;
      }
      const covering = resolution.records.filter((r) => inForceAt(r, effectiveAt));
      if (covering.length === 0) continue;
      // Every version of one goal shares its standing (admission invariant).
      if (goalStanding(resolution.records[0]) === "DECLARED") conflicts.push(conflict("COMPETING_VERSIONS", resolution.records));
      else suggestions.push(...covering.map((r) => projected(r, "VERSION_CONFLICT")));
    }
    declared.sort(byRef);
    inForce = declared.map((r) => projected(r, "RESOLVED"));
    conflicts = [...conflicts, ...structuralConflicts(declared)].sort(compareConflicts);
    suggestions = suggestions.sort((a, b) => byRef(a.declaration, b.declaration));
    status = conflicts.length > 0 ? "INTENT_CONFLICT" : inForce.length > 0 ? "ACTIVE" : "NONE";
  }

  const snapshotPayload = {
    subject,
    effectiveAt,
    knowledgeCutoff,
    status,
    inForce: inForce.map((g) => g.declaration),
    conflicts: conflicts.map((c) => ({ kind: c.kind, declarations: c.declarations })),
    issues,
  };
  const snapshot: GoalSnapshotRef = {
    goalPayloadVersion: CATTLE_GOAL_PAYLOAD_VERSION,
    subject,
    effectiveAt,
    knowledgeCutoff,
    status,
    goals: inForce.map((g) => goalVersionRef(g.declaration)),
    conflicts: conflicts.map((c) => ({ kind: c.kind, goals: c.goals })),
    fingerprint: computeGoalFingerprint("CATTLE_GOAL_SNAPSHOT", snapshotPayload, hash),
  };
  const content: Omit<GoalProjection, "fingerprint"> = {
    goalPayloadVersion: CATTLE_GOAL_PAYLOAD_VERSION,
    subject,
    effectiveAt,
    knowledgeCutoff,
    status,
    inForce,
    activeGoals: status === "ACTIVE" ? inForce : [],
    conflicts,
    suggestions,
    history,
    issues,
    snapshot,
  };
  return { ...content, fingerprint: computeGoalFingerprint("CATTLE_GOAL_PROJECTION", content, hash) };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Projects the production goals of one subject at (`effectiveAt`,
 * `knowledgeCutoff`). The complete request must be canonical plain data; a
 * malformed request fails closed (`ok: false`); a malformed ledger yields
 * status INVALID. The result is detached and deep-frozen.
 */
export function projectProductionGoals(request: GoalProjectionRequest, hash: CattleHash): GoalProjectionResult {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return deepFreezeAnimalValue({ ok: false, issues: [{ code: "CATTLE_GOAL_NON_CANONICAL_INPUT", ref: canonical.path }] });
  const read = readGoalRequest(canonical.value, []);
  if (!read.ok) return deepFreezeAnimalValue({ ok: false, issues: read.issues });
  const projection = projectCanonicalGoals(read.declarations, read.query, hash);
  return deepFreezeAnimalValue({ ok: true, projection: structuredClone(projection) });
}

export interface GoalSnapshotVerification {
  valid: boolean;
  reasonCode: "CATTLE_GOAL_SNAPSHOT_REPRODUCED" | "CATTLE_GOAL_SNAPSHOT_NON_CANONICAL_INPUT" | "CATTLE_GOAL_SNAPSHOT_MALFORMED" | "CATTLE_GOAL_SNAPSHOT_MISMATCH";
}

/**
 * Reproduces a `GoalSnapshotRef` from a supplied ledger: re-projects at the
 * snapshot's own subject and times and requires an identical snapshot
 * (fingerprint included). A ledger extended only by records first known
 * after the snapshot's cutoff reproduces it unchanged.
 */
export function verifyGoalSnapshotRef(request: { snapshot: GoalSnapshotRef; declarations: readonly unknown[] }, hash: CattleHash): GoalSnapshotVerification {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return { valid: false, reasonCode: "CATTLE_GOAL_SNAPSHOT_NON_CANONICAL_INPUT" };
  const req = canonical.value;
  if (!isRecord(req) || !hasOnlyFields(req, ["snapshot", "declarations"]) || !isRecord(req.snapshot)) return { valid: false, reasonCode: "CATTLE_GOAL_SNAPSHOT_MALFORMED" };
  const read = readGoalRequest(
    { declarations: req.declarations, query: { subject: req.snapshot.subject, effectiveAt: req.snapshot.effectiveAt, knowledgeCutoff: req.snapshot.knowledgeCutoff } },
    [],
  );
  if (!read.ok) return { valid: false, reasonCode: "CATTLE_GOAL_SNAPSHOT_MALFORMED" };
  const reproduced = projectCanonicalGoals(read.declarations, read.query, hash).snapshot;
  let same = false;
  try {
    same = canonicalizeValue(reproduced) === canonicalizeValue(req.snapshot);
  } catch {
    same = false; // a snapshot value outside the fingerprintable space never matches
  }
  return same ? { valid: true, reasonCode: "CATTLE_GOAL_SNAPSHOT_REPRODUCED" } : { valid: false, reasonCode: "CATTLE_GOAL_SNAPSHOT_MISMATCH" };
}
