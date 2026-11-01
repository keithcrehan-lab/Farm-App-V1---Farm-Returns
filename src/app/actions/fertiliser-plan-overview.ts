"use server";

/**
 * Fertiliser Overview and Stock Visuals campaign — the real, farm-scoped
 * read behind the new farm-wide Fertiliser Plan landing page
 * (`src/app/(app)/fertiliser-plan/`). Pure composition of already-real,
 * already-audited data:
 *  - `getFarmFertiliserDemandAction`/`getFarmLimeRequirementAction`
 *    (`src/app/actions/fertiliser-plan.ts`) — real per-product/lime
 *    kg/tonnes totals, reused VERBATIM, never recomputed.
 *  - `getFieldFertiliserStatusAction` (`src/app/actions/fertiliser-plan.ts`)
 *    — the same P3 field-status contract used by the live field view and
 *    calculation audit. The overview never reconstructs nutrient science;
 *    it only aggregates each field's canonical P3 gross requirement via
 *    `aggregateFarmNutrientRequirementKg`.
 *  - `buildFarmSlurryStorageOverview` (`src/domain/slurry-storage.ts`) and
 *    `buildFertiliserStockBand`/`currentFertiliserStockByProduct`
 *    (`src/domain/fertiliser-stock.ts`) — this campaign's own new, pure
 *    domain arithmetic.
 *
 * Every read below is farm-scoped via `getFarmForCurrentUser()` first,
 * exactly like every other action in this app, and archived fields are
 * excluded via `activeFields` before they can reach any aggregation —
 * the identical rule `getFarmFertiliserDemandAction`/
 * `getFarmLimeRequirementAction` already apply (Grassland Fertiliser
 * Pilot Completion, Checkpoint A, audit finding F2).
 *
 * Disclosed tradeoff: calling those two existing actions verbatim (rather
 * than threading pre-fetched fields/livestock/slurry through a new,
 * parallel signature) means `listFieldsForFarm`/`listLivestockGroupsForFarm`/
 * `listSlurryAllocationsForFarm` are each read more than once per real
 * page load — deliberate, not an oversight: "never duplicate a
 * calculation, call the existing export" (`DOMAIN_CONTRACTS.md`'s own
 * contract-change protocol) takes priority over saving a handful of
 * cheap, farm-scoped, indexed reads.
 */
import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { listFieldProductionCyclesForSeason } from "@/lib/farm-data/field-production-cycles";
import { listFertiliserStockRecordsForFarm, createFertiliserStockRecord } from "@/lib/farm-data/fertiliser-stock";
import { getFarmFertiliserDemandAction, getFarmLimeRequirementAction, getFieldFertiliserStatusAction } from "./fertiliser-plan";
import {
  aggregateFarmNutrientRequirementKg,
  type FarmFertiliserAggregation,
  type FarmFertiliserQuoteBasket,
  type FarmInputDemand,
  type FarmFertiliserPurchaseRequirementLine,
  type FarmLimeRequirement,
  type FarmNutrientRequirementTotalsKg,
} from "@/domain/fertiliser-plan";
import { buildFarmSlurryStorageOverview, type FarmSlurryStorageOverview } from "@/domain/slurry-storage";
import {
  buildFertiliserStockBand,
  currentFertiliserStockByProduct,
  normaliseFertiliserProductKey,
  validateNewFertiliserStockRecordInput,
  type FertiliserStockBand,
  type FertiliserStockRecord,
  type NewFertiliserStockRecordInput,
} from "@/domain/fertiliser-stock";
import { activeFields, type FieldUse } from "@/domain/types";
import { buildFertiliserQuoteReadiness, type FertiliserQuoteReadiness } from "@/lib/fertiliser-quote-readiness";

export interface FertiliserPlanFieldBreakdownRow {
  fieldId: string;
  fieldName: string;
  areaHa: number;
  seasonalUse?: FieldUse;
  /** Mirrors `Prompt.basis.status` exactly — `"OK"` means this field
   * contributed a real recommendation to the totals above;
   * `"NOT_APPLICABLE"` is a tillage field (this app has no tillage N/P/K
   * table at all); every other status is a real, disclosed gap
   * (`reasonCode` carries the honest reason, most commonly missing
   * livestock evidence). */
  status: "OK" | "NOT_APPLICABLE" | "BLOCKED_INSUFFICIENT_EVIDENCE" | "AMBIGUOUS" | "LEGAL_PROHIBITION" | "UNKNOWN";
  reasonCode?: string;
}

