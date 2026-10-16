/**
 * Cattle C8 — THE context-construction boundary (CAT-INV-001/002/015/021/
 * 023/028; C7 architecture review 2026-10-14; C8 pre-start clarifications
 * 2026-10-15).
 *
 * canonical request (C1 ledgers; C2 / C3 / C4 / C5 / C6 / C7 canonical
 * evidence; C8's registry, models and economic observations) + the trusted
 * C2 implementation registry
 *   → whole-request canonical check (`toCanonicalPlainData`) and the C8
 *     field-presence policy
 *   → C8-owned admission at the cutoff (registry, models, observations)
 *   → the frozen predecessor engines, invoked HERE AND ONLY HERE, in this
 *     order: C1 `rematerialiseAnimalLedger` / `projectAnimalSnapshot` /
 *     `computeAnimalSnapshotFingerprint`; C2 `evaluateHerdObligations` +
 *     `projectObligationHardGates`; C3 `projectAnimalHealth` +
 *     `projectWithdrawalHardGates`; C4 `buildWeightReadContract` → C5
 *     `evaluatePerformance` → C6 `projectProductionGoals` /
 *     `routeProductionGoals` / `resolveGoalTargetApplicability` (over that C5
 *     evaluation); C7 `evaluateHealthProgrammes` (which composes C2 / C3
 *     itself from the same canonical evidence — clarification 5) +
 *     `projectProgrammeHardGates`
 *   → the consumed-field schema (`recommendation-consumed.ts`)
 *   → one sealed, deep-frozen `CattleEvaluationContext` per animal.
 *
 * Invoking a frozen engine over its canonical inputs is delegation, not
 * reinterpretation (CAT-INV-023): no predecessor admission, normalisation,
 * ordering, equivalence or derivation rule is restated here, and no derived
 * predecessor output is accepted from the caller. Evidence a frozen engine
 * rejects fails the request closed. C5 applicability contexts are passed to
 * C5 unchanged; C8 never derives a `goalRef`. The C2 implementation registry
 * is the one trusted, non-canonical parameter (passed unchanged to C2 and
 * C7, and used to resolve model implementations).
 *
 * BINDING (downstream binding rule, CAT-INV-021): each part binds the
 * owner's canonical per-animal output — C1 snapshot fingerprint; C2 record
 * fingerprints; C3 timeline / medicine-ledger / withdrawal-gate
 * fingerprints; C4 contract + series fingerprints; C5 evaluation + animal
 * fingerprints; C6 snapshot / routing / target-applicability fingerprints; C7
 * animal-status fingerprints — never the raw inputs. C4 / C5 / C6 / C3 are
 * composed per animal, so another animal's evidence changes this animal's
 * context only through an owner output it consumes.
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import { animalInstantKey, deepFreezeAnimalValue, rematerialiseAnimalLedger, type AnimalLedger } from "../animal-ledger";
import { computeAnimalSnapshotFingerprint, projectAnimalSnapshot } from "../animal-snapshot";
import { projectProductionGoals, resolveGoalTargetApplicability, routeProductionGoals } from "../goals";
import { projectAnimalHealth, projectWithdrawalHardGates } from "../health";
import { compareStrings, sameFingerprint, type CattleHash } from "../integrity";
import { evaluatePerformance } from "../performance";
import { evaluateHealthProgrammes, projectProgrammeHardGates } from "../programmes";
import { canonicalObligationInstant, evaluateHerdObligations, projectObligationHardGates, toCanonicalPlainData, utcCalendarDateOf, type ObligationImplementationRegistry } from "../regulatory";
import type { SourceVersionRef } from "../source";
import { buildWeightReadContract } from "../weights";
import { admitCandidateActionRegistry, type CandidateActionRegistry, type RecommendationModelRef } from "./candidate-actions";
import { admitEconomicObservations, economicKeyEvidence, type EconomicObservation } from "./economic-context";
import { admitRecommendationModels, evaluateRecommendationModel, relevantModelCatalogue, type AdmittedModelCatalogue } from "./recommendation-models";
import { RULE_EVALUATION_RECORD, exact, type CarriedRuleEvaluation } from "./recommendation-exact";
import { CATTLE_RECOMMENDATION_PAYLOAD_VERSION, computeRecommendationFingerprint } from "./recommendation-integrity";
import {
  C1_SNAPSHOT_IDENTITY,
  C2_EVALUATION,
  C2_GATES,
  C3_PROJECTION,
  C4_CONTRACT,
  C5_EVALUATION,
  C6_PROJECTION,
  C6_ROUTING,
  C6_TARGET_APPLICABILITY,
  C7_EVALUATION,
  SOURCED_GATES,
  consume,
  isPlainObject,
  type ConsumedC7Evaluation,
} from "./recommendation-consumed";
import type {
  CattleEvaluationContext,
  GoalsPart,
  HealthPart,
  NotSupplied,
  ObligationsPart,
  PerformancePart,
  ProgrammesPart,
  RecommendationIssue,
  WeightsPart,
} from "./recommendation-contracts";

/** Trusted, non-canonical parameters (clarification 4: only the C2 implementation registry). */
export interface RecommendationTrustedInputs {
  /** C2 `createObligationImplementationRegistry` registry; required when C2 or C7 evidence is supplied, and the only source of model implementations. */
  obligationImplementations?: ObligationImplementationRegistry;
}

