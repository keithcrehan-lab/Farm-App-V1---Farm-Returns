/**
 * Pilot Integration P1 — the real (signed-in) cattle evaluation: the farm's
 * own rows (`cattle-source.ts`) → the pure translation (`real-records.ts`) →
 * the FROZEN C1 / C4 / C5 / C8 / C9 / Plan exports at ONE viewpoint → the
 * existing C10 view builders. Read-only: nothing is written.
 *
 * What Farm Return holds no real record of (health, obligations, programmes,
 * performance targets and policies, goals, costs, mart prices) is NOT
 * SUPPLIED (`DECISIONS.md` D8): `null` in the C8/C9 request, no per-animal C3
 * or C6 run, costs UNAVAILABLE. The engines report their own unknown states;
 * nothing is filled in. This module never imports the demonstration modules
 * (architecture test) and has no fallback to them.
 */

import "server-only";

import { createHash } from "node:crypto";
import { createAnimalLedger, type AnimalLedger } from "@/domain/cattle/animal-ledger";
import { projectAnimalSnapshot } from "@/domain/cattle/animal-snapshot";
import { evaluatePerformance } from "@/domain/cattle/performance";
import { planCattleWork } from "@/domain/cattle/plan-interface";
import { DEFAULT_CANDIDATE_ACTION_REGISTRY, recommendCattle } from "@/domain/cattle/recommendations";
import { buildWeightReadContract, resolveGroupScope } from "@/domain/cattle/weights";
import {
  animalRow,
  buildAnimalProfile,
  buildHerd,
  details,
  MEMBERSHIP_DISPLAY,
  type AnimalProfileVM,
  type AnimalRowVM,
  type CattleOutputs,
  type CattleViewpoint,
  type Details,
  type HerdVM,
} from "@/domain/cattle/presentation";
import { readCattleSourceForCurrentFarm } from "@/lib/farm-data/cattle-source";
import { reconcileJobs } from "@/server/cattle-plan/plan-jobs";
import { realCattleRecords, type RealCattleRecords, type RealRecordsInput } from "./real-records";
import { irelandCalendarDate } from "./record-weight";

type Rec = Record<string, unknown>;

/** sha256 hex — the frozen engines' injected `CattleHash` (never the test-support one). */
export const realHash = (input: string): string => createHash("sha256").update(input, "utf8").digest("hex");

/** D5: the request instant, whole seconds, valid time = knowledge time. */
export function requestViewpoint(now: Date): CattleViewpoint {
  const at = `${now.toISOString().slice(0, 19)}Z`;
  return { effectiveAt: at, knowledgeCutoff: at };
}

/** Real-mode explanations of the parts Farm Return keeps no record of (screen copy decided here, not in components). */
export const REAL_NOTES = {
  readOnly: "Your farm's own records. You can record an animal's weight here; add animals on Livestock.",
  method: "Weights from Livestock don't record how they were taken, so each shows its method as not recorded.",
  health: "Health and medicine records aren't kept in Farm Return yet, so withdrawal and treatment status are unknown here.",
  costs: "Animal costs aren't kept in Farm Return yet, so this animal's costs are unknown — not €0.",
  goal: "Production goals can't be set in Farm Return yet, so this animal's goal is unknown here.",
  plan: "The animal plan needs mart prices and animal costs, which Farm Return doesn't hold for your farm yet, so it isn't available.",
  work: "Work is worked out from your current records each time you open this page; jobs aren't saved yet.",
} as const;

/** Real-mode unavailable screens (copy decided here; `CattleUnavailable` only renders it). */
export const REAL_UNAVAILABLE = {
  NO_FARM: { title: "No farm is set up for this account yet.", detail: "Finish setting up your farm, then add your cattle on Livestock." },
  UNAVAILABLE: {
    title: "Your cattle records couldn't be read just now.",
    detail: "Nothing is shown in their place: no example animals, estimates or figures. Try again shortly.",
  },
  PLAN: { title: "The animal plan isn't available for your farm yet.", detail: REAL_NOTES.plan },
} as const;

export interface RealUnreadableAnimal {
  animalId: string;
  label: string;
}

/** What the real herd shows beyond the C10 herd view-model: nothing is dropped, nothing reads as "0 animals". */
export interface RealHerdExtras {
  notes: { readOnly: string; method: string; work: string };
  /** Animals with no group recorded (C10 rows, never placed in a made-up group). */
  ungrouped: Details<AnimalRowVM>;
  /** Groups with no individually recorded (or no readable) animal: a headcount or a reason, never "0 animals". */
  headcountGroups: Details<{ groupRef: string; name: string; summary: string }>;
  /** Groups whose Livestock headcount differs from the animals recorded individually. */
  headcountNotes: Details<{ groupRef: string; text: string }>;
  /** Animal records the frozen ledger refused (shown, never dropped). */
  unreadable: Details<RealUnreadableAnimal>;
}

