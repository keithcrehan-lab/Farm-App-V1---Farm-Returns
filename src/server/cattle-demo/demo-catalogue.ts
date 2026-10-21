/**
 * Cattle C10 — the demonstration catalogue (server-only, local demonstration
 * mode only). Every source, rule, product, programme, target and registry
 * entry is SYNTHETIC (`SYNTH-*`): no real legal duty, veterinary schedule,
 * withdrawal period, biological target, price or cost. They exist only so the
 * frozen C1–C9 engines have something honest to run over when Supabase is not
 * configured; a real account never sees them (`isCattleDemoMode`).
 *
 * The catalogue is built with the C0 test-support helpers (`synthRule`,
 * `approve`, `impl`, `bindTo`, `synthSource`) so it goes through exactly the
 * same rule / source / review lifecycle as the frozen phase tests.
 */

import "server-only";

import { computeProgrammeDefinitionFingerprint } from "@/domain/cattle/programmes";
import { DEFAULT_CANDIDATE_ACTION_REGISTRY, type CandidateActionRegistry } from "@/domain/cattle/recommendations";
import { createObligationImplementationRegistry, obligationTermsMarker, type ObligationDefinition } from "@/domain/cattle/regulatory";
import type { CattleRuleVersion } from "@/domain/cattle/rule";
import { computeSourceContentFingerprint, sourceVersionRef } from "@/domain/cattle/source";
import { CATALOGUE, LEGAL_SOURCE, approve, bindTo, hash, impl, synthRule } from "@/domain/cattle/test-fixtures";

export { hash };

type Rec = Record<string, unknown>;

/** The demonstration viewpoint (valid time = knowledge time). Fixture-supplied; never a clock. */
export const DEMO_BASE_VIEWPOINT = "2026-10-16T09:00:00Z";

export const DEMO_FOOD_PRODUCT = "SYNTH-FOOD-MEAT";

// ---------------------------------------------------------------------------
// C8 — the demonstration candidate-action registry
// ---------------------------------------------------------------------------

/**
 * The demonstration runs the FROZEN default candidate-action registry
 * unchanged. In particular C10 adds no weight-staleness interval: the default
 * registry raises `RECORD_WEIGHT` only when no usable weight is in view
 * (`staleAfter: null`). How old the latest weight is may be shown as
 * information (its date), but it is never turned into work until a
 * separately authorised policy owns a staleness rule (an open product
 * decision, recorded in the C10 report).
 */
export const DEMO_ACTION_REGISTRY: CandidateActionRegistry = DEFAULT_CANDIDATE_ACTION_REGISTRY;

// ---------------------------------------------------------------------------
// C2 — one synthetic obligation (DATE_OF_BIRTH anchor, window +1..+30 DAY)
// ---------------------------------------------------------------------------

export const DEMO_OBLIGATION_ID = "SYNTH-OBLIGATION-REGISTRATION";
const DEMO_OBLIGATION_RULE = "SYNTH-RULE-REGISTRATION";
const OBLIGATION_IMPL = impl(() => "PASS", "SYNTH-IMPL-REGISTRATION");

