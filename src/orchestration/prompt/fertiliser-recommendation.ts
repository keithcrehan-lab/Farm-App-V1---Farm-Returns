/**
 * Fertiliser Vertical campaign — the new Prompt producer that turns a
 * field's real, already-computed `NutrientPlan` recommendation
 * (`src/domain/nutrients.ts`'s `calculateNutrientPlan`) into a
 * presentable `Prompt`, via `buildPrompt` (`./index`), exactly the same
 * layering every other real producer in this directory already
 * establishes. This module makes no agronomic decision of its own — it
 * calls `calculateNutrientPlan` once and classifies which of its three
 * real, honest outcome shapes applies; the recommendation itself is
 * entirely `nutrients.ts`'s own, unmodified.
 *
 * **Scope limit, disclosed** (`FERTILISER_VERTICAL_PHASE0.md`): this
 * producer always calls `calculateNutrientPlan` with `silage: undefined`
 * — the real *grazing* branch. No real, persisted `SilagePlan` exists in
 * this app (`mockSilagePlans` is client-store-only mock data), so a
 * server-side producer has no real silage plan to consult; extending
 * this into the silage branch is deliberately out of this campaign's
 * scope, not silently forgotten.
 */
import { calculateNutrientPlan, NUTRIENT_ENGINE_VERSION } from "@/domain/nutrients";
import { blockedInsufficientEvidence, notApplicable, ok, type EngineOutcome } from "@/domain/evidence";
import { isValidIsoUtcDateTime } from "@/domain/iso-datetime";
import type { Field, FertiliserProduct, LivestockGroup, SlurryAllocation } from "@/domain/types";
import { buildPrompt, type Prompt } from "./index";

/** `Prompt.kind` for every Prompt this module produces. */
export const FERTILISER_RECOMMENDATION_PROMPT_KIND = "fertiliser_recommendation";

/**
 * The real, minimal extract of a field's `NutrientPlan` this Prompt
 * presents and, once accepted, is frozen into a real `Decision`'s own
 * `estimateSnapshot` — see `FERTILISER_VERTICAL_PHASE0.md`'s "no new Plan
 * table" section for why this frozen snapshot, not a live re-read, is
 * this campaign's own canonical "what was recommended" record. Every
 * field here is copied verbatim from `NutrientPlan` — no new number is
 * computed in this file.
 *
 * **Deliberately excludes `NutrientPlan.estimatedFieldCostEur`** (Codex
 * audit CRITICAL, round 5): that figure is built from `nutrients.ts`'s
 * own `PRODUCTS` prices, which that module's own header comment already
 * discloses as mock market data pending a real Finance/Market Prices
 * integration — a pre-existing, disclosed limitation of the unmodified
 * Nutrients screen (`PurchasedFertiliserCard.tsx`), not something this
 * campaign may now propagate further. Persisting it into a real
 * Decision's own `estimateSnapshot`, or showing it in Today/Plan copy as
 * part of a "real" recommendation, would be exactly the "mock figure
 * reaching a real, signed-in production record" this campaign's own
 * non-negotiable rules forbid (campaign item 18: "do not invent
 * fertiliser prices... leave monetary impact unavailable" when no
 * verified price exists). The N/P/K requirement and product blend
 * themselves remain fully real and sourced — only the monetary total is
 * omitted from this new vertical's own Prompt/Plan surfaces.
 *
 * **`products` carries no per-product `costEur` either** (Codex audit
 * CRITICAL, round 6): round 5's own fix above removed the field-total
 * `estimatedFieldCostEur`, but `plan.purchasedProducts` itself is a real
 * `FertiliserProduct[]` where *every entry* already carries its own
 * `costEur` (`nutrients.ts`'s `allocatePurchasedProducts`, built from the
 * identical disclosed mock `PRODUCTS` prices) — round 5 copied that
 * array in verbatim, so a mock per-product cost still reached this
 * Prompt's `basis.value`, every persisted Decision's `estimateSnapshot`,
 * and `getLinkedFertiliserPlanForJobSessionAction`'s own client-facing
 * response, undoing round 5's own stated intent for exactly the reason
 * that fix existed. `products` is now `FertiliserRecommendationProduct[]`
 * (`FertiliserProduct` minus `costEur`) and `sanitiseRecommendedProduct`
 * below is the one real place that strips it, applied to every product
 * this module ever puts into a `FertiliserRecommendationSummary`.
 */
