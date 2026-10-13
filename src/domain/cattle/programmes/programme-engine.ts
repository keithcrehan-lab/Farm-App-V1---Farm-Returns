/**
 * Cattle C7 — veterinary / risk-based health-programme state at an explicit
 * (`effectiveAt`, `knowledgeCutoff`).
 *
 * `evaluateHealthProgrammes` answers, for every declared programme and every
 * supplied animal: which declared programme actions are due, done, unknown or
 * blocked at `effectiveAt`, as known at `knowledgeCutoff`. It is NOT a
 * vaccination or prescribing engine: it never chooses a product, dose, timing
 * or programme, never diagnoses, never matches completion fuzzily and ships
 * with no programme (CAT-INV-027). No clock is read.
 *
 * Order (TEMPORAL_EVIDENCE.md):
 * 1. The complete request is checked with `toCanonicalPlainData`;
 *    non-canonical input is rejected (`CATTLE_PROGRAMME_NON_CANONICAL_INPUT`)
 *    and only the detached, deep-frozen copy is used (CAT-INV-001/002).
 * 2. Query times; C1 ledgers (`rematerialiseAnimalLedger`; one per animal).
 * 3. Definitions, reviews and completion declarations admitted at the cutoff
 *    (later knowledge invisible, unreadable knowledge time fails closed,
 *    identity before validity, supersession without precedence). Any
 *    malformed admitted record fails the whole request closed.
 * 4. Predecessor outputs, each re-verified and bound to the same animal, the
 *    same times by instant and the same C1 ledger content (their C1 snapshot
 *    fingerprint equals the one projected here) (CAT-INV-014/023): C3
 *    `AnimalHealthProjection`
 *    (`verifyAnimalHealthProjection`; an unfiltered timeline; its withdrawal
 *    gates through C3 `projectWithdrawalHardGates`) and C2
 *    `AnimalObligationEvaluation` (through C2 `projectObligationHardGates`;
 *    every record, not only the envelope, must carry this animal, this C1
 *    snapshot fingerprint and the query's times).
 *    C7 never re-derives C3 withdrawal or C2 obligation state.
 * 5. Per programme: the governing version at `effectiveAt`
 *    (`programme-definition.ts`), its review state, membership, anchors,
 *    occurrences and per-occurrence state; rebuilt, sorted, fingerprinted,
 *    deep-frozen.
 *
 * REQUIRED inputs and state precedence (ARCHITECTURE.md §Status and evidence
 * precedence; first match wins). Programme level, one record per animal with
 * `occurrence: null` and `actionId: null`:
 *   EVIDENCE_CONFLICT  more than one version effective at `effectiveAt`;
 *   REVIEW_REQUIRED    the governing version is not APPROVED (production
 *                      state not PRODUCTION, or a required C0 review
 *                      dimension — VETERINARY for a veterinarian programme —
 *                      not APPROVED for this exact version and content);
 *   membership at `effectiveAt` (REQUIRED: a KNOWN basis) — INVALID_EVIDENCE
 *   (C4 INVALID / C1 INVALID_EVIDENCE) > EVIDENCE_CONFLICT > UNKNOWN >
 *   NOT_APPLICABLE (resolved non-member). Explicit set: listed ⇒ member.
 *   Group: C4 `resolveGroupScope`. Criteria: every declared criterion's C1
 *   fact (sex, date of birth) must be KNOWN, else unresolved.
 * Action level (member; `occurrence: null`): the anchor (REQUIRED: KNOWN
 *   C1 date of birth for `DATE_OF_BIRTH`) — INVALID_EVIDENCE >
 *   EVIDENCE_CONFLICT > UNKNOWN; never COMPLETED or NOT_APPLICABLE.
 * Occurrence level (`programme-schedule.ts` derivation and boundaries):
 *   INVALID_EVIDENCE   window not representable;
 *   NOT_APPLICABLE     window opens outside the governing version's
 *                      effective period (inclusive start, exclusive end);
 *   membership when the window opened (GROUP only, windows opened by
 *   `effectiveAt`; C4 at `opensAt`): INVALID_EVIDENCE > EVIDENCE_CONFLICT >
 *   UNKNOWN > NOT_APPLICABLE (resolved non-member);
 *   EVIDENCE_CONFLICT  a relevant completion declaration or C3 record is in
 *                      a competing correction, or counted completions
 *                      disagree on timing (in window vs late);
 *   COMPLETED          at least one counted completion (REQUIRED: a live
 *                      declaration for the exact governing version, or a
 *                      live in-window C3 record matching the declared
 *                      criteria, occurring by `effectiveAt` and not before
 *                      the window opens) and no unresolved candidate
 *                      evidence (an unresolved candidate could conceal a
 *                      timing conflict; CAT-INV-009);
 *   REVIEW_REQUIRED    only declarations for another programme version
 *                      (never counted, CAT-INV-025);
 *   INSUFFICIENT_EVIDENCE  unresolved candidate evidence (C3 projection not
 *                      supplied where C3 evidence is needed, a linked record
 *                      unknown / superseded / without a time, a product
 *                      binding unresolved);
 *   UPCOMING           `effectiveAt` before the window opens;
 *   BLOCKED            window open or passed and a declared gate is not
 *                      PASS / NOT_APPLICABLE (FAIL, UNKNOWN /
 *                      INSUFFICIENT_EVIDENCE, conflict, UNSUPPORTED,
 *                      REVIEW_REQUIRED, or not supplied);
 *   DUE / OVERDUE      inside / after the window.
 * Unresolved required evidence therefore never surfaces as COMPLETED or
 * NOT_APPLICABLE (CAT-INV-009). Animal / programme status folds its records
 * in `PROGRAMME_STATUS_PRECEDENCE` order. Completeness of the supplied
 * evidence is the adapter's responsibility (C3 precedent): OVERDUE asserts
 * only that no counted completion exists in the supplied, admitted data.
 */

import type { AssessmentFingerprint, FingerprintVerificationResult } from "../../assessment-integrity";
import {
  animalInstantKey,
  compareInstants,
  deepFreezeAnimalValue,
  isValidAnimalInstant,
  rematerialiseAnimalLedger,
  type AnimalLedger,
} from "../animal-ledger";
import { computeAnimalSnapshotFingerprint, projectAnimalSnapshot, type AnimalResolution, type AnimalSnapshot } from "../animal-snapshot";
import type { CattleEvaluationState, RuleEvaluationRecord } from "../evaluation";
import { compareStrings, sameFingerprint, sortedUnique, type CattleHash } from "../integrity";
import { toCanonicalPlainData } from "../regulatory/canonical-input";
import { canonicalObligationInstant, utcStartOfCalendarDate } from "../regulatory/obligation-time";
import { projectObligationHardGates, type AnimalObligationEvaluation } from "../regulatory";
import { projectWithdrawalHardGates, verifyAnimalHealthProjection, type AnimalHealthProjection, type HealthTimelineEntry, type MedicineLedgerEntry } from "../health";
import { hasOnlyFields, isRecord } from "../health/health-input";
import { resolveGroupScope } from "../weights";
import {
  admitProgrammeDefinitions,
  admitProgrammeReviews,
  canonicalInstant,
  definitionFingerprint,
  programmeInformationClass,
  programmeReviewState,
  resolveGoverningVersion,
  uniqueProgrammeIssues,
  versionEffectiveAt,
  type HealthProgrammeDefinition,
  type ProgrammeAction,
  type ProgrammeApplicability,
  type ProgrammeClassification,
  type ProgrammeRecordIssueCode,
  type ProgrammeReviewRecord,
  type ProgrammeReviewState,
  type ProgrammeVersionHistory,
} from "./programme-definition";
import { admitProgrammeCompletions, type CompletionIssueCode, type CompletionResolution, type ProgrammeCompletionRecord } from "./programme-completion";
import { deriveProgrammeOccurrences, windowPosition, type ProgrammeOccurrence } from "./programme-schedule";
import { CATTLE_PROGRAMME_PAYLOAD_VERSION, computeProgrammeFingerprint, verifyProgrammeFingerprint } from "./programme-integrity";

