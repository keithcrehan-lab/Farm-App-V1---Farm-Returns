"use server";

import { revalidatePath } from "next/cache";
import { cleanSurveyTrack, computeSurveyResults, isGrassSurveyMode, trackDistanceM, type SurveyTrackPoint, type SurveyWeather } from "@/domain/grass-survey";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { insertFarmGrassGrowthObservation, listGrassCoverObservationsForFarm, listGrassCoverObservationsForSurvey } from "@/lib/farm-data/grass-management";
import { isValidGrassGrowthKgDmHaDay } from "@/domain/grass-management";
import { listGrazingFieldSessionsForFarm } from "@/lib/farm-data/grazing-field-sessions";
import {
  appendGrassSurveyTrackPoints,
  createGrassSurvey,
  getActiveGrassSurvey,
  getGrassSurvey,
  listFinishedGrassSurveys,
  listGrassSurveyObservationIds,
  listGrassSurveyTrackPoints,
  updateGrassSurvey,
  type GrassSurveyRecord,
} from "@/lib/farm-data/grass-surveys";
import { getWeatherForField } from "@/server/weather/weather-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

type Result<T> = { ok: true } & T | { ok: false; error: string };

async function weatherSnapshot(centroid: [number, number]): Promise<SurveyWeather | null> {
  try {
    const result = await Promise.race([
      getWeatherForField({ centroid }, { lookbackHours: 168 }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 7000)),
    ]);
    if (!result) return null;
    const recent = [...result.observations].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
    const latest = <K extends "airTemperatureC" | "windSpeedMps" | "windDirectionDeg" | "soilTemperatureC">(key: K) => {
      const hit = recent.find((o) => o[key] !== null);
      return hit ? (hit[key] as number) : null;
    };
    const wind = latest("windSpeedMps");
    const rain7 = result.rollingRainfall.find((w) => w.windowHours === 168);
    return {
      status: result.status,
      stationName: result.station?.canonicalName ?? null,
      distanceKm: result.station ? Math.round(result.station.distanceKm * 10) / 10 : null,
      observedAt: recent[0]?.observedAt ?? null,
      airTemperatureC: latest("airTemperatureC"),
      windSpeedKmh: wind === null ? null : Math.round(wind * 3.6),
      windDirectionDeg: latest("windDirectionDeg"),
      soilTemperatureC: latest("soilTemperatureC"),
      rainfall7dMm: rain7 && rain7.totalMm !== null ? Math.round(rain7.totalMm * 10) / 10 : null,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.fallbackUsed && result.nearestGeographicStation
        ? { nearestStationName: result.nearestGeographicStation.canonicalName, nearestStationDistanceKm: Math.round(result.nearestGeographicStation.distanceKm * 10) / 10 }
        : {}),
    };
  } catch (err) {
    console.error("[Grass surveys] weather snapshot failed", err);
    return null;
  }
}

/** Middle of the farm's mapped fields ([lng, lat]); the farm's sign-up location only if none are mapped. */
async function walkWeatherCentroid(farmId: string, fallback: [number, number]): Promise<[number, number]> {
  try {
    const mapped = (await listFieldsForFarm(farmId)).filter(
      (f) => !f.archivedAt && f.polygon && Number.isFinite(f.centroid?.[0]) && Number.isFinite(f.centroid?.[1]),
    );
    if (!mapped.length) return fallback;
    const lng = mapped.reduce((sum, f) => sum + f.centroid[0], 0) / mapped.length;
    const lat = mapped.reduce((sum, f) => sum + f.centroid[1], 0) / mapped.length;
    return [lng, lat];
  } catch (err) {
    console.error("[Grass surveys] field location lookup failed", err);
    return fallback;
  }
}

export async function startGrassSurveyAction(input: { id: string; mode: string; startedAt: string; device?: string }): Promise<Result<{ survey: GrassSurveyRecord }>> {
  if (!input || typeof input.id !== "string" || !UUID.test(input.id)) return { ok: false, error: "Invalid walk id." };
  if (!isGrassSurveyMode(input.mode) || input.mode === "drone") return { ok: false, error: "Choose walk or quad." };
  const started = Date.parse(input.startedAt);
  if (!Number.isFinite(started) || Math.abs(started - Date.now()) > DAY_MS) return { ok: false, error: "Check your phone's date and time." };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to record a walk." };
  try {
    // Provisional weather at the start, from the middle of the mapped fields; replaced at Finish
    // by the station nearest the recorded route.
    const weather = await weatherSnapshot(await walkWeatherCentroid(farm.id, farm.location.centroid));
    const device = typeof input.device === "string" ? input.device.slice(0, 200) : null;
    const survey = await createGrassSurvey(farm.id, { id: input.id, mode: input.mode, startedAt: new Date(started).toISOString(), weather, device });
    return { ok: true, survey };
  } catch (err) {
    console.error("[Grass surveys] start failed", err);
    return { ok: false, error: "Couldn't start the walk just now. Check your signal and try again." };
  }
}