function obligationDefinition(): ObligationDefinition {
  return {
    obligationId: DEMO_OBLIGATION_ID,
    ruleId: DEMO_OBLIGATION_RULE,
    ruleVersion: 1,
    recordedAt: "2025-01-01T00:00:00Z",
    terms: {
      obligationKind: "SYNTH-REGISTRATION",
      anchor: { kind: "DATE_OF_BIRTH" },
      window: { opensAfter: { amount: 1, unit: "DAY" }, dueAfter: { amount: 30, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" },
      timeBasis: "UTC",
      windowSource: sourceVersionRef(LEGAL_SOURCE),
    },
  };
}

function obligationCatalogue() {
  const def = obligationDefinition();
  const rule: CattleRuleVersion = synthRule({
    ruleId: def.ruleId,
    version: 1,
    title: "Synthetic registration obligation (demonstration)",
    effectiveFrom: "2025-01-01",
    requiredInputs: [],
    implementation: bindTo(OBLIGATION_IMPL),
    sourceBindings: [sourceVersionRef(LEGAL_SOURCE)],
    assumptions: ["synthetic demonstration obligation", obligationTermsMarker(def, hash)],
  });
  return { definitions: [def], ruleVersions: [rule], sources: [...CATALOGUE], reviews: approve(rule, rule.requiredReviews, "2025-01-05T00:00:00Z") };
}

export const DEMO_OBLIGATION_CATALOGUE = obligationCatalogue();
export const DEMO_TRUSTED = { obligationImplementations: createObligationImplementationRegistry([OBLIGATION_IMPL]) };

export function obligationFulfilment(animalId: string, fulfilledAt: string, receivedAt: string): Rec {
  return {
    evidenceId: `SYNTH-REGISTRATION-${animalId}`,
    animalId,
    obligationId: DEMO_OBLIGATION_ID,
    rule: { ruleId: DEMO_OBLIGATION_RULE, version: 1 },
    occurrenceAnchor: null,
    kind: "FULFILMENT",
    fulfilledAt,
    provenance: { sourceCategory: "FARMER", receivedAt },
    supersedes: [],
  };
}

// ---------------------------------------------------------------------------
// C3 — one synthetic product (meat withdrawal 28 DAY, synthetic)
// ---------------------------------------------------------------------------

export const DEMO_PRODUCT_ID = "SYNTH-PRODUCT-WORMER";
const PRODUCT_SOURCE = { sourceId: "SYNTH-SRC-PRODUCT", version: "v1", contentFingerprint: computeSourceContentFingerprint({ text: "synthetic product sheet" }, hash) };

export const DEMO_PRODUCT_RECORDS: Rec[] = [
  {
    productId: DEMO_PRODUCT_ID,
    version: "v1",
    authorisation: { scheme: "SYNTH-SCHEME", number: "SYNTH-AUTH-1" },
    label: "Synthetic wormer (demonstration product)",
    lifecycle: "ACTIVE",
    speciesAuthorisations: [{ species: "BOVINE", withdrawalPeriods: [{ foodProduct: DEMO_FOOD_PRODUCT, route: null, period: { amount: 28, unit: "DAY" } }] }],
    source: { publisher: "SYNTH-PUBLISHER", sourceRef: PRODUCT_SOURCE, retrievedAt: "2025-01-01T00:00:00Z", checkedAt: "2025-01-02T00:00:00Z" },
  },
];

export function medicineAdministration(recordId: string, animalId: string, occurredAt: string, productId = DEMO_PRODUCT_ID): Rec {
  return {
    recordId,
    animalId,
    kind: "MEDICINE_ADMINISTRATION",
    occurredAt,
    productId,
    route: "SYNTH-ROUTE-ORAL",
    dose: { amount: 10, unit: "SYNTH-DOSE-UNIT" },
    batchRef: "SYNTH-BATCH-1",
    provenance: { sourceCategory: "FARMER", actorRole: "FARMER", receivedAt: occurredAt },
  };
}

// ---------------------------------------------------------------------------
// C7 — one synthetic veterinary programme (DATE_OF_BIRTH + 205..215 DAY)
// ---------------------------------------------------------------------------

export const DEMO_PROGRAMME_ID = "SYNTH-PROGRAMME-BOOSTER";
export const DEMO_PROGRAMME_ACTION = "SYNTH-ACTION-BOOSTER";
const PROGRAMME_DOC = { sourceId: "SYNTH-SRC-PROGRAMME", version: "v1", contentFingerprint: LEGAL_SOURCE.contentFingerprint };

function programmeDefinition(animalIds: string[]): Rec {
  return {
    programmeId: DEMO_PROGRAMME_ID,
    version: "v1",
    supersedesVersions: [],
    classification: "VETERINARY_PROGRAMME",
    declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-1" },
    validFrom: "2025-01-01T00:00:00Z",
    validTo: null,
    applicability: { kind: "EXPLICIT_SET", animalIds: [...animalIds].sort() },
    actions: [
      {
        actionId: DEMO_PROGRAMME_ACTION,
        actionKind: "SYNTH-BOOSTER",
        productRef: null,
        schedule: {
          anchor: { kind: "DATE_OF_BIRTH" },
          window: { opensAfter: { amount: 205, unit: "DAY" }, dueAfter: { amount: 215, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" },
          repeat: null,
        },
        completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria: false },
        gates: [],
        gateRole: "HARD_GATE",
      },
    ],
    productionState: "PRODUCTION",
    provenance: { sourceCategory: "VETERINARY_SOURCE", sourceSystem: null, sourceRecordRef: null, receivedAt: "2025-01-01T00:00:00Z", sourceDocument: PROGRAMME_DOC },
  };
}

export function demoProgrammes(animalIds: string[], completions: Rec[]) {
  const definition = programmeDefinition(animalIds);
  const review = {
    reviewId: "SYNTH-REVIEW-BOOSTER",
    programmeId: DEMO_PROGRAMME_ID,
    programmeVersion: "v1",
    definitionFingerprint: computeProgrammeDefinitionFingerprint(definition, hash),
    dimension: "VETERINARY",
    decision: "APPROVED",
    reviewer: { role: "VETERINARIAN", actor: "SYNTH-REVIEWER-1" },
    reviewedAt: "2025-01-02T00:00:00Z",
    supersedes: [],
  };
  return { definitions: [definition], reviews: [review], completions };
}

export function programmeCompletion(animalId: string, occurrenceId: string, completedAt: string): Rec {
  return {
    recordId: `SYNTH-BOOSTER-DONE-${animalId}`,
    animalId,
    programmeId: DEMO_PROGRAMME_ID,
    programmeVersion: "v1",
    actionId: DEMO_PROGRAMME_ACTION,
    occurrenceId,
    kind: "COMPLETION",
    evidence: { kind: "DECLARED", completedAt },
    declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-1" },
    provenance: { sourceCategory: "VETERINARY_SOURCE", sourceSystem: null, sourceRecordRef: null, receivedAt: completedAt },
    supersedes: [],
  };
}

// ---------------------------------------------------------------------------
// C5 — one synthetic ADG target (1.0 ± 0.1 kg/day) and a trend policy
// ---------------------------------------------------------------------------

const TARGET_SOURCE = { sourceId: "SYNTH-SRC-TARGETS", version: "v1", contentFingerprint: computeSourceContentFingerprint({ text: "synthetic target table" }, hash) };
const definitionProvenance = { sourceRef: TARGET_SOURCE, receivedAt: "2025-01-01T00:00:00Z" };

export const DEMO_TARGET_ID = "SYNTH-TARGET-FINISHING-ADG";

export const DEMO_PERFORMANCE_TARGETS: Rec[] = [
  {
    targetId: DEMO_TARGET_ID,
    version: "v1",
    metric: { kind: "ADG", valueKgPerDay: 1 },
    tolerance: { below: 0.1, above: 0.1 },
    applicability: {},
    validFrom: "2025-01-01T00:00:00Z",
    reviewState: "PRODUCTION",
    provenance: definitionProvenance,
  },
];

export const DEMO_PERFORMANCE_POLICIES: Rec[] = [
  { policyId: "SYNTH-POLICY-TREND", version: "v1", rule: { kind: "TREND", fallingBelowKgPerDay: 0, risingAboveKgPerDay: 0.2 }, provenance: definitionProvenance },
];
