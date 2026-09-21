/**
 * Economic Opportunity Engine, Phase 7 — Audited Opportunity Record /
 * Decision Ledger V1.
 *
 * A RECORDING, EVIDENCE AND STATE-TRANSITION layer, not another economic
 * engine. It answers: "what exactly was calculated, from which evidence,
 * for which action/resource/field, at what point in time, under which
 * assumptions and limitations — and can a later layer consume this result
 * without reinterpreting, recomputing or weakening its provenance?"
 *
 * This module NEVER adds money, recomputes a total, re-runs nutrient
 * science, fertiliser planning, price resolution, or recalculates any
 * Phase 5/6 output. Every economic fact in a record is either the
 * authoritative Phase 5/6 result object itself (deep-cloned — see
 * `createAuditedActionOpportunityRecord`/`buildAuditedWholeFarmDecisionRecord`
 * below) or a value read directly off it — never a value a caller
 * separately declares and this module merely trusts.
 *
 * ---------------------------------------------------------------------
 * STOP-CONDITION REVIEW (brief's seven named conditions) — resolved, not
 * triggered; see DOMAIN_CONTRACTS.md's Phase 7 section for the full
 * write-up this comment summarises.
 * ---------------------------------------------------------------------
 *
 * STOP A (authoritative output lacks required provenance) — NOT
 * triggered. Phase 5's `SlurryDirectEconomicAssessment` already exposes
 * `evaluatedActionId`/`fieldId`/`evaluatedActionVolumeM3` (the exact
 * fields Phase 6's own adversarial review found and closed a binding gap
 * around) and Phase 6's `SlurryWholeFarmAllocationResult` already exposes
 * `selected[].evaluatedActionId`/`.fieldId`/`.assessment` — everything
 * this module needs to bind a record to its real source is already
 * there. This module goes further than merely checking a caller's claim
 * against these fields: `createAuditedActionOpportunityRecord`'s only
 * economic input is the real assessment object itself — there is no
 * separate `evaluatedActionId`/`fieldId`/`volumeM3`/`amount` parameter a
 * caller could supply and mismatch. A mismatch of that class is not
 * merely checked here; it is structurally impossible by API design.
 *
 * STOP B (immutable snapshot impossible) — NOT triggered.
 * `SlurryDirectEconomicAssessment`/`SlurryWholeFarmAllocationResult` are
 * both entirely plain, JSON-safe values (decimal *strings* via
 * `MoneyAmount`, ISO date strings, nested plain objects/arrays, string-
 * literal discriminated unions) — no `Decimal` instances, no `Date`
 * objects, no functions, no class instances anywhere in either shape.
 * `structuredClone` (the exact mechanism `evidence.ts`'s own `ok()`
 * already uses to solve the identical "caller could mutate this after
 * the fact" problem for `CalculationExplanation`) therefore gives a real,
 * complete, disconnected copy — no earlier Phase 1-6 contract needed to
 * change.
 *
 * STOP C (duplicate identity ambiguous) — NOT triggered, resolved by
 * design. `assessment.id` (Phase 5/6's own deterministic calculation
 * identity) and `assessment.evaluatedActionId` (the real-world action's
 * stable identity) are already two DIFFERENT fields on the authoritative
 * source object — recording the exact same `assessment.id` twice is
 * "the same calculation recorded twice" (a future persistence layer's
 * job to reject via a real uniqueness constraint on `assessmentId`, which
 * this module's read-model surfaces for exactly that purpose); a NEW,
 * genuinely different `assessment.id` sharing the SAME
 * `evaluatedActionId` is "the same real action legitimately reassessed"
 * — fully representable via `supersedesRecordId`, with
 * `validateSupersession` anchoring that supersession to matching
 * `evaluatedActionId`, never merely a shared field.
 *
 * STOP D (blocked-vs-zero incompatible with serialisation) — NOT
 * triggered. `EngineOutcome<T>`'s own discriminated union (`status: "OK"`
 * vs every other status) already survives a plain `JSON.stringify`/
 * `JSON.parse` round trip exactly, since it is itself built from plain
 * string/number/object values — proven directly by this module's own
 * serialisation round-trip tests using a real quantified-zero case and a
 * real blocked case.
 *
 * STOP E (exact money/quantity serialisation unsafe) — NOT triggered.
 * `MoneyAmount`/`evaluatedActionVolumeM3`/`volumeM3` are already decimal
 * *strings*, never `Decimal` instances or `number`s that could lose
 * precision — a JSON round trip of a string is lossless by construction,
 * proven directly by this module's own tests using a real
 * multi-decimal-place amount.
 *
 * STOP F (Phase 6 lineage insufficient) — NOT triggered, resolved by
 * design. `buildAuditedWholeFarmDecisionRecord` does not duplicate each
 * selected candidate's full Phase 5 detail into the Phase 6 record — it
 * requires the caller to have already built each selected candidate's
 * own `AuditedActionOpportunityRecord` (via
 * `createAuditedActionOpportunityRecord`) and references them by id
 * (`constituentActionRecordIds`), after verifying every one is correctly
 * bound to the exact assessment Phase 6 actually selected. One canonical
 * source of truth per fact: the Phase 5 record owns the full audit trail
 * for "why this number"; the Phase 6 record owns "what was selected and
 * its own net/gross contribution" (data Phase 6 itself already computed,
 * not re-derived from the Phase 5 record).
 *
 * STOP G (persistence dependency) — NOT triggered. Every type/function in
 * this module is a pure domain value/function — no Supabase import, no
 * migration, no API route, no sync. The domain contract is fully provable
 * (and is proven, by this module's own tests) without committing to any
 * persistence architecture; Phase 7's read-model fields (`assessmentId`
 * uniqueness, `supersedesRecordId` chains) are deliberately shaped so a
 * FUTURE persistence layer can enforce real constraints on top of this
 * contract, not so this phase has to simulate a database in memory.
 *
 * ---------------------------------------------------------------------
 * Immutable evidence vs. mutable decision state (brief §13/§23/§24) are
 * two STRUCTURALLY SEPARATE types here, not a combined workflow object:
 * `AuditedActionOpportunityRecord`/`AuditedWholeFarmDecisionRecord` carry
 * no lifecycle/decision field at all; `OpportunityDecisionState` carries
 * ONLY a status/timestamp/back-reference id, never a monetary field of
 * any kind. Changing decision state therefore cannot mutate an economic
 * snapshot not because of a runtime check, but because there is no field
 * through which it could — `updateOpportunityDecisionState` returns a
 * brand new `OpportunityDecisionState`, never touches a record at all.
 * "Completed" never implies confirmed cash for the identical reason: with
 * no monetary field on decision state, there is nothing for "completed"
 * to reinterpret.
 */