export async function getActiveGrassSurveyAction(): Promise<GrassSurveyRecord | null> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return null;
  try {
    return await getActiveGrassSurvey(farm.id);
  } catch (err) {
    console.error("[Grass surveys] active lookup failed", err);
    return null;
  }
}

export async function appendGrassSurveyTrackAction(surveyId: string, points: SurveyTrackPoint[]): Promise<{ ok: boolean }> {
  if (typeof surveyId !== "string" || !UUID.test(surveyId) || !Array.isArray(points) || points.length > 1000) return { ok: false };
  const clean = points.filter((p) =>
    p && typeof p.recordedAt === "string" && Number.isFinite(Date.parse(p.recordedAt)) &&
    Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180 &&
    (p.accuracyM === null || (Number.isFinite(p.accuracyM) && p.accuracyM >= 0)),
  ).map((p) => ({ recordedAt: new Date(p.recordedAt).toISOString(), lat: p.lat, lng: p.lng, accuracyM: p.accuracyM }));
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false };
  try {
    await appendGrassSurveyTrackPoints(farm.id, surveyId, clean);
    return { ok: true };
  } catch (err) {
    console.error("[Grass surveys] track append failed", err);
    return { ok: false };
  }
}

export async function markGrassSurveyFieldAction(surveyId: string, fieldId: string, mark: "grazed" | "skipped" | "clear"): Promise<Result<{ survey: GrassSurveyRecord }>> {
  if (!UUID.test(String(surveyId)) || !UUID.test(String(fieldId)) || !["grazed", "skipped", "clear"].includes(mark)) return { ok: false, error: "Invalid request." };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to record a walk." };
  try {
    const survey = await getGrassSurvey(farm.id, surveyId);
    if (!survey || survey.status !== "in_progress") return { ok: false, error: "This walk has already finished." };
    const grazed = new Set(survey.markedGrazedFieldIds);
    const skipped = new Set(survey.skippedFieldIds);
    grazed.delete(fieldId);
    skipped.delete(fieldId);
    if (mark === "grazed") grazed.add(fieldId);
    if (mark === "skipped") skipped.add(fieldId);
    const updated = await updateGrassSurvey(farm.id, surveyId, { marked_grazed_field_ids: [...grazed], skipped_field_ids: [...skipped] });
    return { ok: true, survey: updated };
  } catch (err) {
    console.error("[Grass surveys] mark failed", err);
    return { ok: false, error: "Couldn't save that just now. Try again." };
  }
}

