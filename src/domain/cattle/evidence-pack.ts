/**
 * Cattle C0 — Recommendation Evidence Pack.
 *
 * The smallest deterministic record that lets a later recommendation be
 * reconstructed: scope, intent, inputs with provenance, exact rule versions
 * evaluated, hard-gate outcomes, calculation steps, source versions,
 * assumptions/limitations/uncertainty, candidates, rejected alternatives,
 * the outcome and an integrity fingerprint.
 *
 * The outcome is derived here, never supplied: any hard gate that FAILs is
 * BLOCKED; any hard gate needing review is REVIEW_REQUIRED; any hard gate
 * that is unknown, conflicting, unsupported or not evaluated is
 * INSUFFICIENT_EVIDENCE; no proposed action is NO_RECOMMENDATION. Only with
 * every hard gate PASS/NOT_APPLICABLE does a proposed action become
 * `actionableActionId`. Advisory results and favourability never override a
 * hard gate. No narrative and no selection engine live here; any later LLM
 * explanation is downstream and non-authoritative.
 *
 * The fingerprint covers all content except `generatedAt` (a pure instance
 * timestamp, the same exclusion `assessment-integrity.ts` makes for
 * `createdAt`). Unordered lists are normalised; calculation steps keep their
 * sequence.
 */

import type { AssessmentFingerprint, FingerprintVerificationResult } from "../assessment-integrity";
import type { RuleEvaluationRecord } from "./evaluation";
import { compareInputItems, type CattleInputItem, type CattleInputScalar } from "./information";
import { compareStrings, computeCattleFingerprint, sameFingerprint, sortedUnique, verifyCattleFingerprint, type CattleHash } from "./integrity";
import { isValidIsoUtcDateTime } from "../iso-datetime";
import { isValidCalendarDate, type RuleVersionRef } from "./rule";
import { compareSourceVersionRefs, type SourceVersionRef } from "./source";
import { CATTLE_EVIDENCE_ARCHITECTURE_VERSION } from "./version";

export type RecommendationOutcome = "ACTIONABLE" | "NO_RECOMMENDATION" | "INSUFFICIENT_EVIDENCE" | "BLOCKED" | "REVIEW_REQUIRED";

export interface TargetScopeRef {
  kind: string;
  id: string;
  snapshotRef: string | null;
}

export interface IntentRef {
  intentId: string;
  description: string;
}

export interface EvidencePackCalculationStep {
  /** 1..n, contiguous; order is meaningful. */
  sequence: number;
  description: string;
  formula: string;
  inputs: Record<string, CattleInputScalar>;
  /** `null` = the step produced no value (never a substituted zero). */
  output: CattleInputScalar | null;
  unit: string | null;
  rounding: string | null;
  rule: RuleVersionRef | null;
}

export interface CandidateAction {
  actionId: string;
  description: string;
  /** Opaque, caller-computed favourability; never consulted by gating. */
  favourability: string | null;
}

export interface RejectedAlternative {
  actionId: string;
  reasonCodes: string[];
}

export interface EvidencePackReview {
  state: "UNREVIEWED" | "REVIEWED";
  reviewerRef: string | null;
  reviewedAt: string | null;
  notes: string[];
}

export interface RecommendationEvidencePackInput {
  recommendationId: string;
  engineVersion: string;
  rulesetVersion: string;
  evaluationDate: string;
  knownAt: string;
  generatedAt: string;
  targetScope: TargetScopeRef;
  intent: IntentRef | null;
  inputs: CattleInputItem[];
  ruleEvaluations: RuleEvaluationRecord[];
  /** Rule ids that must be evaluated hard gates for any action to be actionable. */
  requiredHardGateRuleIds: string[];
  calculationSteps: EvidencePackCalculationStep[];
  additionalSourceRefs: SourceVersionRef[];
  assumptions: string[];
  limitations: string[];
  uncertainties: string[];
  candidateActions: CandidateAction[];
  rejectedAlternatives: RejectedAlternative[];
  proposedActionId: string | null;
  review: EvidencePackReview;
}

export interface HardGateOutcome {
  ruleId: string;
  rule: RuleVersionRef | null;
  state: RuleEvaluationRecord["state"] | "NOT_EVALUATED";
  satisfied: boolean;
}

export interface RecommendationEvidencePack extends RecommendationEvidencePackInput {
  architectureVersion: string;
  missingInputs: string[];
  conflictingInputs: string[];
  hardGateOutcomes: HardGateOutcome[];
  sourceRefs: SourceVersionRef[];
  outcome: RecommendationOutcome;
  outcomeReasonCodes: string[];
  /** Set only when `outcome` is ACTIONABLE. */
  actionableActionId: string | null;
  fingerprint: AssessmentFingerprint;
}

export type BuildEvidencePackResult = { status: "BUILT"; pack: RecommendationEvidencePack } | { status: "INVALID"; issues: string[] };

