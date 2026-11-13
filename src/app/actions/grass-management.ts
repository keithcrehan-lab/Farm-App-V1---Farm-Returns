"use server";

import { revalidatePath } from "next/cache";
import {
  isGrassCoverMethod,
  isGrassGrowthOrigin,
  isValidGrassCoverKgDmHa,
  isValidGrassGrowthKgDmHaDay,
  type FarmGrassGrowthObservation,
  type GrassCoverObservation,
} from "@/domain/grass-management";
import { isValidIsoUtcDateTime } from "@/domain/iso-datetime";
import type { LivestockCategory } from "@/domain/types";
import {
  resolveGrassGrazingDemand,
  type GrassGrazingDemandResolution,
} from "@/domain/grass-grazing-demand";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listFieldProductionCyclesForSeason } from "@/lib/farm-data/field-production-cycles";
import { fieldUseFromCropSystem } from "@/domain/grass-wedge-target";
import {
  insertFarmGrassGrowthObservation,
  insertGrassCoverObservation,
  listFarmGrassGrowthObservations,
  listGrassCoverObservationsForFarm,
} from "@/lib/farm-data/grass-management";
import { listFarmGrassGrowthForecasts } from "@/lib/farm-data/grass-growth-forecasts";
import { listGrazingFieldSessionsForFarm } from "@/lib/farm-data/grazing-field-sessions";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { latestApprovedCountyGrowth, regionalGrowthEvidence } from "@/lib/farm-data/regional-grass-growth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Device clock skew tolerance, same as `record_grazing_field_move`. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export type GrassRejectionCode =
  | "NO_FARM"
  | "INVALID_ID"
  | "INVALID_FIELD_ID"
  | "FIELD_NOT_FOUND"
  | "INVALID_COVER"
  | "INVALID_METHOD"
  | "INVALID_GROWTH_RATE"
  | "INVALID_ORIGIN"
  | "INVALID_OBSERVED_AT"
  | "OBSERVED_AT_IN_FUTURE"
  | "INVALID_LOCATION";

export type RecordGrassObservationResult<T> =
  | { status: "saved"; observation: T }
  | { status: "rejected"; reasonCode: GrassRejectionCode };

export interface RecordGrassCoverObservationInput {
  id: string;
  fieldId: string;
  coverKgDmHa: number;
  method: string;
  observedAt: string;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  /** The grass walk (survey) this reading belongs to, if any. */
  surveyId?: string | null;
}

export interface RecordGrassGrowthObservationInput {
  id: string;
  growthRateKgDmHaDay: number;
  origin: string;
  observedAt: string;
}

