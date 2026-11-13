"use server";

import { revalidatePath } from "next/cache";
import type { Field } from "@/domain/types";
import {
  createFarmerEvidence,
  evaluateFertiliserInputGate,
  type CropSystem,
  type FieldProductionCycle,
  type FieldProductionCycleEvidence,
  type GrazingProductionSystem,
  type FertiliserInputGateResult,
  type ProductionCycleStatus,
} from "@/domain/fertiliser-field-evidence";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import {
  getFieldProductionCycle,
  upsertFieldProductionCycle,
} from "@/lib/farm-data/field-production-cycles";

/** Read only, authenticated hydration of the season's canonical field
 * evidence after a saved farm system, cycle or grazing movement. No
 * client-side resolver is allowed to recalculate that precedence. */
export async function loadCanonicalGrazingFieldStateAction(): Promise<{
  farmId: string;
  fields: Array<Pick<Field, "id" | "grazingSward" | "grazingProductionSystemResolution" | "currentSeasonCropFamily">>;
}> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No signed-in farm for grazing-system evidence.");
  const fields = await listFieldsForFarm(farm.id, { farm, resolveGrazingSystems: true });
  return {
    farmId: farm.id,
    fields: fields.map((field) => ({
      id: field.id,
      grazingSward: field.grazingSward,
      grazingProductionSystemResolution: field.grazingProductionSystemResolution,
      currentSeasonCropFamily: field.currentSeasonCropFamily,
    })),
  };
}

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
  /** Explicit April class; do not infer from legacy whiteCloverPct. */
  aprilWhiteCloverPct?: number;
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
  if (input.aprilWhiteCloverPct !== undefined && (!Number.isFinite(input.aprilWhiteCloverPct) || ![0, 5, 10].includes(input.aprilWhiteCloverPct))) {
    throw new Error("April clover assessment must be a recorded 0%, 5% or 10% class.");
  }
  if (input.aprilWhiteCloverPct !== undefined && (input.cropSystem !== "GRASS_WHITE_CLOVER_GRAZING" || input.season > new Date().toISOString().slice(0, 4))) {
    throw new Error("April clover class must be confirmed for a current or previous-season clover grazing field.");
  }

  const source = input.farmerName.trim() || "Farmer";
  const existing = await getFieldProductionCycle(input.fieldId, input.season);
  const previousEvidence = existing?.evidence ?? {};
  const evidence: FieldProductionCycleEvidence = {
    ...previousEvidence,
    cropSystem: createFarmerEvidence(input.cropSystem, source, undefined, previousEvidence.cropSystem),
    ...(input.grazingProductionSystem
      ? { grazingProductionSystem: createFarmerEvidence(input.grazingProductionSystem, `Field exception · ${source}`, undefined, previousEvidence.grazingProductionSystem) }
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
    ...(input.aprilWhiteCloverPct !== undefined
      ? { aprilWhiteCloverPct: createFarmerEvidence(input.aprilWhiteCloverPct, "April sward class · " + source, undefined, previousEvidence.aprilWhiteCloverPct) }
      : {}),
  };

  if (
    !input.grazingProductionSystem &&
    evidence.grazingProductionSystem &&
    !(evidence.grazingProductionSystem.method === "FARMER_DECLARED" && evidence.grazingProductionSystem.source.startsWith("Field exception · "))
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
