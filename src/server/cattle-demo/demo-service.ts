/**
 * Cattle C10 — the demonstration service (server-only): replays the
 * demonstration herd + session through the frozen engines and returns
 * detached view-models. Callers must check `isCattleDemoMode()` first; in
 * real-account mode nothing here runs.
 */

import "server-only";

import { buildWeightReadContract } from "@/domain/cattle/weights";
import { evaluatePerformance } from "@/domain/cattle/performance";
import { buildAnimalProfile, buildHerd, type AnimalProfileVM, type CattleDirectory, type HerdVM } from "@/domain/cattle/presentation";
import { ageInMonths } from "@/domain/cattle/presentation";
import { summariseAnimalCosts, utcDateOfInstant, valueAnimalAtMart, type AnimalCostRead, type AnimalPlanAssumptions, type MartRef, type MartValuation } from "@/domain/animal-plan";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { CattleDemoSession } from "@/components/cattle/session/demo-session";
import { DEMO_FOOD_PRODUCT, DEMO_OBLIGATION_ID, DEMO_PRODUCT_ID, DEMO_PROGRAMME_ID, hash } from "./demo-catalogue";
import { DEMO_COST_ENTRIES, DEMO_DEFAULT_MART, DEMO_MART_PROVIDER, DEMO_MART_STALE_AFTER_DAYS, demoDefaultAssumptions } from "./demo-economics";
import { DEMO_ANIMALS, DEMO_GROUP_LABELS, DEMO_LOCATION_LABELS, DEMO_TAG_SCHEME, animalIdOf } from "./demo-herd";
import { replayCattleDemo, sessionInputs, type CattleDemoScenario, type DemoEngineOutputs } from "./demo-replay";

/** Real accounts never see the demonstration herd (AGENTS.md: no mock figure to a real account). */
export function isCattleDemoMode(): boolean {
  return !isSupabaseConfigured();
}

export const DEMO_DIRECTORY: CattleDirectory = {
  tagScheme: DEMO_TAG_SCHEME,
  groupLabels: DEMO_GROUP_LABELS,
  locationLabels: DEMO_LOCATION_LABELS,
  programmeLabels: { [DEMO_PROGRAMME_ID]: "Booster (demonstration programme)" },
  obligationLabels: { [DEMO_OBLIGATION_ID]: "Birth registration (synthetic requirement)" },
  foodProductLabels: { [DEMO_FOOD_PRODUCT]: "Meat" },
  productLabels: { [DEMO_PRODUCT_ID]: "Synthetic wormer (demonstration product)" },
};

export const DEMO_TAGS: readonly string[] = DEMO_ANIMALS.map((a) => a.tag);

export function demoHerdView(session: CattleDemoSession, scenario: CattleDemoScenario = "STANDARD"): HerdVM {
  return buildHerd(replayCattleDemo(session, { scenario }), DEMO_DIRECTORY);
}

function costsFor(outputs: DemoEngineOutputs, animalId: string): AnimalCostRead {
  const date = utcDateOfInstant(outputs.viewpoint.effectiveAt);
  return date === null ? { state: "UNAVAILABLE", reason: "VALUATION_DATE_UNREADABLE" } : summariseAnimalCosts(DEMO_COST_ENTRIES, animalId, date);
}

export interface AnimalPlanBaseVM {
  asOfDate: string;
  currentWeightKg: number | null;
  /** OBSERVED housing now (C1 location): `null` = unknown — never read as outdoors (the plan asks for an assumption). */
  currentlyHoused: boolean | null;
  defaults: AnimalPlanAssumptions;
  /** The planned sale date is the declared goal's target date when one exists. */
  saleDateSource: "GOAL" | "DEFAULT";
  costs: AnimalCostRead;
  marts: MartRef[];
  defaultMartId: string;
  /** One valuation per mart, all from the fixture provider. */
  valuations: Record<string, MartValuation>;
}

export interface DemoAnimalView {
  profile: AnimalProfileVM;
  plan: AnimalPlanBaseVM;
}

