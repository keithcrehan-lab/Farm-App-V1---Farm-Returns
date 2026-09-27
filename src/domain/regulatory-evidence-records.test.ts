import { describe, expect, it } from "vitest";
import {
  currentNeatSlurryEvidenceByHousing,
  currentSpreadableAreaByField,
  regulatoryNeatSlurryEvidenceByHousing,
  resolveSpreadableAreaHa,
  validateNewNeatSlurryEvidenceInput,
  validateNewSpreadableAreaInput,
  type NeatSlurryEvidenceRecord,
  type NewNeatSlurryEvidenceInput,
  type NewSpreadableAreaInput,
  type SpreadableAreaRecord,
} from "./regulatory-evidence-records";
import { buildSlurryRegulatoryContext, type BuildSlurryRegulatoryContextInput } from "./slurry-regulatory-context";
import {
  neatSlurryEvidenceInsertRow,
  rowToField,
  rowToHousing,
  rowToNeatSlurryEvidenceRecord,
  rowToSpreadableAreaRecord,
  spreadableAreaInsertRow,
} from "@/lib/farm-data/mappers";
import type { FieldRow, FieldSpreadableAreaRow, HousingRow, SlurryStoreNeatEvidenceRow } from "@/lib/farm-data/row-types";

const TODAY = "2026-03-01";

