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
import { updateFarmProfileForCurrentUser } from "@/lib/farm-data/farms";
import {
  archiveField as archiveFieldRow,
  createField,
  restoreField as restoreFieldRow,
  setFieldBoundary as setFieldBoundaryRow,
  updateFieldCommonageStatus as updateFieldCommonageStatusRow,
  updateFieldDetails as updateFieldDetailsRow,
  updateFieldIndex as updateFieldIndexRow,
  updateFieldWaterBufferContext as updateFieldWaterBufferContextRow,
} from "@/lib/farm-data/fields";
import { addSoilTestToField, type NewSoilTestInput } from "@/lib/farm-data/soil";
import { createLivestockGroup } from "@/lib/farm-data/livestock";
import { createHousing } from "@/lib/farm-data/housing";
import { updateSlurryApplicationMethod as updateSlurryApplicationMethodRow } from "@/lib/farm-data/slurry";

export async function updateFarmProfileAction(
  farmId: string,
  patch: { name?: string; ownerName?: string; county?: string },
) {
  const farm = await updateFarmProfileForCurrentUser(farmId, patch);
  revalidatePath("/settings");
  return farm;
}

export async function addFieldAction(
  farmId: string,
  input: { name: string; areaHa: number; centroid: [number, number]; plannedUse: FieldUse; farmerName: string },
): Promise<Field> {
  const field = await createField(farmId, {
    name: input.name,
    areaHa: input.areaHa,
    centroid: input.centroid,
    plannedUse: { value: input.plannedUse, status: "farmer_adjusted", source: input.farmerName },
    mappedSoil: {
      soilAssociation: "Pending mapping",
      dominantSeries: "Pending mapping",
      texture: "Unknown",
      drainage: "moderately_drained",
      coveragePct: 0,
      datasetVersion: "Not yet mapped",
      source: "Awaiting automatic mapping",
    },
    fertility: {
      pIndex: { value: 2, status: "estimated", source: "Farm Return assumption" },
      kIndex: { value: 2, status: "estimated", source: "Farm Return assumption" },
    },
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
  },
): Promise<Housing> {
  const housing = await createHousing(farmId, input);
  revalidatePath("/housing");
  return housing;
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
