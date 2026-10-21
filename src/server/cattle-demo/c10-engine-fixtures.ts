/**
 * Cattle C10 — test support (imported by tests only): the demonstration
 * herd's real frozen-engine outputs for one animal, with one owner input
 * replaced and the owner re-run — never a hand-built view-model. Used by the
 * presentation-boundary tests to reach a C10 state through C1 / C4 / C5 the
 * way a real record would (an estimated or pound-unit weight, a HOLDING /
 * EXTERNAL / OTHER location).
 */

import { createAnimalLedger, type AnimalLocationKind } from "@/domain/cattle/animal-ledger";
import { projectAnimalSnapshot } from "@/domain/cattle/animal-snapshot";
import { evaluatePerformance } from "@/domain/cattle/performance";
import { buildWeightReadContract } from "@/domain/cattle/weights";
import type { CattleOutputs } from "@/domain/cattle/presentation";
import type { CattleDemoSession } from "@/components/cattle/session/demo-session";
import { hash } from "./demo-catalogue";
import { animalIdOf, weightRecord } from "./demo-herd";
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