// ---------------------------------------------------------------------------
// Field-presence policy (R required, N nullable, A array)
// ---------------------------------------------------------------------------

type Presence = "R" | "N" | "A";
const FIELD_POLICY = {
  request: { query: "R", ledgers: "A", obligations: "N", health: "N", weights: "N", performance: "N", goals: "N", programmes: "N", economics: "R", models: "R", actions: "R" },
  query: { effectiveAt: "R", knowledgeCutoff: "R" },
  obligations: { catalogue: "R", obligationIds: "A", evidence: "A" },
  health: { foodProducts: "A", productRecords: "A", animals: "A" },
  healthAnimal: { animalId: "R", healthRecords: "A" },
  weights: { observations: "A" },
  performance: { targets: "A", policies: "A", contexts: "A", windowFrom: "N" },
  goals: { declarations: "A", routingRegistry: "R" },
  programmes: { definitions: "A", reviews: "A", completions: "A" },
} as const satisfies Record<string, Record<string, Presence>>;

/** Every listed field present and not `undefined`, no other field, `A` an array, `R` not `null`. */
export function conformsToRecommendationPolicy(value: unknown, type: keyof typeof FIELD_POLICY): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const rules: Record<string, Presence> = FIELD_POLICY[type];
  if (Object.keys(value).some((k) => !Object.hasOwn(rules, k))) return false;
  return Object.entries(rules).every(([k, p]) => Object.hasOwn(value, k) && value[k] !== undefined && (p === "A" ? Array.isArray(value[k]) : p === "R" ? value[k] !== null : true));
}

interface ReadRequest {
  effectiveAt: string;
  knowledgeCutoff: string;
  ledgers: unknown[];
  obligations: { catalogue: unknown; obligationIds: unknown[]; evidence: unknown[] } | null;
  health: { foodProducts: unknown[]; productRecords: unknown[]; animals: { animalId: string; healthRecords: unknown[] }[] } | null;
  weights: { observations: unknown[] } | null;
  performance: { targets: unknown[]; policies: unknown[]; contexts: unknown[]; windowFrom: unknown } | null;
  goals: { declarations: unknown[]; routingRegistry: unknown } | null;
  programmes: { definitions: unknown[]; reviews: unknown[]; completions: unknown[] } | null;
  economics: unknown;
  models: unknown;
  actions: unknown;
}

const issue = (code: string, ref: string | null = null): RecommendationIssue => ({ code, ref });