import type { EngineOutcome } from "./evidence";
import { blockedInsufficientEvidence, ok } from "./evidence";
import type { CurrencyCode, MoneyAmount } from "./money";
import type { SlurryDirectEconomicAssessment } from "./slurry-direct-economic-assessment";
import type { SlurryWholeFarmAllocationResult } from "./slurry-whole-farm-allocation";

export const AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION = "audited_opportunity_record_engine_v1.0.0";

// ---------------------------------------------------------------------------
// Source phase — which authoritative engine produced the snapshot this
// record preserves. Never inferred from application version (brief §6);
// this identifies the ENGINE CONTRACT (frozen Phase 5/6 modules) a record
// was calculated under, distinct from the app release that happened to
// call it.
// ---------------------------------------------------------------------------
export type AuditedOpportunitySourcePhase = "phase_5_action" | "phase_6_whole_farm_decision";

type DirectedEconomicOutcome = { direction: "benefit" | "cost" | "zero" | null; amount: EngineOutcome<MoneyAmount> };

function currencyOfDirectedOutcome(outcome: DirectedEconomicOutcome): CurrencyCode | null {
  return outcome.amount.status === "OK" ? outcome.amount.value.currency : null;
}

// ---------------------------------------------------------------------------
// Phase 5 — one audited action-level opportunity record (brief §8).
// Always constructible from a real SlurryDirectEconomicAssessment,
// whether its economics are quantified, genuinely zero, or blocked — a
// blocked assessment still produces a real, readable AUDIT record; it
// simply reads as `quantified: false`, never as a fabricated opportunity.
// This is brief §8's option B in spirit (a blocked result never becomes a
// standalone "opportunity" claim) implemented via the SAME EngineOutcome
// discriminant the assessment itself already carries, rather than a new,
// separate status flag that could drift out of sync with it.
// ---------------------------------------------------------------------------
export interface AuditedActionOpportunityRecord {
  /** This Phase 7 record's own deterministic identity — distinct from
   * `assessmentId` (the calculation's identity) and `evaluatedActionId`
   * (the real-world action's identity). Caller-supplied, never randomly
   * generated (matches every other id in this codebase's Economic
   * Opportunity Engine). */
  id: string;
  recordEngineVersion: string;
  sourcePhase: "phase_5_action";
  /** `null` for a first recording of an action; a real prior record's
   * `id` when this record represents a legitimate reassessment of the
   * SAME underlying action with new evidence (brief §15) — see
   * `validateSupersession`. Rejected at construction if it equals this
   * record's own `id` (brief §15's "prevent a record from superseding
   * itself"). */
  supersedesRecordId: string | null;
  /** When THIS RECORD was created — distinct from `assessment.createdAt`
   * (when the underlying Phase 5 calculation itself ran; brief §7). The
   * two are typically identical for an immediate recording but are kept
   * as separate fields so a later batch-recording flow (not built in this
   * phase) is representable without conflating the two facts. */
  recordCreatedAt: string;

