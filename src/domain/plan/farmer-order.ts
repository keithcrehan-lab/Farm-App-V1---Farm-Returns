/**
 * Plan kernel — farmer working order.
 *
 * The farmer's chosen execution sequence, held separately from system
 * priority. Only an explicit farmer move changes an existing position.
 * Reconciliation drops jobs that left the active set and appends newly
 * active jobs at the end (system priority, then id, decides only the
 * relative order of the newcomers), so a system-priority change never
 * silently reorders a farmer-selected sequence.
 */

import { planAuditEvent, type PlanAuditEvent } from "./audit";
import { compareSystemPriority, type SystemPriority } from "./priority";

export interface FarmerWorkingOrder {
  jobIds: readonly string[];
}

export const EMPTY_FARMER_ORDER: FarmerWorkingOrder = { jobIds: [] };

interface OrderableJob {
  id: string;
  systemPriority: SystemPriority;
}

function byPriorityThenId(a: OrderableJob, b: OrderableJob): number {
  return compareSystemPriority(a.systemPriority, b.systemPriority) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function reconcileFarmerOrder(
  order: FarmerWorkingOrder,
  activeJobs: readonly OrderableJob[],
): FarmerWorkingOrder {
  const active = new Set(activeJobs.map((j) => j.id));
  const kept = [...new Set(order.jobIds)].filter((id) => active.has(id));
  const keptSet = new Set(kept);
  const newcomers = activeJobs.filter((j) => !keptSet.has(j.id)).sort(byPriorityThenId);
  return { jobIds: [...kept, ...[...new Set(newcomers.map((j) => j.id))]] };
}

export type FarmerOrderResult =
  | { ok: true; order: FarmerWorkingOrder; events: readonly PlanAuditEvent[] }
  | { ok: false; error: string };

/** Farmer moves `jobId` to `toIndex` (clamped to the list). */
export function moveInFarmerOrder(
  order: FarmerWorkingOrder,
  jobId: string,
  toIndex: number,
  nowIso: string,
): FarmerOrderResult {
  if (!Number.isInteger(toIndex) || toIndex < 0) return { ok: false, error: "INVALID_INDEX" };
  const ids = [...order.jobIds];
  const fromIndex = ids.indexOf(jobId);
  if (fromIndex === -1) return { ok: false, error: "JOB_NOT_IN_ORDER" };
  ids.splice(fromIndex, 1);
  const target = Math.min(toIndex, ids.length);
  ids.splice(target, 0, jobId);
  if (target === fromIndex) return { ok: true, order, events: [] };
  return {
    ok: true,
    order: { jobIds: ids },
    events: [planAuditEvent(jobId, nowIso, { type: "FARMER_ORDER_CHANGED", fromIndex, toIndex: target })],
  };
}

/** Jobs in farmer order; any not yet in the order follow by priority then id. */
export function sortByFarmerOrder<T extends OrderableJob>(jobs: readonly T[], order: FarmerWorkingOrder): T[] {
  const position = new Map(order.jobIds.map((id, i) => [id, i]));
  return [...jobs].sort((a, b) => {
    const pa = position.get(a.id);
    const pb = position.get(b.id);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return byPriorityThenId(a, b);
  });
}