export const PROGRAMME_OCCURRENCE_STATES = [
  "NOT_APPLICABLE",
  "UPCOMING",
  "DUE",
  "COMPLETED",
  "OVERDUE",
  "BLOCKED",
  "UNKNOWN",
  "INSUFFICIENT_EVIDENCE",
  "EVIDENCE_CONFLICT",
  "REVIEW_REQUIRED",
  "INVALID_EVIDENCE",
] as const;
export type ProgrammeOccurrenceState = (typeof PROGRAMME_OCCURRENCE_STATES)[number];

/** Fold order for animal / group / programme status (first present wins). */
export const PROGRAMME_STATUS_PRECEDENCE: readonly ProgrammeOccurrenceState[] = Object.freeze([
  "REVIEW_REQUIRED",
  "INVALID_EVIDENCE",
  "EVIDENCE_CONFLICT",
  "UNKNOWN",
  "INSUFFICIENT_EVIDENCE",
  "BLOCKED",
  "OVERDUE",
  "DUE",
  "UPCOMING",
  "COMPLETED",
  "NOT_APPLICABLE",
]);

export interface HealthProgrammeQuery {
  /** VALID time. */
  effectiveAt: string;
  /** KNOWLEDGE time. */
  knowledgeCutoff: string;
}

/** Every part must be canonical plain data (CAMPAIGN.md, "Canonical input contract"). */
export interface HealthProgrammeRequest {
  /** `HealthProgrammeDefinition` records (the whole append-only catalogue; empty in production). */
  definitions: readonly unknown[];
  /** `ProgrammeReviewRecord`s. */
  reviews: readonly unknown[];
  /** `ProgrammeCompletionRecord` declarations. */
  completions: readonly unknown[];
  /** C1 ledgers — the animals evaluated (one per animal). */
  ledgers: readonly AnimalLedger[];
  /** C3 projections (at most one per animal) at the query's own times. */
  health: readonly AnimalHealthProjection[];
  /** C2 evaluations (at most one per animal) at the query's own times. */
  obligations: readonly AnimalObligationEvaluation[];
  query: HealthProgrammeQuery;
}

export type ProgrammeMembershipState = "MEMBER" | "NOT_MEMBER" | "UNKNOWN" | "EVIDENCE_CONFLICT" | "INVALID";

export interface ProgrammeMembership {
  state: ProgrammeMembershipState;
  basis: ProgrammeApplicability["kind"];
  /** Canonical instant the membership was resolved at. */
  at: string;
  reasonCodes: string[];
}

export interface ProgrammeGateCheck {
  ruleId: string;
  state: CattleEvaluationState | "NOT_SUPPLIED";
  source: "C2_OBLIGATION" | "C3_WITHDRAWAL" | null;
  blocking: boolean;
}

export interface CountedCompletion {
  basis: "DECLARATION" | "HEALTH_RECORD_LINK" | "DECLARED_CRITERIA";
  declarationId: string | null;
  healthRecordId: string | null;
  /** Canonical spelling. */
  completedAt: string;
  timing: "IN_WINDOW" | "LATE";
}

export interface EvidenceNote {
  /** Declaration id or C3 record id. */
  ref: string;
  reason: string;
}

export interface ProgrammeCompletionSummary {
  /** Every known declaration naming this occurrence, live or superseded (sorted). */
  consideredDeclarationIds: string[];
  counted: CountedCompletion[];
  otherVersionDeclarationIds: string[];
  beforeWindow: string[];
  notYetOccurred: string[];
  unresolved: EvidenceNote[];
  mismatched: EvidenceNote[];
  conflicting: string[];
}

export interface ProgrammeOccurrenceRecord {
  programmeId: string;
  programmeVersion: string | null;
  /** `null` for a programme-level record. */
  actionId: string | null;
  actionKind: string | null;
  animalId: string;
  /** `null` for a programme- or action-level record. */
  occurrence: ProgrammeOccurrence | null;
  state: ProgrammeOccurrenceState;
  reasonCodes: string[];
  completion: ProgrammeCompletionSummary | null;
  gates: ProgrammeGateCheck[];
}

export interface ProgrammeAnimalInputs {
  snapshotFingerprint: AssessmentFingerprint;
  health: { timeline: AssessmentFingerprint; medicineLedger: AssessmentFingerprint; withdrawalGate: AssessmentFingerprint } | null;
  /** C2 obligation state record fingerprints (sorted by digest), or `null` when no evaluation was supplied. */
  obligationRecords: AssessmentFingerprint[] | null;
}

export interface ProgrammeAnimalStatus {
  programmeId: string;
  animalId: string;
  programmeVersion: string | null;
  classification: ProgrammeClassification;
  informationClass: "RULE" | "INTENT";
  membership: ProgrammeMembership | null;
  status: ProgrammeOccurrenceState;
  /** Sorted by action id (programme-level first), then occurrence index. */
  records: ProgrammeOccurrenceRecord[];
  /** Live completion declarations for this animal and programme naming no derived occurrence (sorted). */
  unmatchedDeclarationIds: string[];
  /** Every completion declaration for this animal and programme known by the cutoff, live or superseded, with its declarer, provenance and supersession (sorted by id; CAT-INV-021). */
  declarations: ProgrammeCompletionRecord[];
  inputs: ProgrammeAnimalInputs;
  fingerprint: AssessmentFingerprint;
}

export interface ProgrammeVersionEntry extends ProgrammeVersionHistory {
  definitionFingerprint: AssessmentFingerprint;
}

export interface ProgrammeScopeSummary {
  applicability: ProgrammeApplicability;
  members: string[];
  notMembers: string[];
  unknown: string[];
  conflict: string[];
  invalid: string[];
  /** Explicit-set members with no supplied ledger (never assumed done or not applicable). */
  declaredMembersNotEvaluated: string[];
}

export type ProgrammeStatusValue = ProgrammeOccurrenceState | "NOT_IN_FORCE" | "NO_ANIMALS_EVALUATED";

export interface ProgrammeStatus {
  programmeId: string;
  classification: ProgrammeClassification;
  informationClass: "RULE" | "INTENT";
  versionState: "GOVERNING" | "NOT_IN_FORCE" | "VERSION_CONFLICT";
  /** `reviewRecords`: the live review records bound to the governing version (sorted by id), retained so reviewer, time and supersession are bound to the result (CAT-INV-021). */
  governing: { version: ProgrammeVersionEntry; review: ProgrammeReviewState; reviewRecords: ProgrammeReviewRecord[] } | null;
  /** Versions effective at `effectiveAt` when in conflict (no winner). */
  conflictingVersions: ProgrammeVersionEntry[];
  /** Every known version (history, incl. superseded), sorted by version. */
  versions: ProgrammeVersionEntry[];
  scope: ProgrammeScopeSummary | null;
  status: ProgrammeStatusValue;
  animals: ProgrammeAnimalStatus[];
}

export interface ProgrammeStatusEvaluation {
  programmePayloadVersion: typeof CATTLE_PROGRAMME_PAYLOAD_VERSION;
  /** Canonical spellings. */
  effectiveAt: string;
  knowledgeCutoff: string;
  /** NO_PROGRAMME: no programme known at the cutoff (never "compliant"); NONE_IN_FORCE: none governs `effectiveAt`. */
  outcome: "NO_PROGRAMME" | "NONE_IN_FORCE" | "EVALUATED";
  animalIds: string[];
  programmes: ProgrammeStatus[];
  fingerprint: AssessmentFingerprint;
}