  // --- Read-model summary (brief §26): a future ranking layer can answer
  // basic eligibility questions from these fields alone, without
  // inspecting `assessment`'s internal scientific-engine shape. Every
  // field below is DERIVED from `assessment`, never re-declared/
  // re-entered by a caller. ---------------------------------------------
  assessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  evaluatedActionVolumeM3: string;
  asOfDate: string;
  knownAt: string;
  /** `true` exactly when `assessment.netEconomicResult.amount.status ===
   * "OK"` — a real, quantified economic result exists. `false` covers
   * both a blocked assessment AND (this module's own honesty rule) a
   * `directCostDifference` that is OK but net is blocked purely on
   * unknown realisation cost — this flag answers "is there a net figure
   * a ranking layer can use," not merely "did the gross comparison
   * succeed." */
  quantified: boolean;
  netDirection: "benefit" | "cost" | "zero" | null;
  grossDirection: "benefit" | "cost" | "zero" | null;
  currency: CurrencyCode | null;
  limitations: string[];

  /** The complete, deep-cloned Phase 5 assessment this record snapshots
   * — nothing dropped, nothing re-derived, nothing re-declared (brief
   * §4's full reconstruction chain: scientific outcome, baseline plan
   * cost, intervention plan cost, price evidence, realisation cost, all
   * present here unstripped). Mutating the ORIGINAL object a caller holds
   * after calling `createAuditedActionOpportunityRecord` can never affect
   * this field (brief §23) — it is a real, disconnected copy. */
  assessment: SlurryDirectEconomicAssessment;
}

export interface CreateAuditedActionOpportunityRecordInput {
  /** This Phase 7 record's own deterministic identity. */
  id: string;
  /** The real, already-computed Phase 5 result. The ONLY economic input
   * to this function — there is deliberately no separate
   * evaluatedActionId/fieldId/volumeM3/amount parameter for a caller to
   * supply and potentially mismatch against it (STOP A). */
  assessment: SlurryDirectEconomicAssessment;
  recordCreatedAt: string;
  supersedesRecordId?: string;
}

