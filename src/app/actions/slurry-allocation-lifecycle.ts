"use server";

/**
 * Phase 1A — slurry allocation lifecycle Server Actions (edit, cancel,
 * complete, store observation). Design record:
 * `docs/farm-return-next/SLURRY_ALLOCATION_LIFECYCLE.md`.
 *
 * The farm is resolved server-side from the signed-in user and every input
 * is re-validated here (`slurry-allocation-lifecycle.ts`) — never trusted
 * from the client. No resource arithmetic happens here: ownership, state,
 * capacity and store reconciliation are enforced once, atomically, by the
 * database RPCs/triggers (`20260926000000_slurry_allocation_lifecycle.sql`).
 * A refusal is returned as `rejected` with its issue codes (thrown
 * server-action errors are redacted in production). Phase 1B's farmer
 * slurry plan (`SlurryPlanLifecycle.tsx`, via the farm store) calls them
 * and re-reads `loadSlurryPlanStateAction` after every attempt so server
 * state always wins over the screen.
 */
import { revalidatePath } from "next/cache";
import type { Housing } from "@/domain/types";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listHousingForFarm, recordSlurryStoreObservation } from "@/lib/farm-data/housing";
import {
  cancelPlannedSlurryAllocation,
  completePlannedSlurryAllocation,
  listSlurryAllocationRecordsForFarm,
  updatePlannedSlurryAllocation,
} from "@/lib/farm-data/slurry";
import {
  SlurryAllocationLifecycleRejectedError,
  dublinDate,
  validateSlurryAllocationCompletion,
  validateSlurryAllocationEdit,
  validateSlurryStoreObservation,
  type SlurryAllocationCompletionInput,
  type SlurryAllocationEditInput,
  type SlurryAllocationLifecycleIssue,
  type SlurryAllocationRecord,
} from "@/domain/slurry-allocation-lifecycle";

export type SlurryAllocationLifecycleActionResult<T> = { status: "saved"; value: T } | { status: "rejected"; issues: SlurryAllocationLifecycleIssue[] };

async function requireFarmId(): Promise<string> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No farm found for this account.");
  return farm.id;
}

async function persist<T>(write: () => Promise<T>): Promise<SlurryAllocationLifecycleActionResult<T>> {
  let value: T;
  try {
    value = await write();
  } catch (error: unknown) {
    if (error instanceof SlurryAllocationLifecycleRejectedError) return { status: "rejected", issues: error.issues };
    throw error;
  }
  revalidatePath("/spreading");
  revalidatePath("/nutrients");
  revalidatePath("/today");
  revalidatePath("/housing");
  return { status: "saved", value };
}

export async function updatePlannedSlurryAllocationAction(
  input: SlurryAllocationEditInput,
): Promise<SlurryAllocationLifecycleActionResult<SlurryAllocationRecord>> {
  const farmId = await requireFarmId();
  const validation = validateSlurryAllocationEdit(input);
  if (validation.status !== "OK") return { status: "rejected", issues: validation.issues };
  return persist(() => updatePlannedSlurryAllocation(farmId, validation.value));
}

export async function cancelPlannedSlurryAllocationAction(allocationId: string): Promise<SlurryAllocationLifecycleActionResult<SlurryAllocationRecord>> {
  const farmId = await requireFarmId();
  if (typeof allocationId !== "string" || allocationId.trim() === "") return { status: "rejected", issues: ["ALLOCATION_NOT_FOUND"] };
  return persist(() => cancelPlannedSlurryAllocation(farmId, allocationId));
}

export async function completePlannedSlurryAllocationAction(
  input: SlurryAllocationCompletionInput,
): Promise<SlurryAllocationLifecycleActionResult<SlurryAllocationRecord>> {
  const farmId = await requireFarmId();
  const validation = validateSlurryAllocationCompletion(input, dublinDate(new Date()));
  if (validation.status !== "OK") return { status: "rejected", issues: validation.issues };
  return persist(() => completePlannedSlurryAllocation(farmId, validation.value));
}

export async function recordSlurryStoreObservationAction(
  input: { housingId: string; fillPct: string | number },
  linkedGroupIds: string[],
): Promise<SlurryAllocationLifecycleActionResult<Housing>> {
  const farmId = await requireFarmId();
  const validation = validateSlurryStoreObservation(input);
  if (validation.status !== "OK") return { status: "rejected", issues: validation.issues };
  return persist(() => recordSlurryStoreObservation(farmId, validation.value.housingId, validation.value.fillPct, linkedGroupIds));
}

/** Phase 1B — the canonical, reconciled store state and every allocation
 * record (planned, completed, cancelled) of the signed-in farm: what the
 * slurry plan re-reads after each lifecycle attempt or on open. */
export async function loadSlurryPlanStateAction(): Promise<{ housing: Housing[]; records: SlurryAllocationRecord[] }> {
  const farmId = await requireFarmId();
  const [housing, records] = await Promise.all([listHousingForFarm(farmId), listSlurryAllocationRecordsForFarm(farmId)]);
  return { housing, records };
}
