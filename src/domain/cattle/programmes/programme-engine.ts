/**
 * Cattle C7 — veterinary / risk-based health-programme state at an explicit
 * (`effectiveAt`, `knowledgeCutoff`). Rebuilt from the C7 phase base; the
 * acceptance contract is DOMAIN_CONTRACTS "Cattle C7".
 *
 * `evaluateHealthProgrammes` answers, for every declared programme and every
 * supplied animal: which declared programme actions are due, done, unknown
 * or blocked at `effectiveAt`, as known at `knowledgeCutoff`. It is NOT a
 * vaccination or prescribing engine: it never chooses a product, dose,
 * timing or programme, never diagnoses, never matches completion fuzzily and
 * ships with no programme (CAT-INV-027). No clock is read.
 *
 * Layers (each its own module):
 * 1. canonical boundary + field policy (`programme-fields.ts`);
 * 2. predecessor adapters / verifiers with per-record context membership
 *    (`programme-predecessors.ts`);
 * 3. the resolved-evidence model (`programme-evidence.ts`);
 * 4. definition / review / declaration admission at the cutoff
 *    (`programme-definition.ts`, `programme-completion.ts`);
 * 5. membership, anchors and occurrences (`programme-membership.ts`,
 *    `programme-schedule.ts`);
 * 6. completion matching, resolution before match (`programme-matching.ts`);
 * 7. state precedence and folding (`programme-state.ts`);
 * 8. result binding (this module): result dependency set = result binding set;
 * 9. hard-gate projection (`programme-hard-gates.ts`).
 */

import type { AssessmentFingerprint, FingerprintVerificationResult } from "../../assessment-integrity";
import { deepFreezeAnimalValue } from "../animal-ledger";
import { compareStrings, sortedUnique, type CattleHash } from "../integrity";
import { isRecord } from "../health/health-input";
import { toCanonicalPlainData } from "../regulatory/canonical-input";
import { admitProgrammeCompletions } from "./programme-completion";
import {
  admitProgrammeDefinitions,
  admitProgrammeReviews,
  definitionFingerprint,
  programmeInformationClass,
  programmeReviewState,
  resolveGoverningVersion,
  uniqueProgrammeIssues,
  versionEffectiveAt,
  type HealthProgrammeDefinition,
  type ProgrammeAction,
  type ProgrammeClassification,
  type ProgrammeVersionHistory,
} from "./programme-definition";
import { CATTLE_PROGRAMME_PAYLOAD_VERSION, computeProgrammeFingerprint, verifyProgrammeFingerprint } from "./programme-integrity";
import { contestedRecords, evaluateCompletion, type OccurrenceContext } from "./programme-matching";
import { anchorOf, membershipAt } from "./programme-membership";
import { readAnimals, readRequest, type AnimalContext, type ProgrammeTrustedInputs } from "./programme-predecessors";
import { deriveProgrammeOccurrences, windowPosition, type ProgrammeOccurrence } from "./programme-schedule";
import { foldOrInvalid, membershipState, occurrenceState, outcomeState, type ProgrammeOccurrenceState } from "./programme-state";
import type {
  ProgrammeAnimalStatus,
  ProgrammeEvaluationResult,
  ProgrammeGateCheck,
  ProgrammeGoverning,
  ProgrammeIssue,
  ProgrammeMembership,
  ProgrammeOccurrenceRecord,
  ProgrammeScopeSummary,
  ProgrammeStatus,
  ProgrammeStatusEvaluation,
  ProgrammeStatusValue,
  ProgrammeVersionEntry,
} from "./programme-types";
import type { CompletionResolution, ProgrammeCompletionRecord } from "./programme-completion";
import type { ProgrammeReviewRecord } from "./programme-definition";

// ---------------------------------------------------------------------------
// Result binding (CAT-INV-021; FINGERPRINTS.md rule 4)
// ---------------------------------------------------------------------------

