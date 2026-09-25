"use server";

/**
 * Real Farm V1 Phase 6 — real-mode farm mutation Server Actions.
 *
 * One thin wrapper per `src/store/farm-store.tsx` `FarmActions` method,
 * calling the matching `src/lib/farm-data/*.ts` function (server-only —
 * a Client Component can't import those directly, only a `"use server"`
 * export like these). `farm-store.tsx`'s real-mode branch calls these
 * instead of its mock-mode `setState`/`localStorage` logic, so a signed-in
 * farmer's edits reach Postgres instead of the browser's local storage.
 *
 * `revalidatePath` after every write so a server-rendered page (e.g.
 * `(app)/layout.tsx`'s farm-existence check) picks up the change on next
 * navigation — the client-side state update inside `farm-store.tsx`
 * itself is what makes the *current* page reflect it immediately.
 */
import { revalidatePath } from "next/cache";
import type { Field, FieldUse, Housing, LivestockCategory, LivestockGoal, LivestockGroup, SlurryAllocation } from "@/domain/types";
import { getFarmForCurrentUser, updateFarmProfileForCurrentUser } from "@/lib/farm-data/farms";
import {
  archiveField as archiveFieldRow,
  createField,
  listFieldsForFarm,
  restoreField as restoreFieldRow,
  setFieldBoundary as setFieldBoundaryRow,
  updateFieldCommonageStatus as updateFieldCommonageStatusRow,
  updateFieldDetails as updateFieldDetailsRow,
  updateFieldIndex as updateFieldIndexRow,
  updateFieldWaterBufferContext as updateFieldWaterBufferContextRow,
} from "@/lib/farm-data/fields";
import { addSoilTestToField, type NewSoilTestInput } from "@/lib/farm-data/soil";
import { createLivestockGroup, updateLivestockGroup, type UpdateLivestockGroupInput } from "@/lib/farm-data/livestock";
import { createHousing, listHousingForFarm, updateHousing, type UpdateHousingInput } from "@/lib/farm-data/housing";
import { upsertFinancialAssumption } from "@/lib/farm-data/financial-assumptions";
import { addWeightObservation, createIndividualAnimal, type NewIndividualAnimalInput } from "@/lib/farm-data/individual-animals";
import { createSupplierQuote, type NewSupplierQuoteInput, type SupplierQuote } from "@/lib/farm-data/supplier-quotes";
import type { FinancialAssumption, FinancialAssumptionKey, IndividualAnimal, WeightObservation } from "@/domain/types";
import {
  updateSlurryApplicationMethod as updateSlurryApplicationMethodRow,
  updateSlurryApplicationDate as updateSlurryApplicationDateRow,
  createSlurryAllocation as createSlurryAllocationRow,
  listSlurryAllocationsForFarm,
} from "@/lib/farm-data/slurry";
import { validateNewSlurryAllocationPlan, SLURRY_ALLOCATION_PLAN_ISSUE_COPY, type NewSlurryAllocationPlanInput } from "@/domain/slurry-allocation-plan";
import { createSlurryCompositionRecord } from "@/lib/farm-data/slurry-composition";
import { validateNewSlurryCompositionInput, type NewSlurryCompositionInput, type SlurryComposition } from "@/domain/slurry-composition";

export async function updateFarmProfileAction(
  farmId: string,
  patch: { name?: string; ownerName?: string; county?: string },
) {
  const farm = await updateFarmProfileForCurrentUser(farmId, patch);
  revalidatePath("/settings");
  return farm;
}

/**
 * Codex remediation Priority 6 — boundary-first field creation. Takes a
 * real drawn `polygon`, not a manually-typed area — `createField`/
 * `fieldToInsertRow` derive `areaHa`/`centroid` from it. No `plannedUse`
 * (set afterward in Field Detail) and no fabricated `mappedSoil`/P-K-Index
 * default — `fertility` starts empty, `calculateNutrientPlan` fails closed
 * on both until real evidence exists (`fertilityEvidence`).
 */
export async function addFieldAction(
  farmId: string,
  input: { name: string; polygon: GeoJSON.Polygon },
): Promise<Field> {
  const field = await createField(farmId, {
    name: input.name,
    polygon: input.polygon,
    fertility: {},
  });
  revalidatePath("/fields");
  return field;
}

