/**
 * Cattle C10 — test support (imported by tests only): the demonstration
 * herd's real frozen-engine outputs for one animal, with one owner input
 * replaced and the owner re-run — never a hand-built view-model. Used by the
 * presentation-boundary tests to reach a C10 state through C1 / C4 / C5 the
 * way a real record would (an estimated or pound-unit weight, a HOLDING /
 * EXTERNAL / OTHER location).
 */

import { createAnimalLedger, type AnimalLocationKind } from "@/domain/cattle/animal-ledger";
import { projectProductionGoals } from "@/domain/cattle/goals";
import { projectAnimalSnapshot } from "@/domain/cattle/animal-snapshot";
import { evaluatePerformance } from "@/domain/cattle/performance";
import { buildWeightReadContract } from "@/domain/cattle/weights";
import type { CattleOutputs } from "@/domain/cattle/presentation";
import type { CattleDemoSession } from "@/components/cattle/session/demo-session";
import { hash } from "./demo-catalogue";
import { animalIdOf, goalDeclaration, goalIdOf, weightRecord } from "./demo-herd";
import { replayCattleDemo, sessionInputs } from "./demo-replay";

type Rec = Record<string, unknown>;
const EMPTY: CattleDemoSession = { version: 1, events: [] };

/** A C4 weight record for `tag` (canonical input shape), any unit / collection method. */
export function weightObs(n: number, tag: string, observedAt: string, value: number, o: { unit?: "KILOGRAM" | "POUND"; method?: string } = {}): Rec {
  const r = weightRecord(`SYNTH-W-FIXTURE-${tag}-${n}`, animalIdOf(tag), observedAt, value, observedAt, o.method ?? "SCALE");
  return { ...r, weight: { value, unit: o.unit ?? "KILOGRAM" } };
}

const animalOutputs = (tag: string) => structuredClone(replayCattleDemo(EMPTY, { animalIds: [animalIdOf(tag)] })) as CattleOutputs;

/** The animal's outputs with C4 and C5 re-run over exactly `records` (the frozen engines, the demo's own targets and policies). */
export function outputsWithWeights(tag: string, records: Rec[]): CattleOutputs {
  const animalId = animalIdOf(tag);
  const o = animalOutputs(tag);
  const { viewpoint, targets, policies } = sessionInputs(EMPTY, "STANDARD", [animalId]);
  const c = buildWeightReadContract(structuredClone({ observations: records, scope: { kind: "EXPLICIT_SET", animalIds: [animalId] }, query: viewpoint }) as never, hash);
  if (!c.ok) throw new Error(`C4 rejected the fixture: ${JSON.stringify(c.issues)}`);
  const p = evaluatePerformance(structuredClone({ weights: c.contract, query: { ...viewpoint, windowFrom: null }, targets, policies, contexts: [] }) as never, hash);
  if (!p.ok) throw new Error(`C5 rejected the fixture: ${JSON.stringify(p.issues)}`);
  o.weights = c.contract;
  o.performance = p.evaluation;
  return o;
}

/**
 * The animal's outputs with C5 re-run over its own demo weights against exactly `targets` (the frozen engine:
 * several target ids give several comparisons, two live versions of one id an EVIDENCE_CONFLICT).
 */
export function outputsWithTargets(tag: string, targets: Rec[]): CattleOutputs {
  const animalId = animalIdOf(tag);
  const o = animalOutputs(tag);
  const { viewpoint, observations, policies } = sessionInputs(EMPTY, "STANDARD", [animalId]);
  const c = buildWeightReadContract(structuredClone({ observations, scope: { kind: "EXPLICIT_SET", animalIds: [animalId] }, query: viewpoint }) as never, hash);
  if (!c.ok) throw new Error(`C4 rejected the fixture: ${JSON.stringify(c.issues)}`);
  const p = evaluatePerformance(structuredClone({ weights: c.contract, query: { ...viewpoint, windowFrom: null }, targets, policies, contexts: [] }) as never, hash);
  if (!p.ok) throw new Error(`C5 rejected the fixture: ${JSON.stringify(p.issues)}`);
  o.weights = c.contract;
  o.performance = p.evaluation;
  return o;
}

