/**
 * Cattle C2 — regulatory/obligation lifecycle engine.
 *
 * For each queried obligation the engine resolves the obligation's C0 rule
 * version effective on the UTC date of `effectiveAt` (from the rule versions
 * whose obligation terms were recorded by `knowledgeCutoff`), evaluates it
 * through C0 `evaluateEffectiveCattleRule` over C1-derived inputs (reviews
 * counted only if made by the cutoff), derives the anchor's occurrences from
 * the C1 ledger, computes each occurrence's due window and judges the
 * fulfilment evidence known by the cutoff. No clock is read: both times are
 * explicit, strict UTC and compared by instant.
 *
 * State precedence (first match wins; documented in DOMAIN_CONTRACTS.md):
 *   Rule level (one record, no occurrence):
 *   1. UNSUPPORTED — catalogue invalid; obligation not in the catalogue as
 *      known by the cutoff; a released rule version approved by the cutoff
 *      without terms recorded by it; C0
 *      UNSUPPORTED (no effective version, ambiguous, invalid lineage,
 *      invalid definition, implementation absent or mismatched); terms not
 *      bound into the rule version; window source not a rule binding;
 *      unsupported time basis.
 *   2. REVIEW_REQUIRED — the only version in force on the date is unreleased
 *      (evaluated directly through C0 `evaluateCattleRule`, which can never
 *      pass it), or C0 REVIEW_REQUIRED (not approved by the cutoff, a bound
 *      source not CURRENT).
 *   3. INVALID_EVIDENCE > EVIDENCE_CONFLICT > UNKNOWN > INSUFFICIENT_EVIDENCE
 *      — C0 lacked a KNOWN input: a referenced C1 dimension is invalid,
 *      conflicting or unknown; any other gap (non-C1 key, rejected class or
 *      unit) is INSUFFICIENT_EVIDENCE.
 *   4. NOT_APPLICABLE — C0 NOT_APPLICABLE from KNOWN inputs only, and only
 *      when the anchor is resolved for the animal's whole life up to the
 *      query (`resolveObligationAnchor`); otherwise the anchor's
 *      INVALID_EVIDENCE > EVIDENCE_CONFLICT > UNKNOWN.
 *   5. BLOCKED (HARD_GATE rule FAIL) / ADVISORY_FAIL (ADVISORY rule FAIL).
 *   Anchor level (C0 PASS): INVALID_EVIDENCE > EVIDENCE_CONFLICT > UNKNOWN >
 *      NOT_TRIGGERED when no occurrence can be established.
 *   Occurrence level: anchor INVALID_EVIDENCE > anchor EVIDENCE_CONFLICT >
 *      UNSUPPORTED (window not representable) > INVALID_EVIDENCE (evidence log
 *      invalid, a supersession defect or an unattributable record for this
 *      obligation) > EVIDENCE_CONFLICT (competing corrections, or counted
 *      fulfilments disagreeing on timeliness) > SATISFIED (fulfilled inside
 *      the window) > SATISFIED_LATE (fulfilled after the due end) >
 *      REVIEW_REQUIRED (only evidence for another rule version) > UPCOMING
 *      (before open) > OUTSTANDING (window open) > OVERDUE (past due end).
 *
 * Fulfilment evidence counts only for the exact evaluated rule version, when
 * received by the cutoff and fulfilled by `effectiveAt`. Evidence before the
 * window opens never satisfies it. Nothing is ever SATISFIED or
 * NOT_APPLICABLE from an unknown, conflicting or invalid input, and an empty
 * catalogue yields UNSUPPORTED for every queried obligation.
 */

import type { AssessmentFingerprint, FingerprintVerificationResult } from "../../assessment-integrity";
import { compareInstants, isOpaqueRef, isValidAnimalInstant, rematerialiseAnimalLedger, deepFreezeAnimalValue, type AnimalLedger, type AnimalLedgerIssue, type FarmReturnAnimalId } from "../animal-ledger";
import { computeAnimalSnapshotFingerprint, projectAnimalSnapshot, type AnimalSnapshot } from "../animal-snapshot";
import { evaluateCattleRule, evaluateEffectiveCattleRule, type CattleRuleImplementation, type RuleEvaluationRecord } from "../evaluation";
import { compareStrings, sortedUnique, type CattleHash } from "../integrity";
import { resolveEffectiveRuleVersion, type CattleRuleClassification, type CattleRuleGateRole, type RuleVersionRef } from "../rule";
import { compareSourceVersionRefs } from "../source";
import type { BitemporalRecord, BitemporalResolution } from "./bitemporal-records";
import {
  deriveObligationOccurrences,
  obligationInputDimensionState,
  obligationInputsFromSnapshot,
  resolveObligationAnchor,
  type ObligationAnimalInputs,
  type ObligationOccurrence,
} from "./obligation-anchor";
import {
  SUPPORTED_OBLIGATION_TIME_BASES,
  computeObligationTermsFingerprint,
  materialiseObligationCatalogue,
  obligationTermsMarker,
  type ObligationCatalogue,
  type ObligationCatalogueIssue,
  type ObligationCatalogueResult,
  type ObligationDefinition,
  type ObligationWindowBoundary,
} from "./obligation-definition";
import {
  createObligationEvidenceLog,
  resolveObligationEvidence,
  type ObligationEvidenceIssue,
  type ObligationFulfilmentEvidence,
} from "./obligation-evidence";
import { CATTLE_OBLIGATION_PAYLOAD_VERSION, computeObligationFingerprint, verifyObligationFingerprint } from "./obligation-integrity";
import { addObligationOffset, canonicalObligationInstant, utcCalendarDateOf } from "./obligation-time";

export const OBLIGATION_STATES = [
  "NOT_APPLICABLE",
  "UPCOMING",
  "OUTSTANDING",
  "SATISFIED",
  "SATISFIED_LATE",
  "OVERDUE",
  "BLOCKED",
  "ADVISORY_FAIL",
  "NOT_TRIGGERED",
  "UNKNOWN",
  "INSUFFICIENT_EVIDENCE",
  "EVIDENCE_CONFLICT",
  "INVALID_EVIDENCE",
  "UNSUPPORTED",
  "REVIEW_REQUIRED",
] as const;
export type ObligationState = (typeof OBLIGATION_STATES)[number];

