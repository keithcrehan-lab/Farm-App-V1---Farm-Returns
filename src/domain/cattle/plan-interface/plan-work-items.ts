/**
 * Cattle C9 — canonical work items from the delegated C2 / C7 / C8 outputs.
 *
 * Selection and mapping only (CAT-INV-014/023): each consumed upstream state
 * is translated through the compiled tables in `plan-vocabulary.ts`; no
 * cattle calculation, evidence interpretation or state derivation is
 * restated. Every translation is exhaustive at runtime too: a value outside a
 * table fails closed with an issue (CAT-INV-028), never a default.
 *
 * STATUS / EVIDENCE PRECEDENCE (C9's own list; ARCHITECTURE.md §Status and
 * evidence precedence, CAT-INV-009). For every work item, first match decides:
 *   a. the consumed upstream state is unresolved (C2 UNKNOWN /
 *      INSUFFICIENT_EVIDENCE / EVIDENCE_CONFLICT / INVALID_EVIDENCE /
 *      UNSUPPORTED / REVIEW_REQUIRED; C7 UNKNOWN / INSUFFICIENT_EVIDENCE /
 *      EVIDENCE_CONFLICT / REVIEW_REQUIRED / INVALID_EVIDENCE; C8
 *      REVIEW_REQUIRED / INSUFFICIENT_EVIDENCE) ⇒ evidence-resolution work with
 *      an UNKNOWN blocker (C2: INFORMATION_VALUE, never promoted);
 *   b. a hard-gate failure (C2 BLOCKED, C7 BLOCKED, C8 BLOCKED) ⇒ work with an
 *      ACTIVE blocker;
 *   c. every consumed gate is mapped (D3): FAIL ⇒ ACTIVE; any unresolved
 *      gate state ⇒ UNKNOWN; PASS / NOT_APPLICABLE ⇒ CLEARED;
 *   d. a legal / scheme hard-gate window whose source authority is not
 *      uniquely CURRENT ⇒ no hard deadline and an UNKNOWN blocker (B5 / D1);
 *   e. only then the resolved business state's priority and timing.
 * REQUIRED inputs: C2 — the record state, classification, gate role, window
 * and rule source checks; C7 — the occurrence record state, action, window
 * and gate checks; C8 — the outcome, proposed action, its candidate's
 * benefit claim, trigger reasons and prerequisite gate checks. Unresolved
 * required evidence is never a resolved-looking Plan state: it is a blocker
 * and never completion evidence.
 *
 * Inputs are the ADMITTED C9 DTOs (`plan-adapters.ts`) only — never a raw
 * predecessor record — and every identifier is built by a constructor that
 * accepts admitted C9 primitives. Absent optional structure is decided by
 * explicit `=== null` tests on admitted values, never by defaults.
 */

import { canonicalizeValue } from "../../assessment-integrity";
import { compareStrings, sortedUnique } from "../integrity";
import { PROGRAMME_OCCURRENCE_STATES, programmeGateRuleId } from "../programmes";
import { OBLIGATION_STATES } from "../regulatory";
import { admit, noProposalCheck, workItemCheck, type C9Ref } from "./plan-admission";
import type { C2AnimalDto, C2Dto, C2RecordDto, C7AnimalDto, C7Dto, C7ProgrammeDto, C7RecordDto, C8ActionDto, C8CandidateDto, C8Dto, C8RecommendationDto } from "./plan-adapters";
import type { CattlePlanBlocker, CattlePlanBlockerIdentity, CattlePlanFamily, CattlePlanIssue, CattlePlanNoProposal, CattlePlanSupport, CattlePlanTiming, CattlePlanWorkItem } from "./plan-contracts";
import {
  C2_STATE_PLAN,
  C7_STATE_PLAN,
  C8_DEFAULT_KIND_PLAN,
  C8_FOLD_WHITELIST,
  C8_MODELLED_TIER,
  C8_ORIGIN,
  C8_OUTCOME_PLAN,
  DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED,
  GATE_STATE_STATUS,
  HARD_OBLIGATION_CLASSIFICATIONS,
  lookup,
  obligationActionKey,
  programmeActionKey,
  recommendationActionKey,
  type CattlePlanVocabularyRowId,
  type StatePlan,
} from "./plan-vocabulary";