export function demoAnimalView(session: CattleDemoSession, tag: string, scenario: CattleDemoScenario = "STANDARD"): DemoAnimalView | null {
  const spec = DEMO_ANIMALS.find((a) => a.tag === tag);
  if (!spec) return null;
  const animalId = animalIdOf(tag);
  const first = replayCattleDemo(session, { scenario, animalIds: [animalId] });
  // Project to the declared goal's target date (C5 `projectionAt`) when it is still ahead.
  const goalDecl = first.goals[animalId]?.status === "ACTIVE" ? first.goals[animalId]?.activeGoals[0]?.declaration ?? null : null;
  const firstDate = utcDateOfInstant(first.viewpoint.effectiveAt) ?? "";
  const projectionAt = goalDecl?.targetDate && goalDecl.targetDate > firstDate ? `${goalDecl.targetDate}T12:00:00Z` : null;
  const outputs = projectionAt === null ? first : replayCattleDemo(session, { scenario, animalIds: [animalId], projectionAt });
  const costs = costsFor(outputs, animalId);
  const profile = buildAnimalProfile(outputs, animalId, DEMO_DIRECTORY, costs);
  const asOfDate = utcDateOfInstant(outputs.viewpoint.effectiveAt) ?? "";
  const snap = outputs.snapshots[animalId];
  const sex = snap?.sex.state === "KNOWN" ? snap.sex.value : null;
  const months = snap?.dateOfBirth.state === "KNOWN" && snap.dateOfBirth.value ? ageInMonths(snap.dateOfBirth.value, outputs.viewpoint.effectiveAt) : null;
  const marts = DEMO_MART_PROVIDER.listMarts();
  const valuations: Record<string, MartValuation> = {};
  for (const m of marts) {
    const request = { animalId, martId: m.martId, liveweightKg: profile.weight.kg, sex, breedLabel: profile.identity.breed.value, ageMonths: months, asOfDate };
    // Without the C1 snapshot the animal's details are unknown (not "not recorded"): no comparable is looked up.
    const comparable = snap ? DEMO_MART_PROVIDER.findComparable(request) : ({ state: "UNAVAILABLE", provider: DEMO_MART_PROVIDER.describe(), reason: "ANIMAL_RECORD_UNAVAILABLE" } as const);
    valuations[m.martId] = valueAnimalAtMart(comparable, request, DEMO_MART_STALE_AFTER_DAYS);
  }
  const housed = profile.identity.location.housed;
  const goalDate = profile.goal.targetDate;
  const fallbackSale = "2026-12-04";
  return {
    profile,
    plan: {
      asOfDate,
      currentWeightKg: profile.weight.kg,
      currentlyHoused: housed,
      defaults: demoDefaultAssumptions(goalDate && goalDate > asOfDate ? goalDate : fallbackSale, housed),
      saleDateSource: goalDate && goalDate > asOfDate ? "GOAL" : "DEFAULT",
      costs,
      marts,
      defaultMartId: DEMO_DEFAULT_MART,
      valuations,
    },
  };
}

export type DemoProjection =
  | { state: "PROJECTED"; saleDate: string; kg: number; adgKgPerDay: number; fromObservedAt: string; assumptions: string[] }
  | { state: "NOT_PROJECTED"; saleDate: string; reason: string };

/**
 * The C5 straight-line PREDICTION of one animal's weight at the sale date
 * (C4 read contract + C5 `evaluatePerformance` with `projectionAt`). Only
 * C4 / C5 run: nothing here models feed response.
 */
export function demoProjection(session: CattleDemoSession, tag: string, saleDate: string, scenario: CattleDemoScenario = "STANDARD"): DemoProjection {
  if (!DEMO_ANIMALS.some((a) => a.tag === tag)) return { state: "NOT_PROJECTED", saleDate, reason: "UNKNOWN_ANIMAL" };
  const animalId = animalIdOf(tag);
  const { viewpoint, observations, targets, policies } = sessionInputs(session, scenario, [animalId]);
  const projectionAt = `${saleDate}T12:00:00Z`;
  const contract = buildWeightReadContract(structuredClone({ observations, scope: { kind: "EXPLICIT_SET", animalIds: [animalId] }, query: viewpoint }) as never, hash);
  if (!contract.ok) return { state: "NOT_PROJECTED", saleDate, reason: "WEIGHTS_INVALID" };
  const result = evaluatePerformance(structuredClone({ weights: contract.contract, query: { ...viewpoint, windowFrom: null, projectionAt }, targets, policies, contexts: [] }) as never, hash);
  if (!result.ok) return { state: "NOT_PROJECTED", saleDate, reason: result.issues.some((i) => i.code === "CATTLE_PERFORMANCE_INVALID_PROJECTION_AT") ? "SALE_DATE_NOT_AFTER_TODAY" : "PERFORMANCE_INVALID" };
  const p = result.evaluation.animals[0]?.prediction ?? null;
  if (p === null || p.state !== "PROJECTED" || p.projectedKg === null || p.adgKgPerDay === null || p.fromObservedAt === null) return { state: "NOT_PROJECTED", saleDate, reason: p?.reasonState ?? "NO_PREDICTION" };
  return { state: "PROJECTED", saleDate, kg: p.projectedKg, adgKgPerDay: p.adgKgPerDay, fromObservedAt: p.fromObservedAt, assumptions: p.assumptions };
}