export async function finishGrassSurveyAction(surveyId: string): Promise<Result<{ survey: GrassSurveyRecord }>> {
  if (!UUID.test(String(surveyId))) return { ok: false, error: "Invalid walk id." };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to record a walk." };
  try {
    const survey = await getGrassSurvey(farm.id, surveyId);
    if (!survey) return { ok: false, error: "Walk not found." };
    if (survey.status === "finished") return { ok: true, survey };
    const [fields, observations, sessions, track, surveyObservationIds, finished] = await Promise.all([
      listFieldsForFarm(farm.id),
      listGrassCoverObservationsForFarm(farm.id),
      listGrazingFieldSessionsForFarm(farm.id),
      listGrassSurveyTrackPoints(farm.id, surveyId),
      listGrassSurveyObservationIds(farm.id, surveyId),
      listFinishedGrassSurveys(farm.id, 10),
    ]);
    const finishedAt = new Date().toISOString();
    const previous = finished.find((s) => s.startedAt < survey.startedAt && s.results?.farmCoverKgDmHa != null);
    const distanceM = trackDistanceM(track, survey.mode);
    const results = computeSurveyResults({
      fields: fields.filter((f) => !f.archivedAt).map((f) => ({ id: f.id, name: f.name, areaHa: f.areaHa })),
      observations: observations.map((o) => ({ id: o.id, fieldId: o.fieldId, coverKgDmHa: o.coverKgDmHa, observedAt: o.observedAt })),
      surveyObservationIds,
      startedAt: survey.startedAt,
      finishedAt,
      grazingSessions: sessions.map((s) => ({ fieldId: s.fieldId, startedAt: s.startedAt, ...(s.endedAt ? { endedAt: s.endedAt } : {}) })),
      markedGrazedFieldIds: survey.markedGrazedFieldIds,
      skippedFieldIds: survey.skippedFieldIds,
      distanceM,
      previousFarmCoverKgDmHa: previous?.results?.farmCoverKgDmHa ?? null,
    });
    // Weather from where the walk actually happened: the station nearest the middle of the
    // recorded route. A farm's fields can be far apart, so neither the sign-up location nor the
    // middle of all fields is reliable. Keeps the start-of-walk snapshot if there's no route.
    // Only replace it when the walk is being finished close to when it happened (so the
    // readings are from the walk's own time) and the new reading has data and is no worse than
    // the start snapshot (a STALE/unavailable lookup never overwrites a LIVE one).
    const route = cleanSurveyTrack(track, survey.mode);
    const routeMiddle = route.length ? route[Math.floor(route.length / 2)] : null;
    const finishedSoonAfterWalk = Date.parse(finishedAt) - Date.parse(route.at(-1)?.recordedAt ?? survey.startedAt) <= 3 * 60 * 60 * 1000;
    const candidate = routeMiddle && finishedSoonAfterWalk ? await weatherSnapshot([routeMiddle.lng, routeMiddle.lat]) : null;
    const routeWeather =
      candidate && candidate.observedAt !== null && (candidate.status === "LIVE" || survey.weather?.status !== "LIVE") ? candidate : null;
    const updated = await updateGrassSurvey(farm.id, surveyId, {
      status: "finished",
      finished_at: finishedAt,
      distance_m: distanceM,
      results,
      ...(routeWeather ? { weather: routeWeather } : {}),
    });
    // The walk's calculated growth becomes the farm's growth evidence, so covers are brought forward daily.
    if (results.farmGrowthKgDmHaDay !== null && isValidGrassGrowthKgDmHaDay(results.farmGrowthKgDmHaDay)) {
      await insertFarmGrassGrowthObservation({
        id: crypto.randomUUID(),
        farmId: farm.id,
        growthRateKgDmHaDay: results.farmGrowthKgDmHaDay,
        origin: "farmer_entered",
        observedAt: finishedAt,
        source: `Grass walk ${finishedAt.slice(0, 10)}: calculated from ${results.farmGrowthFieldCount} ${results.farmGrowthFieldCount === 1 ? "field" : "fields"}`,
      }).catch((err) => console.error("[Grass surveys] growth evidence not saved", err));
    }
    revalidatePath("/grass");
    revalidatePath("/grass/walks");
    return { ok: true, survey: updated };
  } catch (err) {
    console.error("[Grass surveys] finish failed", err);
    return { ok: false, error: "Couldn't finish the walk just now. Your readings are saved; try Finish again." };
  }
}

/** A reading taken during a walk, with where it was taken (when the phone had a fix). */
export interface GrassSurveyReading {
  id: string;
  fieldId: string;
  coverKgDmHa: number;
  observedAt: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
}

export async function getGrassSurveyAction(surveyId: string): Promise<Result<{ survey: GrassSurveyRecord; track: SurveyTrackPoint[]; readings: GrassSurveyReading[] }>> {
  if (!UUID.test(String(surveyId))) return { ok: false, error: "Walk not found." };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to see your walks." };
  try {
    const survey = await getGrassSurvey(farm.id, surveyId);
    if (!survey) return { ok: false, error: "Walk not found." };
    // Query this walk's readings directly: a farm-wide list is capped by the API row limit,
    // so on a farm with a long history an older walk's pins would silently disappear.
    const [track, observations] = await Promise.all([
      listGrassSurveyTrackPoints(farm.id, surveyId),
      listGrassCoverObservationsForSurvey(farm.id, surveyId),
    ]);
    const readings: GrassSurveyReading[] = observations
      .map((o) => ({ id: o.id, fieldId: o.fieldId, coverKgDmHa: o.coverKgDmHa, observedAt: o.observedAt, lat: o.lat ?? null, lng: o.lng ?? null, accuracyM: o.accuracyM ?? null }))
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    return { ok: true, survey, track, readings };
  } catch (err) {
    console.error("[Grass surveys] load failed", err);
    return { ok: false, error: "This walk couldn't be loaded just now." };
  }
}

export async function listGrassSurveysAction(): Promise<Result<{ surveys: GrassSurveyRecord[] }>> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to see your walks." };
  try {
    return { ok: true, surveys: await listFinishedGrassSurveys(farm.id) };
  } catch (err) {
    console.error("[Grass surveys] list failed", err);
    return { ok: false, error: "Walks couldn't be loaded just now." };
  }
}