type Built = { items: CattlePlanWorkItem[]; withoutProposal: CattlePlanNoProposal[]; issues: CattlePlanIssue[] };

const issue = (code: string, ref: string | null = null): CattlePlanIssue => ({ code, ref });
const itemKey = (family: CattlePlanFamily, outputId: string) => JSON.stringify([family, outputId]);

/** The identity fields a blocker cites (admitted, or derived from admitted operands only). */
interface BlockerSubject {
  outputId: string;
  digest: string;
  animalId: C9Ref;
  occurrence: C9Ref | null;
}

// ---------------------------------------------------------------------------
// Blockers (D3)
// ---------------------------------------------------------------------------

export function blockerOf(
  identity: CattlePlanBlockerIdentity & [string, string, string, string, "CATTLE_ANIMAL", C9Ref, C9Ref | null],
  status: CattlePlanBlocker["status"],
  kind: CattlePlanBlocker["kind"],
  gateState: string,
): CattlePlanBlocker {
  const [family, , , gate, , animalId, occurrence] = identity;
  return {
    id: `CATTLE_PLAN_BLOCKER:${JSON.stringify(identity)}`,
    identity,
    kind,
    status,
    gateState,
    description: `${family} gate ${gate} is ${gateState} (${status}) for CATTLE_ANIMAL ${animalId}${occurrence === null ? "" : ` at ${occurrence}`}`,
  };
}

/** A consumed C0 gate check (C7 action gate, C8 prerequisite gate) as a blocker; `null` when its state is outside the table. */
function gateBlocker(family: string, item: BlockerSubject, ruleId: C9Ref, state: string, source: string | null): CattlePlanBlocker | null {
  const status = lookup(GATE_STATE_STATUS, state);
  if (status === undefined) return null;
  return blockerOf([`${family}:${source === null ? "NONE" : source}`, item.outputId, item.digest, ruleId, "CATTLE_ANIMAL", item.animalId, item.occurrence], status, source === "C3_WITHDRAWAL" ? "LEGAL_WINDOW" : "OTHER", state);
}

function stateBlocker(family: CattlePlanFamily, item: BlockerSubject, plan: StatePlan, gate: string, state: string): CattlePlanBlocker[] {
  return plan.blocker === "NONE" ? [] : [blockerOf([family, item.outputId, item.digest, gate, "CATTLE_ANIMAL", item.animalId, item.occurrence], plan.blocker, "OTHER", state)];
}

const NO_TIMING: CattlePlanTiming = { window: null, windowBasis: null, hardDeadline: null, sourceChecks: [] };

// ---------------------------------------------------------------------------
// C2
// ---------------------------------------------------------------------------

