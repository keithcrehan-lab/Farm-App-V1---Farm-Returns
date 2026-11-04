import "server-only";

/**
 * Target-season slurry forecast adoptions (Codex audit F010) — append-only
 * reads/writes of `slurry_forecast_adoptions`. Never touches
 * `slurry_allocations` or store levels: an adopted forecast is planning
 * intent, not physical slurry. Which adoption governs a season is chosen by
 * the domain (`currentSlurryForecastAdoption`), never here.
 *
 * Write boundary (`20261103135703_slurry_forecast_adoption_server_write_boundary.sql`):
 * - FARMER_FORECAST adoptions and withdrawals are the farmer's own
 *   declaration and go through the session client under RLS, like every
 *   other farmer-owned table (`decisions.ts` documents why).
 * - A SYSTEM_FORECAST adoption claims the server calculated it. The
 *   database forbids `authenticated` from inserting one at all, so a direct
 *   REST insert can never establish that provenance. It is written only
 *   here, after the server action recomputed and bound the forecast
 *   (`bindSystemSlurryForecast`), through the server-only service-role
 *   client — after an explicit session-scoped ownership check of the farm,
 *   since service_role bypasses RLS — and stamped `SERVER_BOUND`.
 */
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient, isServiceRoleConfigured } from "@/lib/supabase/service-role";
import type {
  SlurryForecastAdoptionRecord,
  SlurryForecastIntent,
  SystemSlurryForecastSnapshot,
} from "@/domain/slurry-forecast-adoption";

interface SlurryForecastAdoptionRow {
  id: string;
  farm_id: string;
  planning_season: string;
  action: "adopt" | "withdraw";
  planning_date: string | null;
  forecast_source: "FARMER_FORECAST" | "SYSTEM_FORECAST" | null;
  expected_available_m3: number | string | null;
  production_basis: "TARGET_SEASON_SAVED" | "CARRY_FORWARD_CURRENT_SETTINGS" | null;
  carried_forward_from_season: string | null;
  scenario_version: string | null;
  /** `20261103122537_slurry_forecast_adoption_system_binding.sql` — absent
   * until that migration is applied. */
  system_forecast_version?: string | null;
  system_forecast_assessed_on?: string | null;
  system_forecast_stores?: SystemSlurryForecastSnapshot["stores"] | null;
  /** `20261103135703_slurry_forecast_adoption_server_write_boundary.sql`. */
  system_forecast_binding?: "SERVER_BOUND" | null;
  intents: SlurryForecastIntent[] | null;
  adopted_at: string;
  adopted_by: string | null;
}

/** Postgres `undefined_table` / PostgREST schema-cache miss: the migration
 * is not applied on this project, so no adoption can exist. */
const TABLE_NOT_APPLIED_CODES: ReadonlySet<string> = new Set(["42P01", "PGRST205"]);

function rowToAdoption(row: SlurryForecastAdoptionRow): SlurryForecastAdoptionRecord {
  return {
    id: row.id,
    farmId: row.farm_id,
    planningSeason: row.planning_season,
    action: row.action,
    ...(row.planning_date ? { planningDate: row.planning_date } : {}),
    ...(row.forecast_source ? { forecastSource: row.forecast_source } : {}),
    ...(row.expected_available_m3 !== null ? { expectedAvailableM3: Number(row.expected_available_m3) } : {}),
    ...(row.production_basis ? { productionBasis: row.production_basis } : {}),
    ...(row.carried_forward_from_season ? { carriedForwardFromSeason: row.carried_forward_from_season } : {}),
    ...(row.scenario_version ? { scenarioVersion: row.scenario_version } : {}),
    ...(row.system_forecast_version && row.system_forecast_assessed_on && Array.isArray(row.system_forecast_stores)
      ? {
          systemForecast: {
            version: row.system_forecast_version,
            assessedOn: row.system_forecast_assessed_on,
            targetDate: row.planning_date ?? "",
            stores: row.system_forecast_stores.map((store) => ({
              housingId: store.housingId,
              projectedAvailableForNewPlanM3: Number(store.projectedAvailableForNewPlanM3),
            })),
          },
        }
      : {}),
    ...(row.system_forecast_binding === "SERVER_BOUND" ? { systemForecastBinding: "SERVER_BOUND" as const } : {}),
    intents: (row.intents ?? []).map((intent) => ({ ...intent, volumeM3: Number(intent.volumeM3) })),
    adoptedAt: row.adopted_at,
    ...(row.adopted_by ? { adoptedBy: row.adopted_by } : {}),
  };
}

