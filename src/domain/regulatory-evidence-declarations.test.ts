import { describe, expect, it } from "vitest";
import { neatSlurryEvidenceView, regulatoryEvidenceViews, spreadableAreaEvidenceView } from "./regulatory-evidence-declarations";
import { currentNeatSlurryEvidenceByHousing, currentSpreadableAreaByField, type NeatSlurryEvidenceRecord, type SpreadableAreaRecord } from "./regulatory-evidence-records";
import type { EvidenceFact } from "./slurry-evidence-context";
import { buildSlurryRegulatoryContextFromRecords } from "./slurry-regulatory-context";
import type { Field, Housing } from "./types";

/**
 * Campaign B minimal evidence UX — the farmer-facing view of the canonical
 * neat-slurry and spreadable-area facts. Letters follow the task's test list.
 */
const INTERNAL = /[A-Z]{2,}_[A-Z_]+|farmer_adjusted|unavailable|not_established/;

const neat = (patch: Partial<NeatSlurryEvidenceRecord> = {}): NeatSlurryEvidenceRecord => ({
  id: "n1",
  farmId: "farm-1",
  housingId: "h1",
  status: "farmer_adjusted",
  neatVolumeM3: 60,
  effectiveDate: "2026-09-25",
  source: "Farmer declaration on the housing screen",
  recordedAt: "2026-09-25T10:00:00Z",
  ...patch,
});
const area = (patch: Partial<SpreadableAreaRecord> = {}): SpreadableAreaRecord => ({
  id: "a1",
  farmId: "farm-1",
  fieldId: "f1",
  status: "farmer_adjusted",
  spreadableAreaHa: 3.5,
  grossAreaHaAtRecord: 4,
  effectiveDate: "2026-09-25",
  source: "Farmer declaration on the field's constraints",
  recordedAt: "2026-09-25T10:00:00Z",
  ...patch,
});
const known = (value: number): EvidenceFact<number> => ({ state: "known", value, status: "farmer_adjusted", source: "x", freshness: "NO_FRESHNESS_POLICY" });

// A store whose current fill reading (20 Sep) precedes the neat evidence.
const STORE = {
  id: "h1",
  farmId: "farm-1",
  shedName: "Main tank",
  shedType: "slatted",
  linkedGroupIds: [],
  housingPeriod: { start: "2025-11-01", end: "2026-03-31" },
  slurryEstimate: {
    volumeM3: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableN: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableP: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableK: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    ruleSetVersion: "slurry_engine_v1.0.0 (mock)",
  },
  storageCapacityM3: 200,
  storageFillPct: 50,
  storageFillStatus: "farmer_recorded",
  storageFillRecordedAt: "2026-09-20T09:00:00.000Z",
  storeObservationSeq: 1,
  storeObservedAt: "2026-09-20T09:00:00.000Z",
} as Housing;
const FIELD = {
  id: "f1",
  farmId: "farm-1",
  name: "Back Field",
  areaHa: 4,
  fertility: {
    pIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2026-03-01" },
    kIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2026-03-01" },
  },
  history: [],
} as unknown as Field;

function views(neatRecords: NeatSlurryEvidenceRecord[], areaRecords: SpreadableAreaRecord[], housing: Housing = STORE, field: Field = FIELD) {
  const records = { neatSlurryEvidenceRecords: neatRecords, spreadableAreaRecords: areaRecords };
  const context = buildSlurryRegulatoryContextFromRecords({
    fields: [field],
    housing: [housing],
    allocationRecords: [],
    compositionRecords: [],
    livestockGroups: [],
    asOfDate: "2026-09-28",
    ...records,
    slurryOriginEvidenceRecords: [],
  });
  const v = regulatoryEvidenceViews(context, records);
  return { context, neat: v.neatSlurryByHousing.get("h1")!, area: v.spreadableAreaByField.get("f1")! };
}

