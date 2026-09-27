import { describe, expect, it } from "vitest";
import {
  buildSlurryRegulatoryContext,
  resolveRegulatoryNeatSlurryVolume,
  SLURRY_REGULATORY_CONTEXT_VERSION,
  type BuildSlurryRegulatoryContextInput,
  type RegulatoryNeatSlurryEvidence,
} from "./slurry-regulatory-context";
import { calculateNutrientPlan } from "./nutrients";
import type { SlurryComposition } from "./slurry-composition";
import type { SlurryAllocationRecord } from "./slurry-allocation-lifecycle";
import type { Field } from "./types";
import type { EvidenceFact } from "./slurry-evidence-context";
import { rowToField, rowToHousing, rowToSlurryAllocationRecord } from "@/lib/farm-data/mappers";
import type { FieldRow, HousingRow, SlurryAllocationRow } from "@/lib/farm-data/row-types";

// Persisted-row fixtures through the real mappers, as in
// slurry-evidence-context.test.ts.
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

function allocationRow(overrides: Partial<SlurryAllocationRow>): SlurryAllocationRow {
  return {
    id: "sa-1",
    farm_id: "farm-1",
    field_id: "field-1",
    housing_id: "housing-1",
    priority: null,
    volume_m3: 60,
    score: null,
    application_method: null,
    application_date: null,
    status: "planned",
    actual_volume_m3: null,
    actual_spread_date: null,
    store_reconciliation: null,
    store_observation_seq: null,
    completed_at: null,
    completed_by: null,
    cancelled_at: null,
    cancelled_by: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

const composition = (overrides: Partial<SlurryComposition> = {}): SlurryComposition => ({
  id: "comp-1",
  farmId: "farm-1",
  housingId: "housing-1",
  slurryType: "cattle_slurry",
  status: "verified",
  dmPct: 6,
  sampleDate: "2026-02-10",
  source: "Laboratory report",
  laboratory: "Teagasc Johnstown",
  recordedAt: "2026-02-11T09:00:00Z",
  ...overrides,
});

const field = (overrides: Partial<FieldRow> = {}): Field => rowToField({ ...FIELD_ROW, ...overrides });
const housing = (overrides: Partial<HousingRow> = {}) => rowToHousing({ ...HOUSING_ROW, ...overrides }, []);
const record = (overrides: Partial<SlurryAllocationRow> = {}): SlurryAllocationRecord => rowToSlurryAllocationRecord(allocationRow(overrides));

const neat = (volumeM3: number): RegulatoryNeatSlurryEvidence => ({ volumeM3, status: "farmer_adjusted", source: "Test declaration", recordedAt: "2026-02-02" });

function ctx(input: Partial<BuildSlurryRegulatoryContextInput> = {}) {
  return buildSlurryRegulatoryContext({
    fields: [field()],
    housing: [housing()],
    allocationRecords: [],
    compositionRecords: [],
    livestockGroups: [],
    asOfDate: "2026-03-01",
    ...input,
  });
}

const PHYSICAL_M3 = 106; // 200 m³ × 53 %

describe("B1 — physical slurry vs regulatory neat slurry", () => {
  it("A: known physical volume with unknown neat volume stays two distinct states", () => {
    const store = ctx().stores[0];
    expect(store.physicalVolumeM3).toMatchObject({ state: "known", value: PHYSICAL_M3 });
    expect(store.regulatoryNeatVolumeM3).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED" });
  });

  it("B: planned physical slurry never becomes neat slurry 1:1 for the nutrient plan", () => {
    const c = ctx({ allocationRecords: [record()] });
    expect(c.plannedRegulatoryNeatSlurryByField["field-1"]).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED" });
    const plan = calculateNutrientPlan({ field: field(), farmGrasslandAreaHa: 8, livestockGroups: [], slurryAllocation: record(), asOfDate: "2026-03-01" });
    expect(plan.statutoryManureValue.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("C: known neat volume stays distinguishable from physical volume", () => {
    const store = ctx({ regulatoryNeatSlurryByHousing: new Map([["housing-1", neat(80)]]) }).stores[0];
    expect(store.physicalVolumeM3).toMatchObject({ state: "known", value: PHYSICAL_M3 });
    expect(store.regulatoryNeatVolumeM3).toMatchObject({ state: "known", value: 80, source: "Test declaration" });
  });

  it("C: a partly-neat store does not give the planned share a neat volume (no fraction is derived)", () => {
    const c = ctx({ allocationRecords: [record()], regulatoryNeatSlurryByHousing: new Map([["housing-1", neat(80)]]) });
    expect(c.plannedRegulatoryNeatSlurryByField["field-1"]).toEqual({ state: "missing", reasonCode: "PLANNED_SHARE_OF_PARTLY_NEAT_STORE_NOT_ESTABLISHED" });
  });

  it("C: a store evidenced as wholly neat slurry makes the planned physical volume its neat volume", () => {
    const c = ctx({ allocationRecords: [record()], regulatoryNeatSlurryByHousing: new Map([["housing-1", neat(PHYSICAL_M3)]]) });
    expect(c.plannedRegulatoryNeatSlurryByField["field-1"]).toMatchObject({ state: "known", value: 60, status: "farmer_adjusted" });
  });

  it("D: composition varies independently of neat identity", () => {
    const withComp = ctx({ compositionRecords: [composition()] }).stores[0];
    const withNeatNoComp = ctx({ regulatoryNeatSlurryByHousing: new Map([["housing-1", neat(50)]]) }).stores[0];
    expect(withComp.composition.recordedDryMatterPct).toMatchObject({ state: "known", value: 6 });
    expect(withComp.regulatoryNeatVolumeM3.state).toBe("missing");
    expect(withNeatNoComp.composition.recordedDryMatterPct.state).toBe("missing");
    expect(withNeatNoComp.regulatoryNeatVolumeM3).toMatchObject({ state: "known", value: 50 });
    expect(withNeatNoComp.physicalVolumeM3).toEqual(withComp.physicalVolumeM3);
  });

  it("O: neat evidence exceeding physical volume is a conflict, neither value chosen", () => {
    const fact = resolveRegulatoryNeatSlurryVolume({ state: "known", value: 100, status: "farmer_adjusted", source: "fill", freshness: "NO_FRESHNESS_POLICY" }, neat(150));
    expect(fact.state).toBe("conflicting");
    if (fact.state === "conflicting") expect(fact.candidates.map((c) => c.value)).toEqual([150, 100]);
  });
});

describe("B2 — farm regulatory context", () => {
  it("E: missing regulatory evidence stays missing or blocked, never false or zero", () => {
    const farm = ctx().farm;
    expect(farm.derogationStatus).toEqual({ state: "missing", reasonCode: "DEROGATION_STATUS_NOT_HELD" });
    expect(farm.manureImports.state).toBe("missing");
    expect(farm.manureExports.state).toBe("missing");
    expect(farm.organicNLimit.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(farm.homeProducedManurePAccounting.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(farm.statutoryGrasslandStockingRate.basis).toBe("current_herd_record_not_previous_year");
  });

  it("records the ruleset and context version it was built against", () => {
    const c = ctx();
    expect(c.version).toBe(SLURRY_REGULATORY_CONTEXT_VERSION);
    expect(c.ruleset.statutorySource).toContain("S.I. No. 588/2025");
  });
});

describe("B3 — gross vs spreadable area", () => {
  it("H: gross mapped area never becomes spreadable area", () => {
    const area = ctx().spreadableArea[0];
    expect(area.grossMappedAreaHa).toMatchObject({ state: "known", value: 8 });
    expect(area.spreadableAreaHa).toEqual({ state: "missing", reasonCode: "SPREADABLE_AREA_NOT_ESTABLISHED" });
    expect(area.knownExcludedAreaHa.state).toBe("missing");
  });

  it("I: unknown spreadable area blocks total volume only, not the per-ha rate", () => {
    const check = ctx().evidenceChecks.find((c) => c.fact === "spreadable_area");
    expect(check?.layers).toEqual(["TOTAL_VOLUME_BLOCKING"]);
    expect(check?.layers).not.toContain("RATE_BLOCKING");
  });

  it("J: archived fields stay out of current planning and out of every check", () => {
    const archived = field({ id: "field-2", name: "Old Field", archived_at: "2026-01-15T00:00:00Z" });
    const c = ctx({ fields: [field(), archived] });
    expect(c.spreadableArea.map((a) => a.fieldId)).toEqual(["field-1"]);
    expect(Object.keys(c.plannedRegulatoryNeatSlurryByField)).toEqual(["field-1"]);
    expect(c.evidenceChecks.some((ch) => ch.scope.kind === "fields" && ch.scope.fieldIds.includes("field-2"))).toBe(false);
  });

  it("L: an existing water-buffer answer is reused as exclusion evidence without inferring an excluded area", () => {
    const f = field({ water_buffer_context: { value: { featureType: "surface_water", distanceM: 25, localOverrideStatus: "verified_none" }, status: "farmer_adjusted", source: "Keith", sourceDate: "2026-01-21" } });
    const area = ctx({ fields: [f] }).spreadableArea[0];
    expect(area.exclusionEvidence.waterBufferContext).toMatchObject({ state: "known", source: "Keith" });
    expect(area.knownExcludedAreaHa.state).toBe("missing");
  });
});

describe("B4 — minimum evidence checks", () => {
  const answered = (id: string, name: string) =>
    field({
      id,
      name,
      commonage_status: { value: "not_commonage", status: "farmer_adjusted", source: "Keith", sourceDate: "2026-01-20" },
      water_buffer_context: { value: { featureType: "surface_water", distanceM: 25, localOverrideStatus: "verified_none" }, status: "farmer_adjusted", source: "Keith" },
    });

  it("K/N: existing commonage and buffer answers prevent duplicate asks", () => {
    const facts = ctx({ fields: [answered("field-1", "Home Field")] }).evidenceChecks.map((c) => c.fact);
    expect(facts).not.toContain("commonage_status");
    expect(facts).not.toContain("water_buffer_context");
  });

  it("K: a recorded 'not sure' commonage answer is disclosed, not asked again", () => {
    const f = field({ commonage_status: { value: "unknown", status: "farmer_adjusted", source: "Keith" } });
    const check = ctx({ fields: [f] }).evidenceChecks.find((c) => c.fact === "commonage_status");
    expect(check).toMatchObject({ state: "declared_unknown", ask: false });
  });

  it("M: a missing field fact is asked once with every field named, and a farm-level fact once for the farm", () => {
    const fields = [field(), field({ id: "field-2", name: "Top Field" }), field({ id: "field-3", name: "Bog Field" })];
    const checks = ctx({ fields }).evidenceChecks;
    const commonage = checks.filter((c) => c.fact === "commonage_status");
    expect(commonage).toHaveLength(1);
    expect(commonage[0].scope).toEqual({ kind: "fields", fieldIds: ["field-1", "field-2", "field-3"] });
    expect(commonage[0].message).toContain("Home Field, Top Field and Bog Field");
    const derogation = checks.filter((c) => c.fact === "derogation_status");
    expect(derogation).toHaveLength(1);
    expect(derogation[0].scope).toEqual({ kind: "farm" });
  });

  it("does not copy one field's answer to another field", () => {
    const checks = ctx({ fields: [answered("field-1", "Home Field"), field({ id: "field-2", name: "Top Field" })] }).evidenceChecks;
    expect(checks.find((c) => c.fact === "commonage_status")?.scope).toEqual({ kind: "fields", fieldIds: ["field-2"] });
  });

  it("G: a farmer-declared P Index with no laboratory result is reported as not legally sufficient, not as absent", () => {
    const f = field({
      fertility: {
        pIndex: { value: 4, status: "farmer_adjusted", source: "Keith" },
        kIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2025-03-01" },
      },
    });
    const check = ctx({ fields: [f] }).evidenceChecks.find((c) => c.fact === "soil_p_laboratory_evidence");
    expect(check).toMatchObject({ state: "not_legally_sufficient", layers: ["COMPLIANCE_BLOCKING"], ask: true, answerTarget: "soil_test" });
  });

  it("O: conflicting slurry DM evidence stays a conflict, not an arbitrary choice", () => {
    const c = ctx({
      housing: [housing(), housing({ id: "housing-2", shed_name: "Shed 2" })],
      allocationRecords: [record(), record({ id: "sa-2", housing_id: "housing-2" })],
      compositionRecords: [composition(), composition({ id: "comp-2", housingId: "housing-2", dmPct: 3 })],
    });
    expect(c.evidenceChecks.find((ch) => ch.fact === "slurry_dry_matter")).toMatchObject({ state: "conflicting", layers: ["RATE_BLOCKING"], ask: false });
  });

  it("P: every check carries its blocking layers, and neat-slurry is a compliance (not rate or volume) blocker with plain language", () => {
    const checks = ctx().evidenceChecks;
    for (const c of checks) expect(c.layers.length).toBeGreaterThan(0);
    const neatCheck = checks.find((c) => c.fact === "regulatory_neat_slurry");
    expect(neatCheck?.layers).toEqual(["COMPLIANCE_BLOCKING"]);
    expect(neatCheck?.ask).toBe(false);
    expect(neatCheck?.message).toBe(
      "Farm Return knows Shed 1 contains 106 m³, but it does not yet know how much of that is neat cattle slurry for regulatory calculations.",
    );
  });

  it("B4.4: farmer-facing messages never expose internal codes", () => {
    const f = field({ fertility: { pIndex: { value: 2, status: "estimated", source: "x" }, kIndex: { value: 2, status: "estimated", source: "x" } } });
    const messages = ctx({ fields: [f, field({ id: "field-2", name: "Top Field", fertility: {} })] }).evidenceChecks.map((c) => c.message);
    for (const m of messages) expect(m).not.toMatch(/[A-Z]{3,}_[A-Z_]+|_m3|_pct|fieldId|housingId/);
  });
});

describe("Campaign B stabilisation — unavailable neat-slurry evidence", () => {
  const unavailable = (volumeM3: number): RegulatoryNeatSlurryEvidence => ({ volumeM3, status: "unavailable", source: "Test record" });
  const knownPhysical: EvidenceFact<number> = { state: "known", value: PHYSICAL_M3, status: "farmer_adjusted", source: "fill", freshness: "NO_FRESHNESS_POLICY" };
  const plannedInput = (fact: EvidenceFact<number>) => (fact.state === "known" ? { volumeM3: fact.value, status: fact.status, source: fact.source } : undefined);
  const planFor = (fact: EvidenceFact<number>) =>
    calculateNutrientPlan({
      field: field(),
      farmGrasslandAreaHa: 8,
      livestockGroups: [],
      slurryAllocation: record(),
      plannedRegulatoryNeatSlurry: plannedInput(fact),
      asOfDate: "2026-03-01",
    });

  it("A: a positive volume marked unavailable never becomes known", () => {
    expect(resolveRegulatoryNeatSlurryVolume(knownPhysical, unavailable(100))).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" });
    expect(resolveRegulatoryNeatSlurryVolume(knownPhysical, unavailable(PHYSICAL_M3)).state).toBe("missing");
  });

  it("B/C: unavailable evidence stays unavailable through field allocation and supplies no statutory quantity", () => {
    const c = ctx({ allocationRecords: [record()], regulatoryNeatSlurryByHousing: new Map([["housing-1", unavailable(PHYSICAL_M3)]]) });
    expect(c.stores[0].regulatoryNeatVolumeM3).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" });
    const fieldFact = c.plannedRegulatoryNeatSlurryByField["field-1"];
    expect(fieldFact.state).not.toBe("known");
    expect(planFor(fieldFact).statutoryManureValue.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    const check = c.evidenceChecks.find((ch) => ch.fact === "regulatory_neat_slurry");
    expect(check).toMatchObject({ state: "missing", layers: ["COMPLIANCE_BLOCKING"] });
    expect(check?.message).toContain("marked as unavailable");
  });

  it("B: a derived field fact keeps its source's trust — an estimate is never relabelled farmer_adjusted", () => {
    const estimated: RegulatoryNeatSlurryEvidence = { volumeM3: PHYSICAL_M3, status: "estimated", source: "Estimate" };
    const fact = ctx({ allocationRecords: [record()], regulatoryNeatSlurryByHousing: new Map([["housing-1", estimated]]) }).plannedRegulatoryNeatSlurryByField["field-1"];
    expect(fact).toMatchObject({ state: "known", status: "estimated" });
  });

  it("D: genuinely known verified neat-slurry evidence remains usable", () => {
    const verified: RegulatoryNeatSlurryEvidence = { volumeM3: PHYSICAL_M3, status: "verified", source: "Lab declaration", recordedAt: "2026-02-02" };
    const fact = ctx({ allocationRecords: [record()], regulatoryNeatSlurryByHousing: new Map([["housing-1", verified]]) }).plannedRegulatoryNeatSlurryByField["field-1"];
    expect(fact).toMatchObject({ state: "known", value: 60, status: "verified", source: "Lab declaration", recordedAt: "2026-02-02" });
    expect(planFor(fact).statutoryManureValue.status).toBe("OK");
  });

  it("E: a known explicit zero stays distinguishable from unavailable and missing", () => {
    expect(resolveRegulatoryNeatSlurryVolume(knownPhysical, { volumeM3: 0, status: "verified", source: "Declaration" })).toMatchObject({ state: "known", value: 0, status: "verified" });
    expect(resolveRegulatoryNeatSlurryVolume(knownPhysical, unavailable(0))).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" });
    expect(resolveRegulatoryNeatSlurryVolume(knownPhysical, undefined)).toEqual({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED" });
  });
});

describe("Campaign B stabilisation — soil P laboratory evidence checks", () => {
  const LAB_P = { value: 2 as const, status: "verified" as const, source: "Lab soil test", sourceDate: "2025-03-01" };
  const K = { value: 3 as const, status: "verified" as const, source: "Lab soil test", sourceDate: "2025-03-01" };
  const soilTest = (sampleDate: string) => ({ sampleDate, laboratory: "Teagasc Johnstown", sampleRef: "S1", p: 4, k: 100, pH: 6.3 });
  const soilChecks = (f: Field) => ctx({ fields: [f] }).evidenceChecks.filter((c) => c.fact === "soil_p_laboratory_evidence");

  it("F/G/H: a laboratory P Index without a sample date is a compliance blocker asking only for the date, and the result is kept", () => {
    for (const f of [field({ fertility: { pIndex: LAB_P, kIndex: K } }), field({ fertility: { pIndex: LAB_P, kIndex: K, verifiedTest: soilTest("") } })]) {
      const c = ctx({ fields: [f] });
      expect(c.evidence.fields[0].soilTestAgeValidity.status).not.toBe("OK");
      const checks = c.evidenceChecks.filter((ch) => ch.fact === "soil_p_laboratory_evidence");
      expect(checks).toHaveLength(1);
      expect(checks[0]).toMatchObject({ state: "validity_unresolved", layers: ["COMPLIANCE_BLOCKING"], ask: true, answerTarget: "soil_test" });
      expect(checks[0].message).toContain("sample date");
      expect(checks[0].message).not.toMatch(/too old|No soil P Index|new soil test/);
      expect(c.evidence.fields[0].soilIndex.p).toMatchObject({ basis: "laboratory", laboratory: { value: 2, status: "verified" } });
    }
  });

  it("I: valid, dated laboratory evidence produces no soil blocker", () => {
    expect(soilChecks(field({ fertility: { pIndex: LAB_P, kIndex: K, verifiedTest: soilTest("2025-02-20") } }))).toEqual([]);
  });

  it("J-M: a farmer override over valid laboratory evidence does not ask for a new soil test, and both provenances stay distinct", () => {
    const f = field({
      fertility: { pIndex: { value: 4, status: "farmer_adjusted", source: "Keith", previous: LAB_P }, kIndex: K, verifiedTest: soilTest("2025-02-20") },
    });
    const c = ctx({ fields: [f] });
    const p = c.evidence.fields[0].soilIndex.p;
    expect(c.evidence.fields[0].soilTestAgeValidity).toMatchObject({ status: "OK", value: "VALID" });
    expect(p.laboratory).toMatchObject({ value: 2, status: "verified", source: "Lab soil test" });
    expect(p.effective).toMatchObject({ value: 4, status: "farmer_adjusted", source: "Keith" });
    expect(p.farmerOverride).toEqual(p.effective);
    expect(p.laboratory).not.toEqual(p.effective);
    const checks = c.evidenceChecks.filter((ch) => ch.fact === "soil_p_laboratory_evidence");
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ state: "override_of_valid_laboratory", layers: ["COMPLIANCE_BLOCKING"], ask: false, answerTarget: "none" });
    expect(checks[0].message).not.toMatch(/soil test is needed|new soil test|Add a soil test/);
  });

  it("an override over an undated laboratory result asks for the date, not a new test", () => {
    const f = field({ fertility: { pIndex: { value: 4, status: "farmer_adjusted", source: "Keith", previous: LAB_P }, kIndex: K } });
    expect(soilChecks(f)).toMatchObject([{ state: "validity_unresolved", ask: true, answerTarget: "soil_test" }]);
  });

  it("N: missing laboratory evidence still produces the appropriate blocker", () => {
    expect(soilChecks(field({ fertility: {} }))).toMatchObject([{ state: "missing", layers: ["RATE_BLOCKING", "COMPLIANCE_BLOCKING"], ask: true }]);
    expect(soilChecks(field({ fertility: { pIndex: { value: 3, status: "estimated", source: "x" }, kIndex: K } }))).toMatchObject([{ state: "not_legally_sufficient" }]);
  });
});
