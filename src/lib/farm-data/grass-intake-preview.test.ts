import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Integration: the real preview gate, the real app-admin check, the real
 * farm-bound adapter, the real evidence reader and the real domain engines.
 * Only the Supabase client, the farm lookup and the existing list readers are
 * faked, so every SQL table touched is observable. */
vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string | null },
  adminRow: false,
  evidenceRows: [] as unknown[],
  evidenceError: null as unknown,
  createClientCalls: 0,
  tables: [] as string[],
  evidenceFilters: [] as string[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    db.createClientCalls += 1;
    return {
      auth: { getUser: async () => ({ data: { user: db.user }, error: null }) },
      from: (table: string) => {
        db.tables.push(table);
        if (table === "app_admins") {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.adminRow ? { user_id: db.user?.id } : null, error: null }) }) }) };
        }
        if (table === "grass_intake_evidence") {
          const q = {
            select: () => q,
            eq: (column: string, value: string) => { db.evidenceFilters.push(`${column}=${value}`); return q; },
            order: () => q,
            range: async (from: number, to: number) => (db.evidenceError
              ? { data: null, error: db.evidenceError }
              : { data: db.evidenceRows.slice(from, to + 1), error: null }),
          };
          return q;
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
  }),
}));
vi.mock("./farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("./grazing-field-sessions", () => ({ listGrazingFieldSessionsForFarm: vi.fn() }));
vi.mock("./grass-management", () => ({ listGrassCoverObservationsForFarm: vi.fn() }));
vi.mock("./fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("./livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));

import { getFarmForCurrentUser } from "./farms";
import { listGrazingFieldSessionsForFarm } from "./grazing-field-sessions";
import { listGrassCoverObservationsForFarm } from "./grass-management";
import { listFieldsForFarm } from "./fields";
import { listLivestockGroupsForFarm } from "./livestock";
import {
  GRASS_INTAKE_PREVIEW_FLAG,
  getGrassIntakePreviewForCurrentFarm,
  grassIntakePreviewReasonFamilies,
  isGrassIntakePreviewAvailableForCurrentUser,
} from "./grass-intake-preview";
import type { GrazingFieldSession } from "@/domain/grazing-field-pressure";
import type { Farm, Field, LivestockCategory, LivestockGroup } from "@/domain/types";

const FARM = "10000000-0000-4000-8000-000000000001";
const OTHER_FARM = "10000000-0000-4000-8000-0000000000ff";
const FIELD = "30000000-0000-4000-8000-000000000001";
const COW = "20000000-0000-4000-8000-000000000001";
const CALF = "20000000-0000-4000-8000-000000000002";
const D1 = "2026-06-01T00:00:00.000Z";
const NOW = new Date("2026-06-08T00:00:30.000Z"); // window 2026-06-01T00:00Z .. 2026-06-08T00:00Z
const ADMIN = { id: "admin-user", email: "keith.crehan@gmail.com", email_confirmed_at: "2026-11-01T00:00:00Z" };
const UUID_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

