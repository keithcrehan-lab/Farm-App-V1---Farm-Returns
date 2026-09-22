/**
 * Farm Return Core Engine, Phase 8 — Opportunity Eligibility & Deterministic
 * Ranking.
 *
 * Answers: "of the audited opportunities Farm Return currently knows about,
 * which are eligible to be considered now, which are excluded (and why),
 * and in what deterministic economic order should the eligible comparable
 * ones appear?" It is a validation/eligibility/comparability/ranking layer
 * over ALREADY-TRUSTED Phase 7/7.1 records — never a second
 * opportunity-generation or calculation engine.
 *
 * Phase 8 has NO authority to: reconstruct an assessment, repair an
 * assessment, invent missing evidence, recompute economics, reinterpret
 * science, regenerate fingerprints, bypass blocked evidence, turn unknown
 * into zero, or infer cash saving from economic value. Every euro figure
 * this module ever compares is read directly off a real, already-computed
 * `SlurryDirectEconomicAssessment.netEconomicResult`/
 * `SlurryWholeFarmAllocationResult.totalNetEconomicResult` — this module
 * performs no `quantity × price`/money-construction arithmetic of its own
 * beyond `compareMoney` (a pure comparison, never a new value).
 *
 * ---------------------------------------------------------------------
 * STOP-CONDITION REVIEW (brief's ten named conditions) — resolved, not
 * triggered.
 * ---------------------------------------------------------------------
 *
 * STOP A (trusted-record boundary unavailable) — NOT triggered.
 * `TrustedOpportunityRecord` (below) is the real union of Phase 7's own two
 * record types (`AuditedActionOpportunityRecord` |
 * `AuditedWholeFarmDecisionRecord`) — there is no `unknown as ...` cast
 * anywhere in this module; TypeScript itself is the boundary, backed by the
 * fact these types can only be constructed via Phase 7's own validated
 * constructors.
 *
 * STOP B (no common comparable value) — NOT triggered. Both record types
 * already carry an identical read-model shape (`quantified`, `netDirection`,
 * `currency`, `limitations`, `asOfDate`, `knownAt`, `recordEngineVersion`,
 * `assessmentFingerprint`) plus their own authoritative
 * `netEconomicResult.amount`/`totalNetEconomicResult.amount` — this module
 * reads that value, never derives one.
 *
 * STOP C (gross/net ambiguity) — NOT triggered. Phase 5/6 already expose a
 * distinct, unambiguous net field (`netEconomicResult`/
 * `totalNetEconomicResult`) separate from gross (`directCostDifference`/
 * `totalGrossEconomicEffect`) — this module ranks net exclusively (§8
 * below); if net is blocked purely on unknown realisation cost, the record's
 * own `quantified` flag is already `false` (Phase 5/6 tie `quantified` to
 * the NET result, not gross), so it is excluded, never silently ranked on
 * gross instead.
 *
 * STOP D (parent/child double counting unresolvable) — NOT triggered.
 * `AuditedWholeFarmDecisionRecord.constituentActionRecordIds` is exactly the
 * real lineage Phase 7 already built (verified against Phase 6's own
 * selection at construction time) — this module suppresses any Phase 5
 * record whose `id` appears in an eligible Phase 6 parent's own list (§below).
 *
 * STOP E (duplicate/reassessment semantics insufficient) — NOT triggered.
 * `assessmentId` + `assessmentFingerprint.digest` + `evaluatedActionId` +
 * `supersedesRecordId` are exactly the real identity fields Phase 7/7.1's
 * own adversarial reviews already proved distinguish these three cases —
 * this module reuses them structurally (§below), inventing nothing new.
 *
 * STOP F (source/currentness policy impossible) — NOT triggered.
 * `asOfDate`/`knownAt`/`recordEngineVersion`/the assessment's own
 * `engineVersion` are all real, present fields — `OpportunityRankingPolicy`
 * (below) is built entirely from them; no arbitrary universal freshness
 * threshold is invented (a caller with no authorised threshold simply
 * supplies `freshness: { mode: "not_evaluated" }`, which never blocks
 * eligibility on freshness grounds and reports `"freshness_undetermined"`
 * honestly rather than assuming current).
 *
 * STOP G (currency conversion required) — NOT triggered, and trivially so
 * today: `CurrencyCode` (`money.ts`) is a single-value union (`"EUR"`
 * only). The real safeguard (§below) is still built structurally, not
 * merely assumed unreachable, the same discipline Phase 6 already applied
 * to its own currency-mismatch guard.
 *
 * STOP H (scientific reinterpretation required) — NOT triggered. This
 * module never reads a scientific field (no `scienceSupport`,
 * `counterfactualInvariance`, product/quantity data) at all — only the
 * already-resolved economic read-model fields.
 *
 * STOP I (new economic calculation required) — NOT triggered. The only
 * arithmetic in this module is `compareMoney` (pure comparison) for
 * sorting — no `addMoney`/`subtractMoney`/`multiplyMoney` call exists
 * anywhere here.
 *
 * STOP J (credit overlap cannot be identified safely) — NOT triggered.
 * The real Phase 1 `validateNoDuplicateCreditClaims` is run, unmodified,
 * over the union of real `EconomicEffect`s belonging to the FINAL ranked
 * set (§ below) — as a defence-in-depth CONFIRMATION alongside the primary
 * structural mechanism (parent/child suppression + duplicate-assessment
 * collapse), exactly as the brief's own §27 permits ("if the validator is
 * not appropriate at this layer... use the canonical lineage mechanism
 * instead" — lineage is primary here; the validator confirms it).
 *
 * ---------------------------------------------------------------------
 * Trust-boundary note on fingerprints (brief §3): this module deliberately
 * does NOT recompute any SHA-256 fingerprint (no `hash` function parameter
 * exists on this module's API at all) — that verification is Phase 7.1's
 * own job, already done once at record-construction time. Phase 8's own
 * "integrity prerequisite" check is a cheap, structural sanity check only
 * (well-formed digest shape + an accepted schema version/algorithm per
 * policy) — never a redundant re-verification of content Phase 8 has no
 * business re-hashing.
 *
 * ---------------------------------------------------------------------
 * Audit-continuity note: `RankedOpportunity`/`ExcludedOpportunity` reference
 * a record by its own `recordId` rather than re-embedding the full record —
 * the same "one canonical source of truth per fact" choice Phase 6/7 already
 * made for their own parent/child lineage. Nothing is stripped; a caller
 * that already holds the full `TrustedOpportunityRecord` (it must, to have
 * passed it in) can look up the complete audit chain by that id.
 */

