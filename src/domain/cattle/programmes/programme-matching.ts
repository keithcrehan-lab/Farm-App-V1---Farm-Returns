/**
 * Cattle C7 — completion evidence per occurrence: declarations, explicit C3
 * links and declared criteria. Never fuzzy.
 *
 * RESOLUTION BEFORE MATCH (DOMAIN_CONTRACTS "Cattle C7", predecessor
 * evidence resolution). Every C3 record is taken through two steps:
 *
 * 1. Evidence authority — every dimension a MATCH would rely on must be
 *    resolved: the record is known, LIVE and not in a competing correction;
 *    for a MEDICINE_ADMINISTRATION under a declared `productRef`, the product
 *    id is identified AND the C3 product binding is BOUND (`fromC3Binding`);
 *    its valid time is known.
 * 2. Value matching — on resolved values only: record kind, event type,
 *    recorded product id, and the bound version when `productVersion` is set.
 *
 * An explicit `null` waives a matching constraint, never authority:
 * `productVersion: null` accepts any BOUND version — an UNKNOWN, UNSUPPORTED,
 * INVALID, conflicting, review-required or missing binding is unresolved
 * evidence, never a match. `productRef: null` removes the product dimension
 * (no product constraint), so no binding is required for it. A record whose
 * own resolved fields show it cannot match (another kind, event type or
 * recorded product) is a mismatch; a record whose authority is unresolved is
 * reported with its outcome and prevents any resolved occurrence state.
 *
 * EVIDENCE EXCLUSIVITY (human decision on H1): one C3 record evidences at
 * most one occurrence of an action. A record claimed for two or more
 * occurrences of the same action — by explicit links and/or by lying inside
 * an occurrence window under declared criteria — is EVIDENCE_CONFLICT in
 * every claiming occurrence and counts in none (no precedence is guessed).
 * The same record may evidence different actions (each action declares its
 * own evidence).
 *
 * DECLARER ROLE (human decision on M1): a declaration's VETERINARIAN role is
 * honoured only with provenance `sourceCategory` VETERINARY_SOURCE;
 * otherwise it counts as a FARMER declaration (decision B2 then applies).
 *
 * EVIDENTIAL AUTHORITY (human rulings B2 / M2): each counted completion is
 * VETERINARY or NON_VETERINARY (`CompletionAuthority`). The only veterinary
 * corroboration the frozen contracts carry is a veterinary-recorded C3
 * record (C3 provenance VETERINARY_SOURCE with actor role VETERINARIAN) or
 * a veterinarian-authored completion declaration; prescription and
 * treatment references are not resolved by C3 and are not used. Farmer
 * evidence is valid and always retained.
 *
 * MONOTONICITY: every independent path is evaluated — an explicitly linked
 * record is ALSO considered under declared criteria — so adding resolved
 * evidence (e.g. a farmer link to a record that already satisfies the
 * criteria) can only add counted completions, never weaken a resolved one.
 * A genuine conflict (competition, timing disagreement, a record claimed by
 * several occurrences) or unresolved candidate evidence still prevents a
 * resolved state (CAT-INV-009).
 */

import { compareInstants } from "../animal-ledger";
import { compareStrings, sortedUnique } from "../integrity";
import type { CompletionResolution, ProgrammeCompletionRecord } from "./programme-completion";
import type { HealthProgrammeDefinition, ProgrammeAction } from "./programme-definition";
import { fromC3Binding, type UnresolvedOutcome } from "./programme-evidence";
import type { AnimalContext, EvidenceRecord } from "./programme-predecessors";
import { windowPosition, type ProgrammeOccurrence } from "./programme-schedule";
import type { CountedCompletion, EvidenceNote, EvidenceRefKind, ProgrammeCompletionSummary, UnresolvedNote } from "./programme-types";

export interface OccurrenceContext {
  definition: HealthProgrammeDefinition;
  action: ProgrammeAction;
  ctx: AnimalContext;
  effectiveAt: string;
  /** Known declarations for this animal, programme and action. */
  declarations: readonly ProgrammeCompletionRecord[];
  completions: CompletionResolution;
  /** C3 record ids claimed by two or more occurrences of this action (`contestedRecords`). */
  contested: ReadonlySet<string>;
}

/** The declarer role C7 honours: VETERINARIAN only with veterinary-source provenance (decision M1). */
export function effectiveDeclarerRole(d: ProgrammeCompletionRecord): "FARMER" | "VETERINARIAN" {
  return d.declaredBy.role === "VETERINARIAN" && d.provenance.sourceCategory === "VETERINARY_SOURCE" ? "VETERINARIAN" : "FARMER";
}