/**
 * The programme evidence an animal status was derived under, bound into its
 * RESULT fingerprint: the COMPLETE canonical governing / conflicting version
 * records (every definition field, effective period, full provenance,
 * lifecycle, supersession and review fingerprint), the review state and the
 * bound review records. The `CATTLE_PROGRAMME_DEFINITION` review fingerprint
 * keeps its narrower meaning and is never the binding on its own.
 */
interface ProgrammeProvenanceBinding {
  governing: ProgrammeVersionEntry | null;
  conflicting: ProgrammeVersionEntry[];
  review: ProgrammeGoverning["review"] | null;
  reviewRecords: ProgrammeReviewRecord[];
}

function provenanceBinding(governing: ProgrammeGoverning | null, conflicting: readonly ProgrammeVersionEntry[]): ProgrammeProvenanceBinding {
  return {
    governing: governing === null ? null : governing.version,
    conflicting: [...conflicting].sort((a, b) => compareStrings(a.definition.version, b.definition.version)),
    review: governing === null ? null : governing.review,
    reviewRecords: governing === null ? [] : governing.reviewRecords,
  };
}

function animalStatusPayload(content: Omit<ProgrammeAnimalStatus, "fingerprint">, effectiveAt: string, knowledgeCutoff: string, binding: ProgrammeProvenanceBinding): unknown {
  return { effectiveAt, knowledgeCutoff, programme: binding, status: content };
}

function evaluationPayload(content: Omit<ProgrammeStatusEvaluation, "fingerprint">): unknown {
  return content;
}

// ---------------------------------------------------------------------------
// Per occurrence / action / animal
// ---------------------------------------------------------------------------

interface AnimalBase {
  programmeId: string;
  classification: ProgrammeClassification;
  version: string | null;
  effectiveAt: string;
  knowledgeCutoff: string;
  binding: ProgrammeProvenanceBinding;
}

const record = (
  base: { programmeId: string; programmeVersion: string | null; animalId: string },
  action: ProgrammeAction | null,
  fields: Pick<ProgrammeOccurrenceRecord, "occurrence" | "state" | "reasonCodes" | "completion" | "gates" | "membershipAtOpen">,
): ProgrammeOccurrenceRecord => ({
  programmeId: base.programmeId,
  programmeVersion: base.programmeVersion,
  actionId: action?.actionId ?? null,
  actionKind: action?.actionKind ?? null,
  animalId: base.animalId,
  ...fields,
  reasonCodes: sortedUnique(fields.reasonCodes),
});

function gateChecks(action: ProgrammeAction, ctx: AnimalContext): ProgrammeGateCheck[] {
  const out: ProgrammeGateCheck[] = [];
  for (const ruleId of action.gates) {
    const supplied = ctx.gates.get(ruleId);
    if (supplied === undefined || supplied.length === 0) out.push({ ruleId, state: "NOT_SUPPLIED", source: null, blocking: true });
    else for (const g of supplied) out.push({ ruleId, state: g.state, source: g.source, blocking: g.state !== "PASS" && g.state !== "NOT_APPLICABLE" });
  }
  return out.sort((a, b) => compareStrings(a.ruleId, b.ruleId) || compareStrings(a.source ?? "", b.source ?? "") || compareStrings(a.state, b.state));
}

interface OccurrenceInputs extends OccurrenceContext {
  knowledgeCutoff: string;
  /** The governing version's effective period at the cutoff. */
  period: Pick<ProgrammeVersionHistory, "effectiveFrom" | "effectiveTo">;
  gates: ProgrammeGateCheck[];
}