/** B5 / D1 timing of a C2 record; `authorityProven: false` only for a legal / scheme hard-gate window without a unique CURRENT source. */
export function c2Timing(r: Pick<C2RecordDto, "obligationId" | "occurrence" | "classification" | "gateRole" | "window" | "sourceChecks">): { timing: CattlePlanTiming; authorityProven: boolean } {
  if (r.window === null) return { timing: NO_TIMING, authorityProven: true };
  const checks = r.sourceChecks;
  const sourceChecks = checks.map((c) => ({ bound: c.bound, status: c.status }));
  const ref = JSON.stringify([r.obligationId, r.occurrence === null ? null : r.occurrence.occurrenceId, r.window.boundary]);
  const window = { opensAt: r.window.opensAt, dueAt: r.window.dueAt, boundary: r.window.boundary };
  const legalHard = r.classification !== null && HARD_OBLIGATION_CLASSIFICATIONS.includes(r.classification) && r.gateRole === "HARD_GATE";
  if (!legalHard) return { timing: { window, windowBasis: `CATTLE_OBLIGATION_WINDOW_RECOMMENDED:${ref}`, hardDeadline: null, sourceChecks }, authorityProven: true };
  // D1: a windowed C2 record's rule binds its window source, and C0 emits one check per binding — one check IS the window source.
  if (checks.length === 1 && checks[0].status === "CURRENT") {
    const b = checks[0].bound;
    return {
      timing: { window, windowBasis: `CATTLE_OBLIGATION_WINDOW_SOURCED_DEADLINE:${ref}`, hardDeadline: { dueIso: r.window.dueAt, authority: { sourceId: b.sourceId, version: b.version, contentFingerprint: b.contentFingerprint } }, sourceChecks },
      authorityProven: true,
    };
  }
  return { timing: { window, windowBasis: `CATTLE_OBLIGATION_WINDOW_${DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED}:${ref}`, hardDeadline: null, sourceChecks }, authorityProven: false };
}

/** B4 for C2. */
export function c2Priority(r: Pick<C2RecordDto, "classification" | "gateRole" | "state">, plan: StatePlan): CattlePlanWorkItem["priority"] {
  const what = `${r.classification === null ? "NONE" : r.classification}:${r.gateRole === null ? "NONE" : r.gateRole}:${r.state}`;
  if (plan.resolution === "UNRESOLVED") return { tier: "INFORMATION_VALUE", basis: `CATTLE_PLAN_PRIORITY_C2_EVIDENCE_RESOLUTION:${what}` };
  const legalHard = r.classification !== null && HARD_OBLIGATION_CLASSIFICATIONS.includes(r.classification) && r.gateRole === "HARD_GATE";
  return legalHard ? { tier: "HARD_OBLIGATION", basis: `CATTLE_PLAN_PRIORITY_C2_HARD_OBLIGATION:${what}` } : { tier: "ROUTINE_MANAGEMENT", basis: `CATTLE_PLAN_PRIORITY_C2_NON_HARD_WORK:${what}` };
}

export const c2OutputId = (animalId: C9Ref, obligationId: C9Ref, occurrenceId: C9Ref | null) => `CATTLE_OBLIGATION_STATE:${JSON.stringify([animalId, obligationId, occurrenceId])}`;