/** A C3 record recorded by a veterinary source: VETERINARY_SOURCE provenance with actor role VETERINARIAN (role ⇔ source, as M1). */
function veterinaryRecorded(record: EvidenceRecord): boolean {
  return record.sourceCategory === "VETERINARY_SOURCE" && record.actorRole === "VETERINARIAN";
}

const recordProvenanceOf = (record: EvidenceRecord) => ({ sourceCategory: record.sourceCategory, actorRole: record.actorRole });

/**
 * Every C3 record claimed for two or more of the action's occurrences:
 * claims are live, uncontested, governing-version link declarations naming a
 * derived occurrence, and — under declared criteria — the opened occurrence
 * whose window holds the record's known valid time (by `effectiveAt`). Only
 * LIVE records whose resolved fields could match are claimable.
 */
export function contestedRecords(
  o: Omit<OccurrenceContext, "contested">,
  occurrences: readonly ProgrammeOccurrence[],
): Set<string> {
  const { definition, action, ctx, effectiveAt, completions } = o;
  if (ctx.health === null) return new Set();
  const claimable = new Map(ctx.health.records.filter((e) => e.status === "LIVE" && resolvedValueMismatch(action, e) === null).map((e) => [e.recordId, e]));
  const claims = new Map<string, Set<string>>();
  const claim = (recordId: string, occurrenceId: string) => claims.set(recordId, (claims.get(recordId) ?? new Set<string>()).add(occurrenceId));
  const derived = new Set(occurrences.map((occ) => occ.occurrenceId));
  const live = new Set(completions.live.map((d) => d.recordId));
  for (const d of o.declarations) {
    if (!live.has(d.recordId) || completions.competingIds.has(d.recordId) || d.programmeVersion !== definition.version) continue;
    if (d.evidence?.kind !== "HEALTH_RECORD" || !derived.has(d.occurrenceId) || !claimable.has(d.evidence.healthRecordId)) continue;
    claim(d.evidence.healthRecordId, d.occurrenceId);
  }
  if (action.completion.matchCriteria) {
    for (const entry of claimable.values()) {
      if (entry.occurredAt === null) continue;
      const t = entry.occurredAt;
      if (compareInstants(t, effectiveAt) > 0) continue;
      for (const occ of occurrences) if (windowPosition(occ, effectiveAt) !== "BEFORE" && windowPosition(occ, t) === "IN") claim(entry.recordId, occ.occurrenceId);
    }
  }
  return new Set([...claims.entries()].filter(([, occs]) => occs.size > 1).map(([recordId]) => recordId));
}

type RecordEvidence = { kind: "MATCH"; at: string } | { kind: "MISMATCH"; reason: string } | { kind: "UNRESOLVED"; outcome: UnresolvedOutcome; reason: string };

/** Value step on fields every C3 record carries resolved: kind, event type, recorded product id. `null` = could match. */
function resolvedValueMismatch(action: ProgrammeAction, record: EvidenceRecord): string | null {
  const { recordKind, eventTypes } = action.completion;
  if (recordKind === null) return "CATTLE_PROGRAMME_EVIDENCE_KIND_NOT_ACCEPTED";
  if (record.kind !== recordKind) return "CATTLE_PROGRAMME_EVIDENCE_KIND_MISMATCH";
  if (record.kind === "VETERINARY_EVENT") return eventTypes !== null && record.eventType !== null && (eventTypes as readonly string[]).includes(record.eventType) ? null : "CATTLE_PROGRAMME_EVENT_TYPE_MISMATCH";
  if (record.kind === "MEDICINE_ADMINISTRATION" && action.productRef !== null && record.productId !== null && record.productId !== action.productRef.productId) {
    return "CATTLE_PROGRAMME_PRODUCT_MISMATCH";
  }
  return null;
}

/**
 * Authority for every remaining dimension a MATCH needs, then the remaining
 * value match. Called only for a LIVE, uncontested record whose resolved
 * kind / event type / recorded product could match.
 */
