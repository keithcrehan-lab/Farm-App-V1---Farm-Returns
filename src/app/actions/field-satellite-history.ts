"use server";

import { booleanIntersects, polygon as turfPolygon } from "@turf/turf";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { boundingBox } from "@/domain/field-boundary";
import { searchSentinel2L2AScenes, type Sentinel2L2AItem } from "@/server/satellite/cdse-stac-client";
import {
  fetchSentinel2NdviSeries,
  renderSentinel2FieldImage,
  sentinelHubBlockReason,
  type NdviObservation,
  type SatelliteRenderMode,
} from "@/server/satellite/sentinel-hub-client";

export type SatelliteHistoryPreset = "3M" | "1Y" | "3Y" | "CUSTOM";

export interface SatelliteHistoryScene {
  id: string;
  acquisitionTimestamp: string;
  platform: string;
  cloudCoverPercent: number;
  processingLevel: string;
  processingVersion: string;
}

export interface SatelliteHistoryResult {
  fieldId: string;
  from: string;
  to: string;
  scenes: SatelliteHistoryScene[];
  contextBounds: [number, number, number, number];
  processingConfigured: boolean;
  processingBlockedReason: string | null;
}

export interface FieldNdviPoint extends NdviObservation {}

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_CHUNK_DAYS = 90;
const HISTORY_SEARCH_LIMIT = 100;
const MAX_HISTORY_DAYS = 3 * 366;

async function getOwnedMappedField(fieldId: string) {
  if (!fieldId) return null;
  const farm = await getFarmForCurrentUser();
  if (!farm) return null;
  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((candidate) => candidate.id === fieldId && candidate.farmId === farm.id) ?? null;
  if (!field?.polygon) return null;
  return field;
}

function rangeForPreset(
  preset: SatelliteHistoryPreset,
  customFrom?: string,
  customTo?: string,
): { from: Date; to: Date } | null {
  const now = new Date();
  const to = customTo ? new Date(`${customTo}T23:59:59.999Z`) : now;
  if (!Number.isFinite(to.getTime())) return null;

  let from: Date;
  if (preset === "CUSTOM") {
    if (!customFrom) return null;
    from = new Date(`${customFrom}T00:00:00.000Z`);
  } else {
    const days = preset === "3M" ? 92 : preset === "1Y" ? 366 : 3 * 366;
    from = new Date(to.getTime() - days * DAY_MS);
  }
  if (!Number.isFinite(from.getTime()) || from >= to) return null;
  if (to.getTime() - from.getTime() > MAX_HISTORY_DAYS * DAY_MS) {
    from = new Date(to.getTime() - MAX_HISTORY_DAYS * DAY_MS);
  }
  return { from, to };
}

function chunkRange(from: Date, to: Date): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  let cursor = from.getTime();
  while (cursor < to.getTime()) {
    const end = Math.min(to.getTime(), cursor + HISTORY_CHUNK_DAYS * DAY_MS);
    chunks.push({ from: new Date(cursor).toISOString(), to: new Date(end).toISOString() });
    cursor = end + 1;
  }
  return chunks;
}

function sceneIntersectsField(fieldPolygon: GeoJSON.Polygon, scene: Sentinel2L2AItem): boolean {
  try {
    return booleanIntersects(turfPolygon(fieldPolygon.coordinates), scene.geometry);
  } catch {
    return false;
  }
}