export function createAuditedActionOpportunityRecord(
  input: CreateAuditedActionOpportunityRecordInput,
): AuditedActionOpportunityRecord {
  if (input.supersedesRecordId !== undefined && input.supersedesRecordId === input.id) {
    throw new Error(
      "createAuditedActionOpportunityRecord: a record cannot supersede itself (supersedesRecordId === id) — this is a structural impossibility, not a domain-evidence gap, so it is rejected at construction rather than represented as a blocked EngineOutcome.",
    );
  }
  // brief §23 mutation-attack defence — see this module's header.
  const assessment = structuredClone(input.assessment);
  const quantified = assessment.netEconomicResult.amount.status === "OK";
  return {
    id: input.id,
    recordEngineVersion: AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION,
    sourcePhase: "phase_5_action",
    supersedesRecordId: input.supersedesRecordId ?? null,
    recordCreatedAt: input.recordCreatedAt,
    assessmentId: assessment.id,
    evaluatedActionId: assessment.evaluatedActionId,
    fieldId: assessment.fieldId,
    evaluatedActionVolumeM3: assessment.evaluatedActionVolumeM3,
    asOfDate: assessment.asOfDate,
    knownAt: assessment.knownAt,
    quantified,
    netDirection: assessment.netEconomicResult.direction,
    grossDirection: assessment.directCostDifferenceDirection,
    currency: currencyOfDirectedOutcome(assessment.netEconomicResult),
    limitations: [...assessment.limitations],
    assessment,
  };
}

// ---------------------------------------------------------------------------
// Phase 6 — one audited whole-farm decision record (brief §9/§10).
// ---------------------------------------------------------------------------
export interface AuditedWholeFarmDecisionRecord {
  id: string;
  recordEngineVersion: string;
  sourcePhase: "phase_6_whole_farm_decision";
  supersedesRecordId: string | null;
  recordCreatedAt: string;

  assessmentId: string;
  asOfDate: string;
  knownAt: string;
  availableVolumeM3: string;
  selectedVolumeM3: string;
  remainingVolumeM3: string;
  quantified: boolean;
  netDirection: "benefit" | "cost" | "zero" | null;
  grossDirection: "benefit" | "cost" | "zero" | null;
  currency: CurrencyCode | null;
  limitations: string[];

  /** Lineage (brief §10/§22): the id of the real
   * `AuditedActionOpportunityRecord` for each SELECTED candidate,
   * deterministically ordered by `evaluatedActionId` — never the full
   * Phase 5 detail duplicated here. The Phase 5 record referenced by each
   * id remains the one canonical source of truth for that action's own
   * full audit trail. */
  constituentActionRecordIds: string[];

  /** The complete, deep-cloned Phase 6 result this record snapshots. */
  result: SlurryWholeFarmAllocationResult;
}

export interface BuildAuditedWholeFarmDecisionRecordInput {
  id: string;
  /** The real, already-computed Phase 6 result. */
  result: SlurryWholeFarmAllocationResult;
  /** One real `AuditedActionOpportunityRecord`, already constructed via
   * `createAuditedActionOpportunityRecord`, for EVERY candidate
   * `result.selected` actually contains — no more, no fewer. Verified
   * below (brief §19), never merely trusted. */
  constituentActionRecords: AuditedActionOpportunityRecord[];
  recordCreatedAt: string;
  supersedesRecordId?: string;
}

