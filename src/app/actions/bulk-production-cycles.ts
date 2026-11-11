"use server";

import { revalidatePath } from "next/cache";
import type { Field } from "@/domain/types";
import {
  bulkCropSystemEvidence,
  carriedForwardEvidence,
  carryForwardEligibility,
  type BulkFieldOutcomeKind,
  type CarryForwardEligibility,
} from "@/domain/bulk-production-cycle";
import {
  CROP_SYSTEM_LABELS,
  evaluateFertiliserInputGate,
  type CropSystem,
  type FertiliserInputGateStatus,
  type FieldProductionCycle,
} from "@/domain/fertiliser-field-evidence";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import {
  getFieldProductionCycle,
  insertFieldProductionCycleIfAbsent,
  listFieldProductionCyclesForSeason,
  updateFieldProductionCycleCropIfUnchanged,
} from "@/lib/farm-data/field-production-cycles";
import { withFuturePlanningChemicalBaseline } from "@/lib/fertiliser-planning-season";

const MAX_BULK_FIELDS = 500;

export interface BulkFieldOutcome {
  fieldId: string;
  fieldName: string;
  outcome: BulkFieldOutcomeKind;
  /** Evidence gate for the saved cycle, on the season's own planning basis. */
  gateStatus?: FertiliserInputGateStatus;
  /** The cycle as saved (`outcome: "saved"`), so the client store can update
   * the field's derived grazing sward at once (Codex audit F010). */
  savedCycle?: FieldProductionCycle;
}

export type BulkProductionCycleResult =
  | { status: "rejected"; message: string }
  | { status: "completed"; season: string; outcomes: BulkFieldOutcome[] };

export interface BulkProductionCyclePreviewRow {
  fieldId: string;
  fieldName: string;
  currentCropSystem?: CropSystem;
  targetCropSystem?: CropSystem;
  carryForward: CarryForwardEligibility;
}

export type BulkProductionCyclePreview =
  | { status: "rejected"; message: string }
  | { status: "ok"; currentSeason: string; targetSeason: string; rows: BulkProductionCyclePreviewRow[] };

interface OwnedSelection {
  farmerName: string;
  /** Requested ids in order, each resolved to an active field on this farm or left `null`. */
  requested: { fieldId: string; field: Field | null }[];
}

function currentSeason(): string {
  return String(new Date().getFullYear());
}

function validSeason(season: unknown): season is string {
  return typeof season === "string" && /^[0-9]{4}$/.test(season);
}

/** Farm identity is resolved here and never taken from the client. A deleted
 * field stays restorable, but it isn't a target for new planning. */
async function resolveSelection(fieldIds: unknown): Promise<OwnedSelection | string> {
  if (!Array.isArray(fieldIds) || fieldIds.length === 0 || !fieldIds.every((id) => typeof id === "string")) return "Select at least one field.";
  const uniqueIds = [...new Set(fieldIds as string[])];
  if (uniqueIds.length > MAX_BULK_FIELDS) return "Too many fields were selected at once.";
  const farm = await getFarmForCurrentUser();
  if (!farm) return "No signed-in farm is available.";
  const fields = await listFieldsForFarm(farm.id);
  const activeById = new Map(fields.filter((field) => field.farmId === farm.id && !field.archivedAt).map((field) => [field.id, field]));
  return {
    farmerName: farm.ownerName?.trim() || "Farmer",
    requested: uniqueIds.map((fieldId) => ({ fieldId, field: activeById.get(fieldId) ?? null })),
  };
}

function gateStatusFor(field: Field, cycle: FieldProductionCycle, season: string): FertiliserInputGateStatus {
  const basis = season > currentSeason() ? withFuturePlanningChemicalBaseline(cycle, season) : cycle;
  return evaluateFertiliserInputGate(field, basis).status;
}

function revalidateIfSaved(outcomes: BulkFieldOutcome[]): void {
  if (!outcomes.some((item) => item.outcome === "saved")) return;
  revalidatePath("/fields");
  revalidatePath("/fertiliser-plan");
}

export async function previewBulkProductionCyclesAction(input: { fieldIds: string[]; targetSeason: string }): Promise<BulkProductionCyclePreview> {
  const nowSeason = currentSeason();
  if (!validSeason(input.targetSeason) || input.targetSeason < nowSeason) return { status: "rejected", message: "Choose this season or a future season." };
  const selection = await resolveSelection(input.fieldIds);
  if (typeof selection === "string") return { status: "rejected", message: selection };
  const active = selection.requested.flatMap(({ field }) => (field ? [field] : []));
  const ids = active.map((field) => field.id);
  const [currentCycles, targetCycles] = await Promise.all([
    listFieldProductionCyclesForSeason(ids, nowSeason),
    listFieldProductionCyclesForSeason(ids, input.targetSeason),
  ]);
  const currentByField = new Map(currentCycles.map((cycle) => [cycle.fieldId, cycle]));
  const targetByField = new Map(targetCycles.map((cycle) => [cycle.fieldId, cycle]));
  return {
    status: "ok",
    currentSeason: nowSeason,
    targetSeason: input.targetSeason,
    rows: active.map((field) => {
      const current = currentByField.get(field.id);
      const target = targetByField.get(field.id);
      return {
        fieldId: field.id,
        fieldName: field.name,
        ...(current ? { currentCropSystem: current.cropSystem } : {}),
        ...(target ? { targetCropSystem: target.cropSystem } : {}),
        carryForward: carryForwardEligibility(current, target),
      };
    }),
  };
}

