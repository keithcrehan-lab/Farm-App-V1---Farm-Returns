/**
 * The area a field's planned slurry is actually spread on, for the
 * canonical fertiliser calculation. Reads the field's spreadable-area fact
 * from the canonical Campaign B context (`buildSlurryRegulatoryContext`'s
 * `spreadableArea`, i.e. `resolveSpreadableAreaHa` over the current
 * record) — it never selects or re-derives a spreadable area of its own.
 * The persisted record is consulted only, by the fact's record id, to tell
 * whether it predates the current boundary.
 *
 * - No declaration on file: the mapped field is the spreading area (the
 *   E1 default), disclosed as such — never presented as a declaration.
 * - A current declaration: its spreadable area (whole field, or the field
 *   less the farmer's mapped no-spread exclusions).
 * - Zero spreadable area: slurry cannot be spread there, so no credit.
 * - Conflicting, invalid or stale evidence (the boundary was redrawn, or
 *   the gross area changed, after the declaration) is unresolved — the
 *   credit is blocked rather than computed on an area that may be wrong.
 */

import type { Field } from "./types";
import type { SpreadableAreaRecord } from "./regulatory-evidence-records";
import type { FieldSpreadableAreaEvidence } from "./slurry-regulatory-context";

export const SLURRY_SPREADABLE_AREA_VERSION = "slurry_spreadable_area_v1.0.0";

/** Gross-area drift tolerated between a declaration and the current
 * boundary — the 4 dp rounding used for every stored hectare figure. */
const GROSS_AREA_TOLERANCE_HA = 0.0001;

export type SlurrySpreadableArea =
  | {
      status: "RESOLVED";
      spreadableAreaHa: number;
      grossAreaHa: number;
      basis: "SPREADABLE_AREA_DECLARATION" | "MAPPED_FIELD_DEFAULT";
      recordId?: string;
      source: string;
      effectiveDate?: string;
      version: typeof SLURRY_SPREADABLE_AREA_VERSION;
    }
  | {
      status: "BLOCKED";
      reasonCode:
        | "P3_SPREADABLE_AREA_ZERO"
        | "P3_SPREADABLE_AREA_CONFLICT"
        | "P3_SPREADABLE_AREA_INVALID"
        | "P3_SPREADABLE_AREA_STALE"
        | "P3_FIELD_AREA_UNKNOWN";
    };

export function resolveSlurrySpreadableArea(
  field: Pick<Field, "areaHa" | "polygonCapturedAt">,
  fact: FieldSpreadableAreaEvidence["spreadableAreaHa"] | undefined,
  records: readonly SpreadableAreaRecord[],
): SlurrySpreadableArea {
  if (!Number.isFinite(field.areaHa) || field.areaHa <= 0)
    return { status: "BLOCKED", reasonCode: "P3_FIELD_AREA_UNKNOWN" };
  if (fact === undefined || (fact.state === "missing" && fact.reasonCode === "SPREADABLE_AREA_NOT_ESTABLISHED"))
    return {
      status: "RESOLVED",
      spreadableAreaHa: field.areaHa,
      grossAreaHa: field.areaHa,
      basis: "MAPPED_FIELD_DEFAULT",
      source: "Mapped field boundary (no no-spread areas declared)",
      version: SLURRY_SPREADABLE_AREA_VERSION,
    };
  if (fact.state === "conflicting")
    return { status: "BLOCKED", reasonCode: "P3_SPREADABLE_AREA_CONFLICT" };
  if (fact.state !== "known")
    return { status: "BLOCKED", reasonCode: "P3_SPREADABLE_AREA_INVALID" };

  const current = records.find((record) => record.id === fact.recordId);
  if (!current) return { status: "BLOCKED", reasonCode: "P3_SPREADABLE_AREA_INVALID" };
  const boundaryRedrawnAfter =
    field.polygonCapturedAt !== undefined &&
    Date.parse(field.polygonCapturedAt) > Date.parse(current.recordedAt);
  const grossChanged =
    current.grossAreaHaAtRecord !== undefined &&
    Math.abs(current.grossAreaHaAtRecord - field.areaHa) > GROSS_AREA_TOLERANCE_HA;
  if (boundaryRedrawnAfter || grossChanged)
    return { status: "BLOCKED", reasonCode: "P3_SPREADABLE_AREA_STALE" };
  if (fact.value <= 0)
    return { status: "BLOCKED", reasonCode: "P3_SPREADABLE_AREA_ZERO" };

  return {
    status: "RESOLVED",
    spreadableAreaHa: fact.value,
    grossAreaHa: field.areaHa,
    basis: "SPREADABLE_AREA_DECLARATION",
    recordId: current.id,
    source: current.source,
    effectiveDate: current.effectiveDate,
    version: SLURRY_SPREADABLE_AREA_VERSION,
  };
}