function resolveThenMatch(action: ProgrammeAction, record: EvidenceRecord, ctx: AnimalContext): RecordEvidence {
  if (record.kind === "MEDICINE_ADMINISTRATION" && action.productRef !== null) {
    if (record.productId === null) return { kind: "UNRESOLVED", outcome: "INSUFFICIENT_EVIDENCE", reason: "CATTLE_PROGRAMME_PRODUCT_NOT_IDENTIFIED" };
    const binding = fromC3Binding(ctx.health?.bindings.get(record.recordId) ?? null);
    if (!binding.resolved) return { kind: "UNRESOLVED", outcome: binding.outcome, reason: binding.reasonCodes[0] };
    if (binding.value.productId !== action.productRef.productId) return { kind: "MISMATCH", reason: "CATTLE_PROGRAMME_PRODUCT_MISMATCH" };
    if (action.productRef.productVersion !== null && binding.value.version !== action.productRef.productVersion) return { kind: "MISMATCH", reason: "CATTLE_PROGRAMME_PRODUCT_VERSION_MISMATCH" };
  }
  if (record.occurredAt === null) return { kind: "UNRESOLVED", outcome: "INSUFFICIENT_EVIDENCE", reason: "CATTLE_PROGRAMME_RECORD_TIME_UNKNOWN" };
  return { kind: "MATCH", at: record.occurredAt };
}

