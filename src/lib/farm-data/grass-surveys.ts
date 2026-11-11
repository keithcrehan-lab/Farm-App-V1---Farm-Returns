import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { GrassSurveyMode, SurveyResults, SurveyTrackPoint, SurveyWeather } from "@/domain/grass-survey";

const TABLE = "grass_surveys";
const TRACK = "grass_survey_track_points";

export interface GrassSurveyRecord {
  id: string;
  mode: GrassSurveyMode;
  status: "in_progress" | "finished";
  startedAt: string;
  finishedAt: string | null;
  distanceM: number | null;
  weather: SurveyWeather | null;
  results: SurveyResults | null;
  markedGrazedFieldIds: string[];
  skippedFieldIds: string[];
}

interface SurveyRow {
  id: string;
  mode: GrassSurveyMode;
  status: "in_progress" | "finished";
  started_at: string;
  finished_at: string | null;
  distance_m: number | string | null;
  weather: SurveyWeather | null;
  results: SurveyResults | null;
  marked_grazed_field_ids: string[] | null;
  skipped_field_ids: string[] | null;
}

const COLUMNS = "id,mode,status,started_at,finished_at,distance_m,weather,results,marked_grazed_field_ids,skipped_field_ids";

function toRecord(r: SurveyRow): GrassSurveyRecord {
  return {
    id: r.id,
    mode: r.mode,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    distanceM: r.distance_m === null ? null : Number(r.distance_m),
    weather: r.weather,
    results: r.results,
    markedGrazedFieldIds: r.marked_grazed_field_ids ?? [],
    skippedFieldIds: r.skipped_field_ids ?? [],
  };
}

export async function getGrassSurvey(farmId: string, id: string): Promise<GrassSurveyRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("farm_id", farmId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toRecord(data as SurveyRow) : null;
}

export async function createGrassSurvey(
  farmId: string,
  input: { id: string; mode: GrassSurveyMode; startedAt: string; weather: SurveyWeather | null; device: string | null },
): Promise<GrassSurveyRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).insert({
    id: input.id,
    farm_id: farmId,
    mode: input.mode,
    started_at: input.startedAt,
    weather: input.weather,
    device: input.device,
  }).select(COLUMNS).single();
  if (error) {
    if (error.code === "23505") {
      const existing = await getGrassSurvey(farmId, input.id);
      if (existing) return existing;
    }
    throw error;
  }
  return toRecord(data as SurveyRow);
}

export async function getActiveGrassSurvey(farmId: string): Promise<GrassSurveyRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select(COLUMNS)
    .eq("farm_id", farmId).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? toRecord(data as SurveyRow) : null;
}

export async function listFinishedGrassSurveys(farmId: string, limit = 60): Promise<GrassSurveyRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select(COLUMNS)
    .eq("farm_id", farmId).eq("status", "finished").order("started_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => toRecord(r as SurveyRow));
}

export async function updateGrassSurvey(
  farmId: string,
  id: string,
  patch: Partial<{ status: "finished"; finished_at: string; distance_m: number; results: SurveyResults; weather: SurveyWeather | null; marked_grazed_field_ids: string[]; skipped_field_ids: string[] }>,
): Promise<GrassSurveyRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).update(patch).eq("farm_id", farmId).eq("id", id).select(COLUMNS).single();
  if (error) throw error;
  return toRecord(data as SurveyRow);
}

/** Idempotent: a point already stored for the same instant is ignored. */
export async function appendGrassSurveyTrackPoints(farmId: string, surveyId: string, points: readonly SurveyTrackPoint[]): Promise<void> {
  if (!points.length) return;
  const supabase = await createClient();
  const { error } = await supabase.from(TRACK).upsert(
    points.map((p) => ({ survey_id: surveyId, farm_id: farmId, recorded_at: p.recordedAt, lat: p.lat, lng: p.lng, accuracy_m: p.accuracyM })),
    { onConflict: "survey_id,recorded_at", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function listGrassSurveyTrackPoints(farmId: string, surveyId: string): Promise<SurveyTrackPoint[]> {
  const supabase = await createClient();
  const out: SurveyTrackPoint[] = [];
  const page = 1000;
  for (let from = 0; from < 50_000; from += page) {
    const { data, error } = await supabase.from(TRACK).select("recorded_at,lat,lng,accuracy_m")
      .eq("farm_id", farmId).eq("survey_id", surveyId).order("recorded_at", { ascending: true }).range(from, from + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) out.push({ recordedAt: r.recorded_at, lat: r.lat, lng: r.lng, accuracyM: r.accuracy_m });
    if (rows.length < page) break;
  }
  return out;
}

export async function listGrassSurveyObservationIds(farmId: string, surveyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("grass_cover_observations").select("id").eq("farm_id", farmId).eq("survey_id", surveyId);
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}