function occurrenceRecord(o: OccurrenceInputs, occ: ProgrammeOccurrence, hash: CattleHash): ProgrammeOccurrenceRecord {
  const { definition, action, ctx, effectiveAt } = o;
  const base = { programmeId: definition.programmeId, programmeVersion: definition.version, animalId: ctx.animalId };
  if (!versionEffectiveAt(o.period, occ.opensAt)) {
    return record(base, action, { occurrence: occ, state: "NOT_APPLICABLE", reasonCodes: ["CATTLE_PROGRAMME_WINDOW_OUTSIDE_PROGRAMME_PERIOD"], completion: null, gates: o.gates, membershipAtOpen: null });
  }
  const position = windowPosition(occ, effectiveAt);
  // Every C4 resolution consulted is retained so its fingerprint binds the result.
  const membershipAtOpen = definition.applicability.kind === "GROUP" && position !== "BEFORE" ? membershipAt(definition.applicability, ctx, occ.opensAt, o.knowledgeCutoff, hash) : null;
  if (membershipAtOpen !== null && membershipAtOpen.state !== "MEMBER") {
    return record(base, action, {
      occurrence: occ,
      state: membershipState(membershipAtOpen.state),
      reasonCodes: [`CATTLE_PROGRAMME_MEMBERSHIP_AT_WINDOW_OPEN_${membershipAtOpen.state}`, ...membershipAtOpen.reasonCodes],
      completion: null,
      gates: o.gates,
      membershipAtOpen,
    });
  }
  const completion = evaluateCompletion(o, occ);
  const veterinaryHardGate = definition.classification === "VETERINARY_PROGRAMME" && action.gateRole === "HARD_GATE";
  const { state, reasonCodes } = occurrenceState({ completion, position, gates: o.gates, veterinaryHardGate });
  return record(base, action, { occurrence: occ, state, reasonCodes, completion, gates: o.gates, membershipAtOpen });
}

function compareRecords(a: ProgrammeOccurrenceRecord, b: ProgrammeOccurrenceRecord): number {
  return (
    (a.actionId === null ? -1 : 0) - (b.actionId === null ? -1 : 0) ||
    compareStrings(a.actionId ?? "", b.actionId ?? "") ||
    (a.occurrence === null ? -1 : a.occurrence.index) - (b.occurrence === null ? -1 : b.occurrence.index)
  );
}

function animalStatus(
  base: AnimalBase,
  ctx: AnimalContext,
  membership: ProgrammeMembership | null,
  records: readonly ProgrammeOccurrenceRecord[],
  unmatchedDeclarationIds: readonly string[],
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
    // An empty record set never resolves (R3): it fails closed.
    status: foldOrInvalid(sorted.map((r) => r.state)),
    records: sorted,
    unmatchedDeclarationIds: sortedUnique([...unmatchedDeclarationIds]),
    declarations: [...declarations].sort((a, b) => compareStrings(a.recordId, b.recordId)),
    inputs: ctx.inputs,
  };
  return { ...content, fingerprint: computeProgrammeFingerprint("CATTLE_PROGRAMME_ANIMAL_STATUS", animalStatusPayload(content, base.effectiveAt, base.knowledgeCutoff, base.binding), hash) };
}

/** Every action record (action-level and per-occurrence) of one member animal. */
function memberRecords(definition: HealthProgrammeDefinition, governing: ProgrammeVersionHistory, ctx: AnimalContext, inputs: EvaluationInputs, declarations: readonly ProgrammeCompletionRecord[], hash: CattleHash) {
  const base = { programmeId: definition.programmeId, programmeVersion: definition.version, animalId: ctx.animalId };
  const records: ProgrammeOccurrenceRecord[] = [];
  const occurrenceKeys = new Set<string>();
  for (const action of definition.actions) {
    const gates = gateChecks(action, ctx);
    const anchor = anchorOf(action, ctx);
    if (!anchor.resolved) {
      records.push(record(base, action, { occurrence: null, state: outcomeState(anchor.outcome), reasonCodes: anchor.reasonCodes, completion: null, gates, membershipAtOpen: null }));
      continue;
    }
    const o: OccurrenceInputs = {
      definition,
      action,
      ctx,
      effectiveAt: inputs.effectiveAt,
      knowledgeCutoff: inputs.knowledgeCutoff,
      period: governing,
      declarations: declarations.filter((d) => d.actionId === action.actionId),
      completions: inputs.completions,
      contested: new Set(),
      gates,
    };
    const derived = deriveProgrammeOccurrences(definition.programmeId, action, ctx.animalId, anchor.value);
    o.contested = contestedRecords(o, derived.flatMap((d) => (d.occurrence === null ? [] : [d.occurrence])));
    for (const { index, occurrence } of derived) {
      if (occurrence === null) {
        records.push(record(base, action, { occurrence: null, state: "INVALID_EVIDENCE", reasonCodes: [`CATTLE_PROGRAMME_WINDOW_NOT_REPRESENTABLE:${index}`], completion: null, gates, membershipAtOpen: null }));
        continue;
      }
      occurrenceKeys.add(JSON.stringify([action.actionId, occurrence.occurrenceId]));
      records.push(occurrenceRecord(o, occurrence, hash));
    }
  }
  return { records, occurrenceKeys };
}