export interface FertiliserPlanOverview {
  seasonLabel: string;
  farmName: string;
  ownerName: string;
  fieldsTotal: number;
  totalAreaHaTotal: number;
  fieldsIncluded: number;
  totalAreaHaIncluded: number;
  fieldsExcluded: number;
  nutrientRequirementKg: FarmNutrientRequirementTotalsKg;
  demand: FarmInputDemand[];
  purchaseRequirementTonnes: FarmFertiliserPurchaseRequirementLine[];
  applicationsWithUnknownComposition: number;
  fieldsWithBlockedEvidence: number;
  truncated: boolean;
  lime: FarmLimeRequirement;
  stockColumns: FertiliserStockBand[];
  limeStockBand: FertiliserStockBand;
  slurry: FarmSlurryStorageOverview;
  fieldBreakdown: FertiliserPlanFieldBreakdownRow[];
  /** Farm Spatial V2 Phase 5 — `getFarmFertiliserDemandAction`'s canonical
   * whole-farm aggregation and quote basket, passed through verbatim (the
   * same single read as `demand` above; never recomputed). */
  aggregation: FarmFertiliserAggregation;
  basket: FarmFertiliserQuoteBasket;
  quoteReadiness: FertiliserQuoteReadiness;
}


export async function getFertiliserPlanOverviewAction(): Promise<FertiliserPlanOverview> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error("getFertiliserPlanOverviewAction: no real farm for the current session");
  }
  const now = new Date().toISOString();

  const [allFields, slurryAllocations, housingList, stockRecords, demandResult, limeResult] = await Promise.all([
    listFieldsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
    listHousingForFarm(farm.id),
    listFertiliserStockRecordsForFarm(farm.id),
    getFarmFertiliserDemandAction(),
    getFarmLimeRequirementAction(),
  ]);
  const fields = activeFields(allFields);
  const season = now.slice(0, 4);
  const productionCycles = await listFieldProductionCyclesForSeason(fields.map((field) => field.id), season);

  // P4 presentation adapter: the overview reads the exact same P3 field
  // status contract as the field screen. No legacy Prompt/NutrientPlan
  // recompute is permitted here, so the overview, calculation audit and
  // procurement basket all trace back to one agronomy engine.
  const p3FieldResults = await Promise.all(
    fields.map(async (field) => ({ field, result: await getFieldFertiliserStatusAction(field.id) })),
  );
  const perFieldRequirements: { areaHa: number; requirementKgHa?: { n: number; p: number; k: number } }[] = [];
  const fieldBreakdown: FertiliserPlanFieldBreakdownRow[] = p3FieldResults.map(({ field, result }) => {
    if (result.status === "ok") {
      perFieldRequirements.push({ areaHa: field.areaHa, requirementKgHa: result.requirementKgHa });
      return {
        fieldId: field.id,
        fieldName: field.name,
        areaHa: field.areaHa,
        seasonalUse: field.plannedUse?.value,
        status: "OK" as const,
      };
    }
    perFieldRequirements.push({ areaHa: field.areaHa, requirementKgHa: undefined });
    return {
      fieldId: field.id,
      fieldName: field.name,
      areaHa: field.areaHa,
      seasonalUse: field.plannedUse?.value,
      status: result.status === "not_applicable" ? ("NOT_APPLICABLE" as const) : ("BLOCKED_INSUFFICIENT_EVIDENCE" as const),
      ...(result.status === "blocked" ? { reasonCode: result.reasonCode } : {}),
    };
  });

  const nutrientRequirementKg = aggregateFarmNutrientRequirementKg(perFieldRequirements);
  const fieldsIncluded = fieldBreakdown.filter((f) => f.status === "OK").length;
  const totalAreaHaIncluded = fieldBreakdown.filter((f) => f.status === "OK").reduce((sum, f) => sum + f.areaHa, 0);
  const totalAreaHaTotal = fields.reduce((sum, f) => sum + f.areaHa, 0);

  const currentStockByProduct = currentFertiliserStockByProduct(stockRecords);
  // Codex-style defense in depth applied proactively: a farmer's own real
  // recorded stock for a product must never silently vanish from this
  // overview just because that product currently has zero recommended/
  // planned/confirmed demand (e.g. stock recorded ahead of a
  // recommendation existing yet, or held over after this season's
  // requirement was already fully met) — every demand row with a real
  // remaining requirement OR a real stock record is shown, and any
  // product with a real stock record but no demand row at all is still
  // shown too (with an honest `0` remaining requirement, so
  // `buildFertiliserStockBand` reports it as pure surplus rather than
  // this overview dropping it).
  // `FarmInputDemand` itself carries no `npkAnalysis` (see its own doc
  // comment — it's the deliberately science-free demand-aggregation
  // shape) — `purchaseRequirementTonnes` is built from the same real
  // per-field data one step earlier in the pipeline and does carry it,
  // matched here by normalised product name rather than re-deriving it.
  // Every lookup against `currentStockByProduct` below uses
  // `normaliseFertiliserProductKey` — that map is itself keyed by it
  // (Codex audit HIGH, round 1: "Urea"/"urea"/" Urea " must never form
  // separate balances), so a raw product string must never be used as a
  // map key directly anywhere in this function.
  const npkAnalysisByProduct = new Map(demandResult.purchaseRequirementTonnes.map((line) => [normaliseFertiliserProductKey(line.product), line.npkAnalysis]));
  const demandProductKeys = new Set(demandResult.demand.map((d) => normaliseFertiliserProductKey(d.product)));
  const limeKey = normaliseFertiliserProductKey("Lime");
  const stockColumns: FertiliserStockBand[] = [
    ...demandResult.demand
      .filter((d) => d.remainingRequirementKg > 0 || currentStockByProduct.has(normaliseFertiliserProductKey(d.product)))
      .map((d) => {
        const key = normaliseFertiliserProductKey(d.product);
        return buildFertiliserStockBand({
          product: d.product,
          npkAnalysis: npkAnalysisByProduct.get(key),
          remainingRequirementKg: d.remainingRequirementKg,
          currentStock: currentStockByProduct.get(key),
        });
      }),
    ...Array.from(currentStockByProduct.entries())
      .filter(([key]) => key !== limeKey && !demandProductKeys.has(key))
      .map(([, stock]) =>
        buildFertiliserStockBand({
          product: stock.product,
          remainingRequirementKg: 0,
          currentStock: stock,
        }),
      ),
  ];

  const limeStockBand = buildFertiliserStockBand({
    product: "Lime",
    remainingRequirementKg: limeResult.farmTotalTonnes * 1000,
    currentStock: currentStockByProduct.get(limeKey),
  });

  const slurry = buildFarmSlurryStorageOverview(housingList, slurryAllocations);
  const quoteReadiness = buildFertiliserQuoteReadiness({
    fields,
    cycles: productionCycles,
    slurryAllocations,
    aggregation: demandResult.aggregation,
  });

  return {
    seasonLabel: String(new Date(now).getUTCFullYear()),
    farmName: farm.name,
    ownerName: farm.ownerName,
    fieldsTotal: fields.length,
    totalAreaHaTotal,
    fieldsIncluded,
    totalAreaHaIncluded,
    fieldsExcluded: fields.length - fieldsIncluded,
    nutrientRequirementKg,
    demand: demandResult.demand,
    purchaseRequirementTonnes: demandResult.purchaseRequirementTonnes,
    applicationsWithUnknownComposition: demandResult.applicationsWithUnknownComposition,
    fieldsWithBlockedEvidence: demandResult.fieldsWithBlockedEvidence,
    truncated: demandResult.truncated,
    lime: limeResult,
    stockColumns,
    limeStockBand,
    slurry,
    fieldBreakdown,
    aggregation: demandResult.aggregation,
    basket: demandResult.basket,
    quoteReadiness,
  };
}

export interface AddFertiliserStockRecordResult {
  status: "ok" | "validation_error";
  errors?: { field: string; message: string }[];
  record?: FertiliserStockRecord;
}

/**
 * Records a new dated stock observation (campaign brief: "the smallest
 * reliable record of product, quantity, unit, effective date and source,
 * with an auditable correction history"). Never updates an existing row —
 * every call is a real, new, immutable `fertiliser_stock_records` insert;
 * a farmer correcting a mistaken figure simply records a new one.
 */
export async function addFertiliserStockRecordAction(input: NewFertiliserStockRecordInput): Promise<AddFertiliserStockRecordResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error("addFertiliserStockRecordAction: no real farm for the current session");
  }
  const today = new Date().toISOString().slice(0, 10);
  const errors = validateNewFertiliserStockRecordInput(input, today);
  if (errors.length > 0) {
    return { status: "validation_error", errors };
  }
  const record = await createFertiliserStockRecord(farm.id, input);
  revalidatePath("/fertiliser-plan");
  return { status: "ok", record };
}