export interface ObligationQuery {
  /** VALID time evaluated (strict UTC). */
  effectiveAt: string;
  /** KNOWLEDGE time: latest `receivedAt`/`recordedAt`/`reviewedAt` admitted (strict UTC). */
  knowledgeCutoff: string;
  /** Obligations to evaluate; each yields at least one record. */
  obligationIds: readonly string[];
}

export interface ObligationWindow {
  opensAt: string;
  dueAt: string;
  boundary: ObligationWindowBoundary;
}

export interface ObligationEvidenceSummary {
  /** Known-by-cutoff records of this obligation attributed to this occurrence (live or superseded). */
  consideredEvidenceIds: string[];
  supersededEvidenceIds: string[];
  /** Records that decided SATISFIED / SATISFIED_LATE (full copies). */
  countedEvidence: ObligationFulfilmentEvidence[];
  beforeWindowEvidenceIds: string[];
  /** Fulfilments of this occurrence dated after `effectiveAt` (not yet happened in valid time). */
  notYetOccurredEvidenceIds: string[];
  otherRuleVersionEvidenceIds: string[];
  conflictingEvidenceIds: string[];
  invalidEvidenceIds: string[];
  /** Live records of this obligation attributable to no derived occurrence. */
  unattributedEvidenceIds: string[];
}

export interface ObligationStateRecord {
  obligationPayloadVersion: number;
  /** An obligation state is an obligation/constraint — never a fact or a recommendation. */
  informationClass: "OBLIGATION_OR_CONSTRAINT";
  animalId: FarmReturnAnimalId;
  obligationId: string;
  obligationKind: string | null;
  /** Verbatim from the evaluated C0 rule version; `null` when none resolved. */
  classification: CattleRuleClassification | null;
  gateRole: CattleRuleGateRole | null;
  rule: RuleVersionRef | null;
  ruleFingerprint: AssessmentFingerprint | null;
  termsFingerprint: AssessmentFingerprint | null;
  /** The complete C0 evaluation record. */
  ruleEvaluation: RuleEvaluationRecord;
  occurrence: ObligationOccurrence | null;
  window: ObligationWindow | null;
  state: ObligationState;
  reasonCodes: string[];
  evidence: ObligationEvidenceSummary;
  /** C1 snapshot fingerprint at (`effectiveAt`, `knowledgeCutoff`). */
  snapshotFingerprint: AssessmentFingerprint;
  effectiveAt: string;
  knowledgeCutoff: string;
  fingerprint: AssessmentFingerprint;
}

export interface AnimalObligationEvaluation {
  obligationPayloadVersion: number;
  animalId: FarmReturnAnimalId;
  effectiveAt: string;
  knowledgeCutoff: string;
  /** UTC calendar date of `effectiveAt` — the C0 evaluation date. */
  evaluationDate: string;
  snapshotFingerprint: AssessmentFingerprint;
  catalogueIssues: ObligationCatalogueIssue[];
  evidenceIssues: ObligationEvidenceIssue[];
  /** Sorted by obligation id, then occurrence id. */
  results: ObligationStateRecord[];
}

export type ObligationRequestIssueCode =
  | "CATTLE_OBLIGATION_INVALID_REQUEST"
  | "CATTLE_OBLIGATION_INVALID_EFFECTIVE_AT"
  | "CATTLE_OBLIGATION_INVALID_KNOWLEDGE_CUTOFF"
  | "CATTLE_OBLIGATION_INVALID_OBLIGATION_IDS"
  | "CATTLE_OBLIGATION_INVALID_LEDGER";

export type AnimalObligationResult =
  | { ok: true; evaluation: AnimalObligationEvaluation }
  | { ok: false; issues: ObligationRequestIssueCode[]; ledgerIssues: AnimalLedgerIssue[] };

export interface AnimalObligationRequest {
  ledger: AnimalLedger;
  /** Fulfilment evidence inputs for this animal (validated; any invalid record fails the log closed). */
  evidence: readonly unknown[];
  catalogue: ObligationCatalogue;
  query: ObligationQuery;
}

// ---------------------------------------------------------------------------

interface ValidQuery {
  effectiveAt: string;
  knowledgeCutoff: string;
  obligationIds: string[];
}

function readQuery(query: unknown): { ok: true; query: ValidQuery } | { ok: false; issues: ObligationRequestIssueCode[] } {
  if (query === null || typeof query !== "object") return { ok: false, issues: ["CATTLE_OBLIGATION_INVALID_REQUEST"] };
  const { effectiveAt, knowledgeCutoff, obligationIds } = query as Record<string, unknown>;
  const issues: ObligationRequestIssueCode[] = [];
  const e = isValidAnimalInstant(effectiveAt) ? canonicalObligationInstant(effectiveAt) : null;
  const k = isValidAnimalInstant(knowledgeCutoff) ? canonicalObligationInstant(knowledgeCutoff) : null;
  if (e === null) issues.push("CATTLE_OBLIGATION_INVALID_EFFECTIVE_AT");
  if (k === null) issues.push("CATTLE_OBLIGATION_INVALID_KNOWLEDGE_CUTOFF");
  let ids: string[] = [];
  if (!Array.isArray(obligationIds) || !obligationIds.every(isOpaqueRef)) issues.push("CATTLE_OBLIGATION_INVALID_OBLIGATION_IDS");
  else ids = sortedUnique(obligationIds as string[]);
  if (issues.length > 0 || e === null || k === null) return { ok: false, issues };
  return { ok: true, query: { effectiveAt: e, knowledgeCutoff: k, obligationIds: ids } };
}

/** Run when no implementation is supplied for the resolved version: never matches a binding, so C0 reports UNSUPPORTED. */
const NO_IMPLEMENTATION: CattleRuleImplementation = Object.freeze({
  implementationId: "CATTLE_OBLIGATION_NO_IMPLEMENTATION",
  version: 1,
  evaluate: () => "UNSUPPORTED" as const,
});

type EvidenceEnvelope = ObligationFulfilmentEvidence & BitemporalRecord;

