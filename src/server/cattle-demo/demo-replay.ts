/**
 * Cattle C10 — the demonstration replay (server-only). Builds the canonical
 * C1–C7 inputs of the demonstration herd plus the demo-session actions and
 * runs them through the FROZEN public engines only:
 *
 *   C1 projectAnimalSnapshot · C4 resolveGroupScope / buildWeightReadContract
 *   C5 evaluatePerformance · C6 projectProductionGoals · C3 projectAnimalHealth
 *   C8 recommendCattle · C9 planCattleWork · Plan createPlanJob / reevaluatePlanJob
 *
 * Time: the base viewpoint is fixture-supplied (`DEMO_BASE_VIEWPOINT`); the
 * k-th session action happens at the base + (k + 1) × 10 minutes, and the
 * viewpoint after it is that instant (valid time = knowledge time). No clock
 * is read. Plan jobs are created from the C9 proposals of the base run and
 * reconciled with every later run (`reconcileJobs`: origin kept, current
 * blockers and priority refreshed from the matching proposal, then the frozen
 * Plan kernel decides completion, readiness and status); proposals of a later
 * run whose identity no open job holds become new jobs at that run.
 *
 * The replay holds no state: the same session always gives the same result.
 */

import "server-only";

import type { AnimalLedger } from "@/domain/cattle/animal-ledger";
import { projectAnimalSnapshot, type AnimalSnapshot } from "@/domain/cattle/animal-snapshot";
import { projectProductionGoals, type GoalProjection } from "@/domain/cattle/goals";
import { projectAnimalHealth, type AnimalHealthProjection } from "@/domain/cattle/health";
import { evaluatePerformance, type PerformanceEvaluation } from "@/domain/cattle/performance";
import { planCattleWork, type CattlePlanIssue, type CattlePlanResult } from "@/domain/cattle/plan-interface";
import { recommendCattle, type CattleRecommendationResult, type RecommendationIssue } from "@/domain/cattle/recommendations";
import { buildWeightReadContract, resolveGroupScope, type ScopeResolution, type WeightReadContract } from "@/domain/cattle/weights";
import { reconcileJobs, type CattleJobState } from "@/server/cattle-plan/plan-jobs";
export { jobOrigin, reconcileJobs } from "@/server/cattle-plan/plan-jobs";
import type { CattleDemoEvent, CattleDemoSession } from "@/components/cattle/session/demo-session";
import { DEMO_ACTION_REGISTRY, DEMO_BASE_VIEWPOINT, DEMO_TRUSTED, hash } from "./demo-catalogue";
import { DEMO_ANIMALS, GROUP_FINISHERS, GROUP_STORES, animalIdOf, demoHerdRecords, demoStaticRequestParts, goalDeclaration, goalIdOf, weightRecord, type DemoHerdRecords } from "./demo-herd";

type Rec = Record<string, unknown>;

export interface DemoViewpoint {
  effectiveAt: string;
  knowledgeCutoff: string;
}

/** A demonstration scenario selectable in local demonstration mode only. */
export type CattleDemoScenario = "STANDARD" | "PLANNING_RUN_FAILURE" | "EMPTY_HERD";

/** A retained Plan job of the replay (shared shape — `@/server/cattle-plan/plan-jobs`). */
export type DemoJobState = CattleJobState;

export interface DemoEngineOutputs {
  viewpoint: DemoViewpoint;
  ledgers: AnimalLedger[];
  snapshots: Record<string, AnimalSnapshot | null>;
  groups: { groupRef: string; scope: ScopeResolution | null }[];
  weights: WeightReadContract | null;
  performance: PerformanceEvaluation | null;
  goals: Record<string, GoalProjection | null>;
  health: Record<string, AnimalHealthProjection | null>;
  recommendations: { ok: true; result: CattleRecommendationResult } | { ok: false; issues: RecommendationIssue[] };
  plan: { ok: true; result: CattlePlanResult } | { ok: false; issues: CattlePlanIssue[] };
  jobs: DemoJobState[];
  /** Session actions applied, with their instants (for the activity timeline). */
  applied: { event: CattleDemoEvent; at: string; observedAt: string | null }[];
}