export type FertiliserRecommendationProduct = Omit<FertiliserProduct, "costEur">;

export interface FertiliserRecommendationSummary {
  fieldId: string;
  areaHa: number;
  requirementKgHa: { n: number; p: number; k: number };
  products: FertiliserRecommendationProduct[];
  calculationVersion: string;
}

/**
 * The one real place a `FertiliserProduct`'s own mock `costEur` is
 * stripped before it may reach any of this vertical's new surfaces —
 * exported (Codex audit CRITICAL, round 6) so `NutrientsPageClient.tsx`'s
 * own separate, client-side `FertiliserPlanSheet` recommendation prop
 * (built directly from `calculateNutrientPlan`, never through this
 * module's own `promptForFertiliserRecommendation`) can reuse the
 * identical sanitiser rather than a second, easily-forgotten copy of it.
 */
export function sanitiseRecommendedProduct(product: FertiliserProduct): FertiliserRecommendationProduct {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- deliberately discarding the mock costEur, never reading it.
  const { costEur, ...rest } = product;
  return rest;
}

function describeFertiliserRecommendationOk(
  value: FertiliserRecommendationSummary,
  fieldName: string,
): { title: string; description: string } {
  const productNames = value.products.map((p) => p.name).join(", ");
  return {
    title: `Fertiliser recommended — ${fieldName}`,
    description: `${fieldName} needs ${value.requirementKgHa.n} kg N, ${value.requirementKgHa.p} kg P, ${value.requirementKgHa.k} kg K per ha. Recommended: ${productNames}.`,
  };
}

/**
 * Builds a real `Prompt` for one field's fertiliser recommendation.
 * `field`/`farmGrasslandAreaHa`/`livestockGroups`/`slurryAllocation`/
 * `nonGrassPct`/`asOfDate` are passed straight to `calculateNutrientPlan`
 * — this function makes no decision about the resulting `NutrientPlan`
 * beyond classifying it into one of three honest Prompt states:
 *
 * - `BLOCKED_INSUFFICIENT_EVIDENCE` — mirrors `plan.fertilityEvidence`
 *   exactly (no P/K Soil Index recorded yet) — the same real reason
 *   `PurchasedFertiliserCard.tsx` already discloses on the Nutrients
 *   screen, not a new one invented here.
 * - `NOT_APPLICABLE` (`NO_FERTILISER_CURRENTLY_RECOMMENDED`) — real
 *   evidence exists, but `calculateNutrientPlan` itself already
 *   determined no purchased product is recommended (Index 4 soil, a
 *   commonage/buffer legal prohibition already suppressing the blend,
 *   or a genuine zero remaining need after organic offset) — never
 *   re-derived here, always read straight off `purchasedProducts`.
 * - `OK` — a real recommendation exists; `basis.value` is the
 *   `FertiliserRecommendationSummary` above.
 *
 * **Never for a tillage field** (Codex audit CRITICAL, round 6): this
 * app has no tillage N/P/K recommendation table anywhere — every real
 * number `calculateNutrientPlan` produces (Table 12-3's grazing curve,
 * or the silage tables this producer never calls) is a *grassland*
 * figure. `buildAllRealPrompts` fans this producer out over every field
 * on the farm with no land-use filter, so before this fix a tillage
 * field silently received a real, actionable, persistable grazing-based
 * "Fertiliser recommended" Prompt/Decision — a fabricated number for a
 * land use this engine was never sourced for, not merely an omission.
 * Gated first, before `calculateNutrientPlan` is even called, with its
 * own `NOT_APPLICABLE` reason — genuinely nothing this Prompt kind can
 * ever say for this field's land use, not a fixable evidence gap.
 *
 * **Never from an un-evidenced empty `livestockGroups`** (Codex audit
 * CRITICAL, round 6): `calculateGrasslandStockingRateKgHa` divides the
 * farm's total livestock units by `farmGrasslandAreaHa`, and
 * `nGrazingSucklerToBeefKgHa` *clamps* any stocking rate at or below its
 * lowest defined row (1.0 LU/ha) to that row's own 35 kg N/ha — there is
 * no real "0 LU/ha" row in Table 12-3 (an earlier round of this
 * campaign's own tests wrongly assumed one existed). This app's data
 * model has no way to distinguish "this farm has confirmed zero
 * livestock" from "livestock has simply never been entered yet" — an
 * empty `livestockGroups` read is genuinely ambiguous between the two.
 * Presenting the clamped 35 kg N/ha as a real, actionable recommendation
 * for the ambiguous case is exactly the extrapolation-presented-as-fact
 * this campaign's own fail-closed rule forbids; a field with real soil
 * evidence but zero recorded livestock now blocks instead
 * (`MISSING_LIVESTOCK_DATA`), the same "ask, don't guess" treatment
 * missing soil fertility already gets. Deliberately only applied to the
 * branch that would otherwise become `OK` — a field already
 * `NOT_APPLICABLE` for an unrelated real reason (Index 4 soil, a
 * commonage/buffer legal prohibition) stays that way regardless of
 * livestock evidence, since no amount of livestock data would change
 * that outcome.
 */