interface Context {
  animalId: FarmReturnAnimalId;
  ledger: AnimalLedger;
  snapshot: AnimalSnapshot;
  snapshotFingerprint: AssessmentFingerprint;
  inputs: ObligationAnimalInputs;
  catalogue: ObligationCatalogueResult;
  evidence: { ok: true; resolution: BitemporalResolution<EvidenceEnvelope> } | { ok: false };
  query: ValidQuery;
  evaluationDate: string;
  hash: CattleHash;
}

function emptySummary(): ObligationEvidenceSummary {
  return {
    consideredEvidenceIds: [],
    supersededEvidenceIds: [],
    countedEvidence: [],
    beforeWindowEvidenceIds: [],
    notYetOccurredEvidenceIds: [],
    otherRuleVersionEvidenceIds: [],
    conflictingEvidenceIds: [],
    invalidEvidenceIds: [],
    unattributedEvidenceIds: [],
  };
}

type Draft = Omit<ObligationStateRecord, "fingerprint" | "obligationPayloadVersion" | "informationClass" | "animalId" | "snapshotFingerprint" | "effectiveAt" | "knowledgeCutoff">;

function finalise(ctx: Context, draft: Draft): ObligationStateRecord {
  const unsigned: Omit<ObligationStateRecord, "fingerprint"> = {
    obligationPayloadVersion: CATTLE_OBLIGATION_PAYLOAD_VERSION,
    informationClass: "OBLIGATION_OR_CONSTRAINT",
    animalId: ctx.animalId,
    ...draft,
    reasonCodes: sortedUnique(draft.reasonCodes),
    snapshotFingerprint: ctx.snapshotFingerprint,
    effectiveAt: ctx.query.effectiveAt,
    knowledgeCutoff: ctx.query.knowledgeCutoff,
  };
  const detached = structuredClone(unsigned);
  return { ...detached, fingerprint: computeObligationFingerprint("CATTLE_OBLIGATION_STATE", detached, ctx.hash) };
}

/** Recomputes a record's fingerprint from its content (change detection, not a signature). */
export function verifyObligationStateRecord(record: ObligationStateRecord, hash: CattleHash): FingerprintVerificationResult {
  const { fingerprint, ...content } = record;
  return verifyObligationFingerprint("CATTLE_OBLIGATION_STATE", content, fingerprint, hash);
}

function unresolved(ctx: Context, obligationId: string, ruleId: string, reasons: string[]): ObligationStateRecord {
  const ruleEvaluation = evaluateEffectiveCattleRule([], ruleId, NO_IMPLEMENTATION, { evaluationDate: ctx.evaluationDate, inputs: [], catalogue: [], reviews: [] }, ctx.hash);
  return finalise(ctx, {
    obligationId,
    obligationKind: null,
    classification: null,
    gateRole: null,
    rule: null,
    ruleFingerprint: null,
    termsFingerprint: null,
    ruleEvaluation,
    occurrence: null,
    window: null,
    state: "UNSUPPORTED",
    reasonCodes: reasons,
    evidence: emptySummary(),
  });
}

/** Rule id recorded for an obligation the catalogue cannot name a rule for. */
export function undefinedObligationRuleId(obligationId: string): string {
  return `CATTLE_OBLIGATION_UNDEFINED:${obligationId}`;
}

function inputGapState(ctx: Context, record: RuleEvaluationRecord): { state: ObligationState; reasons: string[] } {
  const keys = sortedUnique([...record.missingInputs, ...record.conflictingInputs.map((c) => c.inputKey)]);
  const states = keys.map((k) => ({ key: k, state: obligationInputDimensionState(ctx.inputs, k) }));
  const reasons = states.map((s) => `CATTLE_OBLIGATION_INPUT_${s.state ?? "NOT_DERIVABLE"}:${s.key}`);
  if (record.rejectedInputs.length > 0) reasons.push("CATTLE_OBLIGATION_INPUT_REJECTED");
  if (states.some((s) => s.state === "INVALID_EVIDENCE")) return { state: "INVALID_EVIDENCE", reasons };
  if (record.conflictingInputs.length > 0 || states.some((s) => s.state === "CONFLICTING_EVIDENCE")) return { state: "EVIDENCE_CONFLICT", reasons };
  if (keys.length > 0 && record.rejectedInputs.length === 0 && states.every((s) => s.state === "UNKNOWN")) return { state: "UNKNOWN", reasons };
  return { state: "INSUFFICIENT_EVIDENCE", reasons };
}