const FIELD_ROW: FieldRow = {
  id: "field-1",
  farm_id: "farm-1",
  name: "Home Field",
  area_ha: 8,
  centroid_lng: -8.49,
  centroid_lat: 51.9,
  polygon: null,
  polygon_source: null,
  polygon_captured_at: null,
  lpis_ref: null,
  planned_use: { value: "grazing", status: "farmer_adjusted", source: "Keith" },
  mapped_soil: null,
  fertility: {
    pIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2025-03-01" },
    kIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2025-03-01" },
  },
  commonage_status: null,
  water_buffer_context: null,
  history: [],
  thumbnail: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const HOUSING_ROW: HousingRow = {
  id: "housing-1",
  farm_id: "farm-1",
  shed_name: "Shed 1",
  shed_type: "slatted",
  housing_period_start: "2025-11-01",
  housing_period_end: "2026-03-31",
  tank_refinement: null,
  slurry_estimate: {
    volumeM3: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableN: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableP: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableK: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    ruleSetVersion: "slurry_engine_v1.0.0 (mock)",
  },
  storage_capacity_m3: 200,
  storage_fill_pct: 53,
  storage_fill_status: "farmer_recorded",
  storage_fill_recorded_at: "2026-02-01T00:00:00Z",
  store_observation_seq: 1,
  store_observed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const PHYSICAL_M3 = 106; // 200 m³ × 53 %

function ctx(input: Partial<BuildSlurryRegulatoryContextInput> = {}) {
  return buildSlurryRegulatoryContext({
    fields: [rowToField(FIELD_ROW)],
    housing: [rowToHousing(HOUSING_ROW, [])],
    allocationRecords: [],
    compositionRecords: [],
    livestockGroups: [],
    asOfDate: TODAY,
    ...input,
  });
}

let seq = 0;
/** What the database hands back after an insert: the insert payload plus
 * `id`/`created_at` defaults, with `numeric` serialised as a string (as
 * PostgREST may) — a real mapper round trip, not a hand-built record. */
function persistNeat(input: NewNeatSlurryEvidenceInput, createdAt = "2026-02-10T09:00:00Z"): SlurryStoreNeatEvidenceRow {
  const row = neatSlurryEvidenceInsertRow("farm-1", input, "user-1");
  expect(row.created_by).toBe("user-1");
  return { ...row, neat_volume_m3: row.neat_volume_m3 === null ? null : String(row.neat_volume_m3), id: `neat-${++seq}`, created_at: createdAt };
}

function persistArea(input: NewSpreadableAreaInput, grossAtRecord: number | null, createdAt = "2026-02-10T09:00:00Z"): FieldSpreadableAreaRow {
  const row = spreadableAreaInsertRow("farm-1", input, "user-1");
  expect(row.created_by).toBe("user-1");
  return { ...row, spreadable_area_ha: String(row.spreadable_area_ha), gross_area_ha_at_record: grossAtRecord, id: `area-${++seq}`, created_at: createdAt };
}

const reloadNeat = (rows: SlurryStoreNeatEvidenceRow[]) => regulatoryNeatSlurryEvidenceByHousing(rows.map(rowToNeatSlurryEvidenceRecord));
const reloadArea = (rows: FieldSpreadableAreaRow[]) => currentSpreadableAreaByField(rows.map(rowToSpreadableAreaRecord));

const neatInput = (overrides: Partial<NewNeatSlurryEvidenceInput> = {}): NewNeatSlurryEvidenceInput => ({
  housingId: "housing-1",
  status: "farmer_adjusted",
  neatVolumeM3: 80,
  effectiveDate: "2026-02-10",
  source: "Farmer declaration",
  ...overrides,
});

const areaInput = (overrides: Partial<NewSpreadableAreaInput> = {}): NewSpreadableAreaInput => ({
  fieldId: "field-1",
  status: "farmer_adjusted",
  spreadableAreaHa: 6.5,
  effectiveDate: "2026-02-10",
  source: "Farmer declaration",
  ...overrides,
});

describe("regulatory neat-slurry evidence persistence", () => {
  it("1/13: an existing store with no persisted evidence stays NOT_ESTABLISHED after reload", () => {
    const store = ctx({ regulatoryNeatSlurryByHousing: reloadNeat([]) }).stores[0];
    expect(store.regulatoryNeatVolumeM3).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED" });
  });

  it("2/14: physical store volume alone never becomes regulatory neat volume, and is unchanged by neat evidence", () => {
    const without = ctx().stores[0];
    const withNeat = ctx({ regulatoryNeatSlurryByHousing: reloadNeat([persistNeat(neatInput())]) }).stores[0];
    expect(without.physicalVolumeM3).toMatchObject({ state: "known", value: PHYSICAL_M3 });
    expect(without.regulatoryNeatVolumeM3.state).toBe("missing");
    expect(withNeat.physicalVolumeM3).toEqual(without.physicalVolumeM3);
    expect(withNeat.composition).toEqual(without.composition);
  });

  it("3/6: a persisted known neat volume survives the round trip with status, source, date and record id", () => {
    const row = persistNeat(neatInput({ status: "verified", neatVolumeM3: 80, source: "Nitrates record" }));
    const store = ctx({ regulatoryNeatSlurryByHousing: reloadNeat([row]) }).stores[0];
    expect(store.regulatoryNeatVolumeM3).toEqual({
      state: "known",
      value: 80,
      status: "verified",
      source: "Nitrates record",
      recordedAt: "2026-02-10",
      recordId: row.id,
      freshness: "NO_FRESHNESS_POLICY",
    });
  });

  it("4: an explicit 0 m³ remains a known zero", () => {
    const row = persistNeat(neatInput({ neatVolumeM3: 0 }));
    expect(row.neat_volume_m3).toBe("0");
    const store = ctx({ regulatoryNeatSlurryByHousing: reloadNeat([row]) }).stores[0];
    expect(store.regulatoryNeatVolumeM3).toMatchObject({ state: "known", value: 0, status: "farmer_adjusted" });
  });

  it("5: unavailable evidence stays unavailable after reload — never a known quantity", () => {
    const row = persistNeat(neatInput({ status: "unavailable", neatVolumeM3: undefined }));
    expect(row.neat_volume_m3).toBeNull();
    const c = ctx({ regulatoryNeatSlurryByHousing: reloadNeat([row]) });
    expect(c.stores[0].regulatoryNeatVolumeM3).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" });
    expect(c.evidenceChecks.find((e) => e.fact === "regulatory_neat_slurry")?.message).toContain("marked as unavailable");
  });

  it("a reload never upgrades trust: the current record's own status is carried, even when an older record was verified", () => {
    const older = persistNeat(neatInput({ status: "verified", effectiveDate: "2026-01-05" }), "2026-01-05T09:00:00Z");
    const newer = persistNeat(neatInput({ status: "farmer_adjusted", neatVolumeM3: 70, effectiveDate: "2026-02-10" }), "2026-02-10T09:00:00Z");
    const store = ctx({ regulatoryNeatSlurryByHousing: reloadNeat([newer, older]) }).stores[0];
    expect(store.regulatoryNeatVolumeM3).toMatchObject({ state: "known", value: 70, status: "farmer_adjusted", recordId: newer.id });
  });

  it("history is kept: every record stays retrievable; the current one is the latest effective date, then latest capture", () => {
    const a = rowToNeatSlurryEvidenceRecord(persistNeat(neatInput({ neatVolumeM3: 50, effectiveDate: "2026-02-10" }), "2026-02-10T09:00:00Z"));
    const b = rowToNeatSlurryEvidenceRecord(persistNeat(neatInput({ neatVolumeM3: 60, effectiveDate: "2026-02-10" }), "2026-02-11T09:00:00Z"));
    const c = rowToNeatSlurryEvidenceRecord(persistNeat(neatInput({ neatVolumeM3: 90, effectiveDate: "2026-01-01" }), "2026-02-12T09:00:00Z"));
    const records: NeatSlurryEvidenceRecord[] = [a, b, c];
    expect(currentNeatSlurryEvidenceByHousing(records).get("housing-1")).toMatchObject({ neatVolumeM3: 60 });
    expect(records.map((r) => r.neatVolumeM3)).toEqual([50, 60, 90]);
  });

  it("neat evidence above the physical volume is a derived conflict, not a persisted one", () => {
    const store = ctx({ regulatoryNeatSlurryByHousing: reloadNeat([persistNeat(neatInput({ neatVolumeM3: 150 }))]) }).stores[0];
    expect(store.regulatoryNeatVolumeM3).toMatchObject({ state: "conflicting", reasonCode: "NEAT_SLURRY_EXCEEDS_PHYSICAL_VOLUME" });
  });

  describe("7: invalid neat evidence is rejected, never coerced", () => {
    it.each([
      ["negative", { neatVolumeM3: -1 }],
      ["NaN", { neatVolumeM3: Number.NaN }],
      ["infinite", { neatVolumeM3: Number.POSITIVE_INFINITY }],
      ["missing volume on known evidence", { neatVolumeM3: undefined }],
    ])("rejects %s", (_label, overrides) => {
      expect(validateNewNeatSlurryEvidenceInput(neatInput(overrides), TODAY).map((e) => e.field)).toContain("neatVolumeM3");
    });

    it("rejects a volume on unavailable evidence, an unknown status, a blank source and a bad/future date", () => {
      expect(validateNewNeatSlurryEvidenceInput(neatInput({ status: "unavailable", neatVolumeM3: 10 }), TODAY).map((e) => e.field)).toEqual(["neatVolumeM3"]);
      expect(validateNewNeatSlurryEvidenceInput(neatInput({ status: "estimated" as never }), TODAY).map((e) => e.field)).toEqual(["status"]);
      expect(validateNewNeatSlurryEvidenceInput(neatInput({ source: "  " }), TODAY).map((e) => e.field)).toEqual(["source"]);
      expect(validateNewNeatSlurryEvidenceInput(neatInput({ effectiveDate: "2026-02-30" }), TODAY).map((e) => e.field)).toEqual(["effectiveDate"]);
      expect(validateNewNeatSlurryEvidenceInput(neatInput({ effectiveDate: "2026-03-02" }), TODAY).map((e) => e.field)).toEqual(["effectiveDate"]);
    });

    it("accepts explicit zero and unavailable-without-volume", () => {
      expect(validateNewNeatSlurryEvidenceInput(neatInput({ neatVolumeM3: 0 }), TODAY)).toEqual([]);
      expect(validateNewNeatSlurryEvidenceInput(neatInput({ status: "unavailable", neatVolumeM3: undefined }), TODAY)).toEqual([]);
    });

    it("a malformed persisted row throws on load rather than becoming a value", () => {
      const row = persistNeat(neatInput());
      expect(() => rowToNeatSlurryEvidenceRecord({ ...row, neat_volume_m3: "-5" })).toThrow(/neat_volume_m3/);
      expect(() => rowToNeatSlurryEvidenceRecord({ ...row, neat_volume_m3: "NaN" })).toThrow(/neat_volume_m3/);
      expect(() => rowToNeatSlurryEvidenceRecord({ ...row, neat_volume_m3: null })).toThrow(/volume does not match status/);
      expect(() => rowToNeatSlurryEvidenceRecord({ ...row, status: "unavailable" })).toThrow(/volume does not match status/);
      expect(() => rowToNeatSlurryEvidenceRecord({ ...row, status: "mapped" })).toThrow(/unknown status/);
    });
  });
});

describe("spreadable-area evidence persistence", () => {
  const field = rowToField(FIELD_ROW);

  it("8/13: missing spreadable area stays missing — never the gross area", () => {
    const area = ctx({ spreadableAreaByField: reloadArea([]) }).spreadableArea[0];
    expect(area.grossMappedAreaHa).toMatchObject({ state: "known", value: 8 });
    expect(area.spreadableAreaHa).toEqual({ state: "missing", reasonCode: "SPREADABLE_AREA_NOT_ESTABLISHED" });
  });

  it("9: an explicit 0 ha remains a known zero", () => {
    const area = ctx({ spreadableAreaByField: reloadArea([persistArea(areaInput({ spreadableAreaHa: 0 }), 8)]) }).spreadableArea[0];
    expect(area.spreadableAreaHa).toMatchObject({ state: "known", value: 0 });
  });

  it("10: a positive spreadable area survives the round trip with provenance; gross area is unchanged", () => {
    const row = persistArea(areaInput({ status: "verified", spreadableAreaHa: 6.5, source: "Nitrates map" }), 8);
    const c = ctx({ spreadableAreaByField: reloadArea([row]) });
    expect(c.spreadableArea[0].spreadableAreaHa).toEqual({
      state: "known",
      value: 6.5,
      status: "verified",
      source: "Nitrates map",
      recordedAt: "2026-02-10",
      recordId: row.id,
      freshness: "NO_FRESHNESS_POLICY",
    });
    expect(c.spreadableArea[0].grossMappedAreaHa).toMatchObject({ state: "known", value: 8, status: "estimated" });
    expect(c.evidenceChecks.find((e) => e.fact === "spreadable_area")).toBeUndefined();
  });

  it("11: spreadable area above known gross area is rejected on write — never clamped", () => {
    expect(validateNewSpreadableAreaInput(areaInput({ spreadableAreaHa: 8.01 }), field, TODAY).map((e) => e.field)).toEqual(["spreadableAreaHa"]);
    expect(validateNewSpreadableAreaInput(areaInput({ spreadableAreaHa: 8 }), field, TODAY)).toEqual([]);
    // Gross area unknown: no ceiling to check against.
    expect(validateNewSpreadableAreaInput(areaInput({ spreadableAreaHa: 12 }), { areaHa: 0 }, TODAY)).toEqual([]);
  });

  it.each([
    ["negative", -0.1],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("rejects a %s spreadable area", (_label, spreadableAreaHa) => {
    expect(validateNewSpreadableAreaInput(areaInput({ spreadableAreaHa }), field, TODAY).map((e) => e.field)).toEqual(["spreadableAreaHa"]);
  });

  it("rejects an estimated status — no engine estimates spreadable area", () => {
    expect(validateNewSpreadableAreaInput(areaInput({ status: "estimated" as never }), field, TODAY).map((e) => e.field)).toEqual(["status"]);
  });

  it("12: a gross-area change does not rewrite the recorded spreadable area — it surfaces a conflict", () => {
    const row = persistArea(areaInput({ spreadableAreaHa: 6.5 }), 8);
    const shrunk = rowToField({ ...FIELD_ROW, area_ha: 5 });
    const c = ctx({ fields: [shrunk], spreadableAreaByField: reloadArea([row]) });
    const fact = c.spreadableArea[0].spreadableAreaHa;
    expect(fact).toMatchObject({ state: "conflicting", reasonCode: "SPREADABLE_AREA_EXCEEDS_GROSS_AREA" });
    expect(fact.state === "conflicting" && fact.candidates.map((x) => x.value)).toEqual([6.5, 5]);
    // The record itself — and its gross-at-record stamp — is untouched.
    expect(rowToSpreadableAreaRecord(row)).toMatchObject({ spreadableAreaHa: 6.5, grossAreaHaAtRecord: 8 });
    const check = c.evidenceChecks.find((e) => e.fact === "spreadable_area");
    expect(check).toMatchObject({ state: "conflicting", layers: ["TOTAL_VOLUME_BLOCKING"], scope: { kind: "fields", fieldIds: ["field-1"] } });
  });

  it("a gross-area increase keeps the recorded spreadable area known and unchanged", () => {
    const row = persistArea(areaInput({ spreadableAreaHa: 6.5 }), 8);
    const grown = rowToField({ ...FIELD_ROW, area_ha: 10 });
    expect(ctx({ fields: [grown], spreadableAreaByField: reloadArea([row]) }).spreadableArea[0].spreadableAreaHa).toMatchObject({ state: "known", value: 6.5 });
  });

  it("the current record is the latest; history stays retrievable and a reload never upgrades trust", () => {
    const older = rowToSpreadableAreaRecord(persistArea(areaInput({ status: "verified", spreadableAreaHa: 7, effectiveDate: "2026-01-01" }), 8));
    const newer = rowToSpreadableAreaRecord(persistArea(areaInput({ status: "farmer_adjusted", spreadableAreaHa: 6, effectiveDate: "2026-02-01" }), 8));
    const records: SpreadableAreaRecord[] = [newer, older];
    const current = currentSpreadableAreaByField(records).get("field-1");
    expect(current).toMatchObject({ spreadableAreaHa: 6, status: "farmer_adjusted" });
    expect(records.map((r) => r.spreadableAreaHa)).toEqual([6, 7]);
  });

  it("a record with no gross area at recording time maps without inventing one", () => {
    const record = rowToSpreadableAreaRecord(persistArea(areaInput(), null));
    expect(record).not.toHaveProperty("grossAreaHaAtRecord");
  });

  it("a malformed persisted row throws on load rather than becoming a value", () => {
    const row = persistArea(areaInput(), 8);
    expect(() => rowToSpreadableAreaRecord({ ...row, spreadable_area_ha: "" })).toThrow(/spreadable_area_ha/);
    expect(() => rowToSpreadableAreaRecord({ ...row, spreadable_area_ha: "-1" })).toThrow(/spreadable_area_ha/);
    expect(() => rowToSpreadableAreaRecord({ ...row, status: "unavailable" })).toThrow(/unknown status/);
  });

  it("an invalid in-memory record resolves to INVALID, never to zero", () => {
    const record = { ...rowToSpreadableAreaRecord(persistArea(areaInput(), 8)), spreadableAreaHa: Number.NaN };
    expect(resolveSpreadableAreaHa({ state: "missing", reasonCode: "FIELD_AREA_NOT_RECORDED" }, record)).toEqual({
      state: "missing",
      reasonCode: "SPREADABLE_AREA_EVIDENCE_INVALID",
    });
  });

  it("insert payloads never send a gross-area stamp or coerce a blank note", () => {
    const row = spreadableAreaInsertRow("farm-1", areaInput({ note: "  " }), null);
    expect(row).not.toHaveProperty("gross_area_ha_at_record");
    expect(row.note).toBeNull();
    expect(neatSlurryEvidenceInsertRow("farm-1", neatInput({ status: "unavailable", neatVolumeM3: 5 }), null).neat_volume_m3).toBeNull();
  });
});

describe("tied observations (same effective date and capture time) are never resolved by input order", () => {
  const TIED_AT = "2026-02-10T09:00:00Z";
  const neatFact = (rows: SlurryStoreNeatEvidenceRow[]) => ctx({ regulatoryNeatSlurryByHousing: reloadNeat(rows) }).stores[0].regulatoryNeatVolumeM3;
  const areaFact = (rows: FieldSpreadableAreaRow[]) => ctx({ spreadableAreaByField: reloadArea(rows) }).spreadableArea[0].spreadableAreaHa;

  it("A/B: neat known vs unavailable — [a,b] and [b,a] give the same conflict, never whichever came first", () => {
    const a = persistNeat(neatInput({ status: "verified", neatVolumeM3: 80 }), TIED_AT);
    const b = persistNeat(neatInput({ status: "unavailable", neatVolumeM3: undefined }), TIED_AT);
    const ab = neatFact([a, b]);
    expect(neatFact([b, a])).toEqual(ab);
    expect(ab).toEqual({
      state: "conflicting",
      reasonCode: "REGULATORY_NEAT_SLURRY_TIED_OBSERVATIONS_CONFLICT",
      candidates: [{ value: 80, status: "verified", source: "Farmer declaration", recordedAt: "2026-02-10", recordId: a.id }],
    });
    const c = ctx({ regulatoryNeatSlurryByHousing: reloadNeat([b, a]) });
    expect(c.evidenceChecks.find((e) => e.fact === "regulatory_neat_slurry")).toMatchObject({ state: "conflicting", layers: ["COMPLIANCE_BLOCKING"] });
    expect(c.evidenceChecks.find((e) => e.fact === "regulatory_neat_slurry")?.message).toContain("at the same time");
  });

  it("C: tied different known neat volumes conflict, with both candidates in record-id order", () => {
    const a = persistNeat(neatInput({ neatVolumeM3: 80 }), TIED_AT);
    const b = persistNeat(neatInput({ neatVolumeM3: 0 }), TIED_AT);
    const ab = neatFact([a, b]);
    expect(neatFact([b, a])).toEqual(ab);
    expect(ab).toMatchObject({ state: "conflicting", reasonCode: "REGULATORY_NEAT_SLURRY_TIED_OBSERVATIONS_CONFLICT" });
    expect(ab.state === "conflicting" && ab.candidates.map((x) => [x.value, x.recordId])).toEqual([
      [80, a.id],
      [0, b.id],
    ]);
  });

  it("a tied more-trusted status never erases a less-trusted one with the same volume", () => {
    const a = persistNeat(neatInput({ status: "verified", neatVolumeM3: 80 }), TIED_AT);
    const b = persistNeat(neatInput({ status: "farmer_adjusted", neatVolumeM3: 80 }), TIED_AT);
    expect(neatFact([a, b])).toMatchObject({ state: "conflicting", reasonCode: "REGULATORY_NEAT_SLURRY_TIED_OBSERVATIONS_CONFLICT" });
    expect(neatFact([b, a])).toEqual(neatFact([a, b]));
  });

  it("tied equivalent unavailable records stay unavailable — never a known value", () => {
    const a = persistNeat(neatInput({ status: "unavailable", neatVolumeM3: undefined }), TIED_AT);
    const b = persistNeat(neatInput({ status: "unavailable", neatVolumeM3: undefined }), TIED_AT);
    expect(neatFact([b, a])).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" });
  });

  it("D: tied equivalent neat observations collapse to the lowest record id, whatever the input order", () => {
    const a = persistNeat(neatInput({ neatVolumeM3: 80, note: "first" }), TIED_AT);
    const b = persistNeat(neatInput({ neatVolumeM3: 80, note: "second" }), TIED_AT);
    const records = [a, b].map(rowToNeatSlurryEvidenceRecord);
    const lowest = [a.id, b.id].sort()[0];
    expect(currentNeatSlurryEvidenceByHousing(records).get("housing-1")).toMatchObject({ id: lowest });
    expect(currentNeatSlurryEvidenceByHousing([...records].reverse()).get("housing-1")).toMatchObject({ id: lowest });
    expect(neatFact([b, a])).toEqual(neatFact([a, b]));
    expect(neatFact([a, b])).toMatchObject({ state: "known", value: 80, recordId: lowest });
  });

  it("E/F: spreadable area known vs invalid tied record — same conflict in either order, the known row is never silently picked", () => {
    const a = rowToSpreadableAreaRecord(persistArea(areaInput({ spreadableAreaHa: 6.5 }), 8, TIED_AT));
    const b = { ...rowToSpreadableAreaRecord(persistArea(areaInput(), 8, TIED_AT)), spreadableAreaHa: Number.NaN };
    const fact = (records: SpreadableAreaRecord[]) =>
      ctx({ spreadableAreaByField: currentSpreadableAreaByField(records) }).spreadableArea[0].spreadableAreaHa;
    expect(fact([b, a])).toEqual(fact([a, b]));
    expect(fact([a, b])).toEqual({
      state: "conflicting",
      reasonCode: "SPREADABLE_AREA_TIED_OBSERVATIONS_CONFLICT",
      candidates: [{ value: 6.5, status: "farmer_adjusted", source: "Farmer declaration", recordedAt: "2026-02-10", recordId: a.id }],
    });
  });

  it("E/G: tied different known spreadable areas conflict identically in either order", () => {
    const a = persistArea(areaInput({ spreadableAreaHa: 6.5 }), 8, TIED_AT);
    const b = persistArea(areaInput({ spreadableAreaHa: 0, status: "verified" }), 8, TIED_AT);
    const ab = areaFact([a, b]);
    expect(areaFact([b, a])).toEqual(ab);
    expect(ab.state === "conflicting" && ab.candidates.map((x) => [x.value, x.status, x.recordId])).toEqual([
      [6.5, "farmer_adjusted", a.id],
      [0, "verified", b.id],
    ]);
    const c = ctx({ spreadableAreaByField: reloadArea([b, a]) });
    const checks = c.evidenceChecks.filter((e) => e.fact === "spreadable_area");
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ state: "conflicting", layers: ["TOTAL_VOLUME_BLOCKING"], scope: { kind: "fields", fieldIds: ["field-1"] } });
    expect(checks[0].message).toContain("at the same time");
  });

  it("H: tied equivalent spreadable-area observations collapse to the lowest record id, whatever the input order", () => {
    const a = persistArea(areaInput({ spreadableAreaHa: 6.5, note: "first" }), 8, TIED_AT);
    const b = persistArea(areaInput({ spreadableAreaHa: 6.5, note: "second" }), 8, TIED_AT);
    const lowest = [a.id, b.id].sort()[0];
    expect(reloadArea([a, b]).get("field-1")).toMatchObject({ id: lowest });
    expect(reloadArea([b, a]).get("field-1")).toMatchObject({ id: lowest });
    expect(areaFact([b, a])).toEqual(areaFact([a, b]));
    expect(areaFact([a, b])).toMatchObject({ state: "known", value: 6.5, recordId: lowest });
  });

  it("I: an explicit zero stays a known zero when it is the sole or unambiguous latest fact", () => {
    const zero = persistNeat(neatInput({ neatVolumeM3: 0 }), TIED_AT);
    const older = persistNeat(neatInput({ neatVolumeM3: 80, effectiveDate: "2026-01-01" }), TIED_AT);
    expect(neatFact([zero])).toMatchObject({ state: "known", value: 0 });
    expect(neatFact([older, zero])).toMatchObject({ state: "known", value: 0, recordId: zero.id });
    const zeroTwin = persistNeat(neatInput({ neatVolumeM3: 0 }), TIED_AT);
    expect(neatFact([zeroTwin, zero])).toMatchObject({ state: "known", value: 0 });
    const areaZero = persistArea(areaInput({ spreadableAreaHa: 0 }), 8, TIED_AT);
    const areaOlder = persistArea(areaInput({ spreadableAreaHa: 6.5 }), 8, "2026-02-09T09:00:00Z");
    expect(areaFact([areaZero, areaOlder])).toMatchObject({ state: "known", value: 0, recordId: areaZero.id });
  });

  it("J: non-tied records keep latest-effective-date-then-latest-capture behaviour in either order", () => {
    const earlierCapture = persistNeat(neatInput({ neatVolumeM3: 50 }), "2026-02-10T09:00:00Z");
    const laterCapture = persistNeat(neatInput({ neatVolumeM3: 60 }), "2026-02-10T09:00:01Z");
    const olderDate = persistNeat(neatInput({ neatVolumeM3: 90, effectiveDate: "2026-01-01" }), "2026-02-12T09:00:00Z");
    for (const rows of [
      [earlierCapture, laterCapture, olderDate],
      [olderDate, laterCapture, earlierCapture],
    ]) {
      expect(neatFact(rows)).toMatchObject({ state: "known", value: 60, recordId: laterCapture.id });
    }
    // A tie on an older effective date is irrelevant once a later one exists.
    const tiedOldA = persistArea(areaInput({ spreadableAreaHa: 5, effectiveDate: "2026-01-01" }), 8, TIED_AT);
    const tiedOldB = persistArea(areaInput({ spreadableAreaHa: 6, effectiveDate: "2026-01-01" }), 8, TIED_AT);
    const newest = persistArea(areaInput({ spreadableAreaHa: 7, effectiveDate: "2026-02-01" }), 8, TIED_AT);
    expect(areaFact([tiedOldA, newest, tiedOldB])).toMatchObject({ state: "known", value: 7, recordId: newest.id });
    expect(areaFact([tiedOldB, tiedOldA, newest])).toMatchObject({ state: "known", value: 7, recordId: newest.id });
  });
});