export function promptForFertiliserRecommendation(
  field: Field,
  farmGrasslandAreaHa: number,
  livestockGroups: LivestockGroup[],
  slurryAllocation: SlurryAllocation | undefined,
  nonGrassPct: number | undefined,
  asOfDate: string | undefined,
  createdAt: string,
): Prompt {
  let basis: EngineOutcome<FertiliserRecommendationSummary>;

  if (field.plannedUse?.value === "tillage") {
    basis = notApplicable("TILLAGE_FIELD_NOT_SUPPORTED");
  } else {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa,
      livestockGroups,
      slurryAllocation,
      nonGrassPct,
      asOfDate,
    });

    basis =
      plan.fertilityEvidence.status !== "OK"
        ? plan.fertilityEvidence
        : plan.purchasedProducts.length === 0
          ? notApplicable("NO_FERTILISER_CURRENTLY_RECOMMENDED")
          : livestockGroups.length === 0
            ? blockedInsufficientEvidence("MISSING_LIVESTOCK_DATA", ["livestockGroups"])
            : ok(
                {
                  fieldId: field.id,
                  areaHa: field.areaHa,
                  requirementKgHa: plan.requirement.value,
                  products: plan.purchasedProducts.map(sanitiseRecommendedProduct),
                  calculationVersion: plan.calculationVersion,
                },
                "IRISH_MODEL",
              );
  }

  return buildPrompt({
    id: globalThis.crypto.randomUUID(),
    farmId: field.farmId,
    fieldId: field.id,
    kind: FERTILISER_RECOMMENDATION_PROMPT_KIND,
    basis,
    createdAt,
    calculationVersion: NUTRIENT_ENGINE_VERSION,
    inputsSnapshot: {
      farmGrasslandAreaHa,
      slurryAllocationVolumeM3: slurryAllocation?.volumeM3,
      nonGrassPct: nonGrassPct ?? 0,
      asOfDate: asOfDate ?? new Date().toISOString().slice(0, 10),
      pIndex: field.fertility.pIndex?.value,
      kIndex: field.fertility.kIndex?.value,
    },
    titleWhenBlocked: `Fertiliser recommendation needs review — ${field.name}`,
    describeOk: (value) => describeFertiliserRecommendationOk(value, field.name),
  });
}

/**
 * "Plan this application" (campaign items 3/4) — the real, minimal
 * farmer-editable surface on top of a `fertiliser_recommendation`
 * Prompt's own `OK` recommendation. A farmer may narrow *which* of the
 * recommendation's own real products they're planning, *how much* of it
 * (a real positive kg quantity), and *when* — never invent a product,
 * quantity, or date the live recommendation didn't itself support.
 *
 * PRODUCT JUDGEMENT CALL (`docs/evidence-register.md`): the set of
 * editable keys itself (exactly these three, no partial-area override,
 * no farmer-entered nutrient rate) is a product scoping decision, not a
 * scientific one — the underlying N/P/K requirement and product
 * composition are never editable here, only the farmer's own planning
 * choice about how much of the recommended product they intend to apply
 * and when.
 */