function evaluateObligation(ctx: Context, obligationId: string): ObligationStateRecord[] {
  if (!ctx.catalogue.ok) return [unresolved(ctx, obligationId, undefinedObligationRuleId(obligationId), ["CATTLE_OBLIGATION_CATALOGUE_INVALID"])];
  const catalogue = ctx.catalogue.catalogue;
  const { knowledgeCutoff } = ctx.query;
  // Only definitions recorded by the cutoff exist for this query: anything
  // recorded later (set aside by the catalogue) never changes the result.
  const knownDefs = catalogue.definitions.filter((d) => d.obligationId === obligationId && compareInstants(d.recordedAt, knowledgeCutoff) <= 0);
  if (knownDefs.length === 0) return [unresolved(ctx, obligationId, undefinedObligationRuleId(obligationId), ["CATTLE_OBLIGATION_NOT_IN_CATALOGUE"])];
  const ruleId = knownDefs[0].ruleId;
  const reviews = catalogue.reviews.filter((r) => compareInstants(r.reviewedAt, knowledgeCutoff) <= 0);
  // A version's terms are its knowledge time. A released version with an
  // approval known by the cutoff but no terms known by it fails closed; one
  // with neither is not yet known at the cutoff.
  const knownVersions = new Set(knownDefs.map((d) => d.ruleVersion));
  const withoutTerms = catalogue.ruleVersions.filter(
    (r) =>
      r.ruleId === ruleId &&
      (r.productionState === "PRODUCTION" || r.productionState === "SUPERSEDED") &&
      !knownVersions.has(r.version) &&
      reviews.some((v) => v.ruleId === ruleId && v.ruleVersion === r.version && v.decision === "APPROVED"),
  );
  if (withoutTerms.length > 0) {
    return [unresolved(ctx, obligationId, ruleId, withoutTerms.map((r) => `CATTLE_OBLIGATION_RULE_VERSION_WITHOUT_TERMS:v${r.version}`))];
  }
  const versions = catalogue.ruleVersions.filter((r) => r.ruleId === ruleId && knownVersions.has(r.version));
  const resolution = resolveEffectiveRuleVersion(versions, ruleId, ctx.evaluationDate);
  // C0 never selects an unreleased version. When the only version in force on
  // the date is unreleased (draft/approved/blocked, ...), it is evaluated as
  // such so the obligation reports REVIEW_REQUIRED (never anything weaker).
  const unreleased =
    resolution.status === "NO_EFFECTIVE_VERSION"
      ? versions.filter(
          (r) =>
            r.productionState !== "PRODUCTION" &&
            r.productionState !== "SUPERSEDED" &&
            r.effectiveFrom <= ctx.evaluationDate &&
            (r.effectiveTo === null || ctx.evaluationDate < r.effectiveTo),
        )
      : [];
  const awaitingRelease = unreleased.length === 1;
  const rule = resolution.status === "RESOLVED" ? resolution.rule : awaitingRelease ? unreleased[0] : null;
  const implementation = rule
    ? catalogue.implementations.find((i) => i.implementationId === rule.implementation.implementationId && i.version === rule.implementation.version)
    : undefined;
  const c0Context = { evaluationDate: ctx.evaluationDate, inputs: ctx.inputs.items, catalogue: catalogue.sources, reviews };
  const ruleEvaluation =
    awaitingRelease && rule
      ? evaluateCattleRule(rule, implementation ?? NO_IMPLEMENTATION, c0Context, ctx.hash)
      : evaluateEffectiveCattleRule(versions, ruleId, implementation ?? NO_IMPLEMENTATION, c0Context, ctx.hash);
  const def: ObligationDefinition | null = rule ? (knownDefs.find((d) => d.ruleVersion === rule.version) ?? null) : null;
  const reasons: string[] = [];
  if (rule && !implementation) reasons.push("CATTLE_OBLIGATION_IMPLEMENTATION_NOT_SUPPLIED");
  if (rule && def) {
    if (!rule.assumptions.includes(obligationTermsMarker(def, ctx.hash))) reasons.push("CATTLE_OBLIGATION_TERMS_NOT_BOUND_TO_RULE_VERSION");
    if (!rule.sourceBindings.some((s) => compareSourceVersionRefs(s, def.terms.windowSource) === 0)) reasons.push("CATTLE_OBLIGATION_WINDOW_SOURCE_NOT_BOUND");
    if (!SUPPORTED_OBLIGATION_TIME_BASES.includes(def.terms.timeBasis)) reasons.push(`CATTLE_OBLIGATION_TIME_BASIS_UNSUPPORTED:${def.terms.timeBasis}`);
  }
  const common = {
    obligationId,
    obligationKind: def ? def.terms.obligationKind : null,
    classification: ruleEvaluation.classification,
    gateRole: ruleEvaluation.gateRole,
    rule: ruleEvaluation.rule,
    ruleFingerprint: ruleEvaluation.ruleFingerprint,
    termsFingerprint: def ? computeObligationTermsFingerprint(def, ctx.hash) : null,
    ruleEvaluation,
  };
  const ruleLevel = (state: ObligationState, extra: string[] = []): ObligationStateRecord[] => [
    finalise(ctx, { ...common, occurrence: null, window: null, state, reasonCodes: [...reasons, ...extra], evidence: emptySummary() }),
  ];

  if (ruleEvaluation.state === "UNSUPPORTED" || reasons.length > 0 || !rule || !def) return ruleLevel("UNSUPPORTED", ["CATTLE_OBLIGATION_RULE_UNSUPPORTED"]);
  if (awaitingRelease) return ruleLevel("REVIEW_REQUIRED", ["CATTLE_OBLIGATION_RULE_REVIEW_REQUIRED", "CATTLE_OBLIGATION_RULE_NOT_RELEASED"]);
  if (ruleEvaluation.state === "REVIEW_REQUIRED") return ruleLevel("REVIEW_REQUIRED", ["CATTLE_OBLIGATION_RULE_REVIEW_REQUIRED"]);
  if (ruleEvaluation.state === "INSUFFICIENT_EVIDENCE" || ruleEvaluation.state === "CONFLICTING_EVIDENCE") {
    const gap = inputGapState(ctx, ruleEvaluation);
    return ruleLevel(gap.state, gap.reasons);
  }
  if (ruleEvaluation.state === "FAIL") {
    return rule.gateRole === "HARD_GATE" ? ruleLevel("BLOCKED", ["CATTLE_OBLIGATION_HARD_GATE_FAIL"]) : ruleLevel("ADVISORY_FAIL", ["CATTLE_OBLIGATION_ADVISORY_FAIL"]);
  }

  // C0 NOT_APPLICABLE is reported only for a RESOLVED anchor (see
  // `resolveObligationAnchor`): an unknown, conflicting or invalid anchor —
  // anywhere in the animal's life up to the query — is never cleared.
  if (ruleEvaluation.state === "NOT_APPLICABLE") {
    const anchor = resolveObligationAnchor(def.terms.anchor, ctx.ledger, ctx.snapshot);
    if (anchor.state === "KNOWN") return ruleLevel("NOT_APPLICABLE", ["CATTLE_OBLIGATION_RULE_NOT_APPLICABLE"]);
    const state: ObligationState = anchor.state === "INVALID" ? "INVALID_EVIDENCE" : anchor.state === "CONFLICT" ? "EVIDENCE_CONFLICT" : "UNKNOWN";
    return ruleLevel(state, [
      "CATTLE_OBLIGATION_RULE_NOT_APPLICABLE",
      ...anchor.reasonCodes,
      ...anchor.assertionIds.map((id) => `CATTLE_OBLIGATION_ANCHOR_ASSERTION:${id}`),
    ]);
  }

  // C0 PASS: derive occurrences. The anchor must also be resolved for the
  // animal's whole life to the query (`resolveObligationAnchor`): an
  // unresolved period could conceal further occurrences, so it is reported
  // as its own record — alongside any known occurrences — and is never
  // hidden by a satisfied occurrence (the hard-gate projection folds it in).
  const derivation = deriveObligationOccurrences(obligationId, def.terms.anchor, ctx.ledger, ctx.snapshot);
  const anchor = resolveObligationAnchor(def.terms.anchor, ctx.ledger, ctx.snapshot);
  const evidence = obligationEvidence(ctx, obligationId, def);
  const anchorRecord = (state: ObligationState, reasonCodes: string[], unattributedEvidenceIds: string[]) =>
    finalise(ctx, { ...common, occurrence: null, window: null, state, reasonCodes, evidence: { ...emptySummary(), unattributedEvidenceIds } });
  const anchorReasons = [...anchor.reasonCodes, ...anchor.assertionIds.map((id) => `CATTLE_OBLIGATION_ANCHOR_ASSERTION:${id}`)];
  if (derivation.status !== "OCCURRENCES") {
    const worst = [derivation.status, anchor.state].includes("INVALID")
      ? "INVALID"
      : [derivation.status, anchor.state].includes("CONFLICT")
        ? "CONFLICT"
        : [derivation.status, anchor.state].includes("UNKNOWN")
          ? "UNKNOWN"
          : "NOT_TRIGGERED";
    return [
      anchorRecord(
        ANCHOR_STATE[worst],
        [`CATTLE_OBLIGATION_ANCHOR_${derivation.status}`, ...derivation.anchorAssertionIds.map((id) => `CATTLE_OBLIGATION_ANCHOR_ASSERTION:${id}`), ...anchorReasons],
        evidence.ok ? evidence.liveIds : [],
      ),
    ];
  }
  const attributedIds = new Set<string>();
  const records = derivation.occurrences.map((occurrence) => {
    const result = evaluateOccurrence(ctx, def, rule, occurrence, evidence);
    for (const id of result.attributed) attributedIds.add(id);
    return result;
  });
  const unattributed = evidence.ok ? evidence.liveIds.filter((id) => !attributedIds.has(id)) : [];
  const out = records.map((r) => finalise(ctx, { ...common, ...r.draft, evidence: { ...r.draft.evidence, unattributedEvidenceIds: unattributed } }));
  if (anchor.state !== "KNOWN") out.push(anchorRecord(ANCHOR_STATE[anchor.state], ["CATTLE_OBLIGATION_ANCHOR_UNRESOLVED_PERIOD", ...anchorReasons], unattributed));
  return out;
}