const MINUTE = 60_000;

export function sessionInstant(index: number): string {
  return new Date(Date.parse(DEMO_BASE_VIEWPOINT) + (index + 1) * 10 * MINUTE).toISOString().replace(".000Z", "Z");
}

const tagExists = (tag: string) => DEMO_ANIMALS.some((a) => a.tag === tag);

interface Inputs {
  records: DemoHerdRecords;
  weights: Rec[];
  goals: Rec[];
}

/** Apply session events 0..upto-1 to the base records (pure; returns new arrays). */
function inputsAfter(base: DemoHerdRecords, events: readonly CattleDemoEvent[], upto: number, applied: DemoEngineOutputs["applied"]): Inputs {
  const weights = [...base.weights];
  const goals = [...base.goals];
  for (let i = 0; i < upto; i++) {
    const e = events[i];
    const at = sessionInstant(i);
    if (!tagExists(e.tag)) continue;
    const animalId = animalIdOf(e.tag);
    if (e.kind === "RECORD_WEIGHT") {
      const observedAt = e.observedDate === null ? at : `${e.observedDate}T12:00:00Z`;
      weights.push(weightRecord(`SYNTH-W-SESSION-${e.eventId}`, animalId, observedAt, e.kg, at, "SCALE"));
      if (applied.length < upto) applied.push({ event: e, at, observedAt });
    } else {
      const goalId = goalIdOf(e.tag);
      const prior = goals.filter((g) => g.goalId === goalId).map((g) => String(g.version));
      const version = `v${prior.length + 1}`;
      // A correction of every earlier version (the plan replaces the declared goal); a first declaration otherwise.
      goals.push(
        goalDeclaration({ goalId, version, supersedes: prior.sort(), animalId, type: e.goalType, targetKg: e.targetKg, targetDate: e.targetDate, validFrom: prior.length > 0 ? "2026-05-01T00:00:00Z" : at, receivedAt: at }),
      );
      if (applied.length < upto) applied.push({ event: e, at, observedAt: null });
    }
  }
  return { records: base, weights, goals };
}

function cattleRequest(inputs: Inputs, viewpoint: DemoViewpoint, scenario: CattleDemoScenario): Rec {
  const parts = demoStaticRequestParts(inputs.records);
  const weights = scenario === "PLANNING_RUN_FAILURE" ? [...inputs.weights, { recordId: "SYNTH-W-MALFORMED", animalId: animalIdOf("1427"), observedAt: "not-an-instant" }] : inputs.weights;
  return {
    query: { effectiveAt: viewpoint.effectiveAt, knowledgeCutoff: viewpoint.knowledgeCutoff },
    ledgers: inputs.records.ledgers,
    obligations: parts.obligations,
    health: parts.health,
    weights: { observations: weights },
    performance: parts.performance,
    goals: { declarations: inputs.goals, routingRegistry: parts.goalRouting },
    programmes: parts.programmes,
    economics: { observations: [] },
    models: { records: [], reviews: [], sources: [] },
    actions: DEMO_ACTION_REGISTRY,
  };
}

function planRun(inputs: Inputs, viewpoint: DemoViewpoint, scenario: CattleDemoScenario, groupScopes: { groupRef: string }[]) {
  const request = structuredClone({ cattle: cattleRequest(inputs, viewpoint, scenario), groupScopes });
  return planCattleWork(request, hash, DEMO_TRUSTED);
}


function emptyHerd(base: DemoHerdRecords): DemoHerdRecords {
  return { ...base, ledgers: [], weights: [], goals: [], health: [], obligationEvidence: [], programmeAnimals: [], programmeCompletions: [] };
}

/**
 * Replays the base herd and the session; returns the frozen engine outputs at
 * the final viewpoint plus the Plan jobs as the kernel left them.
 */