function observedAtRejection(value: unknown): GrassRejectionCode | undefined {
  if (typeof value !== "string" || !isValidIsoUtcDateTime(value)) return "INVALID_OBSERVED_AT";
  if (Date.parse(value) > Date.now() + FUTURE_TOLERANCE_MS) return "OBSERVED_AT_IN_FUTURE";
  return undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function farmerSource(ownerName: string): string {
  return ownerName.trim() || "Farmer";
}

function revalidateGrassSurfaces(): void {
  revalidatePath("/grass");
  revalidatePath("/today");
}

export async function recordGrassCoverObservationAction(
  input: RecordGrassCoverObservationInput,
): Promise<RecordGrassObservationResult<GrassCoverObservation>> {
  if (typeof input.id !== "string" || !UUID.test(input.id)) return { status: "rejected", reasonCode: "INVALID_ID" };
  if (typeof input.fieldId !== "string" || !UUID.test(input.fieldId)) return { status: "rejected", reasonCode: "INVALID_FIELD_ID" };
  if (!isValidGrassCoverKgDmHa(input.coverKgDmHa)) return { status: "rejected", reasonCode: "INVALID_COVER" };
  if (!isGrassCoverMethod(input.method)) return { status: "rejected", reasonCode: "INVALID_METHOD" };
  const timeRejection = observedAtRejection(input.observedAt);
  if (timeRejection) return { status: "rejected", reasonCode: timeRejection };
  if (input.surveyId != null && (typeof input.surveyId !== "string" || !UUID.test(input.surveyId))) return { status: "rejected", reasonCode: "INVALID_ID" };

  const lat = input.lat ?? undefined;
  const lng = input.lng ?? undefined;
  const accuracyM = input.accuracyM ?? undefined;
  if ((lat === undefined) !== (lng === undefined)) return { status: "rejected", reasonCode: "INVALID_LOCATION" };
  if (lat !== undefined && (!isFiniteNumber(lat) || lat < -90 || lat > 90)) return { status: "rejected", reasonCode: "INVALID_LOCATION" };
  if (lng !== undefined && (!isFiniteNumber(lng) || lng < -180 || lng > 180)) return { status: "rejected", reasonCode: "INVALID_LOCATION" };
  if (accuracyM !== undefined && (!isFiniteNumber(accuracyM) || accuracyM < 0 || lat === undefined)) {
    return { status: "rejected", reasonCode: "INVALID_LOCATION" };
  }

  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "rejected", reasonCode: "NO_FARM" };
  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((candidate) => candidate.id === input.fieldId && !candidate.archivedAt);
  if (!field) return { status: "rejected", reasonCode: "FIELD_NOT_FOUND" };

  const observation = await insertGrassCoverObservation({
    id: input.id,
    farmId: farm.id,
    fieldId: field.id,
    coverKgDmHa: input.coverKgDmHa,
    method: input.method,
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    ...(accuracyM !== undefined ? { accuracyM } : {}),
    ...(input.surveyId ? { surveyId: input.surveyId } : {}),
    observedAt: input.observedAt,
    source: farmerSource(farm.ownerName),
  });
  revalidateGrassSurfaces();
  return { status: "saved", observation };
}

export async function recordGrassGrowthObservationAction(
  input: RecordGrassGrowthObservationInput,
): Promise<RecordGrassObservationResult<FarmGrassGrowthObservation>> {
  if (typeof input.id !== "string" || !UUID.test(input.id)) return { status: "rejected", reasonCode: "INVALID_ID" };
  if (!isValidGrassGrowthKgDmHaDay(input.growthRateKgDmHaDay)) return { status: "rejected", reasonCode: "INVALID_GROWTH_RATE" };
  if (!isGrassGrowthOrigin(input.origin)) return { status: "rejected", reasonCode: "INVALID_ORIGIN" };
  const timeRejection = observedAtRejection(input.observedAt);
  if (timeRejection) return { status: "rejected", reasonCode: timeRejection };

  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "rejected", reasonCode: "NO_FARM" };

  const observation = await insertFarmGrassGrowthObservation({
    id: input.id,
    farmId: farm.id,
    growthRateKgDmHaDay: input.growthRateKgDmHaDay,
    origin: input.origin,
    observedAt: input.observedAt,
    source: farmerSource(farm.ownerName),
  });
  revalidateGrassSurfaces();
  return { status: "saved", observation };
}

export interface GrassManagementFieldView {
  id: string;
  name: string;
  areaHa: number;
  /** The field's recorded planned use (Fields), when set. */
  plannedUse?: string;
}

export interface GrassGrazingSessionView {
  sessionId: string;
  fieldId: string;
  fieldName: string;
  livestockGroupId: string;
  groupLabel: string;
  category: LivestockCategory;
  headCountSnapshot: number;
  startedAt: string;
  endedAt?: string;
  demand: GrassGrazingDemandResolution;
}

export type GrassOpenGrazingSessionView = GrassGrazingSessionView;

export type GrassManagementData =
  | { status: "no_farm" }
  | {
      status: "ok";
      fields: GrassManagementFieldView[];
      coverObservations: GrassCoverObservation[];
      growthObservations: FarmGrassGrowthObservation[];
      growthForecasts: import("@/domain/grass-management").FarmGrassGrowthForecast[];
      grazingSessions: GrassGrazingSessionView[];
      openGrazingSessions: GrassOpenGrazingSessionView[];
    };