function collapseTileDuplicates(items: Sentinel2L2AItem[]): Sentinel2L2AItem[] {
  const byPass = new Map<string, Sentinel2L2AItem>();
  for (const item of items) {
    const key = `${item.platform}|${item.datetime.slice(0, 16)}`;
    const current = byPass.get(key);
    if (!current || item.cloudCoverPercent < current.cloudCoverPercent) byPass.set(key, item);
  }
  return [...byPass.values()].sort(
    (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
  );
}

export async function getFieldSatelliteHistoryAction(
  fieldId: string,
  preset: SatelliteHistoryPreset,
  customFrom?: string,
  customTo?: string,
): Promise<SatelliteHistoryResult | null> {
  const field = await getOwnedMappedField(fieldId);
  if (!field?.polygon) return null;
  const range = rangeForPreset(preset, customFrom, customTo);
  if (!range) return null;

  const bbox = boundingBox(field.polygon);
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const width = Math.max(maxLng - minLng, 0.0001);
  const height = Math.max(maxLat - minLat, 0.0001);
  const padX = width * 0.22;
  const padY = height * 0.22;
  const contextBounds: [number, number, number, number] = [
    minLng - padX,
    minLat - padY,
    maxLng + padX,
    maxLat + padY,
  ];
  const all = new Map<string, Sentinel2L2AItem>();
  for (const chunk of chunkRange(range.from, range.to)) {
    const result = await searchSentinel2L2AScenes({
      bbox,
      dateFrom: chunk.from,
      dateTo: chunk.to,
      limit: HISTORY_SEARCH_LIMIT,
    });
    if (result.status !== "ok") continue;
    for (const scene of result.items) {
      if (sceneIntersectsField(field.polygon, scene)) all.set(scene.id, scene);
    }
  }

  const scenes = collapseTileDuplicates([...all.values()]).map((scene) => ({
    id: scene.id,
    acquisitionTimestamp: scene.datetime,
    platform: scene.platform,
    cloudCoverPercent: scene.cloudCoverPercent,
    processingLevel: scene.processingLevel,
    processingVersion: scene.processingVersion,
  }));
  const blocked = sentinelHubBlockReason();

  return {
    fieldId,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    scenes,
    contextBounds,
    processingConfigured: blocked === null,
    processingBlockedReason: blocked,
  };
}

export async function getFieldSatelliteImageAction(
  fieldId: string,
  acquisitionTimestamp: string,
  mode: SatelliteRenderMode,
): Promise<
  | { ok: true; dataUrl: string; bounds: [number, number, number, number] }
  | { ok: false; message: string }
> {
  const field = await getOwnedMappedField(fieldId);
  if (!field?.polygon) return { ok: false, message: "This field does not have a mapped boundary." };
  const blocked = sentinelHubBlockReason();
  if (blocked) return { ok: false, message: blocked };

  try {
    const rendered = await renderSentinel2FieldImage({
      polygon: field.polygon,
      acquisitionTimestamp,
      mode,
    });
    return {
      ok: true,
      dataUrl: `data:${rendered.contentType};base64,${Buffer.from(rendered.png).toString("base64")}`,
      bounds: rendered.bounds,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Satellite image unavailable." };
  }
}

export async function getFieldNdviSeriesAction(
  fieldId: string,
  preset: SatelliteHistoryPreset,
  customFrom?: string,
  customTo?: string,
): Promise<{ ok: true; points: FieldNdviPoint[] } | { ok: false; message: string }> {
  const field = await getOwnedMappedField(fieldId);
  if (!field?.polygon) return { ok: false, message: "This field does not have a mapped boundary." };
  const range = rangeForPreset(preset, customFrom, customTo);
  if (!range) return { ok: false, message: "Choose a valid date range." };
  const blocked = sentinelHubBlockReason();
  if (blocked) return { ok: false, message: blocked };

 try {
    const all: FieldNdviPoint[] = [];
    for (const chunk of chunkRange(range.from, range.to)) {
      all.push(
        ...(await fetchSentinel2NdviSeries({
          polygon: field.polygon,
          dateFrom: chunk.from,
          dateTo: chunk.to,
        })),
      );
    }
    const byDay = new Map<string, FieldNdviPoint>();
    for (const point of all) {
      const day = point.intervalFrom.slice(0, 10);
      const current = byDay.get(day);
      if (!current || (point.fieldCloudPercent ?? 101) < (current.fieldCloudPercent ?? 101)) byDay.set(day, point);
    }
    return {
      ok: true,
      points: [...byDay.values()].sort(
        (a, b) => new Date(a.intervalFrom).getTime() - new Date(b.intervalFrom).getTime(),
      ),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "NDVI analysis unavailable." };
  }
}