let seq = 0;
const row = (kind: string, payload: Record<string, unknown>, farmId = FARM) => ({
  id: `40000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, farm_id: farmId, kind, payload: { kind, ...payload },
  effective_from: D1, effective_to: null, recorded_at: "2026-06-01T12:00:00.000Z", source: "farmer", supersedes_id: null,
});
const pairEvidence = () => [
  row("cow_calf_pair", { cowGroupId: COW, calfGroupId: CALF, calfStage: "older_grazing", uniquePairConfirmed: true }),
  row("group_headcount_weight", { groupId: COW, headCount: 40, avgWeightKg: 680 }),
  row("group_headcount_weight", { groupId: CALF, headCount: 40, avgWeightKg: 200 }),
  row("group_feed", { groupId: COW, feedType: "none", kgFreshPerHeadDay: 0, dmFraction: null }),
  row("group_feed", { groupId: CALF, feedType: "none", kgFreshPerHeadDay: 0, dmFraction: null }),
];
const session = (groupId: string, category: LivestockCategory, startedAt = D1): GrazingFieldSession => ({
  id: `s${++seq}`, farmId: FARM, livestockGroupId: groupId, fieldId: FIELD, startedAt, headCountSnapshot: 40,
  livestockCategorySnapshot: category, livestockUnitsPerHeadSnapshot: 1, source: "farmer_move", createdAt: startedAt,
});
const group = (id: string, category: LivestockCategory) => ({ id, farmId: FARM, category } as unknown as LivestockGroup);

function signIn(opts: { admin?: boolean; farm?: string | null } = {}) {
  db.user = ADMIN;
  db.adminRow = opts.admin ?? true;
  vi.mocked(getFarmForCurrentUser).mockResolvedValue(opts.farm === null ? null : ({ id: opts.farm ?? FARM } as Farm));
}
function farmData(sessions: GrazingFieldSession[] = [session(COW, "suckler_cow"), session(CALF, "calf")]) {
  vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue(sessions);
  vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([group(COW, "suckler_cow"), group(CALF, "calf")]);
  vi.mocked(listFieldsForFarm).mockResolvedValue([{ id: FIELD, farmId: FARM } as unknown as Field]);
  vi.mocked(listGrassCoverObservationsForFarm).mockResolvedValue([]);
}
const evidenceQueries = () => db.tables.filter(t => t === "grass_intake_evidence").length;
const farmReaders = [listGrazingFieldSessionsForFarm, listLivestockGroupsForFarm, listFieldsForFarm, listGrassCoverObservationsForFarm];

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(db, { user: null, adminRow: false, evidenceRows: [], evidenceError: null, createClientCalls: 0, tables: [], evidenceFilters: [] });
  vi.unstubAllEnvs();
  vi.stubEnv(GRASS_INTAKE_PREVIEW_FLAG, "on");
});
afterEach(() => vi.unstubAllEnvs());

describe("grass intake research preview — flag OFF (default)", () => {
  it.each([undefined, "", "true", "1", "ON", " on"])("flag %j: DISABLED with zero SQL of any kind", async (value) => {
    vi.stubEnv(GRASS_INTAKE_PREVIEW_FLAG, value as string);
    if (value === undefined) delete process.env[GRASS_INTAKE_PREVIEW_FLAG];
    signIn();
    db.evidenceRows = pairEvidence();
    farmData();
    expect(await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW)).toEqual({ status: "DISABLED" });
    expect(await isGrassIntakePreviewAvailableForCurrentUser()).toBe(false);
    expect(db.createClientCalls).toBe(0);
    expect(db.tables).toEqual([]);
    expect(getFarmForCurrentUser).not.toHaveBeenCalled();
    for (const reader of farmReaders) expect(reader).not.toHaveBeenCalled();
  });
});

describe("grass intake research preview — authorisation and scope", () => {
  it("signed out: NOT_AUTHORISED, no evidence or farm reads", async () => {
    expect(await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW)).toEqual({ status: "UNAVAILABLE", reason: "NOT_AUTHORISED" });
    expect(await isGrassIntakePreviewAvailableForCurrentUser()).toBe(false);
    expect(evidenceQueries()).toBe(0);
    expect(getFarmForCurrentUser).not.toHaveBeenCalled();
  });

  it("owner email without the app_admins row is refused (email alone is not enough)", async () => {
    signIn({ admin: false });
    farmData();
    expect(await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW)).toEqual({ status: "UNAVAILABLE", reason: "NOT_AUTHORISED" });
    expect(evidenceQueries()).toBe(0);
    for (const reader of farmReaders) expect(reader).not.toHaveBeenCalled();
  });

  it("another signed-in farmer, even with an app_admins row, is refused before any farm read", async () => {
    db.user = { id: "farmer-2", email: "someone@example.com", email_confirmed_at: "2026-11-01T00:00:00Z" };
    db.adminRow = true;
    expect(await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW)).toEqual({ status: "UNAVAILABLE", reason: "NOT_AUTHORISED" });
    expect(db.tables).toEqual([]);
    expect(getFarmForCurrentUser).not.toHaveBeenCalled();
  });

  it.each([["not-a-uuid"], [""], [42], [null], [{ id: FIELD }], [`${FIELD} `]])("rejects field id %j as INVALID_SCOPE with zero SQL", async (fieldId) => {
    signIn();
    expect(await getGrassIntakePreviewForCurrentFarm({ fieldId }, NOW)).toEqual({ status: "UNAVAILABLE", reason: "INVALID_SCOPE" });
    expect(db.createClientCalls).toBe(0);
  });

  it("ignores any caller-supplied farm id or dates: reads only the server-bound farm over the fixed 7-day window", async () => {
    signIn();
    db.evidenceRows = pairEvidence();
    farmData();
    const sneaky = { fieldId: FIELD, farmId: OTHER_FARM, from: "1970-01-01T00:00:00.000Z", to: "2200-01-01T00:00:00.000Z" };
    const view = await getGrassIntakePreviewForCurrentFarm(sneaky as { fieldId: string }, NOW);
    expect(db.evidenceFilters).toEqual([`farm_id=${FARM}`]);
    for (const reader of farmReaders) {
      const calls = vi.mocked(reader).mock.calls as unknown as unknown[][];
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every(call => call[0] === FARM)).toBe(true);
    }
    expect(listGrazingFieldSessionsForFarm).toHaveBeenCalledWith(FARM, "2026-06-08T00:00:00.000Z");
    expect(view).toMatchObject({ window: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-08T00:00:00.000Z", days: 7 } });
  });

  it("a user with no farm gets NO_FARM and no other farm data is read", async () => {
    signIn({ farm: null });
    expect(await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW)).toEqual({ status: "UNAVAILABLE", reason: "NO_FARM" });
    expect(evidenceQueries()).toBe(0);
    for (const reader of farmReaders) expect(reader).not.toHaveBeenCalled();
  });

  it("an evidence row from another farm fails the read closed (no figure)", async () => {
    signIn();
    db.evidenceRows = [...pairEvidence(), row("group_feed", { groupId: COW, feedType: "none", kgFreshPerHeadDay: 0, dmFraction: null }, OTHER_FARM)];
    farmData();
    expect(await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW)).toEqual({ status: "UNAVAILABLE", reason: "READ_FAILED" });
  });

  it("a field not on the signed-in farm HOLDS", async () => {
    signIn();
    db.evidenceRows = pairEvidence();
    farmData();
    const view = await getGrassIntakePreviewForCurrentFarm({ fieldId: "30000000-0000-4000-8000-0000000000ff" }, NOW);
    expect(view).toMatchObject({ status: "HELD", reasons: ["FIELD_NOT_ON_FARM"] });
    expect(view).not.toHaveProperty("grazedKgDm");
  });
});

describe("grass intake research preview — enabled, current farm", () => {
  it("READY: returns the engine's planning allocation unchanged, labelled, bounded and versioned", async () => {
    signIn();
    db.evidenceRows = pairEvidence();
    farmData();
    const view = await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD.toUpperCase() }, NOW);
    if (view.status !== "READY") throw new Error(JSON.stringify(view));
    // 704 kg DM/day (Teagasc BEEF2026 pair rule, same as the adapter test) x 7 days; not recomputed here.
    expect(view.grazedKgDm).toBeCloseTo(4928, 9);
    expect(view).toMatchObject({
      quantityBasis: "PLANNING_ALLOCATION_ONLY", completeness: "COMPLETE", grazedDays: 7, unrecordedDays: 0,
      version: "grass_session_segment_demand_v1.0.0", resolutionVersion: "grass_evidence_resolution_v1.0.0",
      models: ["suckler_pair"], gateVersions: ["grass_intake_evidence_gate_v1.0.0"],
    });
    expect(view.evidenceRecordIds).toHaveLength(5);
    expect(view).not.toHaveProperty("farmId");
    expect(view).not.toHaveProperty("intervals");
  });

  it("READY but PARTIAL when part of the window has no recorded movement (unknown, not zero)", async () => {
    signIn();
    db.evidenceRows = pairEvidence();
    const start = "2026-06-03T00:00:00.000Z";
    farmData([session(COW, "suckler_cow", start), session(CALF, "calf", start)]);
    const view = await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW);
    expect(view).toMatchObject({ status: "READY", completeness: "PARTIAL_UNRECORDED_OCCUPANCY", unrecordedDays: 2, grazedDays: 5 });
  });

  it("HELD when evidence is missing — no number, and no ids or timestamps in the reasons", async () => {
    signIn();
    db.evidenceRows = pairEvidence().filter(r => r.kind !== "group_feed");
    farmData();
    const view = await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW);
    expect(view).toMatchObject({ status: "HELD", reasons: ["EVIDENCE_MISSING"] });
    expect(view).not.toHaveProperty("grazedKgDm");
    expect(JSON.stringify((view as { reasons: string[] }).reasons)).not.toMatch(UUID_TEXT);
  });

  it("HELD (evidence missing) when cattle grazed but no evidence was ever recorded — never zero", async () => {
    signIn();
    farmData();
    const view = await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW);
    expect(view).toMatchObject({ status: "HELD", reasons: ["EVIDENCE_MISSING"] });
  });

  it("NO_RECORDED_GRAZING when no cattle were recorded in the field — no number", async () => {
    signIn();
    farmData([]);
    const view = await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW);
    expect(view).toMatchObject({ status: "NO_RECORDED_GRAZING" });
    expect(view).not.toHaveProperty("grazedKgDm");
  });

  it("HELD for unsupported data (dairy concentrate not asserted concentrate-only)", async () => {
    signIn();
    const DAIRY = "20000000-0000-4000-8000-000000000003";
    db.evidenceRows = [
      row("group_headcount_weight", { groupId: DAIRY, headCount: 40, avgWeightKg: 550 }),
      row("dairy_stage", { groupId: DAIRY, stage: "midseason_lactating" }),
      row("group_feed", { groupId: DAIRY, feedType: "concentrate", kgFreshPerHeadDay: 3, dmFraction: 0.88 }),
      row("cover_basis", { fieldId: FIELD, observationId: "50000000-0000-4000-8000-000000000001", basis: "measured_above_4cm" }),
    ];
    farmData([session(DAIRY, "dairy_cow")]);
    vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([group(DAIRY, "dairy_cow")]);
    const view = await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW);
    expect(view.status).toBe("HELD");
    expect(view).not.toHaveProperty("grazedKgDm");
  });
});

describe("grass intake research preview — missing schema / read errors", () => {
  it.each([["PGRST205"], ["42P01"]])("missing evidence table (%s) is an explicit UNAVAILABLE state, not a crash or number", async (code) => {
    signIn();
    db.evidenceError = { code, message: "relation grass_intake_evidence does not exist" };
    farmData();
    expect(await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW)).toEqual({ status: "UNAVAILABLE", reason: "EVIDENCE_SCHEMA_UNAVAILABLE" });
    for (const reader of farmReaders) expect(reader).not.toHaveBeenCalled();
  });

  it("any other read error is READ_FAILED", async () => {
    signIn();
    db.evidenceRows = pairEvidence();
    farmData();
    vi.mocked(listGrazingFieldSessionsForFarm).mockRejectedValue(new Error("network"));
    expect(await getGrassIntakePreviewForCurrentFarm({ fieldId: FIELD }, NOW)).toEqual({ status: "UNAVAILABLE", reason: "READ_FAILED" });
  });
});

describe("reason families", () => {
  it("maps raw domain reasons to bounded families and never echoes ids or timestamps", () => {
    const raw = [
      `noSourceScopedModelForGroup:${COW}@2026-06-01T00:00:00.000Z`,
      `cowAverageWeightKg:${COW}:${CALF}@2026-06-01T00:00:00.000Z`,
      `evidenceGroupMissing:${CALF}`,
      "possiblyTruncatedRead:sessions",
      "somethingNew:abc",
    ];
    const families = grassIntakePreviewReasonFamilies(raw);
    expect(families).toEqual(["EVIDENCE_MISSING", "EVIDENCE_STALE_OR_INCOMPLETE", "GROUP_RECORDS_CHANGED", "OTHER", "POSSIBLY_INCOMPLETE_READ"]);
    expect(JSON.stringify(families)).not.toMatch(UUID_TEXT);
  });
});