const ANCHOR_STATE: Record<"INVALID" | "CONFLICT" | "UNKNOWN" | "NOT_TRIGGERED", ObligationState> = {
  INVALID: "INVALID_EVIDENCE",
  CONFLICT: "EVIDENCE_CONFLICT",
  UNKNOWN: "UNKNOWN",
  NOT_TRIGGERED: "NOT_TRIGGERED",
};

type ObligationEvidenceView =
  | { ok: false; reasons: string[]; invalidIds: string[] }
  | {
      ok: true;
      known: EvidenceEnvelope[];
      liveIds: string[];
      resolution: BitemporalResolution<EvidenceEnvelope>;
    };

function obligationEvidence(ctx: Context, obligationId: string, def: ObligationDefinition): ObligationEvidenceView {
  if (!ctx.evidence.ok) return { ok: false, reasons: ["CATTLE_OBLIGATION_EVIDENCE_LOG_INVALID"], invalidIds: [] };
  const resolution = ctx.evidence.resolution;
  const known = resolution.known.filter((r) => r.obligationId === obligationId);
  const ids = new Set(known.map((r) => r.evidenceId));
  const linkIssues = resolution.linkIssues.filter((i) => ids.has(i.recordId) || ids.has(i.targetId));
  const singleOccurrence = def.terms.anchor.kind === "DATE_OF_BIRTH";
  const misattributed = known.filter((r) => (singleOccurrence ? r.occurrenceAnchor !== null : r.occurrenceAnchor === null));
  if (linkIssues.length > 0 || misattributed.length > 0) {
    return {
      ok: false,
      reasons: [...linkIssues.map((i) => `${i.code}:${i.recordId}`), ...misattributed.map((r) => `CATTLE_OBLIGATION_EVIDENCE_OCCURRENCE_SHAPE_MISMATCH:${r.evidenceId}`)],
      invalidIds: sortedUnique([...linkIssues.flatMap((i) => [i.recordId, i.targetId]).filter((id) => ids.has(id)), ...misattributed.map((r) => r.evidenceId)]),
    };
  }
  const liveIds = known.filter((r) => !resolution.supersededBy.has(r.evidenceId)).map((r) => r.evidenceId);
  return { ok: true, known, liveIds, resolution };
}

function strip(e: EvidenceEnvelope): ObligationFulfilmentEvidence {
  const { recordId, receivedAt, ...record } = e;
  void recordId;
  void receivedAt;
  return record;
}