export interface FertiliserPlanEdits {
  /** Must be one of `FertiliserRecommendationSummary.products[].name` —
   * never an arbitrary farmer-typed string. */
  plannedProduct?: string;
  /** Real, positive total product kg for the field — not a nutrient
   * quantity, not a rate per hectare (`fertiliser-plan.ts`'s own
   * `FertiliserActualQuantity` keeps the identical "product kg, not
   * nutrient kg" distinction for the later Actual). */
  plannedQuantityKg?: number;
  /** ISO calendar date (`YYYY-MM-DD`) — the only real, persisted
   * "planned date" this app has anywhere for a fertiliser application
   * (stored inside the accepted Decision's own `edits`, per
   * `FERTILISER_VERTICAL_PHASE0.md`'s "no new Plan table" decision). */
  plannedDate?: string;
}

const FERTILISER_PLAN_EDIT_KEYS = new Set<keyof FertiliserPlanEdits>(["plannedProduct", "plannedQuantityKg", "plannedDate"]);

/**
 * Validates a farmer's edit to a `fertiliser_recommendation` Prompt
 * before it becomes part of an accepted Decision's `edits` jsonb.
 * Allowlist, not denylist, matching
 * `assertManualJobStartValueHasNoOutcomeKeys`'s own established
 * discipline (`src/orchestration/job-session/index.ts`) — any key beyond
 * `{plannedProduct, plannedQuantityKg, plannedDate}` throws, named or
 * not. Every real value is checked against the real, server-recomputed
 * `recommendation` it edits (never the client's own unverified claim) —
 * `plannedProduct` must be one of this field's own live recommendation's
 * real products. Throws rather than silently dropping an invalid edit —
 * a rejected plan edit must never be recorded as if it had succeeded.
 */
export function validateFertiliserPlanEdits(
  edits: Record<string, unknown>,
  recommendation: FertiliserRecommendationSummary,
): FertiliserPlanEdits {
  for (const key of Object.keys(edits)) {
    if (!FERTILISER_PLAN_EDIT_KEYS.has(key as keyof FertiliserPlanEdits)) {
      throw new Error(
        `validateFertiliserPlanEdits: unrecognised edit key "${key}" — only ${JSON.stringify([...FERTILISER_PLAN_EDIT_KEYS])} are ever permitted.`,
      );
    }
  }

  const result: FertiliserPlanEdits = {};

  if (edits.plannedProduct !== undefined) {
    if (typeof edits.plannedProduct !== "string" || !recommendation.products.some((p) => p.name === edits.plannedProduct)) {
      throw new Error(
        `validateFertiliserPlanEdits: plannedProduct must be one of this recommendation's own real products (${recommendation.products.map((p) => p.name).join(", ")})`,
      );
    }
    result.plannedProduct = edits.plannedProduct;
  }

  if (edits.plannedQuantityKg !== undefined) {
    if (typeof edits.plannedQuantityKg !== "number" || !Number.isFinite(edits.plannedQuantityKg) || edits.plannedQuantityKg <= 0) {
      throw new Error("validateFertiliserPlanEdits: plannedQuantityKg must be a real, finite, positive number");
    }
    result.plannedQuantityKg = edits.plannedQuantityKg;
  }

  if (edits.plannedDate !== undefined) {
    // Codex audit MEDIUM (round 1): the shape-only regex previously
    // accepted a real-looking but non-existent calendar date (e.g.
    // "2026-02-31"). Reuses `isValidIsoUtcDateTime`'s own real,
    // leap-year-aware calendar validation (`iso-datetime.ts`) rather
    // than a second, weaker date-range check — appending a fixed
    // midnight time only to satisfy that function's full-datetime
    // pattern; the extra precision is never stored or used.
    if (typeof edits.plannedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(edits.plannedDate) || !isValidIsoUtcDateTime(`${edits.plannedDate}T00:00:00.000Z`)) {
      throw new Error("validateFertiliserPlanEdits: plannedDate must be a real, existing ISO calendar date (YYYY-MM-DD)");
    }
    result.plannedDate = edits.plannedDate;
  }

  return result;
}
