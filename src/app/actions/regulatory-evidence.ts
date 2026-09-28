"use server";

/**
 * Campaign B — the farmer's own declarations of a store's regulatory neat
 * cattle slurry and a field's spreadable area
 * (`regulatory-evidence-records.ts`). The farm is resolved server-side from
 * the signed-in user; the store/field must be on that farm and the input is
 * re-validated by the repository. Every save is a new record — never an
 * edit — and the database stamps who captured it and when. A declaration
 * made here is always `farmer_adjusted` (or `unavailable` for "no
 * figure"), never upgraded to verified. Refusals are returned (thrown
 * server action errors are redacted in production); an unapplied migration
 * is `not_available`, never a silent success.
 */
import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import {
  EvidenceRecordRejectedError,
  RegulatoryEvidenceNotAvailableError,
  createNeatSlurryEvidenceRecord,
  createSpreadableAreaRecord,
  loadRegulatoryEvidenceRecordsForFarm,
} from "@/lib/farm-data/regulatory-evidence";
import type { Field, Housing } from "@/domain/types";
import type { EvidenceRecordValidationError, NeatSlurryEvidenceRecord, SpreadableAreaRecord } from "@/domain/regulatory-evidence-records";
import { NEAT_SLURRY_DECLARATION_SOURCE, SPREADABLE_AREA_DECLARATION_SOURCE } from "@/domain/regulatory-evidence-declarations";

export type RegulatoryEvidenceActionResult<R> =
  | { status: "saved"; record: R }
  | { status: "rejected"; errors: EvidenceRecordValidationError[] }
  | { status: "not_available" };

/** `neatVolumeM3` absent = the farmer has no defensible figure (recorded as
 * unavailable, never as zero). An explicit 0 is a known zero. */
export interface NeatSlurryDeclarationInput {
  housingId: string;
  neatVolumeM3?: number;
  effectiveDate: string;
  note?: string;
}

export interface SpreadableAreaDeclarationInput {
  fieldId: string;
  spreadableAreaHa: number;
  effectiveDate: string;
  note?: string;
}

async function saveEvidence<R>(write: (farmId: string) => Promise<R>): Promise<RegulatoryEvidenceActionResult<R>> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No farm found for this account.");
  let record: R;
  try {
    record = await write(farm.id);
  } catch (error: unknown) {
    if (error instanceof EvidenceRecordRejectedError) return { status: "rejected", errors: error.errors };
    if (error instanceof RegulatoryEvidenceNotAvailableError) return { status: "not_available" };
    throw error;
  }
  for (const path of ["/housing", "/fields", "/nutrients", "/spreading", "/today", "/evidence-report"]) revalidatePath(path);
  return { status: "saved", record };
}

export async function recordNeatSlurryDeclarationAction(input: NeatSlurryDeclarationInput): Promise<RegulatoryEvidenceActionResult<NeatSlurryEvidenceRecord>> {
  return saveEvidence((farmId) =>
    createNeatSlurryEvidenceRecord(farmId, {
      housingId: input.housingId,
      ...(input.neatVolumeM3 === undefined ? { status: "unavailable" as const } : { status: "farmer_adjusted" as const, neatVolumeM3: input.neatVolumeM3 }),
      effectiveDate: input.effectiveDate,
      source: NEAT_SLURRY_DECLARATION_SOURCE,
      ...(input.note ? { note: input.note } : {}),
    }),
  );
}

export async function recordSpreadableAreaDeclarationAction(input: SpreadableAreaDeclarationInput): Promise<RegulatoryEvidenceActionResult<SpreadableAreaRecord>> {
  return saveEvidence((farmId) =>
    createSpreadableAreaRecord(farmId, {
      fieldId: input.fieldId,
      status: "farmer_adjusted",
      spreadableAreaHa: input.spreadableAreaHa,
      effectiveDate: input.effectiveDate,
      source: SPREADABLE_AREA_DECLARATION_SOURCE,
      ...(input.note ? { note: input.note } : {}),
    }),
  );
}

/** The persisted evidence and the store/field state it is judged against,
 * re-read together after a declaration is saved so the screen's canonical
 * selection runs over server state (including another session's store
 * readings or field edits), never over a locally appended record. */
export async function loadRegulatoryEvidenceStateAction(): Promise<{
  housing: Housing[];
  fields: Field[];
  neatSlurryEvidenceRecords: NeatSlurryEvidenceRecord[];
  spreadableAreaRecords: SpreadableAreaRecord[];
}> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No farm found for this account.");
  const [housing, fields, evidence] = await Promise.all([
    listHousingForFarm(farm.id),
    listFieldsForFarm(farm.id),
    loadRegulatoryEvidenceRecordsForFarm(farm.id),
  ]);
  return { housing, fields, neatSlurryEvidenceRecords: evidence.neatSlurryEvidenceRecords, spreadableAreaRecords: evidence.spreadableAreaRecords };
}
