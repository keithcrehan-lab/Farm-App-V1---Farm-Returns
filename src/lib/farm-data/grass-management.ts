import "server-only";

/**
 * Grass Management Phase 1 data access over the append-only
 * `grass_cover_observations` and `farm_grass_growth_observations` ledgers
 * (`20261103231532_grass_management_observations.sql`). No update/delete
 * function exists on purpose — the database grants select/insert only.
 *
 * Every row is parsed strictly: a malformed row (non-finite or
 * out-of-range number, unknown method/origin, unparseable timestamp,
 * half a GPS pair) throws `GrassManagementRowError` rather than being
 * silently coerced, dropped or defaulted.
 */
import {
  isGrassCoverMethod,
  isGrassGrowthOrigin,
  isValidGrassCoverKgDmHa,
  isValidGrassGrowthKgDmHaDay,
  type FarmGrassGrowthObservation,
  type GrassCoverMethod,
  type GrassCoverObservation,
  type GrassGrowthOrigin,
} from "@/domain/grass-management";
import { createClient } from "@/lib/supabase/server";

export interface GrassCoverObservationRow {
  id: string;
  farm_id: string;
  field_id: string;
  cover_kg_dm_ha: number | string;
  method: string;
  lat: number | string | null;
  lng: number | string | null;
  accuracy_m: number | string | null;
  observed_at: string;
  source: string;
  created_at: string;
}

export interface FarmGrassGrowthObservationRow {
  id: string;
  farm_id: string;
  growth_rate_kg_dm_ha_day: number | string;
  origin: string;
  observed_at: string;
  source: string;
  created_at: string;
}

export class GrassManagementRowError extends Error {
  constructor(table: string, id: unknown, detail: string) {
    super(`${table}: malformed row ${String(id)} — ${detail}`);
    this.name = "GrassManagementRowError";
  }
}

const COVER_TABLE = "grass_cover_observations";
const GROWTH_TABLE = "farm_grass_growth_observations";

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return undefined;
}

function requireText(table: string, row: { id?: unknown }, key: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new GrassManagementRowError(table, row.id, `${key} must be non-empty text`);
  return value;
}

function requireTimestamp(table: string, row: { id?: unknown }, key: string, value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new GrassManagementRowError(table, row.id, `${key} is not a valid timestamp`);
  }
  return value;
}

function optionalNumber(
  table: string,
  row: { id?: unknown },
  key: string,
  value: unknown,
  valid: (n: number) => boolean,
): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = toNumber(value);
  if (n === undefined || !Number.isFinite(n) || !valid(n)) throw new GrassManagementRowError(table, row.id, `${key} is out of range`);
  return n;
}

export function parseGrassCoverObservationRow(row: GrassCoverObservationRow): GrassCoverObservation {
  const id = requireText(COVER_TABLE, row, "id", row.id);
  const cover = toNumber(row.cover_kg_dm_ha);
  if (!isValidGrassCoverKgDmHa(cover)) throw new GrassManagementRowError(COVER_TABLE, id, "cover_kg_dm_ha is out of range");
  if (!isGrassCoverMethod(row.method)) throw new GrassManagementRowError(COVER_TABLE, id, `unknown method ${String(row.method)}`);
  const lat = optionalNumber(COVER_TABLE, row, "lat", row.lat, (n) => n >= -90 && n <= 90);
  const lng = optionalNumber(COVER_TABLE, row, "lng", row.lng, (n) => n >= -180 && n <= 180);
  if ((lat === undefined) !== (lng === undefined)) throw new GrassManagementRowError(COVER_TABLE, id, "lat/lng must be both present or both absent");
  const accuracyM = optionalNumber(COVER_TABLE, row, "accuracy_m", row.accuracy_m, (n) => n >= 0);
  return {
    id,
    farmId: requireText(COVER_TABLE, row, "farm_id", row.farm_id),
    fieldId: requireText(COVER_TABLE, row, "field_id", row.field_id),
    coverKgDmHa: cover,
    method: row.method,
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    ...(accuracyM !== undefined ? { accuracyM } : {}),
    observedAt: requireTimestamp(COVER_TABLE, row, "observed_at", row.observed_at),
    source: requireText(COVER_TABLE, row, "source", row.source),
    createdAt: requireTimestamp(COVER_TABLE, row, "created_at", row.created_at),
  };
}

export function parseFarmGrassGrowthObservationRow(row: FarmGrassGrowthObservationRow): FarmGrassGrowthObservation {
  const id = requireText(GROWTH_TABLE, row, "id", row.id);
  const rate = toNumber(row.growth_rate_kg_dm_ha_day);
  if (!isValidGrassGrowthKgDmHaDay(rate)) throw new GrassManagementRowError(GROWTH_TABLE, id, "growth_rate_kg_dm_ha_day is out of range");
  if (!isGrassGrowthOrigin(row.origin)) throw new GrassManagementRowError(GROWTH_TABLE, id, `unknown origin ${String(row.origin)}`);
  return {
    id,
    farmId: requireText(GROWTH_TABLE, row, "farm_id", row.farm_id),
    growthRateKgDmHaDay: rate,
    origin: row.origin,
    observedAt: requireTimestamp(GROWTH_TABLE, row, "observed_at", row.observed_at),
    source: requireText(GROWTH_TABLE, row, "source", row.source),
    createdAt: requireTimestamp(GROWTH_TABLE, row, "created_at", row.created_at),
  };
}