describe("regulatory neat-slurry view", () => {
  it("A: no evidence stays not recorded — never the tank's physical volume", () => {
    const { context, neat: v } = views([], []);
    expect(context.stores[0].physicalVolumeM3).toMatchObject({ state: "known", value: 100 });
    expect(v).toEqual({ state: "not_recorded", message: expect.any(String) });
    expect(v.record).toBeUndefined();
  });

  it("C: a comparable farmer figure is in use, with its value and dates", () => {
    const { neat: v } = views([neat()], []);
    expect(v.state).toBe("in_use");
    expect(v.record).toMatchObject({ neatVolumeM3: 60, effectiveDate: "2026-09-25", recordedAt: "2026-09-25T10:00:00Z" });
  });

  it("D: a revision becomes current while the earlier record stays in history", () => {
    const records = [neat(), neat({ id: "n2", neatVolumeM3: 40, recordedAt: "2026-09-26T10:00:00Z" })];
    const { neat: v } = views(records, []);
    expect(v.record).toMatchObject({ id: "n2", neatVolumeM3: 40 });
    expect(records.map((r) => r.id)).toEqual(["n1", "n2"]);
  });

  it("E: an explicit zero is a known, usable zero", () => {
    const { context, neat: v } = views([neat({ neatVolumeM3: 0 })], []);
    expect(context.stores[0].regulatoryNeatVolumeM3).toMatchObject({ state: "known", value: 0 });
    expect(v).toMatchObject({ state: "in_use", record: { neatVolumeM3: 0 } });
  });

  it("F: 'no figure' is recorded as such — distinct from zero and not in use", () => {
    const { context, neat: v } = views([neat({ status: "unavailable", neatVolumeM3: undefined })], []);
    expect(context.stores[0].regulatoryNeatVolumeM3.state).toBe("missing");
    expect(v.state).toBe("no_figure");
    expect(v.record?.neatVolumeM3).toBeUndefined();
  });

  it("G: a figure dated on or before the latest fill reading stays on record but blocked", () => {
    for (const effectiveDate of ["2026-09-20", "2026-09-10"]) {
      const { context, neat: v } = views([neat({ effectiveDate })], []);
      expect(context.stores[0].regulatoryNeatVolumeM3.state).toBe("missing");
      expect(v.state).toBe("not_current");
      expect(v.record?.effectiveDate).toBe(effectiveDate);
      expect(v.message).toMatch(/after the latest fill reading/);
    }
    // With no known physical volume, the explanation says so.
    const { neat: noFill } = views([neat()], [], { ...STORE, storageCapacityM3: 0 } as Housing);
    expect(noFill.state).toBe("not_current");
    expect(noFill.message).toMatch(/fill level/);
  });

  it("conflicts stay visibly unresolved: tied figures show no record; more than the tank is flagged", () => {
    const tied = views([neat(), neat({ id: "n2", neatVolumeM3: 10 })], []).neat;
    expect(tied.state).toBe("conflicting");
    expect(tied.record).toBeUndefined();
    const over = views([neat({ neatVolumeM3: 150 })], []).neat;
    expect(over).toMatchObject({ state: "conflicting", record: { neatVolumeM3: 150 } });
  });

  it("J: no message exposes an internal code", () => {
    const facts: [EvidenceFact<number>, EvidenceFact<number>, NeatSlurryEvidenceRecord[]][] = [
      [known(10), known(100), [neat()]],
      [{ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED" }, known(100), []],
      [{ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" }, known(100), [neat({ status: "unavailable", neatVolumeM3: undefined })]],
      [{ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_COMPARABLE_WITH_CURRENT_STORE_STATE" }, known(100), [neat()]],
      [{ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_COMPARABLE_WITH_CURRENT_STORE_STATE" }, { state: "missing", reasonCode: "X_Y" }, [neat()]],
      [{ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_INVALID" }, known(100), [neat()]],
      [{ state: "conflicting", reasonCode: "NEAT_SLURRY_EXCEEDS_PHYSICAL_VOLUME", candidates: [] }, known(100), [neat()]],
    ];
    for (const [fact, physicalVolume, records] of facts) {
      const v = neatSlurryEvidenceView({ fact, physicalVolume, current: currentNeatSlurryEvidenceByHousing(records).get("h1") });
      expect(v.message).not.toMatch(INTERNAL);
    }
  });
});

describe("spreadable-area view", () => {
  it("K/M: missing evidence is not confirmed — never the gross area, which stays a separate fact", () => {
    const { context, area: v } = views([], []);
    expect(context.spreadableArea[0].grossMappedAreaHa).toMatchObject({ state: "known", value: 4 });
    expect(context.spreadableArea[0].spreadableAreaHa.state).toBe("missing");
    expect(v).toEqual({ state: "not_recorded", message: expect.any(String) });
  });

  it("L: a farmer-declared area is in use with its dates", () => {
    const { area: v } = views([], [area()]);
    expect(v).toMatchObject({ state: "in_use", record: { spreadableAreaHa: 3.5, effectiveDate: "2026-09-25" } });
  });

  it("N: an explicit zero survives as a known zero", () => {
    const { context, area: v } = views([], [area({ spreadableAreaHa: 0 })]);
    expect(context.spreadableArea[0].spreadableAreaHa).toMatchObject({ state: "known", value: 0 });
    expect(v).toMatchObject({ state: "in_use", record: { spreadableAreaHa: 0 } });
  });

  it("O/P: an area above the field's current size is never clamped — it stays an unresolved conflict", () => {
    const { area: v } = views([], [area({ spreadableAreaHa: 4 })], STORE, { ...FIELD, areaHa: 3 });
    expect(v).toMatchObject({ state: "conflicting", record: { spreadableAreaHa: 4 } });
    const tied = views([], [area(), area({ id: "a2", spreadableAreaHa: 2 })]).area;
    expect(tied.state).toBe("conflicting");
    expect(tied.record).toBeUndefined();
  });

  it("S: a revision is current; the earlier record is untouched", () => {
    const records = [area(), area({ id: "a2", spreadableAreaHa: 3, effectiveDate: "2026-09-27", recordedAt: "2026-09-27T10:00:00Z" })];
    expect(views([], records).area.record).toMatchObject({ id: "a2", spreadableAreaHa: 3 });
    expect(records[0]).toMatchObject({ id: "a1", spreadableAreaHa: 3.5 });
  });

  it("T: no message exposes an internal code", () => {
    const facts: [EvidenceFact<number>, SpreadableAreaRecord[]][] = [
      [known(3), [area()]],
      [{ state: "missing", reasonCode: "SPREADABLE_AREA_NOT_ESTABLISHED" }, []],
      [{ state: "missing", reasonCode: "SPREADABLE_AREA_EVIDENCE_INVALID" }, [area()]],
      [{ state: "conflicting", reasonCode: "SPREADABLE_AREA_TIED_OBSERVATIONS_CONFLICT", candidates: [] }, [area(), area({ id: "a2", spreadableAreaHa: 1 })]],
      [{ state: "conflicting", reasonCode: "SPREADABLE_AREA_EXCEEDS_GROSS_AREA", candidates: [] }, [area()]],
    ];
    for (const [fact, records] of facts) {
      expect(spreadableAreaEvidenceView({ fact, current: currentSpreadableAreaByField(records).get("f1") }).message).not.toMatch(INTERNAL);
    }
  });
});