export function buildAuditedWholeFarmDecisionRecord(
  input: BuildAuditedWholeFarmDecisionRecordInput,
): EngineOutcome<AuditedWholeFarmDecisionRecord> {
  if (input.supersedesRecordId !== undefined && input.supersedesRecordId === input.id) {
    return blockedInsufficientEvidence("ECONOMIC_OPPORTUNITY_RECORD_SELF_SUPERSESSION", [
      "a record cannot supersede itself (supersedesRecordId === id)",
    ]);
  }

  const result = structuredClone(input.result);
  const constituentByActionId = new Map(input.constituentActionRecords.map((record) => [record.evaluatedActionId, record]));

  // brief §19: derive/verify against the AUTHORITATIVE Phase 6 output —
  // never trust a caller-supplied constituent list without checking it
  // actually corresponds to what Phase 6 selected.
  const missingOrMismatched: string[] = [];
  for (const selected of result.selected) {
    const record = constituentByActionId.get(selected.evaluatedActionId);
    if (!record || record.assessmentId !== selected.assessment.id || record.fieldId !== selected.fieldId) {
      missingOrMismatched.push(selected.evaluatedActionId);
    }
  }
  if (missingOrMismatched.length > 0) {
    return blockedInsufficientEvidence("ECONOMIC_OPPORTUNITY_RECORD_MISSING_CONSTITUENT_RECORD", [
      `no correctly-bound AuditedActionOpportunityRecord was supplied for selected action(s): ${missingOrMismatched.join(", ")} — every action result.selected actually contains must have its own AuditedActionOpportunityRecord constructed (via createAuditedActionOpportunityRecord) and passed in, bound to the exact same assessment Phase 6 selected, before a whole-farm decision record can be built`,
    ]);
  }
  const selectedActionIds = new Set(result.selected.map((selected) => selected.evaluatedActionId));
  const unrelated = input.constituentActionRecords.filter((record) => !selectedActionIds.has(record.evaluatedActionId));
  if (unrelated.length > 0) {
    return blockedInsufficientEvidence("ECONOMIC_OPPORTUNITY_RECORD_UNRELATED_CONSTITUENT_RECORD", [
      `constituentActionRecords includes record(s) for action(s) not present in this Phase 6 result's own selected list: ${unrelated.map((record) => record.evaluatedActionId).join(", ")} — a whole-farm decision record's constituents must exactly match its own selected candidates, no more and no fewer`,
    ]);
  }

  const quantified = result.totalNetEconomicResult.amount.status === "OK";
  return ok(
    {
      id: input.id,
      recordEngineVersion: AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION,
      sourcePhase: "phase_6_whole_farm_decision",
      supersedesRecordId: input.supersedesRecordId ?? null,
      recordCreatedAt: input.recordCreatedAt,
      assessmentId: result.id,
      asOfDate: result.asOfDate,
      knownAt: result.knownAt,
      availableVolumeM3: result.availableVolumeM3,
      selectedVolumeM3: result.selectedVolumeM3,
      remainingVolumeM3: result.remainingVolumeM3,
      quantified,
      netDirection: result.totalNetEconomicResult.direction,
      grossDirection: result.totalGrossEconomicEffect.direction,
      currency: currencyOfDirectedOutcome(result.totalNetEconomicResult),
      limitations: [...result.limitations],
      constituentActionRecordIds: [...selectedActionIds]
        .sort()
        .map((actionId) => constituentByActionId.get(actionId)!.id),
      result,
    },
    "IRISH_MODEL",
  );
}

// ---------------------------------------------------------------------------
// Supersession validation (brief §15/§22/§25/§34) — usable for either
// record type via a minimal structural shape, so the same rule (anchored
// to evaluatedActionId, never merely a shared field) governs both.
// ---------------------------------------------------------------------------
export interface SupersedableRecordLike {
  id: string;
  supersedesRecordId: string | null;
  evaluatedActionId?: string;
}

export interface SupersessionValidationResult {
  valid: boolean;
  reasonCode?: string;
  detail?: string;
}

/**
 * Validates a claimed supersession relationship between a NEW record and
 * the specific PRIOR record it names. Call this whenever a caller
 * asserts `newRecord.supersedesRecordId` refers to `priorRecord` — this
 * module's own constructors already reject the trivial self-reference
 * case at construction time; this validator additionally proves the
 * referenced prior record is the one actually being pointed at, and that
 * the two records share the same real-world `evaluatedActionId` (brief
 * §15: "do not automatically supersede merely because two records share
 * a field — underlying action identity must matter").
 */
