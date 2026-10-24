import "server-only";

/**
 * Pilot Integration P1 — the farm-scoped read of the real cattle records
 * (`docs/farm-return-next/pilot-integration/DECISIONS.md` D1, D6). Rows only:
 * no cattle-engine logic, no demonstration fallback.
 *
 * The farm is NEVER a caller argument: it is resolved here, server-side, from
 * the authenticated user (`getFarmForCurrentUser`). Every query is filtered by
 * that farm id, under the `livestock_*` owner RLS policies.
 *
 * Completeness: PostgREST caps every response at the project's max-rows, so
 * an unbounded `select` can silently truncate (P0 finding). Individuals and
 * weights are read in pages with an exact count, and the read FAILS CLOSED
 * (`INCOMPLETE`) unless every counted row arrived — a short history is never
 * presented as the whole one. This holds whatever the server cap is, since
 * the loop stops on the count, not on a short page.
 */
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LivestockGroup } from "@/domain/types";
import { getFarmForCurrentUser } from "./farms";
import { listLivestockGroupsForFarm } from "./livestock";
import type { LivestockIndividualRow, WeightObservationRow } from "./row-types";

/** Requested page size. The server may return fewer per page; the count decides completeness. */
export const CATTLE_SOURCE_PAGE_SIZE = 1000;

export interface CattleSourceRecords {
  farmId: string;
  groups: LivestockGroup[];
  animals: LivestockIndividualRow[];
  weights: WeightObservationRow[];
}

export type CattleSourceRead =
  | { state: "OK"; records: CattleSourceRecords }
  /** No signed-in user, or the user has no farm. */
  | { state: "NO_FARM" }
  /** A query failed. */
  | { state: "UNAVAILABLE" }
  /** The rows couldn't all be read (the count and the rows received disagree). */
  | { state: "INCOMPLETE" };

type Supabase = Awaited<ReturnType<typeof createClient>>;

class IncompleteRead extends Error {}

async function readAllRows<T>(supabase: Supabase, table: "livestock_individuals" | "livestock_weight_observations", farmId: string): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;
  for (;;) {
    const from = rows.length;
    const { data, error, count } = await supabase
      .from(table)
      .select("*", { count: "exact" })
      .eq("farm_id", farmId)
      // Deterministic, total order: new rows (later created_at) land at the end, never between pages.
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + CATTLE_SOURCE_PAGE_SIZE - 1);
    if (error) throw error;
    if (typeof count !== "number") throw new IncompleteRead(`${table}: no row count`);
    expected ??= count;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (rows.length >= expected) break;
    if (page.length === 0) throw new IncompleteRead(`${table}: ${rows.length} of ${expected} rows`);
  }
  if (rows.length !== expected) throw new IncompleteRead(`${table}: ${rows.length} rows, ${expected} counted`);
  return rows;
}

export async function readCattleSourceForCurrentFarm(): Promise<CattleSourceRead> {
  try {
    const farm = await getFarmForCurrentUser();
    if (!farm) return { state: "NO_FARM" };
    const supabase = await createClient();
    const [groups, animals, weights] = await Promise.all([
      listLivestockGroupsForFarm(farm.id),
      readAllRows<LivestockIndividualRow>(supabase, "livestock_individuals", farm.id),
      readAllRows<WeightObservationRow>(supabase, "livestock_weight_observations", farm.id),
    ]);
    // A farm's handful of groups is read by the existing reader; at a full page it fails closed rather than trust it.
    if (groups.length >= CATTLE_SOURCE_PAGE_SIZE) return { state: "INCOMPLETE" };
    return { state: "OK", records: { farmId: farm.id, groups, animals, weights } };
  } catch (e) {
    // Next's own control-flow signals (dynamic rendering, redirect, not-found) are never a "read failed".
    unstable_rethrow(e);
    if (e instanceof IncompleteRead) {
      console.error("[cattle-source] incomplete read:", e.message);
      return { state: "INCOMPLETE" };
    }
    console.error("[cattle-source] read failed:", e);
    return { state: "UNAVAILABLE" };
  }
}