import type { CurrencyCode, MoneyAmount } from "./money";
import { compareMoney } from "./money";
import type { EngineOutcome } from "./evidence";
import { ASSESSMENT_FINGERPRINT_ALGORITHM } from "./assessment-integrity";
import type {
  AuditedActionOpportunityRecord,
  AuditedWholeFarmDecisionRecord,
  OpportunityDecisionState,
  OpportunityDecisionStatus,
} from "./audited-opportunity-record";
import { validateNoDuplicateCreditClaims, type DoubleCountingValidationResult, type EconomicEffect } from "./economic-opportunity";

export const OPPORTUNITY_RANKING_ENGINE_VERSION = "opportunity_ranking_engine_v1.0.0";
export const RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT = "AUDITED_NET_ECONOMIC_BENEFIT";

/** Brief §65 — required on every ranking result. Mathematical precision in
 * the calculation ("this ranks above that by an exact audited amount") is
 * distinct from a guarantee about realised outcomes. */
export const OPPORTUNITY_RANKING_CERTAINTY_LIMITATION =
  "Under the audited inputs and current policy, a higher-ranked opportunity has a higher calculated economic value than a lower-ranked one. This does not prove it will produce a greater realised return — mathematical precision in the calculation is distinct from scientific or economic certainty about the outcome.";

/** The strongest existing trusted Phase 7.1 record type — the real union of
 * the two shapes Phase 7 can produce, discriminated by `sourcePhase`. Phase
 * 8 never accepts anything else. */