function evaluateOccurrence(
  ctx: Context,
  def: ObligationDefinition,
  rule: RuleVersionRef,
  occurrence: ObligationOccurrence,
  evidence: ObligationEvidenceView,
): { draft: Pick<ObligationStateRecord, "occurrence" | "window" | "state" | "reasonCodes" | "evidence">; attributed: string[] } {
  const summary = emptySummary();
  const anchored = (r: EvidenceEnvelope) =>
    def.terms.anchor.kind === "DATE_OF_BIRTH" ? r.occurrenceAnchor === null : r.occurrenceAnchor !== null && compareInstants(r.occurrenceAnchor, occurrence.anchorAt) === 0;
  const considered = evidence.ok ? evidence.known.filter(anchored) : [];
  summary.consideredEvidenceIds = considered.map((r) => r.evidenceId);
  const done = (state: ObligationState, reasons: string[], window: ObligationWindow | null) => ({
    draft: { occurrence, window, state, reasonCodes: reasons, evidence: summary },
    attributed: summary.consideredEvidenceIds,
  });

  if (occurrence.anchorState === "INVALID") return done("INVALID_EVIDENCE", ["CATTLE_OBLIGATION_ANCHOR_INVALID"], null);
  if (occurrence.anchorState === "CONFLICT") return done("EVIDENCE_CONFLICT", ["CATTLE_OBLIGATION_ANCHOR_CONFLICT"], null);
  const opensAt = addObligationOffset(occurrence.anchorAt, def.terms.window.opensAfter);
  const dueAt = addObligationOffset(occurrence.anchorAt, def.terms.window.dueAfter);
  if (opensAt === null || dueAt === null) return done("UNSUPPORTED", ["CATTLE_OBLIGATION_WINDOW_OUT_OF_RANGE"], null);
  const window: ObligationWindow = { opensAt, dueAt, boundary: def.terms.window.boundary };
  const inclusiveEnd = window.boundary === "INCLUSIVE_START_INCLUSIVE_END";
  const beforeOpen = (t: string) => compareInstants(t, opensAt) < 0;
  const pastDue = (t: string) => (inclusiveEnd ? compareInstants(t, dueAt) > 0 : compareInstants(t, dueAt) >= 0);

  if (!evidence.ok) {
    summary.invalidEvidenceIds = evidence.invalidIds;
    return done("INVALID_EVIDENCE", evidence.reasons, window);
  }
  const { resolution } = evidence;
  summary.supersededEvidenceIds = considered.filter((r) => resolution.supersededBy.has(r.evidenceId)).map((r) => r.evidenceId);
  const consideredIds = new Set(summary.consideredEvidenceIds);
  const competing = resolution.competitions.filter(
    (c) => consideredIds.has(c.targetId) || c.terminals.some((t) => t.obligationId === def.obligationId && anchored(t)),
  );
  if (competing.length > 0) {
    summary.conflictingEvidenceIds = sortedUnique(competing.flatMap((c) => c.terminals.map((t) => t.evidenceId)));
    return done("EVIDENCE_CONFLICT", ["CATTLE_OBLIGATION_COMPETING_CORRECTIONS"], window);
  }
  const live = considered.filter((r) => !resolution.supersededBy.has(r.evidenceId) && r.kind === "FULFILMENT");
  const happened = live.filter((r) => compareInstants(r.fulfilledAt as string, ctx.query.effectiveAt) <= 0);
  const sameVersion = (r: EvidenceEnvelope) => r.rule.ruleId === rule.ruleId && r.rule.version === rule.version;
  summary.notYetOccurredEvidenceIds = live.filter((r) => sameVersion(r) && !happened.includes(r)).map((r) => r.evidenceId);
  const other = happened.filter((r) => !sameVersion(r));
  summary.otherRuleVersionEvidenceIds = other.map((r) => r.evidenceId);
  const own = happened.filter(sameVersion);
  const early = own.filter((r) => beforeOpen(r.fulfilledAt as string));
  const late = own.filter((r) => pastDue(r.fulfilledAt as string));
  const inWindow = own.filter((r) => !early.includes(r) && !late.includes(r));
  summary.beforeWindowEvidenceIds = early.map((r) => r.evidenceId);
  const reasons = early.length > 0 ? ["CATTLE_OBLIGATION_FULFILMENT_BEFORE_WINDOW"] : [];
  if (inWindow.length > 0 && late.length > 0) {
    summary.conflictingEvidenceIds = [...inWindow, ...late].map((r) => r.evidenceId).sort(compareStrings);
    return done("EVIDENCE_CONFLICT", [...reasons, "CATTLE_OBLIGATION_FULFILMENT_TIMING_DISAGREES"], window);
  }
  if (inWindow.length > 0) {
    summary.countedEvidence = inWindow.map(strip);
    return done("SATISFIED", reasons, window);
  }
  if (late.length > 0) {
    summary.countedEvidence = late.map(strip);
    return done("SATISFIED_LATE", [...reasons, "CATTLE_OBLIGATION_FULFILLED_AFTER_DUE"], window);
  }
  if (other.length > 0) return done("REVIEW_REQUIRED", [...reasons, "CATTLE_OBLIGATION_EVIDENCE_FOR_OTHER_RULE_VERSION"], window);
  const at = ctx.query.effectiveAt;
  if (beforeOpen(at)) return done("UPCOMING", reasons, window);
  if (!pastDue(at)) return done("OUTSTANDING", reasons, window);
  return done("OVERDUE", reasons, window);
}

/**
 * KNOWLEDGE time of a raw evidence input, read before anything else about it
 * is trusted: `provenance` then `receivedAt`, each read exactly once (a
 * throwing getter or a non-object reads as unreadable).
 */
function evidenceKnowledgeTime(input: unknown): unknown {
  if (input === null || typeof input !== "object") return undefined;
  try {
    const provenance = (input as Record<string, unknown>).provenance;
    return provenance !== null && typeof provenance === "object" ? (provenance as Record<string, unknown>).receivedAt : undefined;
  } catch {
    return undefined;
  }
}

/** True only for a readable strict-UTC knowledge time after the cutoff. */
function receivedAfter(receivedAt: unknown, knowledgeCutoff: string): boolean {
  return isValidAnimalInstant(receivedAt) && compareInstants(receivedAt, knowledgeCutoff) > 0;
}

/**
 * Stands in for an input that could not be admitted as plain data (it could
 * not be cloned, or its admission metadata changed while it was read). It is
 * never cloneable, so the log reports it as not cloneable and fails closed —
 * and the caller's object is never retained, re-read or retried.
 */
const UNADMITTABLE_EVIDENCE: unknown = Object.freeze(() => undefined);

type EvidenceAdmission = { status: "LATER" } | { status: "ADMITTED"; copy: unknown };

/**
 * Admits ONE raw evidence input. Its admission metadata (knowledge time, and
 * any `extra` keys such as the herd's animal id) is captured exactly once
 * BEFORE cloning; the input is then cloned once. Clone failure ⇒ set aside
 * only when the captured time is provably after the cutoff, otherwise
 * UNADMITTABLE (fail closed). A clone whose metadata differs from the
 * captured metadata (a changing getter) ⇒ UNADMITTABLE. Otherwise the clone
 * decides: provably later ⇒ set aside; else admitted.
 */