function c2Item(e: C2AnimalDto, r: C2RecordDto, out: Built): void {
  const occurrenceId = r.occurrence === null ? null : r.occurrence.occurrenceId;
  const outputId = c2OutputId(e.animalId, r.obligationId, occurrenceId);
  const plan = lookup<StatePlan>(C2_STATE_PLAN, r.state);
  if (plan === undefined) {
    out.issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C2:${r.state}`));
    return;
  }
  if (!plan.proposal) {
    out.withoutProposal.push({ family: "C2_OBLIGATION", outputId, outputFingerprint: r.fingerprint, animalId: e.animalId, consumedState: r.state, reason: `CATTLE_PLAN_NO_PROPOSAL:C2_${r.state}` });
    return;
  }
  const ref: BlockerSubject = { outputId, digest: r.fingerprint.digest, animalId: e.animalId, occurrence: occurrenceId === null ? r.obligationId : occurrenceId };
  const { timing, authorityProven } = c2Timing(r);
  const blockers = stateBlocker("C2_OBLIGATION", ref, plan, r.requestedRuleId, r.state);
  if (!authorityProven) blockers.push(blockerOf(["C2_OBLIGATION", outputId, ref.digest, DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED, "CATTLE_ANIMAL", e.animalId, ref.occurrence], "UNKNOWN", "OTHER", DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED));
  const actionKey = obligationActionKey(r.obligationId);
  out.items.push({
    key: itemKey("C2_OBLIGATION", outputId),
    family: "C2_OBLIGATION",
    origin: "OBLIGATION",
    outputId,
    outputFingerprint: r.fingerprint,
    animalId: e.animalId,
    cites: JSON.stringify([r.obligationId, occurrenceId]),
    consumedState: r.state,
    reasonCodes: sortedUnique(r.reasonCodes),
    vocabularyRow: "C2_OBLIGATION",
    actionKey,
    timing,
    blockers,
    priority: c2Priority(r, plan),
    supporting: [],
  });
}

// ---------------------------------------------------------------------------
// C7
// ---------------------------------------------------------------------------

export const c7OutputId = (animalId: C9Ref, programmeId: C9Ref, actionId: C9Ref | null, occurrenceId: C9Ref | null) => `CATTLE_PROGRAMME_OCCURRENCE:${JSON.stringify([animalId, programmeId, actionId, occurrenceId])}`;

function c7Item(p: C7ProgrammeDto, status: C7AnimalDto, rec: C7RecordDto, out: Built): void {
  const occurrenceId = rec.occurrence === null ? null : rec.occurrence.occurrenceId;
  const outputId = c7OutputId(status.animalId, p.programmeId, rec.actionId, occurrenceId);
  const plan = lookup<StatePlan>(C7_STATE_PLAN, rec.state);
  if (plan === undefined) {
    out.issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C7:${rec.state}`));
    return;
  }
  // B6: a C7 proposal needs a concrete programme action; a programme-level record names none.
  if (!plan.proposal || rec.actionId === null || rec.actionKind === null) {
    const reason = plan.proposal ? "CATTLE_PLAN_NO_PROPOSAL:C7_NO_CONCRETE_ACTION" : `CATTLE_PLAN_NO_PROPOSAL:C7_${rec.state}`;
    out.withoutProposal.push({ family: "C7_PROGRAMME", outputId, outputFingerprint: status.fingerprint, animalId: status.animalId, consumedState: rec.state, reason });
    return;
  }
  const ref: BlockerSubject = { outputId, digest: status.fingerprint.digest, animalId: status.animalId, occurrence: occurrenceId === null ? rec.actionId : occurrenceId };
  // C7's own published identity of the action's hard-gate rule, over admitted operands.
  const blockers = stateBlocker("C7_PROGRAMME", ref, plan, programmeGateRuleId(p.programmeId, rec.actionId), rec.state);
  for (const g of rec.gates) {
    const b = gateBlocker("C7_GATE", ref, g.ruleId, g.state, g.source);
    if (b === null) out.issues.push(issue("CATTLE_PLAN_GATE_STATE_UNMAPPED", `C7:${g.state}`));
    else blockers.push(b);
  }
  const o = rec.occurrence;
  const timing: CattlePlanTiming =
    o === null
      ? NO_TIMING
      : { window: { opensAt: o.opensAt, dueAt: o.dueAt, boundary: o.boundary }, windowBasis: `CATTLE_PROGRAMME_OCCURRENCE_WINDOW_RECOMMENDED:${JSON.stringify([p.programmeId, rec.actionId, o.occurrenceId, o.boundary])}`, hardDeadline: null, sourceChecks: [] };
  out.items.push({
    key: itemKey("C7_PROGRAMME", outputId),
    family: "C7_PROGRAMME",
    origin: "PROGRAMME",
    outputId,
    outputFingerprint: status.fingerprint,
    animalId: status.animalId,
    cites: JSON.stringify([p.programmeId, rec.actionId, occurrenceId]),
    consumedState: rec.state,
    reasonCodes: sortedUnique(rec.reasonCodes),
    vocabularyRow: "C7_PROGRAMME_ACTION",
    actionKey: programmeActionKey(p.programmeId, rec.actionKind),
    timing,
    blockers,
    // B4: no C7 contract proves a stronger evidence-backed priority.
    priority: { tier: "ROUTINE_MANAGEMENT", basis: `CATTLE_PLAN_PRIORITY_C7_PROGRAMME_WORK:${p.classification}:${rec.state}` },
    supporting: [],
  });
}