// ---------------------------------------------------------------------------
// Per programme
// ---------------------------------------------------------------------------

interface EvaluationInputs {
  effectiveAt: string;
  knowledgeCutoff: string;
  animals: Map<string, AnimalContext>;
  reviews: ProgrammeReviewRecord[];
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
  const declarationsOf = (animalId: string) => inputs.completions.known.filter((d) => d.animalId === animalId && d.programmeId === programmeId);
  const liveIds = new Set(inputs.completions.live.map((d) => d.recordId));
  const statusOf = (list: readonly ProgrammeAnimalStatus[], extra: ProgrammeOccurrenceState[] = []): ProgrammeStatusValue =>
    list.length === 0 && extra.length === 0 ? "NO_ANIMALS_EVALUATED" : foldOrInvalid([...list.map((a) => a.status), ...extra]);
  const programmeLevel = (version: string | null, animalId: string, state: ProgrammeOccurrenceState, reasonCodes: string[]) =>
    record({ programmeId, programmeVersion: version, animalId }, null, { occurrence: null, state, reasonCodes, completion: null, gates: [], membershipAtOpen: null });

  if (resolution.state === "VERSION_CONFLICT") {
    const conflicting = resolution.versions.map(entryOf);
    const base: AnimalBase = { programmeId, classification, version: null, effectiveAt, knowledgeCutoff, binding: provenanceBinding(null, conflicting) };
    const list = animalList.map((ctx) => animalStatus(base, ctx, null, [programmeLevel(null, ctx.animalId, "EVIDENCE_CONFLICT", ["CATTLE_PROGRAMME_VERSIONS_IN_CONFLICT"])], [], declarationsOf(ctx.animalId), hash));
    return { ...head, versionState: "VERSION_CONFLICT", governing: null, conflictingVersions: conflicting, scope: null, status: list.length === 0 ? "EVIDENCE_CONFLICT" : statusOf(list), animals: list };
  }

