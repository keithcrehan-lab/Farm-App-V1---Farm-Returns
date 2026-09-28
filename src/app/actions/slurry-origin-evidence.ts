"use server";

/**
 * Campaign B — records where the slurry in one planned spreading came from
 * (`slurry-origin-evidence.ts`). The farm is resolved server-side from the
 * signed-in user and the input is re-validated here; the database stamps
 * the plan snapshot and capture provenance and refuses a declaration for a
 * plan that is no longer planned or has changed since the farmer saw it.
 * A refusal is returned as `rejected` with its issue codes (thrown server
 * action errors are redacted in production).
 */
import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { SlurryOriginEvidenceRejectedError, createSlurryOriginEvidenceRecord } from "@/lib/farm-data/regulatory-evidence";
import type { SlurryOriginDeclaration, SlurryOriginEvidenceRecord, SlurryOriginEvidenceRejection } from "@/domain/slurry-origin-evidence";

export type SlurryOriginEvidenceActionResult =
  | { status: "saved"; record: SlurryOriginEvidenceRecord }
  | { status: "rejected"; issues: SlurryOriginEvidenceRejection[] };

export async function recordSlurryOriginDeclarationAction(input: {
  allocationId: string;
  planRevision: number;
  origin: SlurryOriginDeclaration;
}): Promise<SlurryOriginEvidenceActionResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No farm found for this account.");
  let record: SlurryOriginEvidenceRecord;
  try {
    // A farmer's own answer on the slurry plan: always `farmer_adjusted`,
    // never upgraded to verified here.
    record = await createSlurryOriginEvidenceRecord(farm.id, {
      allocationId: input.allocationId,
      planRevision: input.planRevision,
      origin: input.origin,
      status: "farmer_adjusted",
      source: "Farmer declaration on the slurry plan",
    });
  } catch (error: unknown) {
    if (error instanceof SlurryOriginEvidenceRejectedError) return { status: "rejected", issues: error.issues };
    throw error;
  }
  revalidatePath("/spreading");
  revalidatePath("/nutrients");
  revalidatePath("/today");
  return { status: "saved", record };
}
