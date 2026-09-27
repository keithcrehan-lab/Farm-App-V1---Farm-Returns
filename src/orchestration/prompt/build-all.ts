/**
 * Runs every real, shipped Prompt producer against a real farm's real
 * `Field[]` — shared by Today (`app/(app)/today/page.tsx`) and Plan
 * (`app/(app)/plan/page.tsx`) so both screens compute the identical real
 * Prompt set from the identical real inputs, rather than one screen's
 * own copy silently drifting from the other's (`CLAUDE.md`'s reuse rule
 * applied to this checkpoint's own new orchestration code, not just
 * pre-existing modules).
 *
 * Not itself a calculation — each producer already is one (see their own
 * doc comments); this only fans a real field list out across all four.
 * A producer that can't apply to a given field (e.g. no `commonageStatus`
 * recorded) returns its own honest `BLOCKED_INSUFFICIENT_EVIDENCE`
 * Prompt rather than being filtered out here — a farmer seeing "no data
 * yet" for a field is itself real, disclosed information (§6: "If
 * required data is absent, fail closed: ask, defer or explain").
 */
import { promptForSpreadingWindow } from "./spreading-window";
import { promptForSoilTestAge } from "./soil-test-age";
import { promptForCommonageStatus } from "./commonage-status";
import { promptForLocalBufferOverride } from "./local-buffer-override";
import { promptForFertiliserRecommendation } from "./fertiliser-recommendation";
import { farmGrasslandAggregates, resolveFieldSlurryAllocation } from "@/domain/nutrients";
import { currentSlurryCompositionByHousing, type SlurryComposition } from "@/domain/slurry-composition";
import type { Prompt } from "./index";
import type { Farm, Field, LivestockGroup, SlurryAllocation } from "@/domain/types";
import { activeFields } from "@/domain/types";
import { resolveFieldSlurryCompositionInput } from "@/domain/slurry-evidence-context";

/**
 * The real farm-wide grassland-area/non-grass-% aggregation
 * `promptForFertiliserRecommendation` (via `calculateNutrientPlan`)
 * needs. Extracted as its own function (rather than left inline in
 * `buildAllRealPrompts`) so `recompute.ts`'s server-side re-derivation
 * of a single field's `fertiliser_recommendation` Prompt, and
 * `NutrientsPageClient.tsx`'s own client-side display, can all call the
 * exact same real aggregation — never independently-drifting copies of
 * it (Codex audit HIGH, round 5: this function's first version and
 * `NutrientsPageClient.tsx`'s own separate inline copy both made the
 * identical real mistake below; `NutrientsPageClient.tsx` now calls this
 * function directly instead of keeping its own duplicate).
 *
 * Codex audit CRITICAL (round 10): a *third* independent copy of this
 * exact arithmetic was found in `src/domain/finance.ts` — the underlying
 * calculation now lives in exactly one place,
 * `src/domain/nutrients.ts`'s own additive `farmGrasslandAggregates`
 * (the correct, lowest layer for it, callable from both domain and
 * orchestration code), with this function kept only as the established
 * orchestration-layer entry point every existing caller already uses.
 */
export function computeFarmGrasslandAggregates(fields: readonly Field[]): { farmGrasslandAreaHa: number; nonGrassPct: number } {
  // Campaign A (A1.1): a farm-wide current-planning aggregate never counts
  // an archived field, whichever list a caller passes in.
  return farmGrasslandAggregates(activeFields(fields));
}

/**
 * Fertiliser Vertical campaign — `livestockGroups`/`slurryAllocations`
 * are new, required parameters: `promptForFertiliserRecommendation`
 * needs the same real farm-wide inputs `NutrientsPageClient.tsx`'s own
 * existing `calculateNutrientPlan` call site already gathers
 * (`useLivestockGroups()`/`useSlurryAllocations()`) — reused here, not
 * re-fetched or re-derived. `farmGrasslandAreaHa`/`nonGrassPct` are
 * computed from `fields` itself via `computeFarmGrasslandAggregates`
 * above, kept in exactly one place now that a second real caller
 * (`recompute.ts`) needs the same real farm-wide figures.
 */