export interface RealHerdView {
  herd: HerdVM;
  extras: RealHerdExtras;
}

/** The real Record Weight sheet's words (P2): no method is asked for or claimed (D12). */
export const REAL_RECORD_WEIGHT_COPY = {
  label: "Weight",
  methodLine: "How it was weighed isn't recorded in Farm Return yet, so it's saved with the method not recorded.",
  earlierNote: "A weight for an earlier day goes into the history at that date.",
  footer: "Saved to your farm's records; the cattle engine then recalculates this animal from them.",
} as const;

export interface RealAnimalView {
  profile: AnimalProfileVM;
  notes: typeof REAL_NOTES;
  recordWeight: {
    /** The farmer's calendar date (Ireland) at the view's viewpoint: "Now" records this date; no later date is accepted. */
    today: string;
    copy: typeof REAL_RECORD_WEIGHT_COPY;
  };
}

export interface RealEvaluation {
  outputs: CattleOutputs;
  records: RealCattleRecords;
  /** Animals whose C1 ledger was refused, with their recorded tag (or `null`). */
  unreadable: { animalId: string; tag: string | null }[];
}

/** One single-viewpoint run of the frozen engines over the farm's records. Pure (no store, no clock). */
export function evaluateRealCattle(input: RealRecordsInput, viewpoint: CattleViewpoint): { ok: true; evaluation: RealEvaluation } | { ok: false; reason: string } {
  const translated = realCattleRecords(input);
  if (!translated.ok) return { ok: false, reason: translated.reason };
  const records = translated.records;

  const ledgers: AnimalLedger[] = [];
  const unreadable: RealEvaluation["unreadable"] = [];
  for (const a of records.assertions) {
    const r = createAnimalLedger(a.animalId, a.inputs);
    if (r.ok) ledgers.push(r.ledger);
    else unreadable.push({ animalId: a.animalId, tag: input.animals.find((x) => x.id === a.animalId)?.tag_number ?? null });
  }
  const inLedgers = new Set(ledgers.map((l) => l.animalId as string));
  // A refused animal's weights stay out of the run with it (it is listed as unreadable, never evaluated half-way).
  const observations = records.weights.filter((w) => inLedgers.has(String(w.animalId)));
  // D11: a null `group_id` is a recorded "not assigned to a group", which C1 can't express (no assertion = unknown).
  // Group scopes are therefore resolved over the animals that HAVE a recorded group — an ungrouped animal is listed
  // as ungrouped, never as an unresolved member of every group.
  const grouped = ledgers.filter((l) => l.assertions.some((x) => x.kind === "MANAGEMENT_GROUP"));
  const groupScopes = records.scopedGroupRefs.filter((g) => grouped.some((l) => l.assertions.some((x) => x.kind === "MANAGEMENT_GROUP" && x.value === g))).map((groupRef) => ({ groupRef }));

  const request: Rec = {
    query: { effectiveAt: viewpoint.effectiveAt, knowledgeCutoff: viewpoint.knowledgeCutoff },
    ledgers,
    obligations: null,
    health: null,
    weights: { observations },
    performance: null,
    goals: null,
    programmes: null,
    economics: { observations: [] },
    models: { records: [], reviews: [], sources: [] },
    actions: DEFAULT_CANDIDATE_ACTION_REGISTRY,
  };
  const recommendations = recommendCattle(structuredClone(request), realHash);
  // No group-level work is planned in P1 (every real proposal is per animal), so C9 is given no group scopes (D11).
  const plan = planCattleWork(structuredClone({ cattle: request, groupScopes: [] }), realHash);
  const jobs = reconcileJobs([], plan.ok ? { ok: true, result: plan.result } : { ok: false }, viewpoint.effectiveAt, () => recommendations);

  const snapshots: CattleOutputs["snapshots"] = {};
  const goals: CattleOutputs["goals"] = {};
  const health: CattleOutputs["health"] = {};
  for (const l of ledgers) {
    const s = projectAnimalSnapshot(l, viewpoint);
    snapshots[l.animalId] = s.ok ? s.snapshot : null;
    goals[l.animalId] = null; // D8: no goal store — not run, never "no goal"
    health[l.animalId] = null; // D8: no health store — not run, never "no treatments"
  }
  const groups = groupScopes.map(({ groupRef }) => {
    const s = resolveGroupScope({ scope: { kind: "GROUP", groupRef, ledgers: grouped }, query: viewpoint }, realHash);
    return { groupRef, scope: s.ok ? s.scope : null };
  });
  const contract = buildWeightReadContract(structuredClone({ observations, scope: { kind: "EXPLICIT_SET", animalIds: [...inLedgers].sort() }, query: viewpoint }) as never, realHash);
  let performance: CattleOutputs["performance"] = null;
  if (contract.ok) {
    // No targets or trend policies are held for a real farm: C5 reports gain and history, and no comparison.
    const p = evaluatePerformance(structuredClone({ weights: contract.contract, query: { ...viewpoint, windowFrom: null }, targets: [], policies: [], contexts: [] }) as never, realHash);
    performance = p.ok ? p.evaluation : null;
  }

  return {
    ok: true,
    evaluation: {
      outputs: { viewpoint, ledgers, snapshots, groups, weights: contract.ok ? contract.contract : null, performance, goals, health, recommendations, plan, jobs },
      records,
      unreadable,
    },
  };
}

