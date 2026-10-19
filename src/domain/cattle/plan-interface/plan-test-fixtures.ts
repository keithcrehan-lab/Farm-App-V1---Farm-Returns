/**
 * Synthetic fixtures for the Cattle C9 tests (test support only). Every
 * animal, obligation, programme, source, rule and value is fictional
 * (`SYNTH-*`); no real legal, veterinary or scientific content.
 */

import { createAnimalLedger, type AnimalLedger } from "../animal-ledger";
import { computeProgrammeDefinitionFingerprint } from "../programmes";
import { DEFAULT_CANDIDATE_ACTION_REGISTRY } from "../recommendations";
import { createObligationImplementationRegistry, obligationTermsMarker, type ObligationDefinition } from "../regulatory";
import type { CattleRuleVersion } from "../rule";
import { sourceVersionRef } from "../source";
import { CATALOGUE, LEGAL_SOURCE, approve, bindTo, hash, impl, synthRule, synthSource } from "../test-fixtures";

export { hash };
export type Rec = Record<string, unknown>;

export const A = "SYNTH-ANIMAL-1";
export const B = "SYNTH-ANIMAL-2";
export const GROUP = "SYNTH-GROUP-1";
export const OTHER_GROUP = "SYNTH-GROUP-2";

const prov = (receivedAt = "2026-02-01T00:00:00Z") => ({ sourceCategory: "FARMER", receivedAt });

/** DOB 2026-03-01; optional C1 MANAGEMENT_GROUP assertions. */
export function ledgerOf(animalId: string, groups: { id: string; value: string; from?: string; supersedes?: string[]; receivedAt?: string }[] = []): AnimalLedger {
  const r = createAnimalLedger(animalId, [
    { assertionId: `${animalId}-dob`, animalId, kind: "DATE_OF_BIRTH", value: "2026-03-01", provenance: prov() },
    { assertionId: `${animalId}-sex`, animalId, kind: "SEX", value: "FEMALE", provenance: prov() },
    ...groups.map((g) => ({
      assertionId: g.id,
      animalId,
      kind: "MANAGEMENT_GROUP",
      value: g.value,
      validFrom: g.from ?? "2026-01-01T00:00:00Z",
      validTo: null,
      supersedes: g.supersedes ?? [],
      provenance: prov(g.receivedAt),
    })),
  ]);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.ledger;
}

// C2 — DATE_OF_BIRTH anchor, window [birth + 1 DAY, birth + 10 DAY) = [03-02, 03-11) (synthetic).
export const OBL = "SYNTH-OBLIGATION-1";
export const OBL_RULE = "SYNTH-RULE-OBLIGATION";
export const OBL_PASS = impl(() => "PASS", "SYNTH-IMPL-OBLIGATION");
export const OBL_FAIL = impl(() => "FAIL", "SYNTH-IMPL-OBLIGATION-FAIL");
export const LEGAL_SOURCE_2 = synthSource({ sourceId: "SYNTH-SRC-LEGAL-2", title: "Synthetic legal instrument 2" }, { text: "synthetic clause B" });