  const version = entryOf(resolution.version);
  const definition = version.definition;
  const review = programmeReviewState(definition, version.definitionFingerprint, inputs.reviews);
  const reviewRecords = inputs.reviews.filter((r) => review.dimensions.some((d) => d.reviewIds.includes(r.reviewId))).sort((a, b) => compareStrings(a.reviewId, b.reviewId));
  const governing: ProgrammeGoverning = { version, review, reviewRecords };
  const base: AnimalBase = { programmeId, classification, version: definition.version, effectiveAt, knowledgeCutoff, binding: provenanceBinding(governing, []) };
  if (!review.approved) {
    const reasons = [
      ...(definition.productionState === "PRODUCTION" ? [] : [`CATTLE_PROGRAMME_NOT_CURRENT:${definition.productionState}`]),
      ...review.dimensions.filter((d) => d.state !== "APPROVED").map((d) => `CATTLE_PROGRAMME_REVIEW_${d.state}:${d.dimension}`),
    ];
    const list = animalList.map((ctx) => animalStatus(base, ctx, null, [programmeLevel(definition.version, ctx.animalId, "REVIEW_REQUIRED", reasons)], [], declarationsOf(ctx.animalId), hash));
    return { ...head, versionState: "GOVERNING", governing, conflictingVersions: [], scope: null, status: list.length === 0 ? "REVIEW_REQUIRED" : statusOf(list), animals: list };
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
    ({ MEMBER: scope.members, NOT_MEMBER: scope.notMembers, UNKNOWN: scope.unknown, EVIDENCE_CONFLICT: scope.conflict, INVALID: scope.invalid })[membership.state].push(ctx.animalId);
    const declarations = declarationsOf(ctx.animalId);
    const liveCompletions = declarations.filter((d) => liveIds.has(d.recordId) && d.kind === "COMPLETION");
    if (membership.state !== "MEMBER") {
      const level = programmeLevel(definition.version, ctx.animalId, membershipState(membership.state), [`CATTLE_PROGRAMME_MEMBERSHIP_${membership.state}`, ...membership.reasonCodes]);
      list.push(animalStatus(base, ctx, membership, [level], liveCompletions.map((d) => d.recordId), declarations, hash));
      continue;
    }
    const { records, occurrenceKeys } = memberRecords(definition, version, ctx, inputs, declarations, hash);
    const unmatched = liveCompletions.filter((d) => !occurrenceKeys.has(JSON.stringify([d.actionId, d.occurrenceId]))).map((d) => d.recordId);
    list.push(animalStatus(base, ctx, membership, records, unmatched, declarations, hash));
  }
  const missing: ProgrammeOccurrenceState[] = scope.declaredMembersNotEvaluated.length > 0 ? ["INSUFFICIENT_EVIDENCE"] : [];
  return { ...head, versionState: "GOVERNING", governing, conflictingVersions: [], scope, status: statusOf(list, missing), animals: list };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function evaluateCanonical(req: unknown, trusted: ProgrammeTrustedInputs, hash: CattleHash): ProgrammeEvaluationResult {
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
  const animals = readAnimals(read.read, trusted, hash);
  if (!animals.ok) issues.push(...animals.issues);
  if (issues.length > 0 || !definitions.ok || !reviews.ok || !completions.ok || !animals.ok) return { ok: false, issues: uniqueProgrammeIssues(issues) };

  const inputs: EvaluationInputs = { effectiveAt, knowledgeCutoff, animals: animals.animals, reviews: reviews.reviews, completions: completions.resolution };
  const programmes = [...definitions.admission.programmes.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([id, versions]) => evaluateProgramme(id, versions, inputs, hash));
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
 * Evaluates every declared programme for every supplied animal at
 * (`effectiveAt`, `knowledgeCutoff`). The complete request must be canonical
 * plain data with every field present; only the detached copy is used. C2 /
 * C3 results are composed in-process from the request's canonical evidence
 * by their frozen engines; `trusted.obligationImplementations` is C2's trusted
 * implementation registry (never request data — the C2 precedent). Any
 * malformed admitted record or rejected predecessor evidence fails the whole
 * request closed. The result is deep-frozen.
 */
export function evaluateHealthProgrammes(request: unknown, hash: CattleHash, trusted: ProgrammeTrustedInputs = {}): ProgrammeEvaluationResult {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return deepFreezeAnimalValue({ ok: false, issues: [{ code: "CATTLE_PROGRAMME_NON_CANONICAL_INPUT", ref: canonical.path }] });
  return deepFreezeAnimalValue(structuredClone(evaluateCanonical(canonical.value, trusted, hash)));
}

/** Re-verifies every animal-status fingerprint (with its provenance binding) and the evaluation fingerprint. */
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
      const binding = provenanceBinding(p.governing, p.conflictingVersions);
      for (const a of p.animals) {
        const { fingerprint, ...content } = a;
        const v = verifyProgrammeFingerprint("CATTLE_PROGRAMME_ANIMAL_STATUS", animalStatusPayload(content, e.effectiveAt, e.knowledgeCutoff, binding), fingerprint as AssessmentFingerprint, hash);
        if (!v.valid) return v;
      }
    }
    const { fingerprint, ...content } = e;
    return verifyProgrammeFingerprint("CATTLE_PROGRAMME_STATUS", evaluationPayload(content), fingerprint, hash);
  } catch {
    return { valid: false, reasonCode: "CATTLE_PROGRAMME_EVALUATION_MALFORMED", detail: "fingerprint payload is not canonical" };
  }
}