export async function listSlurryForecastAdoptionsForFarm(farmId: string): Promise<SlurryForecastAdoptionRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("slurry_forecast_adoptions")
    .select("*")
    .eq("farm_id", farmId)
    .order("adopted_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    if (TABLE_NOT_APPLIED_CODES.has(error.code ?? "")) return [];
    throw error;
  }
  return ((data ?? []) as SlurryForecastAdoptionRow[]).map(rowToAdoption);
}

export type NewSlurryForecastAdoption = Omit<
  SlurryForecastAdoptionRecord,
  "id" | "farmId" | "adoptedAt" | "systemForecastBinding"
>;

/** Whether a SYSTEM_FORECAST adoption can be written: the server-only
 * service-role client is configured. When it is not, the action fails
 * closed rather than writing an unbound system forecast. */
export function isSystemSlurryForecastWriteConfigured(): boolean {
  return isServiceRoleConfigured();
}

function adoptionInsertRow(farmId: string, input: NewSlurryForecastAdoption) {
  return {
    farm_id: farmId,
    planning_season: input.planningSeason,
    action: input.action,
    planning_date: input.planningDate ?? null,
    forecast_source: input.forecastSource ?? null,
    expected_available_m3: input.expectedAvailableM3 ?? null,
    production_basis: input.productionBasis ?? null,
    carried_forward_from_season: input.carriedForwardFromSeason ?? null,
    scenario_version: input.scenarioVersion ?? null,
    intents: input.intents,
    adopted_by: input.adoptedBy ?? null,
  };
}

export async function createSlurryForecastAdoption(
  farmId: string,
  input: NewSlurryForecastAdoption,
): Promise<SlurryForecastAdoptionRecord> {
  const supabase = await createClient();
  const isSystem = input.action === "adopt" && input.forecastSource === "SYSTEM_FORECAST";
  if (!isSystem) {
    if (input.systemForecast) throw new Error("createSlurryForecastAdoption: a system snapshot requires SYSTEM_FORECAST");
    const { data, error } = await supabase
      .from("slurry_forecast_adoptions")
      .insert(adoptionInsertRow(farmId, input))
      .select("*")
      .single();
    if (error) throw error;
    return rowToAdoption(data as SlurryForecastAdoptionRow);
  }

  const snapshot = input.systemForecast;
  if (!snapshot) throw new Error("createSlurryForecastAdoption: SYSTEM_FORECAST requires the server-bound snapshot");
  // service_role bypasses RLS, so ownership is checked explicitly with the
  // caller's own session first: the farm must be theirs.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: owned, error: ownershipError } = await supabase
    .from("farms")
    .select("id")
    .eq("id", farmId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (ownershipError) throw ownershipError;
  if (!owned) throw new Error("createSlurryForecastAdoption: farm is not owned by the current user");

  const { data, error } = await createServiceRoleClient()
    .from("slurry_forecast_adoptions")
    .insert({
      ...adoptionInsertRow(farmId, input),
      system_forecast_version: snapshot.version,
      system_forecast_assessed_on: snapshot.assessedOn,
      system_forecast_stores: snapshot.stores,
      system_forecast_binding: "SERVER_BOUND",
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToAdoption(data as SlurryForecastAdoptionRow);
}