export interface ReplayOptions {
  scenario?: CattleDemoScenario;
  /** C5 `projectionAt` (strictly after the final viewpoint), or `null`. */
  projectionAt?: string | null;
  /** Restrict the run to these animals (per-animal views); `null` = the whole herd with its group scopes. */
  animalIds?: string[] | null;
}

/** A pure memo of replay results (same input ⇒ same output); bounded, process-local, never persisted. */
const MEMO = new Map<string, DemoEngineOutputs>();
const MEMO_LIMIT = 48;

export function replayCattleDemo(session: CattleDemoSession, options: ReplayOptions = {}): DemoEngineOutputs {
  const key = JSON.stringify([session, options.scenario ?? "STANDARD", options.projectionAt ?? null, options.animalIds ?? null]);
  const hit = MEMO.get(key);
  if (hit) return hit;
  const result = replayUncached(session, options.scenario ?? "STANDARD", options.projectionAt ?? null, options.animalIds ?? null);
  MEMO.set(key, result);
  if (MEMO.size > MEMO_LIMIT) MEMO.delete(MEMO.keys().next().value as string);
  return result;
}

function restrict(records: DemoHerdRecords, animalIds: string[] | null): DemoHerdRecords {
  if (animalIds === null) return records;
  const keep = new Set(animalIds);
  return {
    ledgers: records.ledgers.filter((l) => keep.has(l.animalId)),
    weights: records.weights.filter((w) => keep.has(String(w.animalId))),
    goals: records.goals.filter((g) => keep.has(String((g.subject as Rec).animalId))),
    health: records.health.filter((h) => keep.has(h.animalId)),
    obligationEvidence: records.obligationEvidence.filter((o) => keep.has(String(o.animalId))),
    programmeAnimals: records.programmeAnimals,
    programmeCompletions: records.programmeCompletions.filter((c) => keep.has(String(c.animalId))),
  };
}