function admitEvidenceInput(input: unknown, knowledgeCutoff: string, extra: readonly string[] = []): EvidenceAdmission & { captured: Record<string, unknown> } {
  const captured: Record<string, unknown> = { receivedAt: evidenceKnowledgeTime(input) };
  for (const key of extra) captured[key] = readEvidenceKey(input, key);
  let copy: unknown;
  try {
    copy = structuredClone(input);
  } catch {
    return receivedAfter(captured.receivedAt, knowledgeCutoff) ? { status: "LATER", captured } : { status: "ADMITTED", copy: UNADMITTABLE_EVIDENCE, captured };
  }
  const stable = evidenceKnowledgeTime(copy) === captured.receivedAt && extra.every((key) => readEvidenceKey(copy, key) === captured[key]);
  if (!stable) return { status: "ADMITTED", copy: UNADMITTABLE_EVIDENCE, captured };
  return receivedAfter(captured.receivedAt, knowledgeCutoff) ? { status: "LATER", captured } : { status: "ADMITTED", copy, captured };
}

function readEvidenceKey(input: unknown, key: string): unknown {
  if (input === null || typeof input !== "object") return undefined;
  try {
    return (input as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/**
 * Evidence that provably arrived after the cutoff (a valid `receivedAt` later
 * than it) does not exist for this query, so a later record — even a
 * malformed, contradictory or uncloneable one — can never change an earlier
 * reconstruction (`admitEvidenceInput`). Everything else, including a record
 * whose knowledge time cannot be read, is validated (and fails the log
 * closed if malformed). The private copy is what the log validates.
 */
function admitKnownEvidence(inputs: readonly unknown[], knowledgeCutoff: string): unknown[] {
  const admitted: unknown[] = [];
  for (const input of Array.from(inputs)) {
    const a = admitEvidenceInput(input, knowledgeCutoff);
    if (a.status === "ADMITTED") admitted.push(a.copy);
  }
  return admitted;
}

function evaluateCanonical(
  ledger: AnimalLedger,
  evidenceInputs: readonly unknown[] | null,
  catalogue: ObligationCatalogueResult,
  query: ValidQuery,
  hash: CattleHash,
): AnimalObligationResult {
  const projected = projectAnimalSnapshot(ledger, { effectiveAt: query.effectiveAt, knowledgeCutoff: query.knowledgeCutoff });
  if (!projected.ok) return { ok: false, issues: ["CATTLE_OBLIGATION_INVALID_LEDGER"], ledgerIssues: projected.ledgerIssues };
  const snapshot = projected.snapshot;
  const admitted = evidenceInputs === null ? null : admitKnownEvidence(evidenceInputs, query.knowledgeCutoff);
  const log = admitted === null ? null : createObligationEvidenceLog(ledger.animalId, admitted);
  const ctx: Context = {
    animalId: ledger.animalId,
    ledger,
    snapshot,
    snapshotFingerprint: computeAnimalSnapshotFingerprint(snapshot, hash),
    inputs: obligationInputsFromSnapshot(snapshot),
    catalogue,
    evidence: log !== null && log.ok ? { ok: true, resolution: resolveObligationEvidence(log.log, query.knowledgeCutoff) } : { ok: false },
    query,
    evaluationDate: utcCalendarDateOf(query.effectiveAt),
    hash,
  };
  const results = query.obligationIds
    .flatMap((id) => evaluateObligation(ctx, id))
    .sort((a, b) => compareStrings(a.obligationId, b.obligationId) || compareStrings(a.occurrence?.occurrenceId ?? "", b.occurrence?.occurrenceId ?? ""));
  const evaluation: AnimalObligationEvaluation = {
    obligationPayloadVersion: CATTLE_OBLIGATION_PAYLOAD_VERSION,
    animalId: ledger.animalId,
    effectiveAt: query.effectiveAt,
    knowledgeCutoff: query.knowledgeCutoff,
    evaluationDate: ctx.evaluationDate,
    snapshotFingerprint: ctx.snapshotFingerprint,
    catalogueIssues: catalogue.ok ? [] : catalogue.issues,
    evidenceIssues: log === null ? [{ code: "CATTLE_OBLIGATION_EVIDENCE_NOT_OBJECT", evidenceId: null }] : log.ok ? [] : log.issues,
    results,
  };
  return { ok: true, evaluation: deepFreezeAnimalValue(structuredClone(evaluation)) };
}

/**
 * Evaluates the queried obligations for one animal. The request is read once;
 * the ledger is re-materialised (a hand-built ledger is re-validated), the
 * evidence and catalogue are cloned/validated once, and the returned
 * evaluation is a detached, deep-frozen copy. Invalid query times, obligation
 * ids or ledger fail closed (`ok: false`); an invalid catalogue or evidence
 * log yields fail-closed per-obligation states instead.
 */
export function evaluateAnimalObligations(request: AnimalObligationRequest, hash: CattleHash): AnimalObligationResult {
  if (request === null || typeof request !== "object") return { ok: false, issues: ["CATTLE_OBLIGATION_INVALID_REQUEST"], ledgerIssues: [] };
  const { ledger, evidence, catalogue, query } = request;
  const q = readQuery(query);
  const rebuilt = rematerialiseAnimalLedger(ledger);
  const issues: ObligationRequestIssueCode[] = q.ok ? [] : [...q.issues];
  if (!rebuilt.ok) issues.push("CATTLE_OBLIGATION_INVALID_LEDGER");
  if (!q.ok || !rebuilt.ok) return { ok: false, issues, ledgerIssues: rebuilt.ok ? [] : rebuilt.issues };
  return evaluateCanonical(rebuilt.ledger, Array.isArray(evidence) ? evidence : null, materialiseObligationCatalogue(catalogue, q.query.knowledgeCutoff), q.query, hash);
}

// ---------------------------------------------------------------------------
// Herd helper
// ---------------------------------------------------------------------------

export type HerdObligationIssueCode =
  | "CATTLE_OBLIGATION_HERD_INVALID_LEDGER"
  | "CATTLE_OBLIGATION_HERD_DUPLICATE_ANIMAL"
  | "CATTLE_OBLIGATION_HERD_EVIDENCE_UNATTRIBUTABLE"
  | "CATTLE_OBLIGATION_HERD_EVIDENCE_FOR_UNEVALUATED_ANIMAL";

export interface HerdObligationIssue {
  code: HerdObligationIssueCode;
  animalId: string | null;
}

export interface HerdObligationRequest {
  ledgers: readonly unknown[];
  /** Evidence for any animal in the herd, partitioned by `animalId`. */
  evidence: readonly unknown[];
  catalogue: ObligationCatalogue;
  query: ObligationQuery;
}

export interface HerdObligationEvaluation {
  effectiveAt: string;
  knowledgeCutoff: string;
  /** One per distinct valid animal, sorted by animal id. */
  animals: AnimalObligationEvaluation[];
  /** Sorted; never merged into an animal's results. */
  issues: HerdObligationIssue[];
  catalogueIssues: ObligationCatalogueIssue[];
}

export type HerdObligationResult = { ok: true; herd: HerdObligationEvaluation } | { ok: false; issues: ObligationRequestIssueCode[] };

/**
 * Evaluates a supplied set of animals at one query. Input order never
 * matters. An invalid ledger or an animal id supplied by more than one
 * ledger is reported and that animal is not evaluated (duplicates are never
 * merged and no copy is preferred). Evidence with no readable animal id is
 * reported and makes every animal's evidence log fail closed; evidence for
 * an animal not evaluated is reported.
 */
export function evaluateHerdObligations(request: HerdObligationRequest, hash: CattleHash): HerdObligationResult {
  if (request === null || typeof request !== "object") return { ok: false, issues: ["CATTLE_OBLIGATION_INVALID_REQUEST"] };
  const { ledgers, evidence, catalogue, query } = request;
  const q = readQuery(query);
  if (!q.ok) return { ok: false, issues: q.issues };
  if (!Array.isArray(ledgers) || !Array.isArray(evidence)) return { ok: false, issues: ["CATTLE_OBLIGATION_INVALID_REQUEST"] };
  const issues: HerdObligationIssue[] = [];
  const byAnimal = new Map<string, AnimalLedger[]>();
  // Animal ids claimed by ledgers that are invalid: such an id is supplied by
  // more than one ledger once any other ledger claims it, so that animal is
  // excluded as a duplicate (never evaluated from the valid copy alone).
  const invalidClaims = new Set<string>();
  for (const raw of Array.from(ledgers)) {
    const claimed = readEvidenceKey(raw, "animalId"); // captured once, before cloning
    let copy: unknown;
    try {
      copy = structuredClone(raw);
    } catch {
      if (isOpaqueRef(claimed)) invalidClaims.add(claimed);
      issues.push({ code: "CATTLE_OBLIGATION_HERD_INVALID_LEDGER", animalId: isOpaqueRef(claimed) ? claimed : null });
      continue;
    }
    const rebuilt = rematerialiseAnimalLedger(copy);
    const id = copy !== null && typeof copy === "object" ? (copy as Record<string, unknown>).animalId : null;
    if (!rebuilt.ok || id !== claimed) {
      for (const c of [claimed, id]) if (isOpaqueRef(c)) invalidClaims.add(c);
      issues.push({ code: "CATTLE_OBLIGATION_HERD_INVALID_LEDGER", animalId: isOpaqueRef(id) ? id : isOpaqueRef(claimed) ? claimed : null });
      continue;
    }
    byAnimal.set(rebuilt.ledger.animalId, [...(byAnimal.get(rebuilt.ledger.animalId) ?? []), rebuilt.ledger]);
  }
  const evidenceBy = new Map<string, unknown[]>();
  const unattributable: unknown[] = [];
  // Knowledge-time admission precedes partitioning (`admitEvidenceInput`,
  // animal id captured once with the knowledge time): evidence provably
  // received after the cutoff does not exist for this query and is neither
  // partitioned nor reported. Unadmittable evidence known by the cutoff is
  // partitioned by its captured animal id and fails that log closed.
  for (const raw of Array.from(evidence)) {
    const a = admitEvidenceInput(raw, q.query.knowledgeCutoff, ["animalId"]);
    if (a.status === "LATER") continue;
    const id = a.captured.animalId;
    if (isOpaqueRef(id)) evidenceBy.set(id, [...(evidenceBy.get(id) ?? []), a.copy]);
    else {
      unattributable.push(a.copy);
      issues.push({ code: "CATTLE_OBLIGATION_HERD_EVIDENCE_UNATTRIBUTABLE", animalId: null });
    }
  }
  const materialised = materialiseObligationCatalogue(catalogue, q.query.knowledgeCutoff);
  const animals: AnimalObligationEvaluation[] = [];
  for (const [animalId, list] of [...byAnimal.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    if (list.length > 1 || invalidClaims.has(animalId)) {
      issues.push({ code: "CATTLE_OBLIGATION_HERD_DUPLICATE_ANIMAL", animalId });
      continue;
    }
    // Unattributable evidence is offered to every animal, so each log fails closed.
    const result = evaluateCanonical(list[0], [...(evidenceBy.get(animalId) ?? []), ...unattributable], materialised, q.query, hash);
    if (result.ok) animals.push(result.evaluation);
    else issues.push({ code: "CATTLE_OBLIGATION_HERD_INVALID_LEDGER", animalId });
  }
  const evaluated = new Set(animals.map((a) => a.animalId as string));
  for (const animalId of evidenceBy.keys()) {
    if (!evaluated.has(animalId)) issues.push({ code: "CATTLE_OBLIGATION_HERD_EVIDENCE_FOR_UNEVALUATED_ANIMAL", animalId });
  }
  issues.sort((a, b) => compareStrings(a.code, b.code) || compareStrings(a.animalId ?? "", b.animalId ?? ""));
  const herd: HerdObligationEvaluation = {
    effectiveAt: q.query.effectiveAt,
    knowledgeCutoff: q.query.knowledgeCutoff,
    animals,
    issues,
    catalogueIssues: materialised.ok ? [] : materialised.issues,
  };
  return { ok: true, herd: deepFreezeAnimalValue(structuredClone(herd)) };
}