const NOT_SUPPLIED_COSTS = { state: "UNAVAILABLE", reason: "NOT_KEPT_IN_FARM_RETURN" } as const;

export function realHerdView(e: RealEvaluation): RealHerdView {
  const { outputs, records } = e;
  const herd = buildHerd(outputs, records.directory);
  const inLedgers = new Set(outputs.ledgers.map((l) => l.animalId as string));
  const ungrouped = records.ungroupedAnimalIds.filter((id) => inLedgers.has(id)).map((id) => animalRow(outputs, id, records.directory, MEMBERSHIP_DISPLAY.UNKNOWN));
  const evaluated = new Set(outputs.groups.map((g) => g.groupRef));
  // A group whose every animal record was refused is listed with that reason (its animals are in `unreadable`).
  const unreadableGroups = records.scopedGroupRefs.filter((g) => !evaluated.has(g)).map((groupRef) => ({ groupRef, name: records.directory.groupLabels[groupRef] ?? "Unnamed group", summary: "Animal records can't be read" }));
  return {
    herd,
    extras: {
      notes: { readOnly: REAL_NOTES.readOnly, method: REAL_NOTES.method, work: REAL_NOTES.work },
      ungrouped: details(ungrouped),
      headcountGroups: details([
        ...records.headcountGroups.map((g) => ({
          groupRef: g.groupRef,
          name: g.name,
          summary: g.headcount === null ? "Individual animals not recorded · headcount can't be read" : `${g.headcount} head on Livestock · individual animals not recorded`,
        })),
        ...unreadableGroups,
      ]),
      headcountNotes: details(Object.entries(records.headcountNotes).map(([groupRef, text]) => ({ groupRef, text }))),
      unreadable: details(e.unreadable.map((u) => ({ animalId: u.animalId, label: `${u.tag ?? "Untagged animal"}: record can't be read` }))),
    },
  };
}

/** The farm's group ids a group route may open (evaluated groups and groups without individual records). */
export function realGroupRefs(e: RealEvaluation): Set<string> {
  return new Set([...e.records.scopedGroupRefs, ...e.records.headcountGroups.map((g) => g.groupRef)]);
}

/** `null`: the id is not one of this farm's readable animals (never says whether it exists elsewhere). */
export function realAnimalView(e: RealEvaluation, animalId: string): RealAnimalView | null {
  if (!e.outputs.ledgers.some((l) => l.animalId === animalId)) return null;
  return {
    profile: buildAnimalProfile(e.outputs, animalId, e.records.directory, NOT_SUPPLIED_COSTS),
    notes: REAL_NOTES,
    recordWeight: { today: irelandCalendarDate(new Date(e.outputs.viewpoint.effectiveAt)), copy: REAL_RECORD_WEIGHT_COPY },
  };
}

export type RealCattleLoad = { state: "OK"; evaluation: RealEvaluation } | { state: "NO_FARM" } | { state: "UNAVAILABLE" };

/**
 * The route entry point: the farm is resolved server-side from the signed-in user inside the source read — no
 * caller can name a farm. Any read or evaluation failure is UNAVAILABLE (never the demonstration herd).
 */
export async function loadRealCattle(now: Date = new Date()): Promise<RealCattleLoad> {
  const source = await readCattleSourceForCurrentFarm();
  if (source.state === "NO_FARM") return { state: "NO_FARM" };
  if (source.state !== "OK") return { state: "UNAVAILABLE" };
  try {
    const r = evaluateRealCattle(source.records, requestViewpoint(now));
    if (!r.ok) {
      console.error("[cattle-real] records refused:", r.reason);
      return { state: "UNAVAILABLE" };
    }
    return { state: "OK", evaluation: r.evaluation };
  } catch (err) {
    console.error("[cattle-real] evaluation failed:", err);
    return { state: "UNAVAILABLE" };
  }
}
