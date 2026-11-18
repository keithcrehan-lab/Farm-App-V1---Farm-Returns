import { describe, expect, it } from "vitest";
import type { GrassIntakeEvidencePayload, GrassIntakeLedgerRecord } from "./grass-intake-evidence-ledger";
import { resolveGrassIntakeEvidence } from "./grass-intake-evidence-resolution";
import { calculateGrassSessionSegmentDemand } from "./grass-session-segment-demand";
import type { GrassCoverObservation } from "./grass-management";
import type { GrazingFieldSession } from "./grazing-field-pressure";
import type { LivestockCategory, LivestockGroup } from "./types";

const FARM = "farm-1";
const FIELD = "30000000-0000-4000-8000-000000000001";
const FIELD2 = "30000000-0000-4000-8000-000000000002";
const COW = "20000000-0000-4000-8000-000000000001";
const CALF = "20000000-0000-4000-8000-000000000002";
const DAIRY = "20000000-0000-4000-8000-000000000003";
const STEER = "20000000-0000-4000-8000-000000000004";
const OBS = "40000000-0000-4000-8000-000000000001";
const D1 = "2026-06-01T00:00:00.000Z", D2 = "2026-06-02T00:00:00.000Z", D3 = "2026-06-03T00:00:00.000Z";

let seq = 0;
const rec = (payload: GrassIntakeEvidencePayload, effectiveFrom = D1, effectiveTo?: string, extra: Partial<GrassIntakeLedgerRecord> = {}): GrassIntakeLedgerRecord => ({
  id: `r${++seq}`, farmId: FARM, recordedAt: "2026-06-01T12:00:00Z", effectiveFrom, ...(effectiveTo ? { effectiveTo } : {}), source: "farmer", payload, ...extra,
});
const head = (groupId: string, headCount: number, avgWeightKg: number): GrassIntakeEvidencePayload => ({ kind: "group_headcount_weight", groupId, headCount, avgWeightKg });
const none = (groupId: string): GrassIntakeEvidencePayload => ({ kind: "group_feed", groupId, feedType: "none", kgFreshPerHeadDay: 0, dmFraction: null });
const meal = (groupId: string, kg: number): GrassIntakeEvidencePayload => ({ kind: "group_feed", groupId, feedType: "concentrate", kgFreshPerHeadDay: kg, dmFraction: 0.88 });
const pair = (): GrassIntakeEvidencePayload => ({ kind: "cow_calf_pair", cowGroupId: COW, calfGroupId: CALF, calfStage: "older_grazing", uniquePairConfirmed: true });

const session = (groupId: string, headCountSnapshot: number, category: LivestockCategory, startedAt = D1, endedAt?: string, fieldId = FIELD): GrazingFieldSession => ({
  id: `s${++seq}`, farmId: FARM, livestockGroupId: groupId, fieldId, startedAt, ...(endedAt ? { endedAt } : {}), headCountSnapshot,
  livestockCategorySnapshot: category, livestockUnitsPerHeadSnapshot: 1, source: "farmer_move", createdAt: startedAt,
});
const group = (id: string, category: LivestockCategory): LivestockGroup => ({
  id, farmId: FARM, category, label: category, count: { value: 1, source: "farmer" }, system: "grazing", value: { value: 0, source: "farmer" },
} as unknown as LivestockGroup);
const GROUPS = [group(COW, "suckler_cow"), group(CALF, "calf"), group(DAIRY, "dairy_cow"), group(STEER, "steer")];
const cover = (observedAt = "2026-05-31T08:00:00.000Z", coverKgDmHa = 1400): GrassCoverObservation => ({ id: OBS, farmId: FARM, fieldId: FIELD, coverKgDmHa, method: "plate_meter" as GrassCoverObservation["method"], observedAt, source: "plate meter walk" });