function validate(input: RecommendationEvidencePackInput): string[] {
  const issues: string[] = [];
  if (!isValidCalendarDate(input.evaluationDate)) issues.push("CATTLE_PACK_INVALID_EVALUATION_DATE");
  if (!isValidIsoUtcDateTime(input.knownAt)) issues.push("CATTLE_PACK_INVALID_KNOWN_AT");
  if (!isValidIsoUtcDateTime(input.generatedAt)) issues.push("CATTLE_PACK_INVALID_GENERATED_AT");
  const candidateIds = input.candidateActions.map((c) => c.actionId);
  if (new Set(candidateIds).size !== candidateIds.length) issues.push("CATTLE_PACK_DUPLICATE_CANDIDATE");
  if (input.proposedActionId !== null && !candidateIds.includes(input.proposedActionId)) issues.push("CATTLE_PACK_PROPOSED_ACTION_NOT_A_CANDIDATE");
  for (const r of input.rejectedAlternatives) {
    if (!candidateIds.includes(r.actionId)) issues.push(`CATTLE_PACK_REJECTED_NOT_A_CANDIDATE:${r.actionId}`);
    if (r.actionId === input.proposedActionId) issues.push(`CATTLE_PACK_PROPOSED_ACTION_ALSO_REJECTED:${r.actionId}`);
    if (r.reasonCodes.length === 0) issues.push(`CATTLE_PACK_REJECTION_WITHOUT_REASON:${r.actionId}`);
  }
  const rejectedIds = input.rejectedAlternatives.map((r) => r.actionId);
  if (new Set(rejectedIds).size !== rejectedIds.length) issues.push("CATTLE_PACK_DUPLICATE_REJECTION");
  const ruleIds = input.ruleEvaluations.map((e) => e.requestedRuleId);
  if (new Set(ruleIds).size !== ruleIds.length) issues.push("CATTLE_PACK_DUPLICATE_RULE_EVALUATION");
  for (const e of input.ruleEvaluations) {
    if (e.evaluationDate !== input.evaluationDate) issues.push(`CATTLE_PACK_EVALUATION_DATE_MISMATCH:${e.requestedRuleId}`);
  }
  for (const id of input.requiredHardGateRuleIds) {
    const e = input.ruleEvaluations.find((r) => r.requestedRuleId === id);
    if (e !== undefined && e.gateRole === "ADVISORY") issues.push(`CATTLE_PACK_REQUIRED_HARD_GATE_IS_ADVISORY:${id}`);
  }
  const sequences = input.calculationSteps.map((s) => s.sequence);
  if (!sequences.every((s, i) => s === i + 1)) issues.push("CATTLE_PACK_CALCULATION_STEPS_NOT_CONTIGUOUS");
  return issues;
}

function deriveHardGates(input: RecommendationEvidencePackInput): HardGateOutcome[] {
  const ids = sortedUnique([
    ...input.requiredHardGateRuleIds,
    ...input.ruleEvaluations.filter((e) => e.gateRole === "HARD_GATE").map((e) => e.requestedRuleId),
  ]);
  return ids.map((ruleId) => {
    const e = input.ruleEvaluations.find((r) => r.requestedRuleId === ruleId);
    if (e === undefined) return { ruleId, rule: null, state: "NOT_EVALUATED", satisfied: false };
    return { ruleId, rule: e.rule, state: e.state, satisfied: e.state === "PASS" || e.state === "NOT_APPLICABLE" };
  });
}

function deriveOutcome(gates: HardGateOutcome[], proposedActionId: string | null): { outcome: RecommendationOutcome; reasons: string[] } {
  const reasons = gates.filter((g) => !g.satisfied).map((g) => `CATTLE_HARD_GATE_${g.state}:${g.ruleId}`);
  if (gates.some((g) => g.state === "FAIL")) return { outcome: "BLOCKED", reasons };
  if (gates.some((g) => g.state === "REVIEW_REQUIRED")) return { outcome: "REVIEW_REQUIRED", reasons };
  if (gates.some((g) => !g.satisfied)) return { outcome: "INSUFFICIENT_EVIDENCE", reasons };
  if (proposedActionId === null) return { outcome: "NO_RECOMMENDATION", reasons: ["CATTLE_NO_ACTION_PROPOSED"] };
  return { outcome: "ACTIONABLE", reasons: [] };
}

function normalise(input: RecommendationEvidencePackInput): RecommendationEvidencePackInput {
  const copy = structuredClone(input);
  return {
    ...copy,
    inputs: copy.inputs.sort(compareInputItems),
    ruleEvaluations: copy.ruleEvaluations.sort((a, b) => compareStrings(a.requestedRuleId, b.requestedRuleId)),
    requiredHardGateRuleIds: sortedUnique(copy.requiredHardGateRuleIds),
    additionalSourceRefs: copy.additionalSourceRefs.sort(compareSourceVersionRefs),
    assumptions: sortedUnique(copy.assumptions),
    limitations: sortedUnique(copy.limitations),
    uncertainties: sortedUnique(copy.uncertainties),
    candidateActions: copy.candidateActions.sort((a, b) => compareStrings(a.actionId, b.actionId)),
    rejectedAlternatives: copy.rejectedAlternatives
      .map((r) => ({ ...r, reasonCodes: sortedUnique(r.reasonCodes) }))
      .sort((a, b) => compareStrings(a.actionId, b.actionId)),
    review: { ...copy.review, notes: sortedUnique(copy.review.notes) },
  };
}