export function oblDefinition(obligationId = OBL, ruleId = OBL_RULE): ObligationDefinition {
  return {
    obligationId,
    ruleId,
    ruleVersion: 1,
    recordedAt: "2026-01-01T00:00:00Z",
    terms: {
      obligationKind: "SYNTH-KIND",
      anchor: { kind: "DATE_OF_BIRTH" },
      window: { opensAfter: { amount: 1, unit: "DAY" }, dueAfter: { amount: 10, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" },
      timeBasis: "UTC",
      windowSource: sourceVersionRef(LEGAL_SOURCE),
    },
  };
}

/** A legal hard-gate obligation catalogue; `extraSource` adds a second rule source binding (D1). */
export function oblCatalogue(o: { implementation?: typeof OBL_PASS; extraSource?: boolean; obligationId?: string; ruleId?: string } = {}) {
  const def = oblDefinition(o.obligationId, o.ruleId);
  const rule: CattleRuleVersion = synthRule({
    ruleId: def.ruleId,
    version: 1,
    requiredInputs: [],
    implementation: bindTo(o.implementation ?? OBL_PASS),
    sourceBindings: o.extraSource ? [sourceVersionRef(LEGAL_SOURCE), sourceVersionRef(LEGAL_SOURCE_2)] : [sourceVersionRef(LEGAL_SOURCE)],
    assumptions: ["synthetic assumption", obligationTermsMarker(def, hash)],
  });
  return { definitions: [def], ruleVersions: [rule], sources: [...CATALOGUE, LEGAL_SOURCE_2], reviews: approve(rule) };
}

export const fulfilment = (o: { evidenceId?: string; animalId?: string; fulfilledAt?: string; receivedAt?: string; supersedes?: string[]; obligationId?: string; ruleId?: string } = {}) => ({
  evidenceId: o.evidenceId ?? `SYNTH-EVIDENCE-${o.animalId ?? A}`,
  animalId: o.animalId ?? A,
  obligationId: o.obligationId ?? OBL,
  rule: { ruleId: o.ruleId ?? OBL_RULE, version: 1 },
  occurrenceAnchor: null,
  kind: "FULFILMENT",
  fulfilledAt: o.fulfilledAt ?? "2026-03-05T00:00:00Z",
  provenance: { sourceCategory: "FARMER", receivedAt: o.receivedAt ?? "2026-03-06T00:00:00Z" },
  supersedes: o.supersedes ?? [],
});

export const obligations = (o: { evidence?: Rec[]; catalogue?: unknown; ids?: string[] } = {}) => ({ catalogue: o.catalogue ?? oblCatalogue(), obligationIds: o.ids ?? [OBL], evidence: o.evidence ?? [] });

export const TRUSTED = { obligationImplementations: createObligationImplementationRegistry([OBL_PASS, OBL_FAIL]) };

// C7 — a synthetic veterinary programme; windows birth + 10..20 DAY, every 30 DAY, 3 times.
const VET_DOC = { sourceId: "SYNTH-SRC-PROGRAMME", version: "v1", contentFingerprint: LEGAL_SOURCE.contentFingerprint };
export const PROGRAMME_ID = "SYNTH-PROGRAMME-1";
export const PROGRAMME_ACTION = "SYNTH-ACTION-1";
export function programmeDefinition(o: { animalIds?: string[]; gates?: string[] } = {}): Rec {
  return {
    programmeId: PROGRAMME_ID,
    version: "v1",
    supersedesVersions: [],
    classification: "VETERINARY_PROGRAMME",
    declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-1" },
    validFrom: "2026-01-01T00:00:00Z",
    validTo: null,
    applicability: { kind: "EXPLICIT_SET", animalIds: o.animalIds ?? [A] },
    actions: [
      {
        actionId: PROGRAMME_ACTION,
        actionKind: "SYNTH-ACTION-KIND",
        productRef: null,
        schedule: {
          anchor: { kind: "DATE_OF_BIRTH" },
          window: { opensAfter: { amount: 10, unit: "DAY" }, dueAfter: { amount: 20, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" },
          repeat: { interval: { amount: 30, unit: "DAY" }, count: 3 },
        },
        completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria: false },
        gates: o.gates ?? [],
        gateRole: "HARD_GATE",
      },
    ],
    productionState: "PRODUCTION",
    provenance: { sourceCategory: "VETERINARY_SOURCE", sourceSystem: null, sourceRecordRef: null, receivedAt: "2026-01-01T00:00:00Z", sourceDocument: VET_DOC },
  };
}
export function programmes(o: { definition?: Rec; completions?: Rec[] } = {}) {
  const definition = o.definition ?? programmeDefinition();
  const review = {
    reviewId: "SYNTH-REVIEW-1",
    programmeId: PROGRAMME_ID,
    programmeVersion: "v1",
    definitionFingerprint: computeProgrammeDefinitionFingerprint(definition, hash),
    dimension: "VETERINARY",
    decision: "APPROVED",
    reviewer: { role: "VETERINARIAN", actor: "SYNTH-REVIEWER-1" },
    reviewedAt: "2026-01-02T00:00:00Z",
    supersedes: [],
  };
  return { definitions: [definition], reviews: [review], completions: o.completions ?? [] };
}
export const programmeCompletion = (occurrenceId: string, completedAt: string, o: { recordId?: string; receivedAt?: string; animalId?: string } = {}) => ({
  recordId: o.recordId ?? "SYNTH-COMPLETION-1",
  animalId: o.animalId ?? A,
  programmeId: PROGRAMME_ID,
  programmeVersion: "v1",
  actionId: PROGRAMME_ACTION,
  occurrenceId,
  kind: "COMPLETION",
  evidence: { kind: "DECLARED", completedAt },
  declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-1" },
  provenance: { sourceCategory: "VETERINARY_SOURCE", sourceSystem: null, sourceRecordRef: null, receivedAt: o.receivedAt ?? completedAt },
  supersedes: [],
});

export const NO_MODELS = { records: [], reviews: [], sources: [] };

export interface Run {
  effectiveAt?: string;
  knowledgeCutoff?: string;
  ledgers?: unknown[];
  obligations?: unknown;
  health?: unknown;
  weights?: unknown;
  goals?: unknown;
  programmes?: unknown;
  actions?: unknown;
  models?: unknown;
  observations?: unknown[];
  groupScopes?: { groupRef: string }[];
}

export function cattleRequest(o: Run = {}): Rec {
  return {
    query: { effectiveAt: o.effectiveAt ?? "2026-03-05T00:00:00Z", knowledgeCutoff: o.knowledgeCutoff ?? "2026-03-05T12:00:00Z" },
    ledgers: o.ledgers ?? [ledgerOf(A)],
    obligations: o.obligations ?? null,
    health: o.health ?? null,
    weights: o.weights ?? null,
    performance: null,
    goals: o.goals ?? null,
    programmes: o.programmes ?? null,
    economics: { observations: o.observations ?? [] },
    models: o.models ?? NO_MODELS,
    actions: o.actions ?? DEFAULT_CANDIDATE_ACTION_REGISTRY,
  };
}

/** A fresh, unfrozen request (never aliased with the fixtures). */
export const planRequest = (o: Run = {}): Rec => structuredClone({ cattle: cattleRequest(o), groupScopes: o.groupScopes ?? [] });

export const registry = (definitions: unknown[]) => ({ registryId: "SYNTH-REGISTRY", version: "1", definitions });
export const defaultOnly = (...kinds: string[]) => registry(DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions.filter((d) => kinds.includes(d.actionKind)));

export function action(actionKind: string, o: Rec = {}): Rec {
  return {
    actionKind,
    recordedAt: "2026-01-01T00:00:00Z",
    description: `Synthetic action ${actionKind}`,
    tier: "EXPECTED_NET_RETURN",
    benefitClaim: "MODELLED",
    applicableGoalTypes: null,
    trigger: { kind: "UNCONDITIONAL" },
    prerequisites: { sources: [], gateRuleIds: [] },
    evidenceRequirements: [],
    effectModelRef: null,
    economicModelRef: null,
    assumptions: [],
    limitations: [],
    ...o,
  };
}

export const weightObs = (recordId: string, observedAt: string, animalId = A, receivedAt = observedAt) => ({
  recordId,
  animalId,
  observedAt,
  weight: { value: 412.5, unit: "KILOGRAM" },
  method: "SCALE",
  provenance: { sourceCategory: "DEVICE", receivedAt },
});

export const goalDecl = (goalId: string, receivedAt = "2026-01-01T00:00:00Z", animalId = A) => ({
  goalId,
  version: "v1",
  action: "DECLARE",
  subject: { kind: "ANIMAL", animalId },
  goalType: "FINISHING",
  validFrom: "2026-01-01T00:00:00Z",
  declaredBy: { actor: "SYNTH-FARMER-1", role: "FARMER" },
  provenance: { sourceCategory: "FARMER", receivedAt },
});
