"use server";

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { getFieldProductionCycle } from "@/lib/farm-data/field-production-cycles";
import { listConfirmedJobSessionsForFarm } from "@/lib/farm-data/job-sessions";
import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";

export type FieldActivityKind =
  | "fertiliser_spreading"
  | "slurry_spreading"
  | "silage"
  | "field_inspection"
  | "soil_sampling"
  | "other";

export interface FieldActivityEvent {
  id: string;
  kind: FieldActivityKind;
  confirmedAt: string;
  title: string;
  detail?: string;
  provenance: string;
}

export interface FieldWorkspaceContext {
  cycle: FieldProductionCycle | null;
  activities: FieldActivityEvent[];
  activitiesTruncated: boolean;
}

function text(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fieldIds(payload: Record<string, unknown>): string[] {
  const value = payload.fieldIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function activityCopy(activityType: string, completionType: "whole" | "partial" | "did_not_happen", payload: Record<string, unknown>) {
  const completion = completionType === "whole" ? "Completed" : completionType === "partial" ? "Part completed" : "Did not happen";

  if (activityType === "fertiliser_spreading") {
    const product = text(payload, "product");
    const quantity = number(payload, "quantity");
    const unit = text(payload, "quantityUnit");
    const area = number(payload, "areaHa");
    return {
      kind: "fertiliser_spreading" as const,
      title: "Fertiliser spreading",
      detail: [completion, product, quantity !== undefined ? `${quantity}${unit ? ` ${unit}` : ""}` : undefined, area !== undefined ? `${area} ha` : undefined].filter(Boolean).join(" · "),
    };
  }
  if (activityType === "slurry_spreading") {
    const quantity = number(payload, "quantity");
    const unit = text(payload, "quantityUnit");
    const method = text(payload, "applicationMethod");
    const area = number(payload, "areaHa");
    return {
      kind: "slurry_spreading" as const,
      title: "Slurry spreading",
      detail: [completion, quantity !== undefined ? `${quantity}${unit ? ` ${unit}` : ""}` : undefined, method, area !== undefined ? `${area} ha` : undefined].filter(Boolean).join(" · "),
    };
  }
  if (activityType === "silage") {
    const area = number(payload, "harvestedAreaHa");
    const bales = number(payload, "bales");
    const tonnes = number(payload, "tonnes");
    return {
      kind: "silage" as const,
      title: "Silage",
      detail: [completion, area !== undefined ? `${area} ha harvested` : undefined, bales !== undefined ? `${bales} bales` : undefined, tonnes !== undefined ? `${tonnes} t` : undefined].filter(Boolean).join(" · "),
    };
  }
  if (activityType === "field_inspection") {
    return {
      kind: "field_inspection" as const,
      title: "Field inspection",
      detail: [completion, text(payload, "observedIssueCategory"), text(payload, "observationNote")].filter(Boolean).join(" · "),
    };
  }
  if (activityType === "soil_sampling") {
    const cores = number(payload, "coreCount");
    return {
      kind: "soil_sampling" as const,
      title: "Soil sampling",
      detail: [completion, cores !== undefined ? `${cores} cores` : undefined, text(payload, "samplingZoneId") ? `Zone ${text(payload, "samplingZoneId")}` : undefined].filter(Boolean).join(" · "),
    };
  }
  return {
    kind: "other" as const,
    title: activityType.replace(/_/g, " "),
    detail: completion,
  };
}

export async function getFieldWorkspaceContextAction(fieldId: string): Promise<FieldWorkspaceContext> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No farm is available for the signed-in user.");

  const fields = await listFieldsForFarm(farm.id);
  if (!fields.some((field) => field.id === fieldId && field.farmId === farm.id)) {
    throw new Error("Field not found for the signed-in farm.");
  }

  const season = String(new Date().getFullYear());
  const [cycle, confirmed] = await Promise.all([
    getFieldProductionCycle(fieldId, season),
    listConfirmedJobSessionsForFarm(farm.id),
  ]);

  const activities = confirmed.sessions.flatMap((session): FieldActivityEvent[] => {
    const actual = session.actual;
    if (!actual) return [];
    const ids = fieldIds(actual.payload);
    if (!ids.includes(fieldId)) return [];
    const copy = activityCopy(actual.activityType, actual.completionType, actual.payload);
    return [{
      id: `actual-${actual.id}`,
      kind: copy.kind,
      confirmedAt: actual.confirmedAt,
      title: copy.title,
      ...(copy.detail ? { detail: copy.detail } : {}),
      provenance: `Confirmed by farmer · ${session.origin} job${session.hasGpsTrace ? " · GPS trace recorded" : ""}`,
    }];
  });

  activities.sort((a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime());
  return { cycle, activities, activitiesTruncated: confirmed.truncated };
}