function run(records: GrassIntakeLedgerRecord[], sessions: GrazingFieldSession[], opts: { to?: string; covers?: GrassCoverObservation[]; groups?: LivestockGroup[]; fieldId?: string } = {}) {
  const to = opts.to ?? D3;
  const resolution = resolveGrassIntakeEvidence({ farmId: FARM, from: D1, to, records });
  return calculateGrassSessionSegmentDemand({ farmId: FARM, fieldId: opts.fieldId ?? FIELD, from: D1, to, resolution, fields: [{ id: FIELD, farmId: FARM }, { id: FIELD2, farmId: FARM }], sessions, groups: opts.groups ?? GROUPS, covers: opts.covers ?? [cover()] });
}
const sucklerEvidence = () => [rec(pair()), rec(head(COW, 40, 680)), rec(head(CALF, 40, 200)), rec(none(COW)), rec(none(CALF))];
const dairyEvidence = (feed: GrassIntakeLedgerRecord[] = [rec(none(DAIRY))]) => [
  rec({ kind: "dairy_stage", groupId: DAIRY, stage: "midseason_lactating" }), rec(head(DAIRY, 50, 550)),
  rec({ kind: "cover_basis", fieldId: FIELD, observationId: OBS, basis: "measured_above_4cm" }), ...feed,
];