export function validateSupersession(
  newRecord: SupersedableRecordLike,
  priorRecord: SupersedableRecordLike | null,
): SupersessionValidationResult {
  if (newRecord.supersedesRecordId === null) return { valid: true };
  if (newRecord.supersedesRecordId === newRecord.id) {
    return {
      valid: false,
      reasonCode: "ECONOMIC_OPPORTUNITY_RECORD_SELF_SUPERSESSION",
      detail: "a record cannot supersede itself.",
    };
  }
  if (priorRecord === null || priorRecord.id !== newRecord.supersedesRecordId) {
    return {
      valid: false,
      reasonCode: "ECONOMIC_OPPORTUNITY_RECORD_SUPERSEDED_RECORD_MISMATCH",
      detail: `supersedesRecordId "${newRecord.supersedesRecordId}" does not match the id of the prior record supplied for validation.`,
    };
  }
  // Defends against the two-hop cycle a pure, stateless validator CAN
  // still detect directly (A supersedes B, and the record supplied AS B
  // itself already claims to supersede A) — a true N-hop cycle needs a
  // real store to walk the full chain, which is a future persistence
  // layer's responsibility, not this domain function's.
  if (priorRecord.supersedesRecordId === newRecord.id) {
    return {
      valid: false,
      reasonCode: "ECONOMIC_OPPORTUNITY_RECORD_CIRCULAR_SUPERSESSION",
      detail: `record "${priorRecord.id}" already claims to supersede "${newRecord.id}" — a supersession relationship cannot run in both directions.`,
    };
  }
  if (
    newRecord.evaluatedActionId !== undefined &&
    priorRecord.evaluatedActionId !== undefined &&
    newRecord.evaluatedActionId !== priorRecord.evaluatedActionId
  ) {
    return {
      valid: false,
      reasonCode: "ECONOMIC_OPPORTUNITY_RECORD_SUPERSESSION_ACTION_MISMATCH",
      detail: `supersession must be anchored to the SAME underlying real-world action (evaluatedActionId "${priorRecord.evaluatedActionId}" vs "${newRecord.evaluatedActionId}") — a record must never supersede a record for a different action merely because they happen to share a field or another attribute.`,
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Mutable decision/lifecycle state (brief §13/§23/§24) — structurally
// separate from the immutable records above; see this module's header.
// Deliberately minimal, per the brief's own "do not invent a workflow-
// heavy state machine" instruction — just enough for a later layer to
// track what a farmer did with a recorded opportunity.
// ---------------------------------------------------------------------------
export type OpportunityDecisionStatus = "active" | "accepted" | "rejected" | "completed";

export interface OpportunityDecisionState {
  /** References an `AuditedActionOpportunityRecord`/
   * `AuditedWholeFarmDecisionRecord` by its own `id` — never embeds or
   * duplicates the record itself. */
  opportunityRecordId: string;
  status: OpportunityDecisionStatus;
  updatedAt: string;
}

export function createOpportunityDecisionState(opportunityRecordId: string, createdAt: string): OpportunityDecisionState {
  return { opportunityRecordId, status: "active", updatedAt: createdAt };
}

/**
 * Returns a brand-new `OpportunityDecisionState` — never mutates
 * `current`. Note what this function CANNOT do, by its own type: alter
 * an economic amount, a limitation, an evidence field, or anything else
 * belonging to the immutable record `opportunityRecordId` merely points
 * at — there is no such field on this type for it to touch. Marking a
 * decision `"completed"` is never read as "cash was actually realised" —
 * that reconciliation is explicitly out of Phase 7's scope (brief §24).
 */
export function updateOpportunityDecisionState(
  current: OpportunityDecisionState,
  status: OpportunityDecisionStatus,
  updatedAt: string,
): OpportunityDecisionState {
  return { opportunityRecordId: current.opportunityRecordId, status, updatedAt };
}