export interface NewGrassCoverObservationInput {
  /** Client-generated idempotency key. */
  id: string;
  farmId: string;
  fieldId: string;
  coverKgDmHa: number;
  method: GrassCoverMethod;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  observedAt: string;
  source: string;
}

export interface NewFarmGrassGrowthObservationInput {
  id: string;
  farmId: string;
  growthRateKgDmHaDay: number;
  origin: GrassGrowthOrigin;
  observedAt: string;
  source: string;
}

function sameInstant(a: string, b: string): boolean {
  return Date.parse(a) === Date.parse(b);
}

function sameCover(input: NewGrassCoverObservationInput, existing: GrassCoverObservation): boolean {
  return (
    existing.farmId === input.farmId &&
    existing.fieldId === input.fieldId &&
    existing.coverKgDmHa === input.coverKgDmHa &&
    existing.method === input.method &&
    existing.lat === input.lat &&
    existing.lng === input.lng &&
    existing.accuracyM === input.accuracyM &&
    sameInstant(existing.observedAt, input.observedAt) &&
    existing.source === input.source
  );
}

function sameGrowth(input: NewFarmGrassGrowthObservationInput, existing: FarmGrassGrowthObservation): boolean {
  return (
    existing.farmId === input.farmId &&
    existing.growthRateKgDmHaDay === input.growthRateKgDmHaDay &&
    existing.origin === input.origin &&
    sameInstant(existing.observedAt, input.observedAt) &&
    existing.source === input.source
  );
}

/** Newest first, ties on id descending — the same order the domain's
 * latest-evidence selection uses. */
export async function listGrassCoverObservationsForFarm(farmId: string): Promise<GrassCoverObservation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(COVER_TABLE)
    .select("*")
    .eq("farm_id", farmId)
    .order("observed_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as GrassCoverObservationRow[]).map(parseGrassCoverObservationRow);
}

/**
 * Inserts one cover observation. Retry-safe by client id: a duplicate id
 * with identical content returns the stored row; a duplicate id with
 * different content throws rather than returning mismatched evidence.
 */
export async function insertGrassCoverObservation(input: NewGrassCoverObservationInput): Promise<GrassCoverObservation> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(COVER_TABLE)
    .insert({
      id: input.id,
      farm_id: input.farmId,
      field_id: input.fieldId,
      cover_kg_dm_ha: input.coverKgDmHa,
      method: input.method,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      accuracy_m: input.accuracyM ?? null,
      observed_at: input.observedAt,
      source: input.source,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: byId, error: byIdError } = await supabase.from(COVER_TABLE).select("*").eq("id", input.id).maybeSingle();
      if (byIdError) throw byIdError;
      if (byId) {
        const existing = parseGrassCoverObservationRow(byId as GrassCoverObservationRow);
        if (!sameCover(input, existing)) {
          throw new Error(`insertGrassCoverObservation: observation ${input.id} already exists with different content`);
        }
        return existing;
      }
    }
    throw error;
  }
  return parseGrassCoverObservationRow(data as GrassCoverObservationRow);
}

export async function listFarmGrassGrowthObservations(farmId: string): Promise<FarmGrassGrowthObservation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(GROWTH_TABLE)
    .select("*")
    .eq("farm_id", farmId)
    .order("observed_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as FarmGrassGrowthObservationRow[]).map(parseFarmGrassGrowthObservationRow);
}

/** Retry-safe by client id, same contract as `insertGrassCoverObservation`. */
export async function insertFarmGrassGrowthObservation(input: NewFarmGrassGrowthObservationInput): Promise<FarmGrassGrowthObservation> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(GROWTH_TABLE)
    .insert({
      id: input.id,
      farm_id: input.farmId,
      growth_rate_kg_dm_ha_day: input.growthRateKgDmHaDay,
      origin: input.origin,
      observed_at: input.observedAt,
      source: input.source,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: byId, error: byIdError } = await supabase.from(GROWTH_TABLE).select("*").eq("id", input.id).maybeSingle();
      if (byIdError) throw byIdError;
      if (byId) {
        const existing = parseFarmGrassGrowthObservationRow(byId as FarmGrassGrowthObservationRow);
        if (!sameGrowth(input, existing)) {
          throw new Error(`insertFarmGrassGrowthObservation: observation ${input.id} already exists with different content`);
        }
        return existing;
      }
    }
    throw error;
  }
  return parseFarmGrassGrowthObservationRow(data as FarmGrassGrowthObservationRow);
}