export async function setFieldBoundaryAction(
  fieldId: string,
  polygon: GeoJSON.Polygon,
  areaHa: number,
  centroid: [number, number],
): Promise<Field> {
  const field = await setFieldBoundaryRow(fieldId, polygon, areaHa, centroid);
  revalidatePath("/fields");
  return field;
}

export async function updateFieldDetailsAction(
  fieldId: string,
  patch: { name?: string; plannedUse?: FieldUse; areaHa?: number },
  farmerName: string,
): Promise<Field> {
  const field = await updateFieldDetailsRow(fieldId, patch, farmerName);
  revalidatePath("/fields");
  return field;
}

export async function archiveFieldAction(fieldId: string): Promise<Field> {
  const field = await archiveFieldRow(fieldId);
  revalidatePath("/fields");
  return field;
}

export async function restoreFieldAction(fieldId: string): Promise<Field> {
  const field = await restoreFieldRow(fieldId);
  revalidatePath("/fields");
  return field;
}

export async function updateFieldIndexAction(
  fieldId: string,
  key: "pIndex" | "kIndex",
  value: 1 | 2 | 3 | 4,
  farmerName: string,
): Promise<Field> {
  const field = await updateFieldIndexRow(fieldId, key, value, farmerName);
  revalidatePath("/soil");
  revalidatePath("/nutrients");
  return field;
}

export async function addSoilTestAction(fieldId: string, input: NewSoilTestInput): Promise<Field> {
  const field = await addSoilTestToField(fieldId, input);
  revalidatePath("/soil");
  revalidatePath("/nutrients");
  return field;
}

export async function addLivestockGroupAction(
  farmId: string,
  input: {
    label: string;
    category: LivestockCategory;
    count: number;
    avgWeightKg?: number;
    system: "grazing" | "housed";
    goal?: LivestockGoal;
    housingId?: string;
    farmerName: string;
  },
): Promise<LivestockGroup> {
  const group = await createLivestockGroup(farmId, input);
  revalidatePath("/livestock");
  return group;
}

export async function addHousingAction(
  farmId: string,
  input: {
    shedName: string;
    shedType: "slatted" | "straw_bedded" | "other";
    housingPeriod: { start: string; end: string };
    storageCapacityM3: number;
    storageFillPct: number;
    storageFillStatus?: "estimated" | "farmer_recorded";
  },
): Promise<Housing> {
  const housing = await createHousing(farmId, input);
  revalidatePath("/housing");
  return housing;
}

/**
 * Real Farm V1 Phase 14 — a farmer overwriting a reference default (or a
 * previously-set assumption) with their own real cost. Always
 * `"farmer_adjusted"` — the reference-default path (onboarding's Step 7
 * accepting a CSO figure as-is) writes directly via
 * `upsertFinancialAssumption` with `"estimated"`/its own source, not this
 * action; this one is specifically "the farmer typed a number in."
 */
export async function updateFinancialAssumptionAction(
  farmId: string,
  key: FinancialAssumptionKey,
  value: number,
  unit: string,
  farmerName: string,
): Promise<FinancialAssumption> {
  const assumption = await upsertFinancialAssumption(farmId, key, value, unit, "farmer_adjusted", farmerName);
  revalidatePath("/finance");
  return assumption;
}

export async function updateFieldCommonageStatusAction(
  fieldId: string,
  status: "commonage" | "not_commonage" | "unknown",
  farmerName: string,
): Promise<Field> {
  const field = await updateFieldCommonageStatusRow(fieldId, status, farmerName);
  revalidatePath("/nutrients");
  return field;
}

export async function updateFieldWaterBufferContextAction(
  fieldId: string,
  context: NonNullable<Field["waterBufferContext"]>["value"],
  farmerName: string,
): Promise<Field> {
  const field = await updateFieldWaterBufferContextRow(fieldId, context, farmerName);
  revalidatePath("/nutrients");
  return field;
}

export async function updateSlurryApplicationMethodAction(
  fieldId: string,
  housingId: string,
  method: "LESS" | "splashplate" | "incorporate_24h" | "other",
  farmerName: string,
): Promise<SlurryAllocation> {
  const allocation = await updateSlurryApplicationMethodRow(fieldId, housingId, method, farmerName);
  revalidatePath("/spreading");
  return allocation;
}