export async function getGrassManagementDataAction(): Promise<GrassManagementData> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "no_farm" };
  const [fields, groups, sessions, coverObservations, growthObservations, growthForecasts] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listGrazingFieldSessionsForFarm(farm.id),
    listGrassCoverObservationsForFarm(farm.id),
    listFarmGrassGrowthObservations(farm.id),
    listFarmGrassGrowthForecasts(farm.id),
  ]);

  const activeFields = fields.filter((field) => !field.archivedAt);

  // A field's use is set in the field drawer ("Current crop / use"), which
  // records it on the season's production cycle — not on field.plannedUse.
  // Read this season's cycle first, then last season's carried forward, and
  // only then the legacy planned use (enter once, use everywhere).
  const thisSeason = new Date().getFullYear();
  const useByField = new Map<string, string>();
  try {
    const ids = activeFields.map((field) => field.id);
    const [current, previous] = await Promise.all([
      listFieldProductionCyclesForSeason(ids, String(thisSeason)),
      listFieldProductionCyclesForSeason(ids, String(thisSeason - 1)),
    ]);
    for (const cycle of [...previous, ...current]) {
      const use = fieldUseFromCropSystem(cycle.cropSystem);
      if (use) useByField.set(cycle.fieldId, use);
    }
  } catch (err) {
    console.error("[Grass] production cycles unavailable", err);
  }
  const fieldUse = (field: (typeof activeFields)[number]) => useByField.get(field.id) ?? field.plannedUse?.value;
  const fieldNameById = new Map(fields.map((field) => [field.id, field.name]));
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const grazingSessions: GrassGrazingSessionView[] = sessions.map((session) => {
    const group = groupById.get(session.livestockGroupId);
    const demand: GrassGrazingDemandResolution = group
      ? resolveGrassGrazingDemand({ group, headCount: session.headCountSnapshot })
      : {
          status: "unresolved",
          groupId: session.livestockGroupId,
          category: session.livestockCategorySnapshot,
          headCount: session.headCountSnapshot,
          reason: "GROUP_NOT_FOUND",
        };

    return {
      sessionId: session.id,
      fieldId: session.fieldId,
      fieldName: fieldNameById.get(session.fieldId) ?? "Recorded field",
      livestockGroupId: session.livestockGroupId,
      groupLabel: group?.label ?? "Recorded group",
      category: session.livestockCategorySnapshot,
      headCountSnapshot: session.headCountSnapshot,
      startedAt: session.startedAt,
      ...(session.endedAt ? { endedAt: session.endedAt } : {}),
      demand,
    };
  });

  // Approved Teagasc county growth: always a forecast for projections; a
  // stand-in growth rate only when the farm has no recent growth of its own.
  let mergedForecasts = growthForecasts;
  let mergedGrowth = growthObservations;
  try {
    const regional = await latestApprovedCountyGrowth(farm.location.county);
    if (regional) {
      const evidence = regionalGrowthEvidence(regional, farm.id);
      if (evidence.forecast) mergedForecasts = [...growthForecasts, evidence.forecast];
      const recentOwn = growthObservations.some((o) => Date.parse(o.observedAt) >= Date.now() - 21 * 86_400_000);
      if (evidence.observation && !recentOwn) mergedGrowth = [...growthObservations, evidence.observation];
    }
  } catch (err) {
    console.error("[Grass] regional growth unavailable", err);
  }

  return {
    status: "ok",
    fields: activeFields.map((field) => { const use = fieldUse(field); return { id: field.id, name: field.name, areaHa: field.areaHa, ...(use ? { plannedUse: use } : {}) }; }),
    coverObservations,
    growthObservations: mergedGrowth,
    growthForecasts: mergedForecasts,
    grazingSessions,
    openGrazingSessions: grazingSessions.filter((session) => !session.endedAt),
  };
}