function replayUncached(session: CattleDemoSession, scenario: CattleDemoScenario, projectionAt: string | null, animalIds: string[] | null): DemoEngineOutputs {
  const base = restrict(scenario === "EMPTY_HERD" ? emptyHerd(demoHerdRecords()) : demoHerdRecords(), animalIds);
  const groupScopes = animalIds === null ? [{ groupRef: GROUP_FINISHERS }, { groupRef: GROUP_STORES }] : [];
  const events = session.events;
  const applied: DemoEngineOutputs["applied"] = [];

  // Plan jobs across viewpoints.
  const baseViewpoint = { effectiveAt: DEMO_BASE_VIEWPOINT, knowledgeCutoff: DEMO_BASE_VIEWPOINT };
  let jobs: DemoJobState[] = [];
  const advance = (run: ReturnType<typeof planRun>, viewpoint: DemoViewpoint, inputs: Inputs) => {
    // The C8 records of THIS run, computed only if a new job needs one (the request C9 consumed, unchanged).
    let c8: ReturnType<typeof recommendCattle> | null = null;
    const c8Run = () => (c8 ??= recommendCattle(structuredClone(cattleRequest(inputs, viewpoint, scenario)), hash, DEMO_TRUSTED));
    jobs = reconcileJobs(jobs, run.ok ? { ok: true, result: run.result } : { ok: false }, viewpoint.effectiveAt, c8Run);
  };

  const baseInputs = inputsAfter(base, events, 0, []);
  let plan = planRun(baseInputs, baseViewpoint, scenario, groupScopes);
  advance(plan, baseViewpoint, baseInputs);
  for (let i = 0; i < events.length; i++) {
    const at = sessionInstant(i);
    const vp = { effectiveAt: at, knowledgeCutoff: at };
    const runInputs = inputsAfter(base, events, i + 1, []);
    plan = planRun(runInputs, vp, scenario, groupScopes);
    advance(plan, vp, runInputs);
  }

  // The final viewpoint is the last run's: its C9 result is reused, not recomputed.
  const viewpoint = events.length === 0 ? baseViewpoint : { effectiveAt: sessionInstant(events.length - 1), knowledgeCutoff: sessionInstant(events.length - 1) };
  const inputs = inputsAfter(base, events, events.length, applied);
  const request = cattleRequest(inputs, viewpoint, scenario);
  const recommendations = recommendCattle(structuredClone(request), hash, DEMO_TRUSTED);

  const ledgers = inputs.records.ledgers;
  const snapshots: DemoEngineOutputs["snapshots"] = {};
  const goals: DemoEngineOutputs["goals"] = {};
  const health: DemoEngineOutputs["health"] = {};
  const parts = demoStaticRequestParts(inputs.records);
  for (const ledger of ledgers) {
    const id = ledger.animalId;
    const s = projectAnimalSnapshot(ledger, viewpoint);
    snapshots[id] = s.ok ? s.snapshot : null;
    const g = projectProductionGoals({ declarations: structuredClone(inputs.goals), query: { subject: { kind: "ANIMAL", animalId: id }, effectiveAt: viewpoint.effectiveAt, knowledgeCutoff: viewpoint.knowledgeCutoff } } as never, hash);
    goals[id] = g.ok ? g.projection : null;
    const records = parts.health.animals.find((a) => a.animalId === id)?.healthRecords ?? [];
    const h = projectAnimalHealth(structuredClone({ ledger, healthRecords: records, productRecords: parts.health.productRecords, query: { effectiveAt: viewpoint.effectiveAt, knowledgeCutoff: viewpoint.knowledgeCutoff, foodProducts: parts.health.foodProducts } }) as never, hash);
    health[id] = h.ok ? h.projection : null;
  }

  const groups = groupScopes.map(({ groupRef }) => {
    const s = resolveGroupScope({ scope: { kind: "GROUP", groupRef, ledgers }, query: viewpoint }, hash);
    return { groupRef, scope: s.ok ? s.scope : null };
  });

  const inScope = ledgers.map((l) => l.animalId as string).sort();
  const observations = (request.weights as { observations: Rec[] }).observations;
  const contract = buildWeightReadContract(structuredClone({ observations, scope: { kind: "EXPLICIT_SET", animalIds: inScope }, query: viewpoint }) as never, hash);
  let performance: PerformanceEvaluation | null = null;
  if (contract.ok) {
    const query: Rec = { ...viewpoint, windowFrom: null };
    if (projectionAt !== null) query.projectionAt = projectionAt;
    const p = evaluatePerformance(structuredClone({ weights: contract.contract, query, targets: parts.performance.targets, policies: parts.performance.policies, contexts: [] }) as never, hash);
    performance = p.ok ? p.evaluation : null;
  }

  return {
    viewpoint,
    ledgers,
    snapshots,
    groups,
    weights: contract.ok ? contract.contract : null,
    performance,
    goals,
    health,
    recommendations,
    plan,
    jobs,
    applied,
  };
}

/** The final viewpoint and the C4 / C5 inputs after the whole session (no engine run). */
export function sessionInputs(session: CattleDemoSession, scenario: CattleDemoScenario, animalIds: string[] | null) {
  const base = restrict(scenario === "EMPTY_HERD" ? emptyHerd(demoHerdRecords()) : demoHerdRecords(), animalIds);
  const events = session.events;
  const viewpoint = events.length === 0 ? { effectiveAt: DEMO_BASE_VIEWPOINT, knowledgeCutoff: DEMO_BASE_VIEWPOINT } : { effectiveAt: sessionInstant(events.length - 1), knowledgeCutoff: sessionInstant(events.length - 1) };
  const inputs = inputsAfter(base, events, events.length, []);
  const request = cattleRequest(inputs, viewpoint, scenario);
  const parts = demoStaticRequestParts(inputs.records);
  return { viewpoint, observations: (request.weights as { observations: Rec[] }).observations, targets: parts.performance.targets, policies: parts.performance.policies };
}