export function buildAllRealPrompts(
  // Codex audit HIGH (round 14): widened from `Pick<Farm, "id" | "location">`
  // so `farm.pBuildUpCompliance` — real, farm-level Article 17(6) evidence
  // — is actually available to pass through to
  // `promptForFertiliserRecommendation` below, rather than every caller
  // of this function only ever supplying the two fields the old, narrower
  // Pick allowed.
  farm: Pick<Farm, "id" | "location" | "pBuildUpCompliance">,
  fields: readonly Field[],
  livestockGroups: readonly LivestockGroup[],
  slurryAllocations: readonly SlurryAllocation[],
  createdAt: string,
  // Slurry Evidence & Composition V1 — real, farm-wide composition
  // records (every shed/tank, every recorded result); resolved to one
  // effective record per housing here (once, per this whole batch), the
  // same real input `NutrientsPageClient.tsx`'s own direct
  // `calculateNutrientPlan` call site already gathers. Optional/omitted
  // (every existing caller keeps compiling) falls back to
  // `promptForFertiliserRecommendation`'s own unchanged default.
  slurryCompositionRecords: readonly SlurryComposition[] = [],
): Prompt[] {
  const prompts: Prompt[] = [];
  const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(fields);
  const compositionByHousing = currentSlurryCompositionByHousing(slurryCompositionRecords);

  for (const field of activeFields(fields)) {
    prompts.push(promptForSpreadingWindow(farm, field, "chemical_fertiliser", undefined, createdAt));
    // Slurry Closed-Period Wiring V1 — the real, distinct statutory
    // closed-period Prompt for organic fertiliser other than farmyard
    // manure (slurry's own real legal category, S.I. 588/2025 —
    // `closed-period-calendar.ts`'s own `CLOSED_PERIOD_BY_ZONE_MATERIAL`),
    // mirroring the chemical-fertiliser call immediately above: same
    // per-field, unconditional pattern, so Today/Plan's shared
    // `SPREADING_WINDOW_PROMPT_KIND` fan-out now carries both real
    // materials rather than only ever chemical fertiliser. Every consumer
    // of this Prompt kind distinguishes the two by their own real
    // `inputsSnapshot.material` (never by array position or count).
    prompts.push(promptForSpreadingWindow(farm, field, "organic_fertiliser_other_than_FYM", undefined, createdAt));
    prompts.push(promptForSoilTestAge(field, undefined, createdAt));
    prompts.push(promptForCommonageStatus(field, createdAt));
    prompts.push(promptForLocalBufferOverride(field, createdAt));
    // Codex audit HIGH (round 31): a bare `.find()` silently discarded
    // a real second allocation to the same field from a different real
    // housing source — see `resolveFieldSlurryAllocation`'s own doc
    // comment.
    const slurryAllocation = resolveFieldSlurryAllocation(slurryAllocations, field.id);
    const compositionInput = resolveFieldSlurryCompositionInput(slurryAllocations, field.id, compositionByHousing);
    prompts.push(
      // `asOfDate` stays `undefined` here, matching every sibling producer
      // in this same loop (`promptForSoilTestAge` etc.) — this is a live,
      // real-time Prompt batch, not the deterministic/historical
      // recomputation `recompute.ts`/`getFarmFertiliserDemand` support via
      // their own explicit, injectable `asOfDate`/`now`.
      promptForFertiliserRecommendation(
        field,
        farmGrasslandAreaHa,
        [...livestockGroups],
        slurryAllocation,
        nonGrassPct,
        undefined,
        createdAt,
        farm.pBuildUpCompliance?.value,
        // Campaign A (A2.2): a multi-store field has housingId "multiple"
        // on the combined allocation, so resolve per contributing store.
        compositionInput.composition,
        compositionInput.unresolved,
      ),
    );
  }
  return prompts;
}