// ---------------------------------------------------------------------------
// C8
// ---------------------------------------------------------------------------

/** D4 tier and vocabulary row of a proposed C8 action; `null` = unmapped (fail closed). */
export function c8KindPlan(actionKind: C8ActionDto["actionKind"], benefitClaim: C8CandidateDto["benefitClaim"], tier: C8ActionDto["tier"]): { tier: CattlePlanWorkItem["priority"]["tier"]; row: CattlePlanVocabularyRowId; basis: string } | null {
  const known = lookup(C8_DEFAULT_KIND_PLAN, actionKind);
  if (known !== undefined) return { tier: known.tier, row: known.row, basis: `CATTLE_PLAN_PRIORITY_C8_KIND:${actionKind}` };
  if (benefitClaim !== "MODELLED") return null;
  const mapped = lookup<string | null>(C8_MODELLED_TIER, tier);
  if (mapped === undefined || mapped === null) return null;
  return { tier: mapped as CattlePlanWorkItem["priority"]["tier"], row: "C8_MODELLED_ACTION", basis: `CATTLE_PLAN_PRIORITY_C8_MODELLED_TIER:${tier}:REGISTRY_DECLARED_UNREVIEWED` };
}

function c8Item(rec: C8RecommendationDto, out: Built): void {
  const outputId = rec.packId;
  const plan = lookup<StatePlan>(C8_OUTCOME_PLAN, rec.outcome);
  if (plan === undefined) {
    out.issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C8:${rec.outcome}`));
    return;
  }
  const action = rec.recommendedAction;
  if (!plan.proposal || action === null) {
    const reason = plan.proposal ? "CATTLE_PLAN_NO_PROPOSAL:C8_NO_CONCRETE_ACTION" : `CATTLE_PLAN_NO_PROPOSAL:C8_${rec.outcome}`;
    out.withoutProposal.push({ family: "C8_RECOMMENDATION", outputId, outputFingerprint: rec.fingerprint, animalId: rec.animalId, consumedState: rec.outcome, reason });
    return;
  }
  const candidate = rec.candidates.find((c) => c.actionId === action.actionId);
  if (candidate === undefined) {
    out.issues.push(issue("CATTLE_PLAN_PROPOSED_CANDIDATE_MISSING", `${rec.animalId}:${action.actionId}`));
    return;
  }
  const kind = c8KindPlan(action.actionKind, candidate.benefitClaim, action.tier);
  const origin = lookup(C8_ORIGIN, candidate.benefitClaim);
  if (kind === null || origin === undefined) {
    out.issues.push(issue("CATTLE_PLAN_ACTION_KIND_UNMAPPED", `${rec.animalId}:${action.actionKind}`));
    return;
  }
  const ref: BlockerSubject = { outputId, digest: rec.fingerprint.digest, animalId: rec.animalId, occurrence: null };
  const blockers: CattlePlanBlocker[] = [];
  for (const g of candidate.gates) {
    const b = gateBlocker("C8_GATE", ref, g.ruleId, g.state, g.source);
    if (b === null) out.issues.push(issue("CATTLE_PLAN_GATE_STATE_UNMAPPED", `C8:${g.state}`));
    else blockers.push(b);
  }
  // C0 derives the outcome from exactly these gates; a contradiction is an invariant failure, never repaired.
  const open = blockers.some((b) => b.status !== "CLEARED");
  if (open !== (rec.outcome !== "ACTIONABLE")) {
    out.issues.push(issue("CATTLE_PLAN_OUTCOME_GATES_INCONSISTENT", `${rec.animalId}:${rec.outcome}`));
    return;
  }
  out.items.push({
    key: itemKey("C8_RECOMMENDATION", outputId),
    family: "C8_RECOMMENDATION",
    origin,
    outputId,
    outputFingerprint: rec.fingerprint,
    animalId: rec.animalId,
    cites: null,
    consumedState: rec.outcome,
    reasonCodes: sortedUnique(candidate.reasonCodes),
    vocabularyRow: kind.row,
    actionKey: recommendationActionKey(action.actionKind),
    timing: NO_TIMING,
    blockers,
    priority: { tier: kind.tier, basis: kind.basis },
    supporting: [],
  });
}

// ---------------------------------------------------------------------------
// D2 — C8 restatement folding
// ---------------------------------------------------------------------------

const OBLIGATION_TRIGGER = /^CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_([A-Z_]+):(.+)$/;
const PROGRAMME_TRIGGER = /^CATTLE_RECOMMENDATION_TRIGGER_PROGRAMME_([A-Z_]+):(.+)$/;

/**
 * Parses one frozen C8 trigger reason code (`recommendation-engine.ts`
 * `triggerOf`): `CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_<STATE>:<JSON [obligationId, occurrenceId]>`
 * or `..._PROGRAMME_<STATE>:<JSON [programmeId, actionId, occurrenceId]>`.
 * Strict: the state must be in the frozen vocabulary, the JSON exact, and the
 * code must re-serialise to itself; anything else is `null`.
 */
export function parseRestatementCitation(code: string): { family: "C2_OBLIGATION" | "C7_PROGRAMME"; state: string; cites: string } | null {
  const ob = OBLIGATION_TRIGGER.exec(code);
  const pr = ob === null ? PROGRAMME_TRIGGER.exec(code) : null;
  const m = ob === null ? pr : ob;
  if (m === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[2]);
  } catch {
    return null;
  }
  const str = (v: unknown) => typeof v === "string";
  const strOrNull = (v: unknown) => v === null || typeof v === "string";
  if (!Array.isArray(parsed)) return null;
  if (ob !== null) {
    if (!(OBLIGATION_STATES as readonly string[]).includes(m[1]) || parsed.length !== 2 || !str(parsed[0]) || !strOrNull(parsed[1])) return null;
    if (`CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_${m[1]}:${JSON.stringify(parsed)}` !== code) return null;
    return { family: "C2_OBLIGATION", state: m[1], cites: JSON.stringify(parsed) };
  }
  if (!(PROGRAMME_OCCURRENCE_STATES as readonly string[]).includes(m[1]) || parsed.length !== 3 || !str(parsed[0]) || !str(parsed[1]) || !strOrNull(parsed[2])) return null;
  if (`CATTLE_RECOMMENDATION_TRIGGER_PROGRAMME_${m[1]}:${JSON.stringify(parsed)}` !== code) return null;
  return { family: "C7_PROGRAMME", state: m[1], cites: JSON.stringify(parsed) };
}

/**
 * Folds a C8 restatement into the authoritative C2 / C7 work it cites (D2)
 * only when ALL hold: every trigger reason code parses under the frozen
 * grammar; each cited item exists among `items` with the same family,
 * animal, citation and consumed state; the action kind is whitelisted for
 * that family. The restatement then becomes supporting provenance (its
 * origin and blockers, never dropped) of every cited item: folding decides job
 * identity only. Otherwise it stays a separate
 * proposal — never a guessed equivalence. Pure; input order independent.
 */
export function foldRestatements(itemsIn: readonly CattlePlanWorkItem[]): CattlePlanWorkItem[] {
  // A SET of work items: an exact duplicate counts once (idempotent). A same-key conflict is never folded
  // (no guessed winner): the set is returned as is, for the group summary to reject.
  const items = [...new Map(itemsIn.map((i) => [canonicalizeValue(i), i])).values()].sort((a, b) => compareStrings(a.key, b.key));
  if (new Set(items.map((i) => i.key)).size !== items.length) return items;
  const byKey = new Map(items.map((i) => [i.key, { ...i, blockers: [...i.blockers], supporting: [...i.supporting] }]));
  for (const c8 of items) {
    if (c8.family !== "C8_RECOMMENDATION") continue;
    const family = lookup<string>(C8_FOLD_WHITELIST, c8.actionKey.slice("CATTLE_RECOMMENDATION:".length));
    if (family === undefined || c8.reasonCodes.length === 0) continue;
    const citations = c8.reasonCodes.map(parseRestatementCitation);
    if (citations.some((c) => c === null || c.family !== family)) continue;
    const targets = citations.map((c) => items.filter((t) => t.family === c!.family && t.animalId === c8.animalId && t.cites === c!.cites && t.consumedState === c!.state));
    if (targets.some((t) => t.length !== 1)) continue;
    const support: CattlePlanSupport = { family: "C8_RECOMMENDATION", origin: c8.origin, outputId: c8.outputId, outputFingerprint: c8.outputFingerprint, actionKind: c8.actionKey.slice("CATTLE_RECOMMENDATION:".length), consumedState: c8.consumedState, reasonCodes: c8.reasonCodes };
    byKey.delete(c8.key);
    for (const [t] of targets) {
      const target = byKey.get(t.key)!;
      if (!target.supporting.some((s) => s.outputId === support.outputId)) target.supporting.push(support);
      for (const b of c8.blockers) if (!target.blockers.some((x) => x.id === b.id)) target.blockers.push(b);
    }
  }
  return [...byKey.values()]
    .map((i) => ({ ...i, blockers: [...i.blockers].sort((a, b) => compareStrings(a.id, b.id)), supporting: [...i.supporting].sort((a, b) => compareStrings(a.outputId, b.outputId)) }))
    .sort((a, b) => compareStrings(a.key, b.key));
}

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

/** Maps ONE admitted record and checks every canonical record it yields (defence in depth); nothing joins `out` unless all pass. */
function admitRecord(where: string, map: (local: Built) => void, out: Built): void {
  const local: Built = { items: [], withoutProposal: [], issues: [] };
  map(local);
  const rejected = [...local.items.map((i) => admit(where, workItemCheck, i)), ...local.withoutProposal.map((n) => admit(where, noProposalCheck, n))].find((i) => i !== null);
  if (rejected !== undefined) {
    out.issues.push(rejected);
    return;
  }
  out.items.push(...local.items);
  out.withoutProposal.push(...local.withoutProposal);
  out.issues.push(...local.issues);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function buildWorkItems(obligations: C2Dto | null, programmes: C7Dto | null, recommendations: C8Dto): Built {
  const out: Built = { items: [], withoutProposal: [], issues: [] };
  // Every input is an admitted C9 DTO (plan-adapters.ts); each canonical record built from one is checked whole
  // before it joins the canonical set.
  if (obligations !== null) for (const e of obligations.animals) for (const r of e.results) admitRecord("C2", (l) => c2Item(e, r, l), out);
  if (programmes !== null) for (const p of programmes.programmes) for (const a of p.animals) for (const r of a.records) admitRecord("C7", (l) => c7Item(p, a, r, l), out);
  for (const rec of recommendations.animals) admitRecord("C8", (l) => c8Item(rec, l), out);
  const keys = new Set<string>();
  for (const i of out.items) {
    if (keys.has(i.key)) out.issues.push(issue("CATTLE_PLAN_WORK_ITEM_IDENTITY_CONFLICT", i.key));
    keys.add(i.key);
  }
  return {
    items: foldRestatements(out.items),
    withoutProposal: [...out.withoutProposal].sort((a, b) => compareStrings(JSON.stringify([a.family, a.outputId, a.consumedState]), JSON.stringify([b.family, b.outputId, b.consumedState]))),
    issues: out.issues,
  };
}