export function evaluateCompletion(o: OccurrenceContext, occ: ProgrammeOccurrence): ProgrammeCompletionSummary {
  const { definition, action, ctx, effectiveAt, completions } = o;
  const counted: CountedCompletion[] = [];
  const unresolved: UnresolvedNote[] = [];
  const mismatched: EvidenceNote[] = [];
  const conflictingDeclarations: string[] = [];
  const conflictingRecords: string[] = [];
  const otherVersion: string[] = [];
  const beforeWindow: string[] = [];
  const notYetOccurred: string[] = [];
  const timeline = ctx.health === null ? [] : ctx.health.records;
  const unresolvedNote = (refKind: EvidenceRefKind, ref: string, outcome: UnresolvedOutcome, reason: string) => unresolved.push({ refKind, ref, reason, outcome });
  const mismatch = (ref: string, reason: string) => mismatched.push({ refKind: "DECLARATION", ref, reason });

  const place = (ref: string, t: string, base: Omit<CountedCompletion, "completedAt" | "timing">) => {
    if (compareInstants(t, effectiveAt) > 0) return notYetOccurred.push(ref);
    const pos = windowPosition(occ, t);
    if (pos === "BEFORE") return beforeWindow.push(ref);
    counted.push({ ...base, completedAt: t, timing: pos === "IN" ? "IN_WINDOW" : "LATE" });
  };

  // Declarations naming exactly this occurrence.
  const mine = o.declarations.filter((d) => d.occurrenceId === occ.occurrenceId);
  const live = new Set(completions.live.map((d) => d.recordId));
  for (const d of mine) {
    if (!live.has(d.recordId) || d.kind === "RETRACTION" || d.evidence === null) continue;
    if (completions.competingIds.has(d.recordId)) {
      conflictingDeclarations.push(d.recordId);
      continue;
    }
    if (d.programmeVersion !== definition.version) {
      otherVersion.push(d.recordId);
      continue;
    }
    if (d.evidence.kind === "DECLARED") {
      const role = effectiveDeclarerRole(d);
      place(d.recordId, d.evidence.completedAt, {
        basis: "DECLARATION",
        authority: role === "VETERINARIAN" ? "VETERINARY" : "NON_VETERINARY",
        declaredBy: role,
        recordProvenance: null,
        declarationId: d.recordId,
        healthRecordId: null,
      });
      continue;
    }
    // Explicit link: authority (projection, known, LIVE, uncontested) → resolved values → remaining authority → match.
    const healthRecordId = d.evidence.healthRecordId;
    if (action.completion.recordKind === null) {
      mismatch(d.recordId, "CATTLE_PROGRAMME_EVIDENCE_KIND_NOT_ACCEPTED");
      continue;
    }
    if (ctx.health === null) {
      unresolvedNote("DECLARATION", d.recordId, "INSUFFICIENT_EVIDENCE", "CATTLE_PROGRAMME_HEALTH_EVIDENCE_NOT_SUPPLIED");
      continue;
    }
    const entry = timeline.find((e) => e.recordId === healthRecordId);
    if (!entry) {
      if (ctx.health.notYetOccurred.has(healthRecordId)) notYetOccurred.push(d.recordId);
      else unresolvedNote("DECLARATION", d.recordId, "INSUFFICIENT_EVIDENCE", "CATTLE_PROGRAMME_LINKED_RECORD_NOT_KNOWN");
      continue;
    }
    if (entry.status !== "LIVE") {
      unresolvedNote("DECLARATION", d.recordId, "INSUFFICIENT_EVIDENCE", "CATTLE_PROGRAMME_LINKED_RECORD_SUPERSEDED");
      continue;
    }
    if (entry.inCompetition) {
      conflictingDeclarations.push(d.recordId);
      continue;
    }
    if (o.contested.has(healthRecordId)) {
      unresolvedNote("DECLARATION", d.recordId, "EVIDENCE_CONFLICT", "CATTLE_PROGRAMME_RECORD_CLAIMED_BY_SEVERAL_OCCURRENCES");
      continue;
    }
    const valueMismatch = resolvedValueMismatch(action, entry);
    if (valueMismatch !== null) {
      mismatch(d.recordId, valueMismatch);
      continue;
    }
    const evidence = resolveThenMatch(action, entry, ctx);
    if (evidence.kind === "MISMATCH") mismatch(d.recordId, evidence.reason);
    else if (evidence.kind === "UNRESOLVED") unresolvedNote("DECLARATION", d.recordId, evidence.outcome, evidence.reason);
    else {
      // A veterinarian-authored link corroborates a farmer-recorded record; a veterinary-recorded record is veterinary evidence whoever links it.
      const role = effectiveDeclarerRole(d);
      place(d.recordId, evidence.at, {
        basis: "HEALTH_RECORD_LINK",
        authority: role === "VETERINARIAN" || veterinaryRecorded(entry) ? "VETERINARY" : "NON_VETERINARY",
        declaredBy: role,
        recordProvenance: recordProvenanceOf(entry),
        declarationId: d.recordId,
        healthRecordId,
      });
    }
  }

  // Declared criteria: only once the window has opened can an in-window record have occurred by effectiveAt.
  if (action.completion.matchCriteria && windowPosition(occ, effectiveAt) !== "BEFORE") {
    if (ctx.health === null) {
      unresolvedNote("OCCURRENCE", occ.occurrenceId, "INSUFFICIENT_EVIDENCE", "CATTLE_PROGRAMME_HEALTH_EVIDENCE_NOT_SUPPLIED");
    } else {
      for (const entry of timeline) {
        // Superseded history is not evidence. A linked record is ALSO an independent criteria candidate (monotonicity).
        if (entry.status !== "LIVE") continue;
        // Candidates: records whose resolved fields could match.
        if (resolvedValueMismatch(action, entry) !== null) continue;
        if (entry.occurredAt !== null) {
          const t = entry.occurredAt;
          if (compareInstants(t, effectiveAt) > 0 || windowPosition(occ, t) !== "IN") continue;
        }
        if (entry.inCompetition) {
          conflictingRecords.push(entry.recordId);
          continue;
        }
        if (o.contested.has(entry.recordId)) {
          unresolvedNote("HEALTH_RECORD", entry.recordId, "EVIDENCE_CONFLICT", "CATTLE_PROGRAMME_RECORD_CLAIMED_BY_SEVERAL_OCCURRENCES");
          continue;
        }
        const evidence = resolveThenMatch(action, entry, ctx);
        if (evidence.kind === "UNRESOLVED") unresolvedNote("HEALTH_RECORD", entry.recordId, evidence.outcome, evidence.reason);
        else if (evidence.kind === "MATCH") {
          counted.push({
            basis: "DECLARED_CRITERIA",
            authority: veterinaryRecorded(entry) ? "VETERINARY" : "NON_VETERINARY",
            declaredBy: null,
            recordProvenance: recordProvenanceOf(entry),
            declarationId: null,
            healthRecordId: entry.recordId,
            completedAt: evidence.at,
            timing: "IN_WINDOW",
          });
        }
      }
    }
  }

  const byRef = (a: EvidenceNote, b: EvidenceNote) => compareStrings(a.refKind, b.refKind) || compareStrings(a.ref, b.ref) || compareStrings(a.reason, b.reason);
  return {
    consideredDeclarationIds: sortedUnique(mine.map((d) => d.recordId)),
    counted: counted.sort((a, b) => compareStrings(a.basis, b.basis) || compareStrings(a.declarationId ?? "", b.declarationId ?? "") || compareStrings(a.healthRecordId ?? "", b.healthRecordId ?? "")),
    otherVersionDeclarationIds: sortedUnique(otherVersion),
    beforeWindow: sortedUnique(beforeWindow),
    notYetOccurred: sortedUnique(notYetOccurred),
    unresolved: unresolved.sort((a, b) => byRef(a, b) || compareStrings(a.outcome, b.outcome)),
    mismatched: mismatched.sort(byRef),
    conflictingDeclarationIds: sortedUnique(conflictingDeclarations),
    conflictingRecordIds: sortedUnique(conflictingRecords),
  };
}