export type TrustedOpportunityRecord = AuditedActionOpportunityRecord | AuditedWholeFarmDecisionRecord;

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function compareStrings(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Freshness policy (brief §15/§16/§37/§54) — explicit, versioned, fail
// closed. No universal threshold is invented: `mode: "not_evaluated"`
// reports `"freshness_undetermined"` on every record and never blocks
// eligibility on freshness grounds. `mode: "max_age_days"` performs real
// evaluation, and under it a missing/invalid `asOfDate` resolves to
// `"freshness_undetermined"` too — which that mode then treats as
// INELIGIBLE (never silently "current").
// ---------------------------------------------------------------------------

export type FreshnessEvaluation = "current" | "stale" | "freshness_undetermined";

export type FreshnessPolicy = { mode: "not_evaluated" } | { mode: "max_age_days"; maxAgeDays: number; evaluationDate: string };

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

function evaluateFreshness(policy: FreshnessPolicy, asOfDate: string): FreshnessEvaluation {
  if (policy.mode === "not_evaluated") return "freshness_undetermined";
  const age = daysBetween(asOfDate, policy.evaluationDate);
  if (age === null) return "freshness_undetermined";
  return age <= policy.maxAgeDays ? "current" : "stale";
}

// ---------------------------------------------------------------------------
// Ranking policy (brief §16/§62/§63) — explicit, versioned. Defaults are
// intentionally NOT supplied by this module (brief §62: "defaults must not
// silently broaden eligibility") — a caller must state every accepted
// version/state explicitly.
// ---------------------------------------------------------------------------

export interface OpportunityRankingPolicy {
  /** Deterministic, caller-supplied — never randomly generated. Recorded on
   * every result (brief §16/§56) so a policy change is distinguishable
   * historically. */
  id: string;
  rankingMode: typeof RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT;
  acceptedIntegritySchemaVersions: number[];
  /** Whitelist of the source assessment's own `engineVersion` (brief §38 —
   * old != automatically invalid or valid; an explicit, caller-owned
   * compatibility decision, never assumed). */
  acceptedSourceEngineVersions: string[];
  acceptedRecordEngineVersions: string[];
  eligibleLifecycleStates: OpportunityDecisionStatus[];
  freshness: FreshnessPolicy;
  /** Brief §9/§49 — a `"cost"`-direction opportunity never enters ranking
   * unless a caller explicitly opts in. */
  includeAdverseOutcomes: boolean;
  /** Brief §48 — pick and document one rule: `true` by default meaning a
   * genuine quantified €0 is a real, auditable, comparable outcome (ranked
   * strictly below any real benefit) rather than silently excluded, which
   * would make it indistinguishable from an unknown/blocked one. */
  includeZeroOutcomes: boolean;
}

// ---------------------------------------------------------------------------
// Eligibility (brief §4/§5/§6) — never a single boolean.
// ---------------------------------------------------------------------------

export type OpportunityEligibilityReason =
  | { kind: "eligible" }
  | { kind: "not_quantified" }
  | { kind: "integrity_not_verified"; detail: string }
  | { kind: "unsupported_source_engine_version"; engineVersion: string }
  | { kind: "unsupported_record_engine_version"; recordEngineVersion: string }
  | { kind: "lifecycle_excluded"; status: OpportunityDecisionStatus }
  | { kind: "superseded"; supersededByRecordId: string }
  | { kind: "stale_evidence" }
  | { kind: "adverse_outcome_excluded" }
  | { kind: "zero_outcome_excluded" }
  | { kind: "parent_child_double_count"; parentRecordId: string }
  | { kind: "duplicate_assessment"; keptRecordId: string }
  | { kind: "identity_content_conflict"; conflictingRecordId: string }
  | { kind: "incomparable_currency" };

export interface RankedOpportunity {
  rank: number;
  recordId: string;
  assessmentId: string;
  /** `evaluatedActionId` for a Phase 5 record; `assessmentId` again for a
   * Phase 6 record, which has no separate single-action identity — it IS
   * the whole-farm selection decision. */
  primaryIdentity: string;
  sourcePhase: TrustedOpportunityRecord["sourcePhase"];
  amount: MoneyAmount;
  direction: "benefit" | "cost" | "zero";
  currency: CurrencyCode;
  recordEngineVersion: string;
  sourceEngineVersion: string;
  freshness: FreshnessEvaluation;
  limitations: string[];
  constituentActionRecordIds: string[] | null;
  /** Structured, never AI prose (brief §33/§34). */
  rankingReason: { code: typeof RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT; amount: MoneyAmount; currency: CurrencyCode };
}

export interface ExcludedOpportunity {
  recordId: string;
  assessmentId: string;
  sourcePhase: TrustedOpportunityRecord["sourcePhase"];
  reason: OpportunityEligibilityReason;
  limitations: string[];
}

export interface OpportunityRankingResult {
  policy: OpportunityRankingPolicy;
  engineVersion: string;
  evaluatedAt: string;
  ranked: RankedOpportunity[];
  excluded: ExcludedOpportunity[];
  /** Real Phase 1 validator, run over the FINAL ranked set's own effects —
   * defence in depth alongside the structural parent/child + duplicate
   * mechanisms above (brief §27). */
  creditValidation: DoubleCountingValidationResult;
  limitations: string[];
}

// ---------------------------------------------------------------------------
// Internal read-only accessors — every one reads a value the trusted record
// already computed; none derives, estimates or recomputes one.
// ---------------------------------------------------------------------------

function sourceEngineVersionOf(record: TrustedOpportunityRecord): string {
  return record.sourcePhase === "phase_5_action" ? record.assessment.engineVersion : record.result.engineVersion;
}

function netAmountOutcome(record: TrustedOpportunityRecord): EngineOutcome<MoneyAmount> {
  return record.sourcePhase === "phase_5_action" ? record.assessment.netEconomicResult.amount : record.result.totalNetEconomicResult.amount;
}

function primaryIdentityOf(record: TrustedOpportunityRecord): string {
  return record.sourcePhase === "phase_5_action" ? record.evaluatedActionId : record.assessmentId;
}

function effectsOf(record: TrustedOpportunityRecord): EconomicEffect[] {
  if (record.sourcePhase === "phase_5_action") {
    return record.assessment.effect !== null ? [record.assessment.effect] : [];
  }
  return record.result.selected.flatMap((selected) => (selected.assessment.effect !== null ? [selected.assessment.effect] : []));
}

function fingerprintWellFormed(record: TrustedOpportunityRecord, policy: OpportunityRankingPolicy): boolean {
  const fp = record.assessmentFingerprint;
  return (
    fp.algorithm === ASSESSMENT_FINGERPRINT_ALGORITHM &&
    SHA256_HEX_PATTERN.test(fp.digest) &&
    policy.acceptedIntegritySchemaVersions.includes(fp.schemaVersion)
  );
}

// ---------------------------------------------------------------------------
// Pass 1 — structural/version/quantified/lifecycle/freshness eligibility,
// evaluated independently per record (no cross-record knowledge needed).
// ---------------------------------------------------------------------------

function provisionalEligibility(
  record: TrustedOpportunityRecord,
  decisionStates: ReadonlyMap<string, OpportunityDecisionState>,
  policy: OpportunityRankingPolicy,
): OpportunityEligibilityReason {
  if (!fingerprintWellFormed(record, policy)) {
    return {
      kind: "integrity_not_verified",
      detail: `assessmentFingerprint (schemaVersion=${record.assessmentFingerprint.schemaVersion}, algorithm=${record.assessmentFingerprint.algorithm}) is not well-formed or its schema version is not accepted by this ranking policy`,
    };
  }
  if (!policy.acceptedRecordEngineVersions.includes(record.recordEngineVersion)) {
    return { kind: "unsupported_record_engine_version", recordEngineVersion: record.recordEngineVersion };
  }
  const sourceEngineVersion = sourceEngineVersionOf(record);
  if (!policy.acceptedSourceEngineVersions.includes(sourceEngineVersion)) {
    return { kind: "unsupported_source_engine_version", engineVersion: sourceEngineVersion };
  }
  if (!record.quantified) {
    return { kind: "not_quantified" };
  }
  const status: OpportunityDecisionStatus = decisionStates.get(record.id)?.status ?? "active";
  if (!policy.eligibleLifecycleStates.includes(status)) {
    return { kind: "lifecycle_excluded", status };
  }
  if (policy.freshness.mode === "max_age_days" && evaluateFreshness(policy.freshness, record.asOfDate) !== "current") {
    return { kind: "stale_evidence" };
  }
  return { kind: "eligible" };
}

// ---------------------------------------------------------------------------
// Main entry point.
// ---------------------------------------------------------------------------

export function rankOpportunities(
  records: readonly TrustedOpportunityRecord[],
  decisionStates: ReadonlyMap<string, OpportunityDecisionState>,
  policy: OpportunityRankingPolicy,
  evaluatedAt: string,
): OpportunityRankingResult {
  const byId = new Map(records.map((record) => [record.id, record]));
  const reasons = new Map<string, OpportunityEligibilityReason>();
  const isEligible = (id: string) => reasons.get(id)?.kind === "eligible";

  // Pass 1.
  for (const record of records) reasons.set(record.id, provisionalEligibility(record, decisionStates, policy));

  // Pass 2 — supersession (brief §17/§46). A record with a non-null
  // `supersedesRecordId` marks its target superseded regardless of the
  // superseding record's OWN further eligibility (a deliberate, conservative
  // choice: a superseded historical record never resurfaces merely because
  // its replacement happens to fail some other unrelated check — both stay
  // excluded rather than risk ranking stale evidence).
  for (const record of records) {
    if (record.supersedesRecordId !== null && byId.has(record.supersedesRecordId)) {
      const target = record.supersedesRecordId;
      if (reasons.get(target)?.kind !== "superseded") {
        reasons.set(target, { kind: "superseded", supersededByRecordId: record.id });
      }
    }
  }

  // Pass 3 — duplicate assessment vs. identity/content conflict (brief
  // §18/§19/§27/§28), among records still eligible after passes 1-2.
  const afterPass2 = records.filter((record) => isEligible(record.id));
  const byAssessmentKey = new Map<string, TrustedOpportunityRecord[]>();
  for (const record of afterPass2) {
    const key = `${record.sourcePhase}:${record.assessmentId}`;
    const bucket = byAssessmentKey.get(key) ?? [];
    bucket.push(record);
    byAssessmentKey.set(key, bucket);
  }
  for (const bucket of byAssessmentKey.values()) {
    if (bucket.length < 2) continue;
    const digests = new Set(bucket.map((record) => record.assessmentFingerprint.digest));
    if (digests.size > 1) {
      // Same assessmentId, different content — an integrity conflict, never
      // a legitimate reassessment (that requires a NEW assessmentId).
      // Neither side ranks.
      for (const record of bucket) {
        const other = bucket.find((candidate) => candidate.id !== record.id)!;
        reasons.set(record.id, { kind: "identity_content_conflict", conflictingRecordId: other.id });
      }
    } else {
      // Same assessmentId, same fingerprint — the same calculation recorded
      // more than once. Keep exactly one, deterministically.
      const sorted = [...bucket].sort((a, b) => compareStrings(a.id, b.id));
      const kept = sorted[0];
      for (const record of sorted.slice(1)) {
        reasons.set(record.id, { kind: "duplicate_assessment", keptRecordId: kept.id });
      }
    }
  }

  // Pass 4 — adverse/zero policy exclusion (brief §9/§48/§49), among records
  // still eligible after pass 3.
  const afterPass3 = records.filter((record) => isEligible(record.id));
  for (const record of afterPass3) {
    if (record.netDirection === "cost" && !policy.includeAdverseOutcomes) {
      reasons.set(record.id, { kind: "adverse_outcome_excluded" });
    } else if (record.netDirection === "zero" && !policy.includeZeroOutcomes) {
      reasons.set(record.id, { kind: "zero_outcome_excluded" });
    }
  }

  // Pass 5 — currency comparability (brief §12/§53). Never rank raw numbers
  // across currencies; no FX is invented. Ranks only the largest single
  // currency group, deterministically (count desc, then currency code asc).
  const afterPass4 = records.filter((record) => isEligible(record.id));
  const currencyCounts = new Map<CurrencyCode, number>();
  for (const record of afterPass4) {
    if (record.currency !== null) currencyCounts.set(record.currency, (currencyCounts.get(record.currency) ?? 0) + 1);
  }
  if (currencyCounts.size > 1) {
    const [majorityCurrency] = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0]))[0];
    for (const record of afterPass4) {
      if (record.currency !== null && record.currency !== majorityCurrency) {
        reasons.set(record.id, { kind: "incomparable_currency" });
      }
    }
  }

  // Pass 6 — parent/child double counting (brief §25/§26/§50), the
  // highest-risk area: a Phase 6 whole-farm decision and its own selected
  // Phase 5 constituents must never both appear in one ranked set. An
  // EXCLUDED parent (failed some other check) does not suppress its
  // children — only a still-eligible parent does. This MUST run last, after
  // every other independent per-record pass (structural, supersession,
  // duplicate/conflict, adverse/zero, currency) has reached its FINAL
  // verdict on the parent — otherwise a parent that will itself be excluded
  // later (e.g. for being adverse, zero, or currency-incompatible) would
  // still be treated as "eligible" at the moment this pass runs, wrongly
  // suppressing real, independently-valid children behind a parent that
  // never actually ranks (found live during Phase 8's adversarial review:
  // a forced-adverse real Phase 6 parent permanently suppressed two real,
  // positive-benefit Phase 5 children with no way to recover them, even
  // though the parent itself was excluded and posed no actual double-
  // counting risk).
  const afterPass5 = records.filter((record) => isEligible(record.id));
  const suppressedByParent = new Map<string, string>();
  for (const record of afterPass5) {
    if (record.sourcePhase === "phase_6_whole_farm_decision") {
      for (const childId of record.constituentActionRecordIds) {
        if (!suppressedByParent.has(childId)) suppressedByParent.set(childId, record.id);
      }
    }
  }
  for (const record of afterPass5) {
    if (record.sourcePhase === "phase_5_action" && suppressedByParent.has(record.id)) {
      reasons.set(record.id, { kind: "parent_child_double_count", parentRecordId: suppressedByParent.get(record.id)! });
    }
  }

  // Build the ranked set from whatever remains eligible.
  const finalEligible = records.filter((record) => isEligible(record.id));
  const rankedUnsorted: RankedOpportunity[] = [];
  for (const record of finalEligible) {
    const netOutcome = netAmountOutcome(record);
    const direction = record.netDirection;
    if (netOutcome.status !== "OK" || direction === null) {
      // Defensive — unreachable given pass 1 already checked `quantified`
      // (which is tied to this exact status), but a blocked/unknown result
      // must never silently rank, ever.
      reasons.set(record.id, { kind: "not_quantified" });
      continue;
    }
    rankedUnsorted.push({
      rank: 0,
      recordId: record.id,
      assessmentId: record.assessmentId,
      primaryIdentity: primaryIdentityOf(record),
      sourcePhase: record.sourcePhase,
      amount: netOutcome.value,
      direction,
      currency: netOutcome.value.currency,
      recordEngineVersion: record.recordEngineVersion,
      sourceEngineVersion: sourceEngineVersionOf(record),
      freshness: evaluateFreshness(policy.freshness, record.asOfDate),
      limitations: [...record.limitations],
      constituentActionRecordIds: record.sourcePhase === "phase_6_whole_farm_decision" ? [...record.constituentActionRecordIds] : null,
      rankingReason: { code: RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, amount: netOutcome.value, currency: netOutcome.value.currency },
    });
  }

  // Deterministic comparator (brief §29/§30/§31): eligibility already
  // narrowed to one comparable class per direction; sort benefit-class
  // descending by amount, cost-class ascending by magnitude, zero-class has
  // no secondary ordering (all literally €0) — then a documented,
  // non-economic, stable tie-break.
  const classRank: Record<"benefit" | "zero" | "cost", number> = { benefit: 0, zero: 1, cost: 2 };
  rankedUnsorted.sort((a, b) => {
    const classDiff = classRank[a.direction] - classRank[b.direction];
    if (classDiff !== 0) return classDiff;
    if (a.direction === "benefit") {
      const cmp = compareMoney(b.amount, a.amount);
      if (cmp !== 0) return cmp;
    } else if (a.direction === "cost") {
      const cmp = compareMoney(a.amount, b.amount);
      if (cmp !== 0) return cmp;
    }
    const bySourcePhase = compareStrings(a.sourcePhase, b.sourcePhase);
    if (bySourcePhase !== 0) return bySourcePhase;
    const byPrimaryIdentity = compareStrings(a.primaryIdentity, b.primaryIdentity);
    if (byPrimaryIdentity !== 0) return byPrimaryIdentity;
    const byAssessmentId = compareStrings(a.assessmentId, b.assessmentId);
    if (byAssessmentId !== 0) return byAssessmentId;
    return compareStrings(a.recordId, b.recordId);
  });
  rankedUnsorted.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  const excluded: ExcludedOpportunity[] = records
    .filter((record) => reasons.get(record.id)?.kind !== "eligible")
    .map((record) => ({
      recordId: record.id,
      assessmentId: record.assessmentId,
      sourcePhase: record.sourcePhase,
      reason: reasons.get(record.id)!,
      limitations: [...record.limitations],
    }));

  const creditValidation = validateNoDuplicateCreditClaims(rankedUnsorted.flatMap((entry) => effectsOf(byId.get(entry.recordId)!)));

  return {
    policy,
    engineVersion: OPPORTUNITY_RANKING_ENGINE_VERSION,
    evaluatedAt,
    ranked: rankedUnsorted,
    excluded,
    creditValidation,
    limitations: [OPPORTUNITY_RANKING_CERTAINTY_LIMITATION],
  };
}