/** Sets the confirmed crop/use for one season on each field. Only the crop
 * changes on an existing cycle: its status, dates and other evidence stay. A
 * cycle that changes between the read and the write is left as it now is and
 * reported as not saved, so the farmer's retry starts from the newer record. */
export async function setBulkFieldCropSystemAction(input: { fieldIds: string[]; season: string; cropSystem: CropSystem }): Promise<BulkProductionCycleResult> {
  const nowSeason = currentSeason();
  if (!validSeason(input.season) || input.season < nowSeason || Number(input.season) > Number(nowSeason) + 1) {
    return { status: "rejected", message: "Choose this season or next season." };
  }
  if (!Object.keys(CROP_SYSTEM_LABELS).includes(input.cropSystem)) return { status: "rejected", message: "Choose a crop or use." };
  const selection = await resolveSelection(input.fieldIds);
  if (typeof selection === "string") return { status: "rejected", message: selection };

  const observedAt = new Date().toISOString();
  const outcomes: BulkFieldOutcome[] = [];
  for (const { fieldId, field } of selection.requested) {
    if (!field) {
      outcomes.push({ fieldId, fieldName: "Unavailable field", outcome: "failed" });
      continue;
    }
    try {
      const existing = await getFieldProductionCycle(field.id, input.season);
      if (existing?.cropSystem === input.cropSystem) {
        outcomes.push({ fieldId, fieldName: field.name, outcome: "unchanged", gateStatus: gateStatusFor(field, existing, input.season) });
        continue;
      }
      const evidence = bulkCropSystemEvidence(existing?.evidence ?? {}, input.cropSystem, selection.farmerName, observedAt);
      const saved = existing
        ? await updateFieldProductionCycleCropIfUnchanged({ id: existing.id, expectedUpdatedAt: existing.updatedAt, cropSystem: input.cropSystem, evidence })
        : await insertFieldProductionCycleIfAbsent({
            fieldId: field.id,
            season: input.season,
            cropSystem: input.cropSystem,
            status: input.season > nowSeason ? "planned" : "active",
            evidence,
          });
      if (!saved) {
        console.error("[bulk-production-cycles] cycle changed while saving; left as it is", fieldId);
        outcomes.push({ fieldId, fieldName: field.name, outcome: "failed" });
        continue;
      }
      outcomes.push({ fieldId, fieldName: field.name, outcome: "saved", gateStatus: gateStatusFor(field, saved, input.season), savedCycle: saved });
    } catch (error) {
      console.error("[bulk-production-cycles] set crop failed", fieldId, error);
      outcomes.push({ fieldId, fieldName: field.name, outcome: "failed" });
    }
  }
  revalidateIfSaved(outcomes);
  return { status: "completed", season: input.season, outcomes };
}

/** Creates a planned target-season cycle from each field's current cycle.
 * The current season is only read, and an existing target cycle is left alone. */
export async function carryForwardFieldCyclesAction(input: { fieldIds: string[]; targetSeason: string }): Promise<BulkProductionCycleResult> {
  const nowSeason = currentSeason();
  if (!validSeason(input.targetSeason) || input.targetSeason <= nowSeason) return { status: "rejected", message: "Carry forward needs a future season." };
  const selection = await resolveSelection(input.fieldIds);
  if (typeof selection === "string") return { status: "rejected", message: selection };

  const observedAt = new Date().toISOString();
  const outcomes: BulkFieldOutcome[] = [];
  for (const { fieldId, field } of selection.requested) {
    if (!field) {
      outcomes.push({ fieldId, fieldName: "Unavailable field", outcome: "failed" });
      continue;
    }
    try {
      const [current, target] = await Promise.all([
        getFieldProductionCycle(field.id, nowSeason),
        getFieldProductionCycle(field.id, input.targetSeason),
      ]);
      const eligibility = carryForwardEligibility(current, target);
      if (eligibility !== "CAN_CARRY" || !current) {
        outcomes.push({ fieldId, fieldName: field.name, outcome: eligibility === "HAS_TARGET_CYCLE" ? "skipped_has_target" : "skipped_no_current" });
        continue;
      }
      const created = await insertFieldProductionCycleIfAbsent({
        fieldId: field.id,
        season: input.targetSeason,
        cropSystem: current.cropSystem,
        status: "planned",
        evidence: carriedForwardEvidence(current, selection.farmerName, observedAt),
      });
      outcomes.push(
        created
          ? { fieldId, fieldName: field.name, outcome: "saved", gateStatus: gateStatusFor(field, created, input.targetSeason) }
          : { fieldId, fieldName: field.name, outcome: "skipped_has_target" },
      );
    } catch (error) {
      console.error("[bulk-production-cycles] carry forward failed", fieldId, error);
      outcomes.push({ fieldId, fieldName: field.name, outcome: "failed" });
    }
  }
  revalidateIfSaved(outcomes);
  return { status: "completed", season: input.targetSeason, outcomes };
}