export type ProgrammeRequestIssueCode =
  | "CATTLE_PROGRAMME_NON_CANONICAL_INPUT"
  | "CATTLE_PROGRAMME_INVALID_REQUEST"
  | "CATTLE_PROGRAMME_INVALID_EFFECTIVE_AT"
  | "CATTLE_PROGRAMME_INVALID_KNOWLEDGE_CUTOFF"
  | "CATTLE_PROGRAMME_INVALID_LEDGER"
  | "CATTLE_PROGRAMME_DUPLICATE_ANIMAL"
  | "CATTLE_PROGRAMME_HEALTH_PROJECTION_INVALID"
  | "CATTLE_PROGRAMME_HEALTH_PROJECTION_FILTERED"
  | "CATTLE_PROGRAMME_HEALTH_PROJECTION_TIME_MISMATCH"
  | "CATTLE_PROGRAMME_HEALTH_PROJECTION_UNKNOWN_ANIMAL"
  | "CATTLE_PROGRAMME_HEALTH_PROJECTION_DUPLICATE"
  | "CATTLE_PROGRAMME_HEALTH_PROJECTION_LEDGER_MISMATCH"
  | "CATTLE_PROGRAMME_OBLIGATIONS_INVALID"
  | "CATTLE_PROGRAMME_OBLIGATIONS_TIME_MISMATCH"
  | "CATTLE_PROGRAMME_OBLIGATIONS_UNKNOWN_ANIMAL"
  | "CATTLE_PROGRAMME_OBLIGATIONS_DUPLICATE"
  | "CATTLE_PROGRAMME_OBLIGATIONS_LEDGER_MISMATCH"
  | "CATTLE_PROGRAMME_OBLIGATIONS_FOREIGN_RECORD"
  | ProgrammeRecordIssueCode
  | CompletionIssueCode;

export interface ProgrammeIssue {
  code: ProgrammeRequestIssueCode;
  /** Record / animal / non-canonical path when readable. */
  ref: string | null;
}

export type ProgrammeEvaluationResult = { ok: true; evaluation: ProgrammeStatusEvaluation } | { ok: false; issues: ProgrammeIssue[] };

// ---------------------------------------------------------------------------
// Request reading (already-canonical data)
// ---------------------------------------------------------------------------

const REQUEST_FIELDS = ["definitions", "reviews", "completions", "ledgers", "health", "obligations", "query"];

interface AnimalContext {
  animalId: string;
  ledger: AnimalLedger;
  snapshot: AnimalSnapshot;
  health: AnimalHealthProjection | null;
  /** Gate rule id → supplied gate records. */
  gates: Map<string, { state: CattleEvaluationState; source: "C2_OBLIGATION" | "C3_WITHDRAWAL" }[]>;
  inputs: ProgrammeAnimalInputs;
}

interface ReadRequest {
  effectiveAt: string;
  knowledgeCutoff: string;
  definitions: unknown[];
  reviews: unknown[];
  completions: unknown[];
  ledgers: unknown[];
  health: unknown[];
  obligations: unknown[];
}

function readRequest(req: unknown): { ok: true; read: ReadRequest } | { ok: false; issues: ProgrammeIssue[] } {
  const arrays = ["definitions", "reviews", "completions", "ledgers", "health", "obligations"] as const;
  if (!isRecord(req) || !hasOnlyFields(req, REQUEST_FIELDS) || !arrays.every((k) => Array.isArray(req[k])) || !isRecord(req.query) || !hasOnlyFields(req.query, ["effectiveAt", "knowledgeCutoff"])) {
    return { ok: false, issues: [{ code: "CATTLE_PROGRAMME_INVALID_REQUEST", ref: null }] };
  }
  const effectiveAt = canonicalInstant(req.query.effectiveAt);
  const knowledgeCutoff = canonicalInstant(req.query.knowledgeCutoff);
  const issues: ProgrammeIssue[] = [];
  if (effectiveAt === null) issues.push({ code: "CATTLE_PROGRAMME_INVALID_EFFECTIVE_AT", ref: null });
  if (knowledgeCutoff === null) issues.push({ code: "CATTLE_PROGRAMME_INVALID_KNOWLEDGE_CUTOFF", ref: null });
  if (effectiveAt === null || knowledgeCutoff === null) return { ok: false, issues };
  const at = (k: (typeof arrays)[number]) => req[k] as unknown[];
  return {
    ok: true,
    read: {
      effectiveAt,
      knowledgeCutoff,
      definitions: at("definitions"),
      reviews: at("reviews"),
      completions: at("completions"),
      ledgers: at("ledgers"),
      health: at("health"),
      obligations: at("obligations"),
    },
  };
}

/** Runs a frozen predecessor verifier; a malformed canonical value it cannot read fails closed (`null` / `false`). */
function failClosed<T>(run: () => T): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

const sameInstant = (a: unknown, b: string) => isValidAnimalInstant(a) && animalInstantKey(a) === animalInstantKey(b);

/**
 * Every consumed C2 record — not only its envelope — must belong to this
 * evaluation: this animal, this C1 snapshot and the query's own times
 * (CAT-INV-014/021/023). C2 binds each record to its own snapshot; a matching
 * envelope never vouches for the records it carries. A mismatch is never
 * repaired or skipped: the whole request fails closed.
 */
function obligationRecordBelongs(record: unknown, ctx: AnimalContext, read: ReadRequest): boolean {
  return (
    isRecord(record) &&
    record.animalId === ctx.animalId &&
    isRecord(record.snapshotFingerprint) &&
    sameFingerprint(record.snapshotFingerprint as unknown as AssessmentFingerprint, ctx.inputs.snapshotFingerprint) &&
    sameInstant(record.effectiveAt, read.effectiveAt) &&
    sameInstant(record.knowledgeCutoff, read.knowledgeCutoff)
  );
}

const UNFILTERED = (f: unknown) => isRecord(f) && f.kinds === null && f.occurredFrom === null && f.occurredTo === null;