function uniqueSourceRefs(refs: SourceVersionRef[]): SourceVersionRef[] {
  return refs.sort(compareSourceVersionRefs).filter((r, i, arr) => i === 0 || compareSourceVersionRefs(arr[i - 1], r) !== 0);
}

type PackContent = Omit<RecommendationEvidencePack, "fingerprint" | "generatedAt">;

function fingerprintPayload(pack: Omit<RecommendationEvidencePack, "fingerprint">): PackContent {
  const { generatedAt, ...content } = pack;
  void generatedAt;
  return content;
}

/** Builds a pack from a deep copy of `input`; later mutation of `input`
 * cannot alter it. Invalid structure is reported, never repaired. */
export function buildRecommendationEvidencePack(input: RecommendationEvidencePackInput, hash: CattleHash): BuildEvidencePackResult {
  const issues = validate(input);
  if (issues.length > 0) return { status: "INVALID", issues: sortedUnique(issues) };
  const n = normalise(input);
  const hardGateOutcomes = deriveHardGates(n);
  const { outcome, reasons } = deriveOutcome(hardGateOutcomes, n.proposedActionId);
  const unfingerprinted: Omit<RecommendationEvidencePack, "fingerprint"> = {
    ...n,
    architectureVersion: CATTLE_EVIDENCE_ARCHITECTURE_VERSION,
    missingInputs: sortedUnique(n.ruleEvaluations.flatMap((e) => e.missingInputs)),
    conflictingInputs: sortedUnique(n.ruleEvaluations.flatMap((e) => e.conflictingInputs.map((c) => c.inputKey))),
    hardGateOutcomes,
    sourceRefs: uniqueSourceRefs([...n.additionalSourceRefs, ...n.ruleEvaluations.flatMap((e) => e.sourceChecks.map((c) => c.bound))]),
    outcome,
    outcomeReasonCodes: sortedUnique(reasons),
    actionableActionId: outcome === "ACTIONABLE" ? n.proposedActionId : null,
  };
  const fingerprint = computeCattleFingerprint("CATTLE_EVIDENCE_PACK", fingerprintPayload(unfingerprinted), hash);
  return { status: "BUILT", pack: { ...unfingerprinted, fingerprint } };
}

function packInput(pack: RecommendationEvidencePack): RecommendationEvidencePackInput {
  return {
    recommendationId: pack.recommendationId,
    engineVersion: pack.engineVersion,
    rulesetVersion: pack.rulesetVersion,
    evaluationDate: pack.evaluationDate,
    knownAt: pack.knownAt,
    generatedAt: pack.generatedAt,
    targetScope: pack.targetScope,
    intent: pack.intent,
    inputs: pack.inputs,
    ruleEvaluations: pack.ruleEvaluations,
    requiredHardGateRuleIds: pack.requiredHardGateRuleIds,
    calculationSteps: pack.calculationSteps,
    additionalSourceRefs: pack.additionalSourceRefs,
    assumptions: pack.assumptions,
    limitations: pack.limitations,
    uncertainties: pack.uncertainties,
    candidateActions: pack.candidateActions,
    rejectedAlternatives: pack.rejectedAlternatives,
    proposedActionId: pack.proposedActionId,
    review: pack.review,
  };
}

/**
 * Verifies a stored pack: rebuilds it from its own input fields (so every
 * derived field, including the outcome, must be consistent) and checks the
 * stored fingerprint against the canonical content. Never repairs a pack.
 */
export function verifyRecommendationEvidencePack(pack: RecommendationEvidencePack, hash: CattleHash): FingerprintVerificationResult {
  const rebuilt = buildRecommendationEvidencePack(packInput(pack), hash);
  if (rebuilt.status === "INVALID") {
    return { valid: false, reasonCode: "CATTLE_PACK_INVALID_STRUCTURE", detail: rebuilt.issues.join(", ") };
  }
  const { fingerprint, ...rest } = pack;
  const stored = verifyCattleFingerprint("CATTLE_EVIDENCE_PACK", fingerprintPayload(rest), fingerprint, hash);
  if (!stored.valid) return stored;
  if (!sameFingerprint(rebuilt.pack.fingerprint, fingerprint)) {
    return {
      valid: false,
      reasonCode: "CATTLE_PACK_DERIVED_CONTENT_INCONSISTENT",
      detail: "the pack's derived fields (outcome, hard gates, aggregates or normalisation) do not match a rebuild from its own inputs",
    };
  }
  return { valid: true };
}
