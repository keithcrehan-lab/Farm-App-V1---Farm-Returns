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
import type { Prompt } from "./index";
import type { Farm, Field, LivestockGroup, SlurryAllocation } from "@/domain/types";

/**
 * The real farm-wide grassland-area/non-grass-% aggregation
 * `promptForFertiliserRecommendation` (via `calculateNutrientPlan`)
 * needs — the identical figures `NutrientsPageClient.tsx`'s own existing
 * call site already derives from the same real `Field[]`. Extracted as
 * its own function (rather than left inline in `buildAllRealPrompts`)
 * so `recompute.ts`'s server-side re-derivation of a single field's
 * `fertiliser_recommendation` Prompt can call the exact same real
 * aggregation, never a second, independently-drifting copy of it.
 */
export function computeFarmGrasslandAggregates(fields: readonly Field[]): { farmGrasslandAreaHa: number; nonGrassPct: number } {
  const farmGrasslandAreaHa = fields.reduce((sum, f) => sum + f.areaHa, 0);
  const nonGrassAreaHa = fields.filter((f) => f.plannedUse?.value === "tillage").reduce((sum, f) => sum + f.areaHa, 0);
  const nonGrassPct = farmGrasslandAreaHa > 0 ? (nonGrassAreaHa / farmGrasslandAreaHa) * 100 : 0;
  return { farmGrasslandAreaHa, nonGrassPct };
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
  farm: Pick<Farm, "id" | "location">,
  fields: readonly Field[],
  livestockGroups: readonly LivestockGroup[],
  slurryAllocations: readonly SlurryAllocation[],
  createdAt: string,
): Prompt[] {
  const prompts: Prompt[] = [];
  const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(fields);

  for (const field of fields) {
    prompts.push(promptForSpreadingWindow(farm, field, "chemical_fertiliser", undefined, createdAt));
    prompts.push(promptForSoilTestAge(field, undefined, createdAt));
    prompts.push(promptForCommonageStatus(field, createdAt));
    prompts.push(promptForLocalBufferOverride(field, createdAt));
    const slurryAllocation = slurryAllocations.find((a) => a.fieldId === field.id);
    prompts.push(
      promptForFertiliserRecommendation(field, farmGrasslandAreaHa, [...livestockGroups], slurryAllocation, nonGrassPct, undefined, createdAt),
    );
  }
  return prompts;
}