/**
 * The animal's outputs with its C1 ledger rebuilt (`createAnimalLedger`) and re-projected
 * (`projectAnimalSnapshot`) with the location assertion at `kind` (`null` = no location assertion).
 */
export function outputsWithLocation(tag: string, kind: AnimalLocationKind | null): CattleOutputs {
  const animalId = animalIdOf(tag);
  const o = animalOutputs(tag);
  const ledger = o.ledgers.find((l) => l.animalId === animalId);
  if (!ledger) throw new Error(tag);
  const others = ledger.assertions.filter((a) => a.kind !== "LOCATION").map((a) => structuredClone(a) as unknown as Rec);
  const location: Rec[] =
    kind === null
      ? []
      : [{ assertionId: `${animalId}-fixture-location`, animalId, kind: "LOCATION", value: { kind, ref: `SYNTH-FIXTURE-${kind}` }, validFrom: "2026-05-01T00:00:00Z", validTo: null, provenance: { sourceCategory: "FARMER", receivedAt: "2026-05-01T00:00:00Z" } }];
  const rebuilt = createAnimalLedger(animalId, [...others, ...location]);
  if (!rebuilt.ok) throw new Error(`C1 rejected the fixture: ${JSON.stringify(rebuilt.issues)}`);
  const s = projectAnimalSnapshot(rebuilt.ledger, o.viewpoint);
  if (!s.ok) throw new Error(`C1 snapshot failed: ${JSON.stringify(s.issues)}`);
  o.ledgers = o.ledgers.map((l) => (l.animalId === animalId ? rebuilt.ledger : l));
  o.snapshots[animalId] = s.snapshot;
  return o;
}

/**
 * The animal's outputs with its C6 goal re-projected (`projectProductionGoals`) from exactly one
 * declaration: `targetWeight` as recorded (any unit — a POUND target has no C6 kg conversion), or none.
 */
export type FixtureGoal = { type: string; targetWeight: { value: number; unit: "KILOGRAM" | "POUND" } | null; targetDate: string | null };

export function outputsWithGoal(tag: string, goal: FixtureGoal): CattleOutputs {
  return outputsWithGoals(tag, [goal]);
}

/**
 * The animal's C6 projection re-run over these declarations only (each its own goal, all valid from
 * 1 May): one goal, several goals in force, or C6's own INTENT_CONFLICT (SALE with RETAIN).
 */
export function outputsWithGoals(tag: string, goals: readonly FixtureGoal[]): CattleOutputs {
  const animalId = animalIdOf(tag);
  return outputsWithGoalRecords(
    tag,
    goals.map((goal, i) => ({
      ...goalDeclaration({ goalId: i === 0 ? goalIdOf(tag) : `${goalIdOf(tag)}-${i + 1}`, version: "1", supersedes: [], animalId, type: goal.type, targetKg: null, targetDate: goal.targetDate, validFrom: "2026-05-01T00:00:00Z", receivedAt: "2026-05-01T00:00:00Z" }),
      targetWeight: goal.targetWeight,
    })),
  );
}

/** The animal's C6 projection re-run over exactly these goal records (versions, endings, withdrawals as recorded). */
export function outputsWithGoalRecords(tag: string, declarations: readonly Rec[]): CattleOutputs {
  const animalId = animalIdOf(tag);
  const o = animalOutputs(tag);
  const g = projectProductionGoals(structuredClone({ declarations, query: { subject: { kind: "ANIMAL", animalId }, effectiveAt: o.viewpoint.effectiveAt, knowledgeCutoff: o.viewpoint.knowledgeCutoff } }) as never, hash);
  if (!g.ok) throw new Error(`C6 rejected the fixture: ${JSON.stringify(g.issues)}`);
  o.goals[animalId] = g.projection;
  return o;
}
