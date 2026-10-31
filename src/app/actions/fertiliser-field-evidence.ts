"use server";

import { revalidatePath } from "next/cache";
import type { Field } from "@/domain/types";
import {
  createDerivedEvidence,
  createFarmerEvidence,
  evaluateFertiliserInputGate,
  inferGrazingProductionSystem,
  type CropSystem,
  type FieldProductionCycle,
  type FieldProductionCycleEvidence,
  type GrazingProductionSystem,
  type FertiliserInputGateResult,
  type ProductionCycleStatus,
} from "@/domain/fertiliser-field-evidence";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import {
  getFieldProductionCycle,
  upsertFieldProductionCycle,
} from "@/lib/farm-data/field-production-cycles";

export interface FieldProductionCycleState {
  cycle: FieldProductionCycle | null;
  gate: FertiliserInputGateResult | null;
}

async function getOwnedField(fieldId: string): Promise<Field | null> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return null;
  const fields = await listFieldsForFarm(farm.id);
  return fields.find((field) => field.id === fieldId && field.farmId === farm.id) ?? null;
}

function validSeason(season: string): boolean {
  return /^[0-9]{4}$/.test(season);
}

function finiteNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

export async function loadFieldProductionCycleAction(fieldId: string, season: string): Promise<FieldProductionCycleState> {
  if (!validSeason(season)) return { cycle: null, gate: null };
  const field = await getOwnedField(fieldId);
  if (!field) return { cycle: null, gate: null };
  const cycle = await getFieldProductionCycle(fieldId, season);
  return { cycle, gate: cycle ? evaluateFertiliserInputGate(field, cycle) : null };
}

export interface SaveFieldProductionCycleActionInput {
  fieldId: string;
  season: string;
  cropSystem: CropSystem;
  status?: ProductionCycleStatus;
  productionTargetTDMHa?: number;
  chemicalNAppliedKgHa?: number;
  chemicalPAppliedKgHa?: number;
  chemicalKAppliedKgHa?: number;
  whiteCloverPct?: number;
  grazingProductionSystem?: GrazingProductionSystem;
  farmerName: string;
}

export async function saveFieldProductionCycleAction(
  input: SaveFieldProductionCycleActionInput,
): Promise<FieldProductionCycleState> {
  if (!validSeason(input.season)) throw new Error("Season must be a four-digit year.");
  const field = await getOwnedField(input.fieldId);
  if (!field) throw new Error("Field not found for the signed-in farm.");

  if (input.whiteCloverPct !== undefined && (!Number.isFinite(input.whiteCloverPct) || input.whiteCloverPct < 0 || input.whiteCloverPct > 100)) {
    throw new Error("White clover percentage must be between 0 and 100.");
  }

  const source = input.farmerName.trim() || "Farmer";
  const existing = await getFieldProductionCycle(input.fieldId, input.season);
  const livestockGroups = input.cropSystem === "GRASS_GRAZING" ? await listLivestockGroupsForFarm(field.farmId) : [];
  const grazingInference = inferGrazingProductionSystem(livestockGroups);
  const previousEvidence = existing?.evidence ?? {};
  const evidence: FieldProductionCycleEvidence = {
    ...previousEvidence,
    cropSystem: createFarmerEvidence(input.cropSystem, source, undefined, previousEvidence.cropSystem),
    ...(input.grazingProductionSystem
      ? { grazingProductionSystem: createFarmerEvidence(input.grazingProductionSystem, source, undefined, previousEvidence.grazingProductionSystem) }
      : input.cropSystem === "GRASS_GRAZING" && grazingInference.value
        ? { grazingProductionSystem: createDerivedEvidence(
            grazingInference.value,
            "Farm Return — recorded livestock",
            grazingInference.reason,
            undefined,
            previousEvidence.grazingProductionSystem,
          ) }
        : {}),
    ...(finiteNonNegative(input.productionTargetTDMHa)
      ? { productionTargetTDMHa: createFarmerEvidence(input.productionTargetTDMHa, source, undefined, previousEvidence.productionTargetTDMHa) }
      : {}),
    ...(finiteNonNegative(input.chemicalNAppliedKgHa)
      ? { chemicalNAppliedKgHa: createFarmerEvidence(input.chemicalNAppliedKgHa, source, undefined, previousEvidence.chemicalNAppliedKgHa) }
      : {}),
    ...(finiteNonNegative(input.chemicalPAppliedKgHa)
      ? { chemicalPAppliedKgHa: createFarmerEvidence(input.chemicalPAppliedKgHa, source, undefined, previousEvidence.chemicalPAppliedKgHa) }
      : {}),
    ...(finiteNonNegative(input.chemicalKAppliedKgHa)
      ? { chemicalKAppliedKgHa: createFarmerEvidence(input.chemicalKAppliedKgHa, source, undefined, previousEvidence.chemicalKAppliedKgHa) }
      : {}),
    ...(finiteNonNegative(input.whiteCloverPct)
      ? { whiteCloverPct: createFarmerEvidence(input.whiteCloverPct, source, undefined, previousEvidence.whiteCloverPct) }
      : {}),
  };

  if (
    input.cropSystem === "GRASS_GRAZING" &&
    !input.grazingProductionSystem &&
    !grazingInference.value &&
    evidence.grazingProductionSystem?.method !== "FARMER_DECLARED"
  ) {
    delete evidence.grazingProductionSystem;
  }

  const cycle = await upsertFieldProductionCycle({
    fieldId: input.fieldId,
    season: input.season,
    cropSystem: input.cropSystem,
    status: input.status ?? "active",
    evidence,
  });

  revalidatePath("/fields");
  revalidatePath("/fertiliser-plan");
  return { cycle, gate: evaluateFertiliserInputGate(field, cycle) };
}