function readRequest(req: unknown): { ok: true; read: ReadRequest } | { ok: false; issues: RecommendationIssue[] } {
  const invalid = { ok: false as const, issues: [issue("CATTLE_RECOMMENDATION_INVALID_REQUEST")] };
  if (!conformsToRecommendationPolicy(req, "request") || !conformsToRecommendationPolicy(req.query, "query")) return invalid;
  const parts = ["obligations", "health", "weights", "performance", "goals", "programmes"] as const;
  for (const p of parts) if (req[p] !== null && !conformsToRecommendationPolicy(req[p], p)) return invalid;
  if (req.health !== null && !((req.health as Record<string, unknown[]>).animals.every((a) => conformsToRecommendationPolicy(a, "healthAnimal")))) return invalid;
  if (req.performance !== null && req.weights === null) return { ok: false, issues: [issue("CATTLE_RECOMMENDATION_PERFORMANCE_WITHOUT_WEIGHTS")] };
  const effectiveAt = canonicalObligationInstant(req.query.effectiveAt);
  const knowledgeCutoff = canonicalObligationInstant(req.query.knowledgeCutoff);
  const issues: RecommendationIssue[] = [];
  if (effectiveAt === null) issues.push(issue("CATTLE_RECOMMENDATION_INVALID_EFFECTIVE_AT"));
  if (knowledgeCutoff === null) issues.push(issue("CATTLE_RECOMMENDATION_INVALID_KNOWLEDGE_CUTOFF"));
  if (effectiveAt === null || knowledgeCutoff === null) return { ok: false, issues };
  return { ok: true, read: { ...(req as unknown as ReadRequest), effectiveAt, knowledgeCutoff } };
}

/** Runs a frozen predecessor engine; anything it cannot process fails closed (`null`). */
function failClosed<T>(run: () => T): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

const byDigest = (a: AssessmentFingerprint, b: AssessmentFingerprint) => compareStrings(a.digest, b.digest);

// ---------------------------------------------------------------------------
// Sealing (one viewpoint; CAT-INV-015)
// ---------------------------------------------------------------------------

/** The times a predecessor output echoes, checked against the context viewpoint at sealing. */
export interface PartEcho {
  part: string;
  effectiveAt: string;
  knowledgeCutoff: string;
}

export type UnsealedContext = Omit<CattleEvaluationContext, "fingerprint" | "recommendationPayloadVersion" | "evaluationDate">;

/**
 * Seals one animal's context: every part must have been projected at exactly
 * the context's `effectiveAt` and `knowledgeCutoff` (by instant) — otherwise
 * the context is rejected, never re-projected or defaulted. The sealed
 * context is deep-frozen and fingerprinted (`CATTLE_RECOMMENDATION_CONTEXT`).
 */
