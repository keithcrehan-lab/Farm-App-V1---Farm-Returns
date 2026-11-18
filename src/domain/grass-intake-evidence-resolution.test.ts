import { describe, expect, it } from "vitest";
import type { GrassIntakeEvidencePayload, GrassIntakeLedgerRecord } from "./grass-intake-evidence-ledger";
import { resolveGrassIntakeEvidence } from "./grass-intake-evidence-resolution";

const FARM = "farm-1";
const COW = "20000000-0000-4000-8000-000000000001";
const CALF = "20000000-0000-4000-8000-000000000002";
const CALF2 = "20000000-0000-4000-8000-000000000005";
const D1 = "2026-06-01T00:00:00.000Z", D2 = "2026-06-02T00:00:00.000Z", D3 = "2026-06-03T00:00:00.000Z", D4 = "2026-06-04T00:00:00.000Z";
let seq = 0;
const rec = (payload: GrassIntakeEvidencePayload, effectiveFrom: string, effectiveTo?: string, extra: Partial<GrassIntakeLedgerRecord> = {}): GrassIntakeLedgerRecord => ({
  id: `r${++seq}`, farmId: FARM, recordedAt: "2026-06-01T12:00:00Z", effectiveFrom, ...(effectiveTo ? { effectiveTo } : {}), source: "farmer", payload, ...extra,
});
const head = (headCount: number, groupId = COW): GrassIntakeEvidencePayload => ({ kind: "group_headcount_weight", groupId, headCount, avgWeightKg: 600 });
const pair = (calfGroupId = CALF): GrassIntakeEvidencePayload => ({ kind: "cow_calf_pair", cowGroupId: COW, calfGroupId, calfStage: "older_grazing", uniquePairConfirmed: true });
const resolve = (records: GrassIntakeLedgerRecord[], from = D1, to = D4) => resolveGrassIntakeEvidence({ farmId: FARM, from, to, records });

describe("grass intake evidence temporal resolution", () => {
  it("splits the window at a headcount change so each segment has one constant count", () => {
    const r = resolve([rec(head(40), D1, D2), rec(head(38), D2)]);
    expect(r.status).toBe("RESOLVED");
    if (r.status !== "RESOLVED") return;
    expect(r.segments.map(s => [s.from, s.to, s.headCountWeight[COW]?.payload.headCount])).toEqual([[D1, D2, 40], [D2, D4, 38]]);
  });
  it("leaves gaps UNKNOWN instead of carrying a value forward or using zero", () => {
    const r = resolve([rec(head(40), D1, D2), rec(head(40), D3)]);
    if (r.status !== "RESOLVED") throw new Error("expected resolved");
    expect(r.segments.map(s => s.headCountWeight[COW]?.payload.headCount ?? "UNKNOWN")).toEqual([40, "UNKNOWN", 40]);
  });
  it("applies an explicit correction and never uses the superseded value", () => {
    const original = rec(head(40), D1);
    const correction = rec(head(42), D1, undefined, { supersedesId: original.id, recordedAt: "2026-06-02T12:00:00Z" });
    const r = resolve([original, correction]);
    if (r.status !== "RESOLVED") throw new Error("expected resolved");
    expect(r.supersededIds).toEqual([original.id]);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].headCountWeight[COW].payload.headCount).toBe(42);
  });
  it("holds on overlapping contradictory records rather than picking a winner", () => {
    const r = resolve([rec(head(40), D1), rec(head(38), D2)]);
    expect(r).toMatchObject({ status: "HELD", reasons: [`overlappingEvidence:group_headcount_weight:${COW}`] });
  });
  it("holds when one group is in two overlapping cow/calf pairs (no double counting)", () => {
    const r = resolve([rec(pair(CALF), D1), rec(pair(CALF2), D2, D3)]);
    expect(r).toMatchObject({ status: "HELD", reasons: [`groupInMultiplePairs:${COW}`] });
  });
  it("marks paired groups so they are excluded from standalone demand", () => {
    const r = resolve([rec(pair(), D2), rec(head(40), D1)]);
    if (r.status !== "RESOLVED") throw new Error("expected resolved");
    expect(r.segments.map(s => s.pairedGroupIds)).toEqual([[], [COW, CALF].sort()]);
  });
  it("holds on forked, dangling, cross-subject or backdated supersession", () => {
    const a = rec(head(40), D1);
    expect(resolve([a, rec(head(41), D1, undefined, { supersedesId: a.id }), rec(head(42), D1, undefined, { supersedesId: a.id })]).status).toBe("HELD");
    expect(resolve([rec(head(41), D1, undefined, { supersedesId: "missing" })])).toMatchObject({ status: "HELD" });
    expect(resolve([a, rec(head(41, CALF), D1, undefined, { supersedesId: a.id })])).toMatchObject({ status: "HELD" });
    expect(resolve([a, rec(head(41), D1, undefined, { supersedesId: a.id, recordedAt: "2026-05-01T00:00:00Z" })])).toMatchObject({ status: "HELD" });
  });
  it("holds on a supersession cycle instead of dropping both records", () => {
    const a = rec(head(40), D1, undefined, { id: "cyc-a", supersedesId: "cyc-b" });
    const b = rec(head(41), D1, undefined, { id: "cyc-b", supersedesId: "cyc-a" });
    expect(resolve([a, b])).toMatchObject({ status: "HELD" });
    expect((resolve([a, b]) as { reasons: string[] }).reasons).toContain("supersessionCycle:cyc-a");
  });
  it("holds on records from another farm or an invalid window", () => {
    expect(resolve([rec(head(40), D1, undefined, { farmId: "farm-2" })])).toMatchObject({ status: "HELD" });
    expect(resolve([], D2, D1)).toMatchObject({ status: "HELD", reasons: ["invalidScopeOrWindow"] });
  });
  it("is deterministic regardless of input order", () => {
    const records = [rec(head(40), D1, D2), rec(head(38), D2), rec(pair(), D3)];
    expect(resolve([...records].reverse())).toEqual(resolve(records));
  });
});
