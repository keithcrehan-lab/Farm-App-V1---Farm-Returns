import { describe, expect, it } from "vitest";
import { resolveSlurrySpreadableArea } from "./slurry-spreadable-area";
import type { SpreadableAreaRecord } from "./regulatory-evidence-records";
import { buildSlurryRegulatoryContextFromRecords } from "./slurry-regulatory-context";
import type { Field } from "./types";

const field = { areaHa: 4, polygonCapturedAt: "2026-03-01T10:00:00.000Z" };

/** Resolve through the canonical Campaign B context, as the plan does. */
function resolve(f: Pick<Field, "areaHa" | "polygonCapturedAt">, records: SpreadableAreaRecord[]) {
  const full = { id: "field-1", farmId: "farm-1", name: "Field", centroid: [0, 0], fertility: {}, ...f } as Field;
  const context = buildSlurryRegulatoryContextFromRecords({
    fields: [full],
    housing: [],
    allocationRecords: [],
    compositionRecords: [],
    livestockGroups: [],
    asOfDate: "2026-06-01",
    neatSlurryEvidenceRecords: [],
    spreadableAreaRecords: records,
    slurryOriginEvidenceRecords: [],
  });
  const fact = context.spreadableArea.find((a) => a.fieldId === "field-1")?.spreadableAreaHa;
  return resolveSlurrySpreadableArea(f, fact, records);
}

function record(overrides: Partial<SpreadableAreaRecord> = {}): SpreadableAreaRecord {
  return {
    id: "area-1",
    farmId: "farm-1",
    fieldId: "field-1",
    status: "farmer_adjusted",
    spreadableAreaHa: 3,
    grossAreaHaAtRecord: 4,
    effectiveDate: "2026-04-01",
    source: "Farmer mapped no-spread areas",
    exclusionGeometry: [],
    recordedAt: "2026-04-01T09:00:00.000Z",
    ...overrides,
  };
}

describe("resolveSlurrySpreadableArea (F008)", () => {
  it("uses the mapped field when no no-spread areas are declared, and says so", () => {
    expect(resolve(field, [])).toMatchObject({
      status: "RESOLVED",
      spreadableAreaHa: 4,
      basis: "MAPPED_FIELD_DEFAULT",
    });
  });

  it("uses the declared spreadable area after mapped exclusions, with its record identity", () => {
    expect(resolve(field, [record()])).toMatchObject({
      status: "RESOLVED",
      spreadableAreaHa: 3,
      grossAreaHa: 4,
      basis: "SPREADABLE_AREA_DECLARATION",
      recordId: "area-1",
      effectiveDate: "2026-04-01",
    });
  });

  it("blocks a recorded zero spreadable area", () => {
    expect(resolve(field, [record({ spreadableAreaHa: 0 })])).toEqual({
      status: "BLOCKED",
      reasonCode: "P3_SPREADABLE_AREA_ZERO",
    });
  });

  it("blocks stale evidence: the boundary was redrawn after the declaration", () => {
    expect(
      resolve({ ...field, polygonCapturedAt: "2026-05-01T10:00:00.000Z" }, [record()]),
    ).toEqual({ status: "BLOCKED", reasonCode: "P3_SPREADABLE_AREA_STALE" });
  });

  it("blocks stale evidence: the gross area changed since the declaration", () => {
    expect(resolve(field, [record({ grossAreaHaAtRecord: 4.5 })])).toEqual({
      status: "BLOCKED",
      reasonCode: "P3_SPREADABLE_AREA_STALE",
    });
  });

  it("blocks conflicting evidence: tied contradictory declarations, or more than the field", () => {
    expect(
      resolve(field, [record(), record({ id: "area-2", spreadableAreaHa: 2 })]),
    ).toEqual({ status: "BLOCKED", reasonCode: "P3_SPREADABLE_AREA_CONFLICT" });
    expect(resolve(field, [record({ spreadableAreaHa: 5 })])).toEqual({
      status: "BLOCKED",
      reasonCode: "P3_SPREADABLE_AREA_CONFLICT",
    });
  });

  it("blocks invalid evidence and an unknown field area", () => {
    expect(resolve(field, [record({ spreadableAreaHa: Number.NaN })])).toEqual({
      status: "BLOCKED",
      reasonCode: "P3_SPREADABLE_AREA_INVALID",
    });
    expect(resolve({ areaHa: 0 }, [])).toEqual({
      status: "BLOCKED",
      reasonCode: "P3_FIELD_AREA_UNKNOWN",
    });
  });
});