export function sealEvaluationContext(unsealed: UnsealedContext, echoes: readonly PartEcho[], hash: CattleHash): { ok: true; context: CattleEvaluationContext } | { ok: false; issues: RecommendationIssue[] } {
  const key = (t: string) => (canonicalObligationInstant(t) === null ? null : animalInstantKey(t));
  const e = key(unsealed.effectiveAt);
  const k = key(unsealed.knowledgeCutoff);
  const mismatched = echoes.filter((x) => e === null || k === null || key(x.effectiveAt) !== e || key(x.knowledgeCutoff) !== k).map((x) => x.part);
  if (e === null || k === null || mismatched.length > 0) {
    return { ok: false, issues: [...new Set(mismatched)].sort(compareStrings).map((p) => issue("CATTLE_RECOMMENDATION_CONTEXT_TIME_MISMATCH", `${unsealed.animalId}:${p}`)) };
  }
  const body = structuredClone({
    recommendationPayloadVersion: CATTLE_RECOMMENDATION_PAYLOAD_VERSION,
    ...unsealed,
    effectiveAt: canonicalObligationInstant(unsealed.effectiveAt) as string,
    knowledgeCutoff: canonicalObligationInstant(unsealed.knowledgeCutoff) as string,
    evaluationDate: utcCalendarDateOf(canonicalObligationInstant(unsealed.effectiveAt) as string),
  }) as Omit<CattleEvaluationContext, "fingerprint">;
  const context: CattleEvaluationContext = { ...body, fingerprint: computeRecommendationFingerprint("CATTLE_RECOMMENDATION_CONTEXT", body, hash) };
  return { ok: true, context: deepFreezeAnimalValue(context) };
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

interface AnimalBuild {
  animalId: string;
  ledger: AnimalLedger;
  snapshotFingerprint: AssessmentFingerprint;
  echoes: PartEcho[];
  obligations: ObligationsPart | NotSupplied;
  health: HealthPart | NotSupplied;
  weights: WeightsPart | NotSupplied;
  performance: PerformancePart | NotSupplied;
  goals: GoalsPart | NotSupplied;
  programmes: ProgrammesPart | NotSupplied;
}

const NOT_SUPPLIED: NotSupplied = { state: "NOT_SUPPLIED" };

/**
 * The CARRIED copy of a hard-gate projection's records: each record validated
 * against the exact C0 `RuleEvaluationRecord` contract and projected
 * (`recommendation-exact.ts`); `null` when any record is malformed — the part
 * then fails closed. No raw predecessor object enters the sealed context.
 */
function gatesOf(raw: readonly unknown[]): CarriedRuleEvaluation[] | null {
  const out: CarriedRuleEvaluation[] = [];
  for (const r of raw) {
    const copy = exact(RULE_EVALUATION_RECORD, r);
    if (copy === null) return null;
    out.push(copy);
  }
  return out;
}

/** C8-owned inputs shared by every animal: the admitted registry, the referenced models and the economic resolutions they need. */
interface OwnedInputs {
  actions: CandidateActionRegistry;
  models: AdmittedModelCatalogue;
  observations: EconomicObservation[];
  valueKeys: string[];
}

function readOwned(read: ReadRequest): { ok: true; owned: OwnedInputs } | { ok: false; issues: RecommendationIssue[] } {
  const issues: RecommendationIssue[] = [];
  const registry = admitCandidateActionRegistry(read.actions, read.knowledgeCutoff);
  const models = admitRecommendationModels(read.models, read.knowledgeCutoff);
  const economics = admitEconomicObservations(read.economics, read.knowledgeCutoff);
  if (!registry.ok) issues.push(...registry.issues);
  if (!models.ok) issues.push(...models.issues);
  if (!economics.ok) issues.push(...economics.issues);
  if (!registry.ok || !models.ok || !economics.ok) return { ok: false, issues };
  const refs: RecommendationModelRef[] = registry.registry.definitions.flatMap((d) => [d.effectModelRef, d.economicModelRef].filter((r): r is RecommendationModelRef => r !== null));
  const relevant = relevantModelCatalogue(models.catalogue, refs);
  const valueKeys = relevant.records.flatMap((m) => (m.role === "ECONOMIC" && m.value !== null ? [...m.value.benefitKeys, ...m.value.costKeys] : []));
  return { ok: true, owned: { actions: registry.registry, models: relevant, observations: economics.observations, valueKeys } };
}

/** C1 → C2 → C3 → C4 → C5 → C6 → C7, each through its frozen engine. */
function composeAnimals(read: ReadRequest, trusted: RecommendationTrustedInputs, hash: CattleHash): { ok: true; animals: AnimalBuild[] } | { ok: false; issues: RecommendationIssue[] } {
  const issues: RecommendationIssue[] = [];
  const animals = new Map<string, AnimalBuild>();
  const times = { effectiveAt: read.effectiveAt, knowledgeCutoff: read.knowledgeCutoff };
  const echo = (a: AnimalBuild, part: string, x: { effectiveAt: string; knowledgeCutoff: string }) => a.echoes.push({ part, effectiveAt: x.effectiveAt, knowledgeCutoff: x.knowledgeCutoff });

  // C1 — rematerialise and project each ledger.
  for (const raw of read.ledgers) {
    const ledger = failClosed(() => rematerialiseAnimalLedger(raw));
    const rawId = isPlainObject(raw) && typeof raw.animalId === "string" ? raw.animalId : null;
    if (ledger === null || !ledger.ok) {
      issues.push(issue("CATTLE_RECOMMENDATION_INVALID_LEDGER", rawId));
      continue;
    }
    const animalId = ledger.ledger.animalId as string;
    if (animals.has(animalId)) {
      issues.push(issue("CATTLE_RECOMMENDATION_DUPLICATE_ANIMAL", animalId));
      continue;
    }
    const projected = failClosed(() => projectAnimalSnapshot(ledger.ledger, times));
    const identity = projected !== null && projected.ok ? consume(C1_SNAPSHOT_IDENTITY, projected.snapshot) : null;
    if (projected === null || !projected.ok || identity === null || identity.animalId !== animalId) {
      issues.push(issue("CATTLE_RECOMMENDATION_INVALID_LEDGER", animalId));
      continue;
    }
    const build: AnimalBuild = {
      animalId,
      ledger: ledger.ledger,
      snapshotFingerprint: computeAnimalSnapshotFingerprint(projected.snapshot, hash),
      echoes: [],
      obligations: NOT_SUPPLIED,
      health: NOT_SUPPLIED,
      weights: NOT_SUPPLIED,
      performance: NOT_SUPPLIED,
      goals: NOT_SUPPLIED,
      programmes: NOT_SUPPLIED,
    };
    echo(build, "C1_SNAPSHOT", identity);
    animals.set(animalId, build);
  }
  if (issues.length > 0) return { ok: false, issues };
  const builds = [...animals.values()].sort((a, b) => compareStrings(a.animalId, b.animalId));
  if (read.obligations !== null && trusted.obligationImplementations === undefined) return { ok: false, issues: [issue("CATTLE_RECOMMENDATION_OBLIGATION_IMPLEMENTATIONS_MISSING")] };

  // C2 — one herd evaluation over every evaluated ledger; gates per animal.
  const obligations = read.obligations;
  if (obligations !== null) {
    const query = { ...times, obligationIds: obligations.obligationIds as string[] };
    const herd = failClosed(() =>
      evaluateHerdObligations({ ledgers: builds.map((b) => b.ledger), evidence: obligations.evidence, catalogue: obligations.catalogue as never, implementations: trusted.obligationImplementations as ObligationImplementationRegistry, query }, hash),
    );
    if (herd === null || !herd.ok || herd.herd.issues.length > 0 || herd.herd.catalogueIssues.length > 0) {
      issues.push(issue("CATTLE_RECOMMENDATION_OBLIGATION_EVIDENCE_INVALID"));
    } else {
      for (const raw of herd.herd.animals) {
        const e = consume(C2_EVALUATION, raw);
        const build = e === null ? undefined : animals.get(e.animalId);
        const projection = e === null ? null : failClosed(() => projectObligationHardGates(raw, hash));
        const gates = projection !== null && projection.ok ? consume(C2_GATES, projection.projection) : null;
        const carried = projection !== null && projection.ok ? gatesOf(projection.projection.ruleEvaluations) : null;
        if (e === null || build === undefined || gates === null || carried === null || projection === null || !projection.ok || gates.animalId !== e.animalId || !sameFingerprint(e.snapshotFingerprint, build.snapshotFingerprint)) {
          issues.push(issue("CATTLE_RECOMMENDATION_OBLIGATION_EVIDENCE_INVALID", e?.animalId ?? null));
          continue;
        }
        echo(build, "C2_EVALUATION", e);
        echo(build, "C2_GATES", gates);
        for (const r of e.results) echo(build, "C2_RECORD", r);
        build.obligations = {
          state: "SUPPLIED",
          recordFingerprints: e.results.map((r) => r.fingerprint).sort(byDigest),
          records: e.results.map((r) => ({ obligationId: r.obligationId, occurrenceId: r.occurrence?.occurrenceId ?? null, state: r.state })),
          gates: carried,
        };
      }
      for (const b of builds) if (b.obligations.state !== "SUPPLIED") issues.push(issue("CATTLE_RECOMMENDATION_OBLIGATION_EVIDENCE_INVALID", b.animalId));
    }
  }

  // C3 — one projection per listed animal over its canonical health records.
  const health = read.health;
  if (health !== null) {
    const seen = new Set<string>();
    for (const entry of health.animals) {
      const build = animals.get(entry.animalId);
      if (build === undefined) {
        issues.push(issue("CATTLE_RECOMMENDATION_HEALTH_EVIDENCE_UNKNOWN_ANIMAL", entry.animalId));
        continue;
      }
      if (seen.has(entry.animalId)) {
        issues.push(issue("CATTLE_RECOMMENDATION_HEALTH_EVIDENCE_DUPLICATE_ANIMAL", entry.animalId));
        continue;
      }
      seen.add(entry.animalId);
      const query = { ...times, foodProducts: health.foodProducts as string[] };
      const result = failClosed(() => projectAnimalHealth({ ledger: build.ledger, healthRecords: entry.healthRecords, productRecords: health.productRecords, query }, hash));
      const projection = result !== null && result.ok ? result.projection : null;
      const p = projection === null ? null : consume(C3_PROJECTION, projection);
      const raw = projection === null ? null : failClosed(() => projectWithdrawalHardGates(projection, hash));
      const gates = raw !== null && raw.ok ? consume(SOURCED_GATES, raw.gates) : null;
      const carried = raw !== null && raw.ok ? gatesOf(raw.gates.ruleEvaluations) : null;
      if (p === null || raw === null || !raw.ok || gates === null || carried === null || p.animalId !== entry.animalId || !sameFingerprint(p.snapshotFingerprint, build.snapshotFingerprint)) {
        issues.push(issue("CATTLE_RECOMMENDATION_HEALTH_EVIDENCE_INVALID", entry.animalId));
        continue;
      }
      echo(build, "C3_PROJECTION", p);
      build.health = {
        state: "SUPPLIED",
        timelineFingerprint: p.timeline.fingerprint,
        medicineLedgerFingerprint: p.medicineLedger.fingerprint,
        withdrawalGateFingerprint: p.withdrawalGate.fingerprint,
        withdrawal: p.withdrawalGate.entries.map((x) => ({ foodProduct: x.foodProduct, state: x.state })),
        gates: carried,
        sourceRefs: structuredClone(gates.sourceRefs) as SourceVersionRef[],
      };
    }
  }

  // C4 → C5 → C6 — per animal.
  for (const build of builds) {
    let performanceEvaluation: unknown = null;
    if (read.weights !== null) {
      const contract = failClosed(() => buildWeightReadContract({ observations: read.weights!.observations, scope: { kind: "EXPLICIT_SET", animalIds: [build.animalId] }, query: times }, hash));
      const c = contract !== null && contract.ok ? consume(C4_CONTRACT, contract.contract) : null;
      const series = c === null ? undefined : c.series.find((s) => s.animalId === build.animalId);
      if (contract === null || !contract.ok || c === null || series === undefined || c.series.length !== 1) {
        issues.push(issue("CATTLE_RECOMMENDATION_WEIGHT_EVIDENCE_INVALID", build.animalId));
        continue;
      }
      echo(build, "C4_CONTRACT", c);
      echo(build, "C4_SERIES", series);
      build.weights = { state: "SUPPLIED", contractFingerprint: c.fingerprint, seriesFingerprint: series.fingerprint, latest: { state: series.latest.state, observedAt: series.latest.observedAt } };
      const performance = read.performance;
      if (performance !== null) {
        const windowFrom = performance.windowFrom as string | null;
        const result = failClosed(() =>
          evaluatePerformance({ weights: contract.contract, query: { ...times, windowFrom, projectionAt: null }, targets: performance.targets, policies: performance.policies, contexts: performance.contexts }, hash),
        );
        const pe = result !== null && result.ok ? consume(C5_EVALUATION, result.evaluation) : null;
        const animal = pe === null ? undefined : pe.animals.find((a) => a.animalId === build.animalId);
        if (result === null || !result.ok || pe === null || animal === undefined) {
          issues.push(issue("CATTLE_RECOMMENDATION_PERFORMANCE_EVIDENCE_INVALID", build.animalId));
          continue;
        }
        echo(build, "C5_EVALUATION", pe);
        performanceEvaluation = result.evaluation;
        build.performance = { state: "SUPPLIED", evaluationFingerprint: pe.fingerprint, animalFingerprint: animal.fingerprint };
      }
    }
    const goals = read.goals;
    if (goals !== null) {
      const query = { subject: { kind: "ANIMAL", animalId: build.animalId }, ...times } as never;
      const projected = failClosed(() => projectProductionGoals({ declarations: goals.declarations, query }, hash));
      const routed = failClosed(() => routeProductionGoals({ declarations: goals.declarations, query, registry: goals.routingRegistry as never }, hash));
      const applied = performanceEvaluation === null ? null : failClosed(() => resolveGoalTargetApplicability({ declarations: goals.declarations, query, performance: performanceEvaluation as never }, hash));
      const g = projected !== null && projected.ok ? consume(C6_PROJECTION, projected.projection) : null;
      const r = routed !== null && routed.ok ? consume(C6_ROUTING, routed.routing) : null;
      const t = applied !== null && applied.ok ? consume(C6_TARGET_APPLICABILITY, applied.applicability) : null;
      const subjectOk = g !== null && g.snapshot.subject.kind === "ANIMAL" && (g.snapshot.subject as { animalId: string }).animalId === build.animalId;
      if (g === null || r === null || !subjectOk || (performanceEvaluation !== null && (t === null || t.animalId !== build.animalId))) {
        issues.push(issue("CATTLE_RECOMMENDATION_GOAL_EVIDENCE_INVALID", build.animalId));
        continue;
      }
      echo(build, "C6_PROJECTION", g);
      echo(build, "C6_SNAPSHOT", g.snapshot);
      echo(build, "C6_ROUTING", r);
      if (t !== null) echo(build, "C6_TARGET_APPLICABILITY", t);
      build.goals = {
        state: "SUPPLIED",
        status: g.status,
        activeGoalTypes: [...new Set(g.activeGoals.map((x) => x.declaration.goalType as string))].sort(compareStrings),
        snapshot: g.snapshot,
        routingState: r.state,
        routingFingerprint: r.fingerprint,
        targetApplicabilityFingerprint: t === null ? null : t.fingerprint,
      };
    }
  }

  // C7 — one evaluation over the request's canonical C7 / C3 / C2 evidence; gates per animal.
  const programmes = read.programmes;
  if (programmes !== null && issues.length === 0) {
    const request = { ...programmes, ledgers: read.ledgers, health: read.health, obligations: read.obligations, query: times };
    const result = failClosed(() => evaluateHealthProgrammes(request as never, hash, { obligationImplementations: trusted.obligationImplementations }));
    const ev = result !== null && result.ok ? consume(C7_EVALUATION, result.evaluation) : null;
    if (result === null || !result.ok || ev === null) {
      issues.push(issue("CATTLE_RECOMMENDATION_PROGRAMME_EVIDENCE_INVALID"));
    } else {
      for (const build of builds) {
        const raw = failClosed(() => projectProgrammeHardGates(result.evaluation, build.animalId, hash));
        const gates = raw !== null && raw.ok ? consume(SOURCED_GATES, raw.gates) : null;
        const carried = raw !== null && raw.ok ? gatesOf(raw.gates.ruleEvaluations) : null;
        if (raw === null || !raw.ok || gates === null || carried === null || !ev.animalIds.includes(build.animalId)) {
          issues.push(issue("CATTLE_RECOMMENDATION_PROGRAMME_EVIDENCE_INVALID", build.animalId));
          continue;
        }
        echo(build, "C7_EVALUATION", ev);
        build.programmes = programmesPart(ev, build.animalId, carried, structuredClone(gates.sourceRefs) as SourceVersionRef[]);
      }
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, animals: builds };
}

function programmesPart(ev: ConsumedC7Evaluation, animalId: string, gates: CarriedRuleEvaluation[], sourceRefs: SourceVersionRef[]): ProgrammesPart {
  const statuses = ev.programmes.flatMap((p) => p.animals.filter((a) => a.animalId === animalId).map((a) => ({ programme: p, status: a })));
  return {
    state: "SUPPLIED",
    animalStatusFingerprints: statuses.map((s) => s.status.fingerprint).sort(byDigest),
    occurrences: statuses
      .flatMap(({ programme, status }) =>
        status.records.map((r) => ({ programmeId: programme.programmeId, classification: programme.classification, actionId: r.actionId, actionKind: r.actionKind, occurrenceId: r.occurrence?.occurrenceId ?? null, state: r.state })),
      )
      .sort((a, b) => compareStrings(JSON.stringify([a.programmeId, a.actionId, a.occurrenceId, a.state]), JSON.stringify([b.programmeId, b.actionId, b.occurrenceId, b.state]))),
    gates,
    sourceRefs,
  };
}

/**
 * Builds one sealed context per animal from a canonical request. The whole
 * request is checked with `toCanonicalPlainData` first (CAT-INV-001); only
 * the detached copy is read (CAT-INV-002).
 */
export function buildEvaluationContexts(
  request: unknown,
  hash: CattleHash,
  trusted: RecommendationTrustedInputs = {},
): { ok: true; effectiveAt: string; knowledgeCutoff: string; contexts: CattleEvaluationContext[] } | { ok: false; issues: RecommendationIssue[] } {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return { ok: false, issues: [issue("CATTLE_RECOMMENDATION_NON_CANONICAL_INPUT", canonical.path)] };
  const read = readRequest(canonical.value);
  if (!read.ok) return read;
  const owned = readOwned(read.read);
  if (!owned.ok) return owned;
  const composed = composeAnimals(read.read, trusted, hash);
  if (!composed.ok) return composed;
  const { effectiveAt, knowledgeCutoff } = read.read;
  // The canonical economic evidence: each relevant key's complete closure and its resolution (admission has already
  // rejected every invalid supersession link, so a key that cannot be resolved here fails closed).
  const economics = economicKeyEvidence(owned.owned.observations, owned.owned.valueKeys, effectiveAt, knowledgeCutoff);
  if (economics === null) return { ok: false, issues: [issue("CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_SUPERSESSION_INVALID")] };
  // Models take no animal input: each referenced model is evaluated once, through C0, at the context's evaluation date.
  const evaluationDate = utcCalendarDateOf(effectiveAt);
  const modelEvaluations = owned.owned.models.records.map((m) => ({
    modelId: m.modelId,
    version: m.version,
    evaluation: evaluateRecommendationModel({ modelId: m.modelId, version: m.version }, m.role, owned.owned.models, trusted.obligationImplementations, evaluationDate, hash),
  }));
  const contexts: CattleEvaluationContext[] = [];
  const issues: RecommendationIssue[] = [];
  for (const b of composed.animals) {
    const sealed = sealEvaluationContext(
      {
        animalId: b.animalId,
        effectiveAt,
        knowledgeCutoff,
        animal: { snapshotFingerprint: b.snapshotFingerprint },
        obligations: b.obligations,
        health: b.health,
        weights: b.weights,
        performance: b.performance,
        goals: b.goals,
        programmes: b.programmes,
        actions: owned.owned.actions,
        models: owned.owned.models,
        modelEvaluations,
        economics,
      },
      b.echoes,
      hash,
    );
    if (sealed.ok) contexts.push(sealed.context);
    else issues.push(...sealed.issues);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, effectiveAt, knowledgeCutoff, contexts };
}
