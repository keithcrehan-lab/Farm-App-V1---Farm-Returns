import "server-only";

/**
 * Real Farm V1 Phase 3 — Farm queries/mutations. Server-only (Supabase
 * session cookies live server-side); every function re-derives the current
 * user itself rather than trusting a caller-supplied id, per Next.js's
 * Data Security guide ("verify authentication and authorization inside
 * every Server Function").
 *
 * One farm per user for V1 — the brief's Definition of Done describes a
 * single real farm per signed-in farmer, not a multi-farm switcher; `.limit(1)`
 * below is a deliberate, documented scope limit, not an oversight.
 */
import { createClient } from "@/lib/supabase/server";
import { tracked, type Farm, type FarmGrazingProductionSystem } from "@/domain/types";
import { farmToInsertRow, rowToFarm, type NewFarmInput } from "./mappers";
import type { FarmRow } from "./row-types";
import type { PrecedingYearGsrRecord } from "@/domain/preceding-year-gsr";

export async function getFarmForCurrentUser(): Promise<Farm | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("farms")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return data ? withPrecedingYearGsrRecords(rowToFarm(data as FarmRow)) : null;
}

/**
 * Real Mode Completion Phase 2/3 — "has this farmer actually finished
 * onboarding" needs to be a real, persisted fact, not inferred from
 * "does a farms row exist" (a farmer who created a farm and left before
 * adding livestock has a row but hasn't finished). `/onboarding` and
 * `(app)/layout.tsx` both call this to decide: no farm -> start
 * onboarding at the Farm step; a farm but not completed -> resume at the
 * Livestock step with the real farm already loaded; completed -> proceed
 * into the app.
 */
export async function getOnboardingStatusForCurrentUser(): Promise<
  { farm: Farm; completed: boolean } | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("farms")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as FarmRow;
  return { farm: await withPrecedingYearGsrRecords(rowToFarm(row)), completed: row.onboarding_completed_at !== null };
}

export async function markOnboardingComplete(farmId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { error } = await supabase
    .from("farms")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", farmId)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function createFarmForCurrentUser(input: NewFarmInput): Promise<Farm> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("farms")
    .insert(farmToInsertRow(user.id, input))
    .select("*")
    .single();
  if (error) throw error;

  return rowToFarm(data as FarmRow);
}

export async function updateFarmProfileForCurrentUser(
  farmId: string,
  patch: { name?: string; ownerName?: string; county?: string; grazingProductionSystem?: FarmGrazingProductionSystem | null },
): Promise<Farm> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.ownerName !== undefined) row.owner_name = patch.ownerName;
  if (patch.county !== undefined) row.county = patch.county;
  if (patch.grazingProductionSystem !== undefined) {
    row.grazing_production_system = patch.grazingProductionSystem === null
      ? null
      : tracked(patch.grazingProductionSystem, "farmer_adjusted", "Farmer");
  }

  // RLS also enforces this, but scoping the update to user_id here too
  // means a wrong/stale farmId fails as "no row updated", not a
  // cross-account write silently scoped away only by the database.
  const { data, error } = await supabase
    .from("farms")
    .update(row)
    .eq("id", farmId)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) throw error;

  return withPrecedingYearGsrRecords(rowToFarm(data as FarmRow));
}

interface PrecedingYearGsrRecordRow {
  id: string;
  farm_id: string;
  reference_year: string;
  gsr_kg_n_ha: number | string;
  status: PrecedingYearGsrRecord["status"];
  source: string;
  recorded_by: string | null;
  created_at: string;
  /** `20261103135704_preceding_year_gsr_record_order.sql` — absent until
   * that migration is applied; null on rows inserted before it. */
  record_order?: number | string | null;
}

/** Postgres `undefined_table` / PostgREST schema-cache miss: the migration
 * is not applied on this project, so no table record can exist. */
const GSR_TABLE_NOT_APPLIED_CODES: ReadonlySet<string> = new Set(["42P01", "PGRST205"]);

function rowToPrecedingYearGsrRecord(row: PrecedingYearGsrRecordRow): PrecedingYearGsrRecord {
  return {
    id: row.id,
    referenceYear: row.reference_year,
    gsrKgNHa: Number(row.gsr_kg_n_ha),
    status: row.status,
    source: row.source,
    // Database-stamped capture time (clock_timestamp()), never the caller's.
    recordedAt: row.created_at,
    ...(row.recorded_by ? { recordedBy: row.recorded_by } : {}),
    // Database-assigned insertion order: the authoritative "later" key.
    ...(row.record_order !== undefined && row.record_order !== null ? { recordOrder: Number(row.record_order) } : {}),
  };
}

/** Every preceding-year stocking-rate record of the farm, from the
 * insert-only `farm_preceding_year_gsr_records` table (Codex audit F003). */
export async function listPrecedingYearGsrRecordsForFarm(farmId: string): Promise<PrecedingYearGsrRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("farm_preceding_year_gsr_records")
    .select("*")
    .eq("farm_id", farmId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    if (GSR_TABLE_NOT_APPLIED_CODES.has(error.code ?? "")) return [];
    throw error;
  }
  return ((data ?? []) as PrecedingYearGsrRecordRow[]).map(rowToPrecedingYearGsrRecord);
}

/** The farm with every preceding-year stocking-rate record: the insert-only
 * table, plus any record still held in the legacy
 * `farms.preceding_year_gsr_records` column (read-only, merged by id) so
 * nothing recorded before the table existed is lost. */
export async function withPrecedingYearGsrRecords(farm: Farm): Promise<Farm> {
  const tableRecords = await listPrecedingYearGsrRecordsForFarm(farm.id);
  const byId = new Map<string, PrecedingYearGsrRecord>();
  // A database order is only ever the table's. The legacy column is
  // farmer-writable JSON, so any order it claims is discarded and its
  // records keep the lower-authority recorded-time ordering.
  for (const { recordOrder: _claimed, ...legacy } of farm.precedingYearGsrRecords ?? []) {
    void _claimed;
    byId.set(legacy.id, legacy);
  }
  for (const record of tableRecords) byId.set(record.id, record);
  const { precedingYearGsrRecords: _legacy, ...rest } = farm;
  void _legacy;
  return byId.size > 0 ? { ...rest, precedingYearGsrRecords: [...byId.values()] } : rest;
}

export type NewPrecedingYearGsrRecord = Omit<PrecedingYearGsrRecord, "id" | "recordedAt">;

/**
 * Records one preceding-year grassland stocking-rate figure (Codex audit
 * F003) as a single INSERT into the insert-only table — never a
 * read-then-replace of a shared array, so two interleaved saves both
 * survive. A correction is a newer row for the same reference year, and
 * `resolvePrecedingYearGsr` selects the latest; the database stamps the
 * capture time. RLS scopes the insert to the signed-in user's own farm.
 */
export async function appendPrecedingYearGsrRecordForCurrentUser(
  farmId: string,
  record: NewPrecedingYearGsrRecord,
): Promise<Farm> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { error } = await supabase.from("farm_preceding_year_gsr_records").insert({
    farm_id: farmId,
    reference_year: record.referenceYear,
    gsr_kg_n_ha: record.gsrKgNHa,
    status: record.status,
    source: record.source,
    recorded_by: record.recordedBy ?? null,
  });
  if (error) throw error;

  const { data, error: readError } = await supabase
    .from("farms")
    .select("*")
    .eq("id", farmId)
    .eq("user_id", user.id)
    .single();
  if (readError) throw readError;
  return withPrecedingYearGsrRecords(rowToFarm(data as FarmRow));
}