describe("grass session segment demand (Step 4)", () => {
  it("counts a cow/calf pair once as an atomic unit and multiplies by interval duration", () => {
    const r = run(sucklerEvidence(), [session(COW, 40, "suckler_cow"), session(CALF, 40, "calf")]);
    if (r.status !== "READY") throw new Error(JSON.stringify(r));
    expect(r.quantityBasis).toBe("PLANNING_ALLOCATION_ONLY");
    expect(r.intervals).toHaveLength(1);
    const iv = r.intervals[0];
    if (iv.status !== "GRAZED") throw new Error("expected grazed");
    expect(iv.units).toHaveLength(1);
    expect(iv.units[0].model).toBe("suckler_pair");
    // 40 x 680 x 2% + 40 x 200 x 2% = 544 + 160 = 704 kg DM/day (BEEF2026 2% liveweight basis) over 2 days.
    expect(iv.kgDmPerDay).toBeCloseTo(704, 9);
    expect(r.grazedKgDm).toBeCloseTo(1408, 9);
  });

  it("splits at a movement and reports the vacated interval as unrecorded, never zero demand", () => {
    const r = run(sucklerEvidence(), [session(COW, 40, "suckler_cow", D1, D2), session(CALF, 40, "calf", D1, D2), session(COW, 40, "suckler_cow", D2, undefined, FIELD2), session(CALF, 40, "calf", D2, undefined, FIELD2)]);
    if (r.status !== "READY") throw new Error(JSON.stringify(r));
    expect(r.intervals.map(i => [i.from, i.status])).toEqual([[D1, "GRAZED"], [D2, "NO_RECORDED_SESSION"]]);
    expect(r.completeness).toBe("PARTIAL_UNRECORDED_OCCUPANCY");
    expect(r.intervals[1]).not.toHaveProperty("kgDm");
    expect(r.grazedKgDm).toBeCloseTo(704, 9);
    expect(r.unrecordedDays).toBe(1);
  });

  it("recalculates at a headcount change recorded in both evidence and sessions", () => {
    const ev = [rec(pair()), rec(head(COW, 40, 680), D1, D2), rec(head(COW, 30, 680), D2), rec(head(CALF, 40, 200), D1, D2), rec(head(CALF, 30, 200), D2), rec(none(COW)), rec(none(CALF))];
    const r = run(ev, [session(COW, 40, "suckler_cow", D1, D2), session(CALF, 40, "calf", D1, D2), session(COW, 30, "suckler_cow", D2), session(CALF, 30, "calf", D2)]);
    if (r.status !== "READY") throw new Error(JSON.stringify(r));
    expect(r.intervals.map(i => (i.status === "GRAZED" ? i.kgDmPerDay : null))).toEqual([704, 528]);
  });

  it("holds when evidence headcount changes but the session snapshot does not", () => {
    const ev = [rec(pair()), rec(head(COW, 40, 680), D1, D2), rec(head(COW, 30, 680), D2), rec(head(CALF, 40, 200)), rec(none(COW)), rec(none(CALF))];
    const r = run(ev, [session(COW, 40, "suckler_cow"), session(CALF, 40, "calf")]);
    expect(r.status).toBe("HELD");
    if (r.status === "HELD") expect(r.reasons.some(x => x.startsWith(`headCountSnapshotMismatch:${COW}`))).toBe(true);
  });

  it("holds when the paired calf is grazing a different field", () => {
    const r = run(sucklerEvidence(), [session(COW, 40, "suckler_cow"), session(CALF, 40, "calf", D1, undefined, FIELD2)]);
    expect(r.status).toBe("HELD");
    if (r.status === "HELD") expect(r.reasons.some(x => x.startsWith(`pairNotTogetherInField:${COW}:${CALF}`))).toBe(true);
  });

  it("holds when one group has overlapping sessions anywhere on the farm (double counting)", () => {
    const r = run(sucklerEvidence(), [session(COW, 40, "suckler_cow"), session(CALF, 40, "calf"), session(COW, 40, "suckler_cow", D2, undefined, FIELD2)]);
    expect(r).toMatchObject({ status: "HELD", reasons: [`groupInOverlappingSessions:${COW}`] });
  });

  it("holds on an unaccounted grazing group instead of understating demand", () => {
    const r = run(sucklerEvidence(), [session(COW, 40, "suckler_cow"), session(CALF, 40, "calf"), session(STEER, 10, "steer")]);
    expect(r.status).toBe("HELD");
    if (r.status === "HELD") expect(r.reasons.some(x => x.startsWith(`noSourceScopedModelForGroup:${STEER}`))).toBe(true);
  });

  it("never assumes no supplementary feed when the feed record is missing", () => {
    const ev = sucklerEvidence().filter(r => !(r.payload.kind === "group_feed" && r.payload.groupId === CALF));
    const r = run(ev, [session(COW, 40, "suckler_cow"), session(CALF, 40, "calf")]);
    expect(r.status).toBe("HELD");
    if (r.status === "HELD") expect(r.reasons.some(x => x.startsWith("missingPairEvidence"))).toBe(true);
  });

  it("holds a pair when concentrate is recorded for the cow", () => {
    const ev = sucklerEvidence().filter(r => !(r.payload.kind === "group_feed" && r.payload.groupId === COW)).concat(rec(meal(COW, 1)));
    const r = run(ev, [session(COW, 40, "suckler_cow"), session(CALF, 40, "calf")]);
    expect(r.status).toBe("HELD");
    if (r.status === "HELD") expect(r.reasons.some(x => x.startsWith("pairLink") || x.startsWith("supplementaryFeedRecordedNone"))).toBe(true);
  });

  it("evaluates dairy with a recorded 'none' feed at the 0 kg meal Teagasc table cell, with provenance", () => {
    const ok = run(dairyEvidence(), [session(DAIRY, 50, "dairy_cow")]);
    if (ok.status !== "READY") throw new Error(JSON.stringify(ok));
    expect(ok.completeness).toBe("COMPLETE");
    const iv = ok.intervals[0];
    if (iv.status !== "GRAZED") throw new Error("expected grazed");
    // Table 1 @1,400 kg DM/ha, 0 kg meal: 16.8 kg grass DM/cow/day x 50 cows.
    expect(iv.kgDmPerDay).toBeCloseTo(16.8 * 50, 9);
    expect(iv.units[0]).toMatchObject({ coverObservationId: OBS, gateVersion: "grass_intake_evidence_gate_v1.0.0" });
    expect(iv.units[0].source).toMatch(/Teagasc/);
    expect(iv.units[0].evidenceDates).toHaveLength(4);
  });

  it("holds dairy concentrate until the ledger can assert concentrate is the only supplement", () => {
    const r = run(dairyEvidence([rec(meal(DAIRY, 2))]), [session(DAIRY, 50, "dairy_cow")]);
    expect(r.status).toBe("HELD");
    if (r.status === "HELD") expect(r.reasons.some(x => x.startsWith(`concentrateOnlyNotAsserted:${DAIRY}`))).toBe(true);
  });

  it("holds silage as out of the dairy source scope", () => {
    const silage = run(dairyEvidence([rec({ kind: "group_feed", groupId: DAIRY, feedType: "silage", kgFreshPerHeadDay: 10, dmFraction: 0.3 })]), [session(DAIRY, 50, "dairy_cow")]);
    expect(silage.status).toBe("HELD");
  });

  it("holds dairy when the cover was measured after the session started (not pre-grazing)", () => {
    const r = run(dairyEvidence(), [session(DAIRY, 50, "dairy_cow")], { covers: [cover("2026-06-01T06:00:00.000Z")] });
    expect(r.status).toBe("HELD");
    if (r.status === "HELD") expect(r.reasons.some(x => x.startsWith("coverObservationUnverified"))).toBe(true);
  });

  it("holds when the field was grazed between the cover and a new session for the same group (headcount change)", () => {
    // s1 D1-D2, s2 from D2; cover taken mid-s1 is a residual in progress, not pre-grazing for s2.
    const ev = dairyEvidence();
    const r = run(ev, [session(DAIRY, 50, "dairy_cow", "2026-05-31T00:00:00.000Z", D1), session(DAIRY, 50, "dairy_cow", D1)], { covers: [cover("2026-05-31T12:00:00.000Z")] });
    expect(r.status).toBe("HELD");
    if (r.status === "HELD") expect(r.reasons.some(x => x.startsWith("coverObservationUnverified"))).toBe(true);
  });

  it("accepts a cover taken before a continuous occupancy run that started before the window", () => {
    const r = run(dairyEvidence(), [session(DAIRY, 50, "dairy_cow", "2026-05-31T00:00:00.000Z", D1), session(DAIRY, 50, "dairy_cow", D1)], { covers: [cover("2026-05-30T08:00:00.000Z")] });
    expect(r.status).toBe("READY");
  });

  it("holds when another group grazed the field between the cover and this session", () => {
    const r = run(dairyEvidence(), [session(STEER, 10, "steer", "2026-05-30T00:00:00.000Z", "2026-05-31T00:00:00.000Z"), session(DAIRY, 50, "dairy_cow")], { covers: [cover("2026-05-29T08:00:00.000Z")] });
    expect(r).toMatchObject({ status: "HELD", reasons: [`coverObservationUnverified:${FIELD}@${D1}`] });
  });

  it("holds a cover that was not measured (visual estimate)", () => {
    const r = run(dairyEvidence(), [session(DAIRY, 50, "dairy_cow")], { covers: [{ ...cover(), method: "visual_estimate" }] });
    expect(r).toMatchObject({ status: "HELD", reasons: [`coverObservationUnverified:${FIELD}@${D1}`] });
  });

  it("reports no recorded grazing without a number, and holds an unknown field", () => {
    const r = run(sucklerEvidence(), [session(COW, 40, "suckler_cow", D1, undefined, FIELD2), session(CALF, 40, "calf", D1, undefined, FIELD2)]);
    expect(r.status).toBe("NO_RECORDED_GRAZING");
    expect(r).not.toHaveProperty("grazedKgDm");
    expect(run(sucklerEvidence(), [], { fieldId: "30000000-0000-4000-8000-0000000000ff" })).toMatchObject({ status: "HELD", reasons: ["fieldNotFound"] });
  });

  it("holds when evidence goes stale within the interval (gate freshness policy)", () => {
    const r = run(sucklerEvidence(), [session(COW, 40, "suckler_cow"), session(CALF, 40, "calf")], { to: "2026-07-05T00:00:00.000Z" });
    expect(r.status).toBe("HELD");
  });

  it("propagates a held evidence resolution and refuses cross-farm sessions", () => {
    const conflicting = [rec(head(COW, 40, 680)), rec(head(COW, 38, 680), D2)];
    expect(run(conflicting, []).status).toBe("HELD");
    const foreign = { ...session(COW, 40, "suckler_cow"), farmId: "farm-2" };
    const r = run(sucklerEvidence(), [foreign, session(CALF, 40, "calf")]);
    expect(r.status).toBe("HELD");
    if (r.status === "HELD") expect(r.reasons).toContain(`crossFarmSession:${foreign.id}`);
  });

  it("holds when a group's current category no longer matches the session snapshot", () => {
    const groups = [group(COW, "heifer"), group(CALF, "calf")];
    const r = run(sucklerEvidence(), [session(COW, 40, "suckler_cow"), session(CALF, 40, "calf")], { groups });
    expect(r.status).toBe("HELD");
    if (r.status === "HELD") expect(r.reasons).toContain(`groupCategoryChanged:${COW}`);
  });
});