function readAnimals(read: ReadRequest, hash: CattleHash): { ok: true; animals: Map<string, AnimalContext> } | { ok: false; issues: ProgrammeIssue[] } {
  const issues: ProgrammeIssue[] = [];
  const animals = new Map<string, AnimalContext>();
  for (const raw of read.ledgers) {
    const ledger = rematerialiseAnimalLedger(raw);
    if (!ledger.ok) {
      issues.push({ code: "CATTLE_PROGRAMME_INVALID_LEDGER", ref: isRecord(raw) && typeof raw.animalId === "string" ? raw.animalId : null });
      continue;
    }
    const animalId = ledger.ledger.animalId as string;
    if (animals.has(animalId)) {
      issues.push({ code: "CATTLE_PROGRAMME_DUPLICATE_ANIMAL", ref: animalId });
      continue;
    }
    const projected = projectAnimalSnapshot(ledger.ledger, { effectiveAt: read.effectiveAt, knowledgeCutoff: read.knowledgeCutoff });
    if (!projected.ok) {
      issues.push({ code: "CATTLE_PROGRAMME_INVALID_LEDGER", ref: animalId });
      continue;
    }
    animals.set(animalId, {
      animalId,
      ledger: ledger.ledger,
      snapshot: projected.snapshot,
      health: null,
      gates: new Map(),
      inputs: { snapshotFingerprint: computeAnimalSnapshotFingerprint(projected.snapshot, hash), health: null, obligationRecords: null },
    });
  }
  const addGates = (ctx: AnimalContext, records: readonly RuleEvaluationRecord[], source: "C2_OBLIGATION" | "C3_WITHDRAWAL") => {
    for (const r of records) ctx.gates.set(r.requestedRuleId, [...(ctx.gates.get(r.requestedRuleId) ?? []), { state: r.state, source }]);
  };
  const seenHealth = new Set<string>();
  for (const raw of read.health) {
    const p = raw as AnimalHealthProjection;
    const animalId = isRecord(raw) && typeof raw.animalId === "string" ? raw.animalId : null;
    if (!failClosed(() => verifyAnimalHealthProjection(p, hash).valid)) {
      issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_INVALID", ref: animalId });
      continue;
    }
    const ctx = animals.get(p.animalId);
    if (!ctx) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_UNKNOWN_ANIMAL", ref: p.animalId });
    else if (seenHealth.has(p.animalId)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_DUPLICATE", ref: p.animalId });
    else if (!sameInstant(p.effectiveAt, read.effectiveAt) || !sameInstant(p.knowledgeCutoff, read.knowledgeCutoff)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_TIME_MISMATCH", ref: p.animalId });
    else if (!UNFILTERED(p.timeline.filter)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_FILTERED", ref: p.animalId });
    else if (!sameFingerprint(p.snapshotFingerprint, ctx.inputs.snapshotFingerprint)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_LEDGER_MISMATCH", ref: p.animalId });
    else {
      const gates = failClosed(() => projectWithdrawalHardGates(p, hash));
      if (!gates || !gates.ok) {
        issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_INVALID", ref: p.animalId });
        continue;
      }
      seenHealth.add(p.animalId);
      ctx.health = p;
      ctx.inputs.health = { timeline: p.timeline.fingerprint, medicineLedger: p.medicineLedger.fingerprint, withdrawalGate: p.withdrawalGate.fingerprint };
      addGates(ctx, gates.gates.ruleEvaluations, "C3_WITHDRAWAL");
    }
  }
  const seenObligations = new Set<string>();
  for (const raw of read.obligations) {
    const e = raw as AnimalObligationEvaluation;
    const animalId = isRecord(raw) && typeof raw.animalId === "string" ? raw.animalId : null;
    const projected = isRecord(raw) && Array.isArray(raw.results) ? failClosed(() => projectObligationHardGates(e, hash)) : null;
    if (!projected || !projected.ok) {
      issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_INVALID", ref: animalId });
      continue;
    }
    const ctx = animals.get(e.animalId);
    if (!ctx) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_UNKNOWN_ANIMAL", ref: e.animalId });
    else if (seenObligations.has(e.animalId)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_DUPLICATE", ref: e.animalId });
    else if (!sameInstant(e.effectiveAt, read.effectiveAt) || !sameInstant(e.knowledgeCutoff, read.knowledgeCutoff)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_TIME_MISMATCH", ref: e.animalId });
    else if (!sameFingerprint(e.snapshotFingerprint, ctx.inputs.snapshotFingerprint)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_LEDGER_MISMATCH", ref: e.animalId });
    else if (!e.results.every((r) => obligationRecordBelongs(r, ctx, read))) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_FOREIGN_RECORD", ref: e.animalId });
    else {
      seenObligations.add(e.animalId);
      ctx.inputs.obligationRecords = e.results.map((r) => r.fingerprint).sort((a, b) => compareStrings(a.digest, b.digest));
      addGates(ctx, projected.projection.ruleEvaluations, "C2_OBLIGATION");
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, animals };
}

// ---------------------------------------------------------------------------
// Membership and anchors (through C1 / C4 only)
// ---------------------------------------------------------------------------

function fromC1<T>(r: AnimalResolution<T>): "INVALID" | "EVIDENCE_CONFLICT" | "UNKNOWN" | null {
  switch (r.state) {
    case "INVALID_EVIDENCE":
      return "INVALID";
    case "CONFLICTING_EVIDENCE":
      return "EVIDENCE_CONFLICT";
    case "UNKNOWN":
      return "UNKNOWN";
    case "KNOWN":
      return null;
  }
}

const UNRESOLVED_ORDER: readonly ProgrammeMembershipState[] = ["INVALID", "EVIDENCE_CONFLICT", "UNKNOWN"];

function membershipAt(applicability: ProgrammeApplicability, ctx: AnimalContext, at: string, knowledgeCutoff: string, hash: CattleHash): ProgrammeMembership {
  const of = (state: ProgrammeMembershipState, reasonCodes: string[] = []): ProgrammeMembership => ({ state, basis: applicability.kind, at, reasonCodes: sortedUnique(reasonCodes) });
  switch (applicability.kind) {
    case "EXPLICIT_SET":
      return of(applicability.animalIds.includes(ctx.animalId) ? "MEMBER" : "NOT_MEMBER");
    case "GROUP": {
      const scope = resolveGroupScope({ scope: { kind: "GROUP", groupRef: applicability.groupRef, ledgers: [ctx.ledger] }, query: { effectiveAt: at, knowledgeCutoff } }, hash);
      if (!scope.ok) return of("INVALID", ["CATTLE_PROGRAMME_GROUP_SCOPE_UNRESOLVABLE"]);
      const entry = scope.scope.animals.find((a) => a.animalId === ctx.animalId);
      return entry ? of(entry.state, [...entry.issues]) : of("UNKNOWN", ["CATTLE_PROGRAMME_GROUP_SCOPE_ANIMAL_ABSENT"]);
    }
    case "CRITERIA": {
      const { sex, dateOfBirth } = ctx.snapshot;
      const unresolved: ProgrammeMembershipState[] = [];
      const reasons: string[] = [];
      if (applicability.sex !== null) {
        const s = fromC1(sex);
        if (s !== null) {
          unresolved.push(s);
          reasons.push(`CATTLE_PROGRAMME_CRITERIA_SEX_${s}`, ...sex.issues);
        }
      }
      if (applicability.bornOnOrAfter !== null || applicability.bornBefore !== null) {
        const s = fromC1(dateOfBirth);
        if (s !== null) {
          unresolved.push(s);
          reasons.push(`CATTLE_PROGRAMME_CRITERIA_DATE_OF_BIRTH_${s}`, ...dateOfBirth.issues);
        }
      }
      const worst = UNRESOLVED_ORDER.find((s) => unresolved.includes(s));
      if (worst !== undefined) return of(worst, reasons);
      const dob = dateOfBirth.value;
      const matches =
        (applicability.sex === null || sex.value === applicability.sex) &&
        (applicability.bornOnOrAfter === null || (dob !== null && compareStrings(dob, applicability.bornOnOrAfter) >= 0)) &&
        (applicability.bornBefore === null || (dob !== null && compareStrings(dob, applicability.bornBefore) < 0));
      return of(matches ? "MEMBER" : "NOT_MEMBER");
    }
  }
}

const MEMBERSHIP_TO_STATE: Record<Exclude<ProgrammeMembershipState, "MEMBER">, ProgrammeOccurrenceState> = {
  NOT_MEMBER: "NOT_APPLICABLE",
  UNKNOWN: "UNKNOWN",
  EVIDENCE_CONFLICT: "EVIDENCE_CONFLICT",
  INVALID: "INVALID_EVIDENCE",
};

type AnchorResult = { state: "KNOWN"; at: string } | { state: "UNRESOLVED"; occurrenceState: ProgrammeOccurrenceState; reasonCodes: string[] };

function anchorOf(action: ProgrammeAction, ctx: AnimalContext): AnchorResult {
  const anchor = action.schedule.anchor;
  if (anchor.kind === "FIXED_INSTANT") return { state: "KNOWN", at: anchor.at };
  const dob = ctx.snapshot.dateOfBirth;
  const unresolved = fromC1(dob);
  if (unresolved !== null) return { state: "UNRESOLVED", occurrenceState: MEMBERSHIP_TO_STATE[unresolved], reasonCodes: [`CATTLE_PROGRAMME_ANCHOR_DATE_OF_BIRTH_${dob.state}`, ...dob.issues] };
  const at = dob.value === null ? null : utcStartOfCalendarDate(dob.value);
  return at === null ? { state: "UNRESOLVED", occurrenceState: "INVALID_EVIDENCE", reasonCodes: ["CATTLE_PROGRAMME_ANCHOR_NOT_REPRESENTABLE"] } : { state: "KNOWN", at };
}

// ---------------------------------------------------------------------------
// Gates and completion evidence
// ---------------------------------------------------------------------------

function gateChecks(action: ProgrammeAction, ctx: AnimalContext): ProgrammeGateCheck[] {
  const out: ProgrammeGateCheck[] = [];
  for (const ruleId of action.gates) {
    const supplied = ctx.gates.get(ruleId) ?? [];
    if (supplied.length === 0) out.push({ ruleId, state: "NOT_SUPPLIED", source: null, blocking: true });
    for (const g of supplied) out.push({ ruleId, state: g.state, source: g.source, blocking: g.state !== "PASS" && g.state !== "NOT_APPLICABLE" });
  }
  return out.sort((a, b) => compareStrings(a.ruleId, b.ruleId) || compareStrings(a.source ?? "", b.source ?? "") || compareStrings(a.state, b.state));
}

type Match = { kind: "MATCH" } | { kind: "MISMATCH"; reason: string } | { kind: "UNRESOLVED"; reason: string };

/** Declared criteria only: exact record kind, exact event type, exact product id (and bound version when declared). */
function matchHealthRecord(action: ProgrammeAction, entry: HealthTimelineEntry, ledgerEntry: MedicineLedgerEntry | undefined): Match {
  const { recordKind, eventTypes } = action.completion;
  const record = entry.record;
  if (recordKind === null) return { kind: "MISMATCH", reason: "CATTLE_PROGRAMME_EVIDENCE_KIND_NOT_ACCEPTED" };
  if (record.kind !== recordKind) return { kind: "MISMATCH", reason: "CATTLE_PROGRAMME_EVIDENCE_KIND_MISMATCH" };
  if (record.kind === "VETERINARY_EVENT") return eventTypes !== null && eventTypes.includes(record.eventType) ? { kind: "MATCH" } : { kind: "MISMATCH", reason: "CATTLE_PROGRAMME_EVENT_TYPE_MISMATCH" };
  if (record.kind !== "MEDICINE_ADMINISTRATION" || action.productRef === null) return { kind: "MATCH" };
  if (record.productId === null) return { kind: "UNRESOLVED", reason: "CATTLE_PROGRAMME_PRODUCT_NOT_IDENTIFIED" };
  if (record.productId !== action.productRef.productId) return { kind: "MISMATCH", reason: "CATTLE_PROGRAMME_PRODUCT_MISMATCH" };
  if (action.productRef.productVersion === null) return { kind: "MATCH" };
  const binding = ledgerEntry?.binding;
  if (!binding || binding.state !== "BOUND" || binding.product === null) return { kind: "UNRESOLVED", reason: `CATTLE_PROGRAMME_PRODUCT_BINDING_${binding?.state ?? "NOT_FOUND"}` };
  return binding.product.version === action.productRef.productVersion ? { kind: "MATCH" } : { kind: "MISMATCH", reason: "CATTLE_PROGRAMME_PRODUCT_VERSION_MISMATCH" };
}

interface OccurrenceContext {
  definition: HealthProgrammeDefinition;
  action: ProgrammeAction;
  ctx: AnimalContext;
  effectiveAt: string;
  knowledgeCutoff: string;
  /** The governing version's effective period at the cutoff. */
  period: Pick<ProgrammeVersionHistory, "effectiveFrom" | "effectiveTo">;
  declarations: readonly ProgrammeCompletionRecord[];
  completions: CompletionResolution;
}

function evaluateCompletion(o: OccurrenceContext, occ: ProgrammeOccurrence): ProgrammeCompletionSummary {
  const { action, ctx, effectiveAt, completions } = o;
  const summary: ProgrammeCompletionSummary = {
    consideredDeclarationIds: [],
    counted: [],
    otherVersionDeclarationIds: [],
    beforeWindow: [],
    notYetOccurred: [],
    unresolved: [],
    mismatched: [],
    conflicting: [],
  };
  const timeline = ctx.health?.timeline.entries ?? [];
  const ledgerById = new Map((ctx.health?.medicineLedger.entries ?? []).map((e) => [e.recordId, e]));
  const linkedIds = new Set<string>();
  const place = (ref: string, t: string, base: Omit<CountedCompletion, "completedAt" | "timing">) => {
    if (compareInstants(t, effectiveAt) > 0) return summary.notYetOccurred.push(ref);
    const pos = windowPosition(occ, t);
    if (pos === "BEFORE") return summary.beforeWindow.push(ref);
    summary.counted.push({ ...base, completedAt: t, timing: pos === "IN" ? "IN_WINDOW" : "LATE" });
  };
  const mine = o.declarations.filter((d) => d.occurrenceId === occ.occurrenceId);
  summary.consideredDeclarationIds = mine.map((d) => d.recordId);
  const live = new Set(completions.live.map((d) => d.recordId));
  for (const d of mine) {
    if (!live.has(d.recordId)) continue;
    if (completions.competingIds.has(d.recordId)) {
      summary.conflicting.push(d.recordId);
      continue;
    }
    if (d.kind === "RETRACTION" || d.evidence === null) continue;
    if (d.programmeVersion !== o.definition.version) {
      summary.otherVersionDeclarationIds.push(d.recordId);
      continue;
    }
    if (d.evidence.kind === "DECLARED") {
      place(d.recordId, d.evidence.completedAt, { basis: "DECLARATION", declarationId: d.recordId, healthRecordId: null });
      continue;
    }
    const healthRecordId = d.evidence.healthRecordId;
    linkedIds.add(healthRecordId);
    if (action.completion.recordKind === null) {
      summary.mismatched.push({ ref: d.recordId, reason: "CATTLE_PROGRAMME_EVIDENCE_KIND_NOT_ACCEPTED" });
      continue;
    }
    if (ctx.health === null) {
      summary.unresolved.push({ ref: d.recordId, reason: "CATTLE_PROGRAMME_HEALTH_PROJECTION_NOT_SUPPLIED" });
      continue;
    }
    const entry = timeline.find((e) => e.recordId === healthRecordId);
    if (!entry) {
      if (ctx.health.timeline.notYetOccurredRecordIds.includes(healthRecordId)) summary.notYetOccurred.push(d.recordId);
      else summary.unresolved.push({ ref: d.recordId, reason: "CATTLE_PROGRAMME_LINKED_RECORD_NOT_KNOWN" });
      continue;
    }
    if (entry.status !== "LIVE") {
      summary.unresolved.push({ ref: d.recordId, reason: "CATTLE_PROGRAMME_LINKED_RECORD_SUPERSEDED" });
      continue;
    }
    if (entry.inCompetition) {
      summary.conflicting.push(d.recordId);
      continue;
    }
    const match = matchHealthRecord(action, entry, ledgerById.get(entry.recordId));
    if (match.kind === "MISMATCH") summary.mismatched.push({ ref: d.recordId, reason: match.reason });
    else if (match.kind === "UNRESOLVED") summary.unresolved.push({ ref: d.recordId, reason: match.reason });
    else if (entry.occurredAt === null) summary.unresolved.push({ ref: d.recordId, reason: "CATTLE_PROGRAMME_LINKED_RECORD_TIME_UNKNOWN" });
    else place(d.recordId, canonicalObligationInstant(entry.occurredAt) as string, { basis: "HEALTH_RECORD_LINK", declarationId: d.recordId, healthRecordId });
  }
  const opened = windowPosition(occ, effectiveAt) !== "BEFORE";
  if (action.completion.matchCriteria) {
    if (ctx.health === null) {
      if (opened) summary.unresolved.push({ ref: occ.occurrenceId, reason: "CATTLE_PROGRAMME_HEALTH_PROJECTION_NOT_SUPPLIED" });
    } else {
      for (const entry of timeline) {
        if (entry.status !== "LIVE" || entry.kind !== action.completion.recordKind || linkedIds.has(entry.recordId)) continue;
        const match = matchHealthRecord(action, entry, ledgerById.get(entry.recordId));
        if (match.kind === "MISMATCH") continue;
        if (entry.occurredAt === null) {
          if (opened) summary.unresolved.push({ ref: entry.recordId, reason: "CATTLE_PROGRAMME_CANDIDATE_RECORD_TIME_UNKNOWN" });
          continue;
        }
        const t = canonicalObligationInstant(entry.occurredAt) as string;
        // Declared criteria complete only inside the window; a late record counts only through an explicit link.
        if (compareInstants(t, effectiveAt) > 0 || windowPosition(occ, t) !== "IN") continue;
        if (entry.inCompetition) summary.conflicting.push(entry.recordId);
        else if (match.kind === "UNRESOLVED") summary.unresolved.push({ ref: entry.recordId, reason: match.reason });
        else summary.counted.push({ basis: "DECLARED_CRITERIA", declarationId: null, healthRecordId: entry.recordId, completedAt: t, timing: "IN_WINDOW" });
      }
    }
  }
  const byRef = (a: EvidenceNote, b: EvidenceNote) => compareStrings(a.ref, b.ref) || compareStrings(a.reason, b.reason);
  summary.counted.sort((a, b) => compareStrings(a.basis, b.basis) || compareStrings(a.declarationId ?? "", b.declarationId ?? "") || compareStrings(a.healthRecordId ?? "", b.healthRecordId ?? ""));
  for (const k of ["consideredDeclarationIds", "otherVersionDeclarationIds", "beforeWindow", "notYetOccurred", "conflicting"] as const) summary[k] = sortedUnique(summary[k]);
  summary.unresolved.sort(byRef);
  summary.mismatched.sort(byRef);
  return summary;
}

function occurrenceRecord(o: OccurrenceContext, occ: ProgrammeOccurrence, gates: ProgrammeGateCheck[], hash: CattleHash): ProgrammeOccurrenceRecord {
  const { definition, action, ctx, effectiveAt } = o;
  const base = { programmeId: definition.programmeId, programmeVersion: definition.version, actionId: action.actionId, actionKind: action.actionKind, animalId: ctx.animalId, occurrence: occ, gates };
  if (!versionEffectiveAt(o.period, occ.opensAt)) {
    return { ...base, state: "NOT_APPLICABLE", reasonCodes: ["CATTLE_PROGRAMME_WINDOW_OUTSIDE_PROGRAMME_PERIOD"], completion: null };
  }
  const position = windowPosition(occ, effectiveAt);
  if (definition.applicability.kind === "GROUP" && position !== "BEFORE") {
    const m = membershipAt(definition.applicability, ctx, occ.opensAt, o.knowledgeCutoff, hash);
    const opened = m.state;
    if (opened !== "MEMBER") return { ...base, state: MEMBERSHIP_TO_STATE[opened], reasonCodes: sortedUnique([`CATTLE_PROGRAMME_MEMBERSHIP_AT_WINDOW_OPEN_${opened}`, ...m.reasonCodes]), completion: null };
  }
  const completion = evaluateCompletion(o, occ);
  const timings = new Set(completion.counted.map((c) => c.timing));
  const blocking = gates.filter((g) => g.blocking);
  let state: ProgrammeOccurrenceState;
  const reasons: string[] = [];
  if (completion.conflicting.length > 0 || timings.size > 1) {
    state = "EVIDENCE_CONFLICT";
    reasons.push(timings.size > 1 ? "CATTLE_PROGRAMME_COMPLETION_TIMING_DISAGREES" : "CATTLE_PROGRAMME_COMPLETION_COMPETING_EVIDENCE");
  } else if (completion.counted.length > 0 && completion.unresolved.length === 0) {
    state = "COMPLETED";
    reasons.push(timings.has("LATE") ? "CATTLE_PROGRAMME_COMPLETED_LATE" : "CATTLE_PROGRAMME_COMPLETED_IN_WINDOW");
  } else if (completion.otherVersionDeclarationIds.length > 0) {
    state = "REVIEW_REQUIRED";
    reasons.push("CATTLE_PROGRAMME_COMPLETION_FOR_OTHER_VERSION");
  } else if (completion.unresolved.length > 0) {
    state = "INSUFFICIENT_EVIDENCE";
    reasons.push(...completion.unresolved.map((u) => u.reason));
  } else if (position === "BEFORE") {
    state = "UPCOMING";
  } else if (blocking.length > 0) {
    state = "BLOCKED";
    reasons.push(...blocking.map((g) => `CATTLE_PROGRAMME_GATE_${g.state}:${g.ruleId}`));
  } else {
    state = position === "IN" ? "DUE" : "OVERDUE";
  }
  return { ...base, state, reasonCodes: sortedUnique(reasons), completion };
}

// ---------------------------------------------------------------------------
// Per animal / per programme
// ---------------------------------------------------------------------------

export function foldProgrammeStates(states: readonly ProgrammeOccurrenceState[]): ProgrammeOccurrenceState | null {
  return PROGRAMME_STATUS_PRECEDENCE.find((s) => states.includes(s)) ?? null;
}

const programmeLevel = (programmeId: string, version: string | null, animalId: string, state: ProgrammeOccurrenceState, reasonCodes: string[]): ProgrammeOccurrenceRecord => ({
  programmeId,
  programmeVersion: version,
  actionId: null,
  actionKind: null,
  animalId,
  occurrence: null,
  state,
  reasonCodes: sortedUnique(reasonCodes),
  completion: null,
  gates: [],
});

function compareRecords(a: ProgrammeOccurrenceRecord, b: ProgrammeOccurrenceRecord): number {
  return (
    (a.actionId === null ? -1 : 0) - (b.actionId === null ? -1 : 0) ||
    compareStrings(a.actionId ?? "", b.actionId ?? "") ||
    (a.occurrence === null ? -1 : a.occurrence.index) - (b.occurrence === null ? -1 : b.occurrence.index)
  );
}

function animalStatus(
  base: { programmeId: string; classification: ProgrammeClassification; version: string | null; effectiveAt: string; knowledgeCutoff: string; provenance: ProgrammeProvenanceBinding },
  ctx: AnimalContext,
  membership: ProgrammeMembership | null,
  records: ProgrammeOccurrenceRecord[],
  unmatchedDeclarationIds: string[],
  declarations: readonly ProgrammeCompletionRecord[],
  hash: CattleHash,
): ProgrammeAnimalStatus {
  const sorted = [...records].sort(compareRecords);
  const content: Omit<ProgrammeAnimalStatus, "fingerprint"> = {
    programmeId: base.programmeId,
    animalId: ctx.animalId,
    programmeVersion: base.version,
    classification: base.classification,
    informationClass: programmeInformationClass(base.classification),
    membership,
    status: foldProgrammeStates(sorted.map((r) => r.state)) ?? "NOT_APPLICABLE",
    records: sorted,
    unmatchedDeclarationIds: sortedUnique(unmatchedDeclarationIds),
    declarations: [...declarations].sort((a, b) => compareStrings(a.recordId, b.recordId)),
    inputs: ctx.inputs,
  };
  return { ...content, fingerprint: computeProgrammeFingerprint("CATTLE_PROGRAMME_ANIMAL_STATUS", animalStatusPayload(content, base.effectiveAt, base.knowledgeCutoff, base.provenance), hash) };
}

/**
 * RESULT binding of the programme evidence an animal status was derived under
 * (CAT-INV-021; FINGERPRINTS.md rule 4). It carries the COMPLETE canonical
 * governing / conflicting version records — identity, version, effective
 * period, every definition field, the full provenance (`sourceCategory`,
 * `sourceSystem`, `sourceRecordRef`, `receivedAt`, `sourceDocument`),
 * lifecycle state and supersession — together with their review fingerprint,
 * the review state and the bound review records. The
 * `CATTLE_PROGRAMME_DEFINITION` review fingerprint keeps its own, narrower
 * meaning (the content a reviewer approved) and is never used as the result
 * binding on its own.
 */
interface ProgrammeProvenanceBinding {
  governing: ProgrammeVersionEntry | null;
  /** Sorted by version. */
  conflicting: ProgrammeVersionEntry[];
  review: ProgrammeReviewState | null;
  reviewRecords: ProgrammeReviewRecord[];
}

function provenanceBinding(governing: ProgrammeStatus["governing"], conflictingVersions: readonly ProgrammeVersionEntry[]): ProgrammeProvenanceBinding {
  return {
    governing: governing === null ? null : governing.version,
    conflicting: [...conflictingVersions].sort((a, b) => compareStrings(a.definition.version, b.definition.version)),
    review: governing === null ? null : governing.review,
    reviewRecords: governing === null ? [] : governing.reviewRecords,
  };
}

/** The `CATTLE_PROGRAMME_ANIMAL_STATUS` payload: every field, both query times and the programme provenance binding. */
function animalStatusPayload(content: Omit<ProgrammeAnimalStatus, "fingerprint">, effectiveAt: string, knowledgeCutoff: string, provenance: ProgrammeProvenanceBinding): unknown {
  return { effectiveAt, knowledgeCutoff, programme: provenance, status: content };
}

interface EvaluationInputs {
  effectiveAt: string;
  knowledgeCutoff: string;
  animals: Map<string, AnimalContext>;
  reviews: Parameters<typeof programmeReviewState>[2];
  completions: CompletionResolution;
}

function evaluateProgramme(programmeId: string, versions: readonly ProgrammeVersionHistory[], inputs: EvaluationInputs, hash: CattleHash): ProgrammeStatus {
  const { effectiveAt, knowledgeCutoff, animals } = inputs;
  const entries: ProgrammeVersionEntry[] = versions.map((v) => ({ ...v, definitionFingerprint: definitionFingerprint(v.definition, hash) }));
  const entryOf = (v: ProgrammeVersionHistory) => entries.find((e) => e.definition.version === v.definition.version)!;
  const classification = versions[0].definition.classification;
  const resolution = resolveGoverningVersion(versions, effectiveAt);
  const animalList = [...animals.values()].sort((a, b) => compareStrings(a.animalId, b.animalId));
  const head = { programmeId, classification, informationClass: programmeInformationClass(classification), versions: entries };
  if (resolution.state === "NOT_IN_FORCE") {
    return { ...head, versionState: "NOT_IN_FORCE", governing: null, conflictingVersions: [], scope: null, status: "NOT_IN_FORCE", animals: [] };
  }
  const base = { programmeId, classification, effectiveAt, knowledgeCutoff };
  const declarationsOf = (animalId: string) => inputs.completions.known.filter((d) => d.animalId === animalId && d.programmeId === programmeId);
  const statusOf = (list: ProgrammeAnimalStatus[], extra: ProgrammeOccurrenceState[] = []): ProgrammeStatusValue =>
    list.length === 0 && extra.length === 0 ? "NO_ANIMALS_EVALUATED" : (foldProgrammeStates([...list.map((a) => a.status), ...extra]) ?? "NOT_APPLICABLE");
  if (resolution.state === "VERSION_CONFLICT") {
    const conflicting = resolution.versions.map(entryOf);
    const list = animalList.map((ctx) =>
      animalStatus({ ...base, version: null, provenance: provenanceBinding(null, conflicting) }, ctx, null, [programmeLevel(programmeId, null, ctx.animalId, "EVIDENCE_CONFLICT", ["CATTLE_PROGRAMME_VERSIONS_IN_CONFLICT"])], [], declarationsOf(ctx.animalId), hash),
    );
    return { ...head, versionState: "VERSION_CONFLICT", governing: null, conflictingVersions: conflicting, scope: null, status: list.length === 0 ? "EVIDENCE_CONFLICT" : statusOf(list), animals: list };
  }
  const governing = entryOf(resolution.version);
  const definition = governing.definition;
  const review = programmeReviewState(definition, governing.definitionFingerprint, inputs.reviews);
  const reviewRecords = inputs.reviews
    .filter((r) => review.dimensions.some((d) => d.reviewIds.includes(r.reviewId)))
    .sort((a, b) => compareStrings(a.reviewId, b.reviewId));
  const version = definition.version;
  const vBase = { ...base, version, provenance: provenanceBinding({ version: governing, review, reviewRecords }, []) };
  if (!review.approved) {
    const reasons = [
      ...(definition.productionState === "PRODUCTION" ? [] : [`CATTLE_PROGRAMME_NOT_CURRENT:${definition.productionState}`]),
      ...review.dimensions.filter((d) => d.state !== "APPROVED").map((d) => `CATTLE_PROGRAMME_REVIEW_${d.state}:${d.dimension}`),
    ];
    const list = animalList.map((ctx) => animalStatus(vBase, ctx, null, [programmeLevel(programmeId, version, ctx.animalId, "REVIEW_REQUIRED", reasons)], [], declarationsOf(ctx.animalId), hash));
    return { ...head, versionState: "GOVERNING", governing: { version: governing, review, reviewRecords }, conflictingVersions: [], scope: null, status: list.length === 0 ? "REVIEW_REQUIRED" : statusOf(list), animals: list };
  }

  const scope: ProgrammeScopeSummary = {
    applicability: definition.applicability,
    members: [],
    notMembers: [],
    unknown: [],
    conflict: [],
    invalid: [],
    declaredMembersNotEvaluated: definition.applicability.kind === "EXPLICIT_SET" ? definition.applicability.animalIds.filter((id) => !animals.has(id)) : [],
  };
  const list: ProgrammeAnimalStatus[] = [];
  for (const ctx of animalList) {
    const membership = membershipAt(definition.applicability, ctx, effectiveAt, knowledgeCutoff, hash);
    const bucket = { MEMBER: scope.members, NOT_MEMBER: scope.notMembers, UNKNOWN: scope.unknown, EVIDENCE_CONFLICT: scope.conflict, INVALID: scope.invalid }[membership.state];
    bucket.push(ctx.animalId);
    const declarations = declarationsOf(ctx.animalId);
    if (membership.state !== "MEMBER") {
      const record = programmeLevel(programmeId, version, ctx.animalId, MEMBERSHIP_TO_STATE[membership.state], [`CATTLE_PROGRAMME_MEMBERSHIP_${membership.state}`, ...membership.reasonCodes]);
      const liveIds = declarations.filter((d) => inputs.completions.live.some((l) => l.recordId === d.recordId) && d.kind === "COMPLETION").map((d) => d.recordId);
      list.push(animalStatus(vBase, ctx, membership, [record], liveIds, declarations, hash));
      continue;
    }
    const records: ProgrammeOccurrenceRecord[] = [];
    const occurrenceKeys = new Set<string>();
    for (const action of definition.actions) {
      const anchor = anchorOf(action, ctx);
      const gates = gateChecks(action, ctx);
      if (anchor.state === "UNRESOLVED") {
        records.push({
          programmeId,
          programmeVersion: version,
          actionId: action.actionId,
          actionKind: action.actionKind,
          animalId: ctx.animalId,
          occurrence: null,
          state: anchor.occurrenceState,
          reasonCodes: sortedUnique(anchor.reasonCodes),
          completion: null,
          gates,
        });
        continue;
      }
      const actionDeclarations = declarations.filter((d) => d.actionId === action.actionId);
      const o: OccurrenceContext = { definition, action, ctx, effectiveAt, knowledgeCutoff, period: governing, declarations: actionDeclarations, completions: inputs.completions };
      for (const { index, occurrence } of deriveProgrammeOccurrences(programmeId, action, ctx.animalId, anchor.at)) {
        if (occurrence === null) {
          records.push({
            programmeId,
            programmeVersion: version,
            actionId: action.actionId,
            actionKind: action.actionKind,
            animalId: ctx.animalId,
            occurrence: null,
            state: "INVALID_EVIDENCE",
            reasonCodes: [`CATTLE_PROGRAMME_WINDOW_NOT_REPRESENTABLE:${index}`],
            completion: null,
            gates,
          });
          continue;
        }
        occurrenceKeys.add(JSON.stringify([action.actionId, occurrence.occurrenceId]));
        records.push(occurrenceRecord(o, occurrence, gates, hash));
      }
    }
    const liveSet = new Set(inputs.completions.live.map((d) => d.recordId));
    const unmatched = declarations.filter((d) => liveSet.has(d.recordId) && d.kind === "COMPLETION" && !occurrenceKeys.has(JSON.stringify([d.actionId, d.occurrenceId]))).map((d) => d.recordId);
    list.push(animalStatus(vBase, ctx, membership, records, unmatched, declarations, hash));
  }
  const missing: ProgrammeOccurrenceState[] = scope.declaredMembersNotEvaluated.length > 0 ? ["INSUFFICIENT_EVIDENCE"] : [];
  return { ...head, versionState: "GOVERNING", governing: { version: governing, review, reviewRecords }, conflictingVersions: [], scope, status: statusOf(list, missing), animals: list };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function evaluationPayload(content: Omit<ProgrammeStatusEvaluation, "fingerprint">): unknown {
  return content;
}

function evaluateCanonical(req: unknown, hash: CattleHash): ProgrammeEvaluationResult {
  const read = readRequest(req);
  if (!read.ok) return read;
  const { effectiveAt, knowledgeCutoff } = read.read;
  const issues: ProgrammeIssue[] = [];
  const definitions = admitProgrammeDefinitions(read.read.definitions, knowledgeCutoff);
  if (!definitions.ok) issues.push(...definitions.issues);
  const reviews = admitProgrammeReviews(read.read.reviews, knowledgeCutoff);
  if (!reviews.ok) issues.push(...reviews.issues);
  const completions = admitProgrammeCompletions(read.read.completions, knowledgeCutoff);
  if (!completions.ok) issues.push(...completions.issues);
  const animals = readAnimals(read.read, hash);
  if (!animals.ok) issues.push(...animals.issues);
  if (issues.length > 0 || !definitions.ok || !reviews.ok || !completions.ok || !animals.ok) return { ok: false, issues: uniqueProgrammeIssues(issues) };

  const inputs: EvaluationInputs = { effectiveAt, knowledgeCutoff, animals: animals.animals, reviews: reviews.reviews, completions: completions.resolution };
  const programmes = [...definitions.admission.programmes.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([programmeId, versions]) => evaluateProgramme(programmeId, versions, inputs, hash));
  const content: Omit<ProgrammeStatusEvaluation, "fingerprint"> = {
    programmePayloadVersion: CATTLE_PROGRAMME_PAYLOAD_VERSION,
    effectiveAt,
    knowledgeCutoff,
    outcome: programmes.length === 0 ? "NO_PROGRAMME" : programmes.every((p) => p.versionState === "NOT_IN_FORCE") ? "NONE_IN_FORCE" : "EVALUATED",
    animalIds: [...animals.animals.keys()].sort(compareStrings),
    programmes,
  };
  return { ok: true, evaluation: { ...content, fingerprint: computeProgrammeFingerprint("CATTLE_PROGRAMME_STATUS", evaluationPayload(content), hash) } };
}

/**
 * Evaluates every declared health programme for every supplied animal at
 * (`effectiveAt`, `knowledgeCutoff`). The complete request must be canonical
 * plain data; any malformed request, record or predecessor output fails
 * closed (`ok: false`). The result is detached and deep-frozen.
 */
export function evaluateHealthProgrammes(request: HealthProgrammeRequest, hash: CattleHash): ProgrammeEvaluationResult {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return deepFreezeAnimalValue({ ok: false, issues: [{ code: "CATTLE_PROGRAMME_NON_CANONICAL_INPUT", ref: canonical.path }] });
  return deepFreezeAnimalValue(structuredClone(evaluateCanonical(canonical.value, hash)));
}

/**
 * Re-verifies an evaluation against its own content: the supported payload
 * version, every animal-status fingerprint and the evaluation fingerprint
 * (CAT-INV-021). Change detection only.
 */
export function verifyProgrammeStatusEvaluation(evaluation: ProgrammeStatusEvaluation, hash: CattleHash): FingerprintVerificationResult {
  const canonical = toCanonicalPlainData(evaluation);
  if (!canonical.ok) return { valid: false, reasonCode: "CATTLE_PROGRAMME_EVALUATION_NON_CANONICAL", detail: canonical.path };
  const e = canonical.value as ProgrammeStatusEvaluation;
  if (!isRecord(e) || e.programmePayloadVersion !== CATTLE_PROGRAMME_PAYLOAD_VERSION) {
    return { valid: false, reasonCode: "CATTLE_PROGRAMME_EVALUATION_UNSUPPORTED_PAYLOAD_VERSION", detail: "unsupported programme payload version" };
  }
  if (!Array.isArray(e.programmes) || !isRecord(e.fingerprint) || !e.programmes.every((p) => isRecord(p) && Array.isArray(p.animals) && p.animals.every((a) => isRecord(a) && isRecord(a.fingerprint)))) {
    return { valid: false, reasonCode: "CATTLE_PROGRAMME_EVALUATION_MALFORMED", detail: "evaluation structure is malformed" };
  }
  try {
    for (const p of e.programmes) {
      for (const a of p.animals) {
        const { fingerprint, ...content } = a;
        const v = verifyProgrammeFingerprint("CATTLE_PROGRAMME_ANIMAL_STATUS", animalStatusPayload(content, e.effectiveAt, e.knowledgeCutoff, provenanceBinding(p.governing, p.conflictingVersions)), fingerprint, hash);
        if (!v.valid) return v;
      }
    }
    const { fingerprint, ...content } = e;
    return verifyProgrammeFingerprint("CATTLE_PROGRAMME_STATUS", evaluationPayload(content), fingerprint, hash);
  } catch {
    return { valid: false, reasonCode: "CATTLE_PROGRAMME_EVALUATION_MALFORMED", detail: "fingerprint payload is not canonical" };
  }
}
