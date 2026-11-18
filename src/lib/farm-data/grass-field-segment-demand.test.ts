import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./grass-intake-evidence", () => ({ listCurrentFarmGrassIntakeEvidence: vi.fn() }));
vi.mock("./grazing-field-sessions", () => ({ listGrazingFieldSessionsForFarm: vi.fn() }));
vi.mock("./grass-management", () => ({ listGrassCoverObservationsForFarm: vi.fn() }));
vi.mock("./fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("./livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));

import { listCurrentFarmGrassIntakeEvidence } from "./grass-intake-evidence";
import { listGrazingFieldSessionsForFarm } from "./grazing-field-sessions";
import { listGrassCoverObservationsForFarm } from "./grass-management";
import { listFieldsForFarm } from "./fields";
import { listLivestockGroupsForFarm } from "./livestock";
import { getCurrentFarmGrassFieldSegmentDemand, UNPAGINATED_READ_ROW_CAP } from "./grass-field-segment-demand";
import type { GrassIntakeEvidencePayload, GrassIntakeLedgerRecord } from "@/domain/grass-intake-evidence-ledger";
import type { GrazingFieldSession } from "@/domain/grazing-field-pressure";
import type { Field, LivestockCategory, LivestockGroup } from "@/domain/types";

const FARM = "farm-1";
const FIELD = "30000000-0000-4000-8000-000000000001";
const COW = "20000000-0000-4000-8000-000000000001";
const CALF = "20000000-0000-4000-8000-000000000002";
const D1 = "2026-06-01T00:00:00.000Z", D3 = "2026-06-03T00:00:00.000Z";

let seq = 0;
const rec = (payload: GrassIntakeEvidencePayload): GrassIntakeLedgerRecord => ({
  id: `r${++seq}`, farmId: FARM, recordedAt: "2026-06-01T12:00:00Z", effectiveFrom: D1, source: "farmer", payload,
});
const session = (groupId: string, headCountSnapshot: number, category: LivestockCategory): GrazingFieldSession => ({
  id: `s${++seq}`, farmId: FARM, livestockGroupId: groupId, fieldId: FIELD, startedAt: D1, headCountSnapshot,
  livestockCategorySnapshot: category, livestockUnitsPerHeadSnapshot: 1, source: "farmer_move", createdAt: D1,
});
const group = (id: string, category: LivestockCategory) => ({ id, farmId: FARM, category } as unknown as LivestockGroup);
const field = { id: FIELD, farmId: FARM } as unknown as Field;
const records = () => [
  rec({ kind: "cow_calf_pair", cowGroupId: COW, calfGroupId: CALF, calfStage: "older_grazing", uniquePairConfirmed: true }),
  rec({ kind: "group_headcount_weight", groupId: COW, headCount: 40, avgWeightKg: 680 }),
  rec({ kind: "group_headcount_weight", groupId: CALF, headCount: 40, avgWeightKg: 200 }),
  rec({ kind: "group_feed", groupId: COW, feedType: "none", kgFreshPerHeadDay: 0, dmFraction: null }),
  rec({ kind: "group_feed", groupId: CALF, feedType: "none", kgFreshPerHeadDay: 0, dmFraction: null }),
];

function wire(opts: { sessions?: GrazingFieldSession[]; covers?: unknown[] } = {}) {
  vi.mocked(listCurrentFarmGrassIntakeEvidence).mockResolvedValue({ status: "AVAILABLE", farmId: FARM, records: records() });
  vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue(opts.sessions ?? [session(COW, 40, "suckler_cow"), session(CALF, 40, "calf")]);
  vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([group(COW, "suckler_cow"), group(CALF, "calf")]);
  vi.mocked(listFieldsForFarm).mockResolvedValue([field]);
  vi.mocked(listGrassCoverObservationsForFarm).mockResolvedValue((opts.covers ?? []) as never);
}

