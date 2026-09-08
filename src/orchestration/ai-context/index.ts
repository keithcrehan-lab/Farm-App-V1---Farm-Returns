/**
 * Farm Return Next — Checkpoint 1.5 (Intelligence & Extensibility
 * Architecture). The farm-scoped read boundary a future AI assistant
 * would call — the architectural anchor for `MASTER_SPEC.md`'s eventual
 * "inbuilt AI assistant that can safely answer questions from farm data
 * and Farm Return's scientific engines".
 *
 * **No LLM is connected here. No prompt is constructed here. This module
 * does not know an AI assistant exists** — it is a plain, deterministic
 * read model, exactly the shape `src/orchestration/act/index.ts`/
 * `src/orchestration/job-session/index.ts` already use ("calls existing
 * `src/lib/farm-data/*` functions, never duplicates them" —
 * `ARCHITECTURE.md`'s reuse boundary). A future AI tool calls
 * `getFarmContextForCurrentUser` the same way any other server code would
 * — through the ordinary authenticated-session boundary, never with a
 * caller-supplied farm id (see below).
 *
 * ## The read/write boundary (checkpoint brief items 12/13)
 *
 * This module is READ ONLY, by construction: every export here returns
 * data, none of them accept a mutation. A future AI **tool** that reads
 * farm state should call something shaped like this module.
 * A future AI **action** that changes farm state (plan a job, record a
 * weight, move an activity) must go through the ordinary application/
 * domain commands this app already has — `src/orchestration/act/index.ts`,
 * `src/orchestration/job-session/index.ts`'s own functions, the real
 * `src/app/actions/*.ts` server actions — never a direct database write
 * invented for AI's own convenience. The scientific/domain engines
 * (`src/domain/*.ts`) remain the sole authority for agronomy, compliance,
 * financial, and livestock calculations; an AI surfaces and explains their
 * output, it never computes a competing figure. None of this is enforced
 * by code in this checkpoint (there is no AI caller yet to enforce it
 * against) — it is a documented invariant for whichever future code adds
 * one, restated here because this is the one module that future code will
 * actually import.
 *
 * ## Farm scoping (non-negotiable invariant)
 *
 * `getFarmContextForCurrentUser` takes no farm id parameter at all — it
 * always resolves the current authenticated session's own farm via
 * `getFarmForCurrentUser()`, the same function every other real server
 * action in this app already calls to establish "which farm". There is no
 * code path here that can be asked for a different farm's context.
 * `buildFarmContext` (the pure assembly function) additionally re-checks
 * every supplied item's own `farmId` against the requested one and drops
 * anything that doesn't match, rather than trusting that whatever
 * fetched the inputs already scoped them correctly — defence in depth,
 * not the only protection (the real protection is the same farm-scoped
 * `.eq("farm_id", farmId)` query every `src/lib/farm-data/*.ts` function
 * this module calls already performs).
 */
import "server-only";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listIndividualAnimalsForFarm } from "@/lib/farm-data/individual-animals";
import type { Farm, Field, IndividualAnimal, LivestockGroup } from "@/domain/types";

export interface FarmContextFieldSummary {
  id: string;
  name: string;
  areaHa: number;
  plannedUse?: string;
}

export interface FarmContextAnimalGroupSummary {
  id: string;
  label: string;
  category: string;
  count: number;
}

/**
 * A bounded, farm-scoped snapshot — deliberately not "the database". Only
 * the fields a future assistant genuinely needs for an overview are
 * included; deeper detail (a single field's full fertility history, one
 * animal's full weight trend) belongs in a future, more specific read
 * function called only once a real question needs it, not dumped into
 * every context fetch. Weather-derived state and scientific results
 * (nutrient plans, spreading suitability, ...) are a documented future
 * extension point (checkpoint brief item 11's own list) — genuinely not
 * included yet, not silently omitted: see `individualAnimalCount` and the
 * absence of any `nutrientPlans`/`weather` field for what this snapshot
 * does not yet cover.
 */
export interface FarmContext {
  farmId: string;
  /** When this snapshot was assembled (ISO datetime) — a future AI answer
   * built from this context should disclose this, the same "when was
   * this true" discipline every other Farm Return figure already carries. */
  generatedAt: string;
  farm: {
    name: string;
    county: string;
    enterprises: string[];
  };
  fields: FarmContextFieldSummary[];
  animalGroups: FarmContextAnimalGroupSummary[];
  /** Individual-animal detail is optional per-farm (`IndividualAnimal`'s
   * own doc comment) — a count, not the full list, keeps this snapshot
   * bounded regardless of how many a farm has recorded. */
  individualAnimalCount: number;
}

export interface FarmContextInputs {
  farm: Farm;
  fields: Field[];
  livestockGroups: LivestockGroup[];
  individualAnimals: IndividualAnimal[];
}

/**
 * Pure assembly — no I/O, fully deterministic, trivially testable with no
 * database. `farmId` is the single authority for what belongs in the
 * result; every input collection is filtered against it rather than
 * trusted outright (see this module's own header comment on why).
 */
export function buildFarmContext(farmId: string, inputs: FarmContextInputs, generatedAt: string = new Date().toISOString()): FarmContext {
  if (inputs.farm.id !== farmId) {
    throw new Error(`buildFarmContext: farm mismatch — requested ${farmId}, got farm ${inputs.farm.id}`);
  }

  const fields = inputs.fields.filter((f) => f.farmId === farmId);
  const livestockGroups = inputs.livestockGroups.filter((g) => g.farmId === farmId);
  const individualAnimals = inputs.individualAnimals.filter((a) => a.farmId === farmId);

  return {
    farmId,
    generatedAt,
    farm: {
      name: inputs.farm.name,
      county: inputs.farm.location.county,
      enterprises: inputs.farm.primaryEnterprises,
    },
    fields: fields.map((f) => ({
      id: f.id,
      name: f.name,
      areaHa: f.areaHa,
      ...(f.plannedUse ? { plannedUse: f.plannedUse.value } : {}),
    })),
    animalGroups: livestockGroups.map((g) => ({
      id: g.id,
      label: g.label,
      category: g.category,
      count: g.count.value,
    })),
    individualAnimalCount: individualAnimals.length,
  };
}

/**
 * The one real, callable entry point — resolves the current authenticated
 * user's own farm and assembles its context from the same real,
 * already-farm-scoped `src/lib/farm-data/*.ts` functions every other
 * server action in this app already calls. Returns `null` only when there
 * is genuinely no farm for the current session (mirrors every other
 * `requireCurrentFarm`-style caller's own "no real farm" case) — never a
 * fabricated empty context.
 */
export async function getFarmContextForCurrentUser(): Promise<FarmContext | null> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return null;

  const [fields, livestockGroups, individualAnimals] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listIndividualAnimalsForFarm(farm.id),
  ]);

  return buildFarmContext(farm.id, { farm, fields, livestockGroups, individualAnimals });
}