/** Slurry Application Context V1 — same pattern as
 * `updateSlurryApplicationMethodAction` above, for the new
 * `applicationDate` field. */
export async function updateSlurryApplicationDateAction(
  fieldId: string,
  housingId: string,
  isoDate: string,
  farmerName: string,
): Promise<SlurryAllocation> {
  const allocation = await updateSlurryApplicationDateRow(fieldId, housingId, isoDate, farmerName);
  revalidatePath("/spreading");
  revalidatePath("/nutrients");
  return allocation;
}

/** Slurry planning entry — creates one farmer-planned field allocation.
 * The farm is resolved server-side from the signed-in user, and the raw
 * input is re-validated here against that farm's own fields, stores and
 * allocations (never trusted from the client) before anything is written. */
export async function createSlurryAllocationAction(input: NewSlurryAllocationPlanInput, farmerName: string): Promise<SlurryAllocation> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No farm found for this account.");
  const [fields, housingList, allocations] = await Promise.all([listFieldsForFarm(farm.id), listHousingForFarm(farm.id), listSlurryAllocationsForFarm(farm.id)]);
  const validation = validateNewSlurryAllocationPlan(input, { fields, housingList, allocations });
  if (validation.status !== "OK") throw new Error(validation.issues.map((i) => SLURRY_ALLOCATION_PLAN_ISSUE_COPY[i]).join(" "));
  const allocation = await createSlurryAllocationRow(farm.id, validation.value, farmerName);
  revalidatePath("/spreading");
  revalidatePath("/nutrients");
  revalidatePath("/today");
  return allocation;
}

export async function updateHousingAction(housingId: string, input: UpdateHousingInput, linkedGroupIds: string[]): Promise<Housing> {
  const housing = await updateHousing(housingId, input, linkedGroupIds);
  revalidatePath("/housing");
  return housing;
}

/**
 * Slurry Evidence & Composition V1 — records one dated composition
 * result (farmer-provided or a real laboratory analysis) for a shed/
 * tank. Validated again here (defense in depth on top of the
 * migration's own `check` constraints, and on top of whatever the
 * client form already checked) before ever reaching the database — same
 * discipline `addFertiliserStockRecordAction`
 * (`src/app/actions/fertiliser-plan-overview.ts`) already established
 * for the sibling `fertiliser_stock_records` evidence record.
 * `calculateNutrientPlan` never reads this table directly — every real
 * caller resolves the farm's current composition-by-housing map
 * (`currentSlurryCompositionByHousing`) once and passes the one
 * resolved record in, so this action's only job is the real insert.
 */
export async function addSlurryCompositionRecordAction(farmId: string, input: NewSlurryCompositionInput): Promise<SlurryComposition> {
  const errors = validateNewSlurryCompositionInput(input, new Date().toISOString().slice(0, 10));
  if (errors.length > 0) {
    throw new Error(`Invalid slurry composition record: ${errors.map((e) => e.message).join("; ")}`);
  }
  const record = await createSlurryCompositionRecord(farmId, input);
  revalidatePath("/housing");
  revalidatePath("/nutrients");
  revalidatePath("/today");
  revalidatePath("/plan");
  return record;
}

export async function updateLivestockGroupAction(groupId: string, input: UpdateLivestockGroupInput): Promise<LivestockGroup> {
  const group = await updateLivestockGroup(groupId, input);
  revalidatePath("/livestock");
  return group;
}

export async function addSupplierQuoteAction(farmId: string, input: NewSupplierQuoteInput): Promise<SupplierQuote> {
  const quote = await createSupplierQuote(farmId, input);
  revalidatePath("/finance");
  return quote;
}

export async function addIndividualAnimalAction(farmId: string, input: NewIndividualAnimalInput): Promise<IndividualAnimal> {
  const animal = await createIndividualAnimal(farmId, input);
  revalidatePath("/livestock");
  return animal;
}

export async function addWeightObservationAction(
  farmId: string,
  animalId: string,
  weightKg: number,
  observedDate: string,
  source: string,
): Promise<WeightObservation> {
  const observation = await addWeightObservation(farmId, animalId, weightKg, observedDate, source);
  revalidatePath("/livestock");
  return observation;
}