describe("current-farm grass field segment demand (Step 3 wiring)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns NO_AUTHORISED_FARM and reads nothing else when the user has no farm", async () => {
    vi.mocked(listCurrentFarmGrassIntakeEvidence).mockResolvedValue({ status: "NO_AUTHORISED_FARM" });
    expect(await getCurrentFarmGrassFieldSegmentDemand({ fieldId: FIELD, from: D1, to: D3 })).toEqual({ status: "NO_AUTHORISED_FARM" });
    expect(listGrazingFieldSessionsForFarm).not.toHaveBeenCalled();
    expect(listLivestockGroupsForFarm).not.toHaveBeenCalled();
    expect(listFieldsForFarm).not.toHaveBeenCalled();
    expect(listGrassCoverObservationsForFarm).not.toHaveBeenCalled();
  });

  it("scopes every read to the server-bound farm and returns the domain result unchanged", async () => {
    wire();
    const r = await getCurrentFarmGrassFieldSegmentDemand({ fieldId: FIELD, from: D1, to: D3 });
    expect(listGrazingFieldSessionsForFarm).toHaveBeenCalledWith(FARM, D3);
    expect(listLivestockGroupsForFarm).toHaveBeenCalledWith(FARM);
    expect(listFieldsForFarm).toHaveBeenCalledWith(FARM);
    expect(listGrassCoverObservationsForFarm).toHaveBeenCalledWith(FARM);
    if (r.status !== "EVALUATED" || r.demand.status !== "READY") throw new Error(JSON.stringify(r));
    expect(r.farmId).toBe(FARM);
    expect(r.demand.quantityBasis).toBe("PLANNING_ALLOCATION_ONLY");
    // Same 704 kg DM/day x 2 days as the domain test (BEEF2026 2% liveweight); not recomputed here.
    expect(r.demand.grazedKgDm).toBeCloseTo(1408, 9);
  });

  it("holds when a session belongs to another farm (never crosses farm boundaries)", async () => {
    wire({ sessions: [session(COW, 40, "suckler_cow"), { ...session(CALF, 40, "calf"), farmId: "farm-2" }] });
    const r = await getCurrentFarmGrassFieldSegmentDemand({ fieldId: FIELD, from: D1, to: D3 });
    if (r.status !== "EVALUATED" || r.demand.status !== "HELD") throw new Error(JSON.stringify(r));
    expect(r.demand.reasons.some(x => x.startsWith("crossFarmSession:"))).toBe(true);
  });

  it("holds an invalid window before reading farm data", async () => {
    wire();
    const r = await getCurrentFarmGrassFieldSegmentDemand({ fieldId: FIELD, from: D3, to: D1 });
    expect(r).toMatchObject({ status: "EVALUATED", demand: { status: "HELD", reasons: ["invalidScopeOrWindow"] } });
    expect(listGrazingFieldSessionsForFarm).not.toHaveBeenCalled();
  });

  it("holds instead of computing from a possibly truncated sessions read", async () => {
    const many = Array.from({ length: UNPAGINATED_READ_ROW_CAP }, () => session(COW, 40, "suckler_cow"));
    wire({ sessions: many });
    const r = await getCurrentFarmGrassFieldSegmentDemand({ fieldId: FIELD, from: D1, to: D3 });
    expect(r).toMatchObject({ status: "EVALUATED", demand: { status: "HELD", reasons: ["possiblyTruncatedRead:sessions"] } });
  });

  it("holds when evidence names a group that no longer exists (deleted group's sessions cascade away)", async () => {
    wire({ sessions: [session(COW, 40, "suckler_cow")] });
    vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([group(COW, "suckler_cow")]);
    const r = await getCurrentFarmGrassFieldSegmentDemand({ fieldId: FIELD, from: D1, to: D3 });
    expect(r).toMatchObject({ status: "EVALUATED", demand: { status: "HELD", reasons: [`evidenceGroupMissing:${CALF}`] } });
  });

  it("propagates a reader error instead of returning a partial result", async () => {
    wire();
    vi.mocked(listGrazingFieldSessionsForFarm).mockRejectedValue(new Error("read failed"));
    await expect(getCurrentFarmGrassFieldSegmentDemand({ fieldId: FIELD, from: D1, to: D3 })).rejects.toThrow("read failed");
  });

  it("evaluates a session that started before the window and is still open", async () => {
    const early = "2026-05-20T00:00:00.000Z";
    wire({ sessions: [{ ...session(COW, 40, "suckler_cow"), startedAt: early }, { ...session(CALF, 40, "calf"), startedAt: early }] });
    const r = await getCurrentFarmGrassFieldSegmentDemand({ fieldId: FIELD, from: D1, to: D3 });
    if (r.status !== "EVALUATED" || r.demand.status !== "READY") throw new Error(JSON.stringify(r));
    expect(r.demand.completeness).toBe("COMPLETE");
  });

  it("holds a field that is not on the signed-in farm", async () => {
    wire();
    const r = await getCurrentFarmGrassFieldSegmentDemand({ fieldId: "30000000-0000-4000-8000-0000000000ff", from: D1, to: D3 });
    expect(r).toMatchObject({ status: "EVALUATED", demand: { status: "HELD", reasons: ["fieldNotFound"] } });
  });
});
