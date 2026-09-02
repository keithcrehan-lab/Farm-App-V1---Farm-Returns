import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Direct tests for `job-sessions.ts`'s own Supabase-calling logic —
 * mirrors `decisions.test.ts`/`telemetry.test.ts`'s exact pattern (mocking
 * `@/lib/supabase/server` directly). See those files' own header comments
 * for why this repo departs from its usual "mock the whole module" from
 * the caller's side for this specific class of function.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  getJobSessionById,
  insertJobSession,
  listActiveJobSessionsForFarm,
  listConfirmedJobSessionsForFarm,
  listJobSessionDecisionIdsForFarm,
  updateJobSessionStatus,
  type NewJobSessionInput,
} from "./job-sessions";

const mockCreateClient = vi.mocked(createClient);

function makeFakeClient(options: {
  farmResult?: { data: unknown; error: { message?: string } | null };
  insertResult?: { data: unknown; error: { code?: string; message?: string } | null };
  fetchResult?: { data: unknown; error: { message?: string } | null };
  updateResult?: { data: unknown; error: { code?: string; message?: string } | null };
  listResult?: { data: unknown; error: { message?: string } | null };
}) {
  const maybeSingle = vi.fn().mockResolvedValue(options.farmResult ?? { data: { id: "farm-1" }, error: null });
  const farmsEq = vi.fn().mockReturnValue({ maybeSingle });
  const farmsSelect = vi.fn().mockReturnValue({ eq: farmsEq });

  const insertSingle = vi.fn().mockResolvedValue(options.insertResult ?? { data: null, error: null });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });

  const fetchSingle = vi.fn().mockResolvedValue(options.fetchResult ?? { data: null, error: null });
  const fetchEqInner = vi.fn().mockReturnValue({ single: fetchSingle, maybeSingle: fetchSingle });

  const listLimit = vi.fn().mockResolvedValue(options.listResult ?? { data: [], error: null });
  const listOrder = vi.fn().mockReturnValue({ limit: listLimit });
  const listIn = vi.fn().mockReturnValue({ order: listOrder });

  const fetchEqOuter = vi.fn().mockReturnValue({ eq: fetchEqInner, single: fetchSingle, maybeSingle: fetchSingle, in: listIn });

  const jobSessionsSelect = vi.fn().mockReturnValue({ eq: fetchEqOuter });

  const updateSingle = vi.fn().mockResolvedValue(options.updateResult ?? { data: null, error: null });
  const updateEqInner = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: updateSingle }) });
  const updateEqOuter = vi.fn().mockReturnValue({ eq: updateEqInner });
  const update = vi.fn().mockReturnValue({ eq: updateEqOuter });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "farms") return { select: farmsSelect };
    if (table === "job_sessions") return { insert, select: jobSessionsSelect, update };
    throw new Error(`unexpected table ${table}`);
  });

  return { from, insert, insertSingle, jobSessionsSelect, fetchEqOuter, fetchEqInner, fetchSingle, update, updateEqOuter, updateSingle, listIn, listOrder, listLimit };
}

const baseInput: NewJobSessionInput = {
  id: "session-1",
  farmId: "farm-1",
  decisionId: "decision-1",
  activityType: "fertiliser_spreading",
  origin: "prompt",
  status: "active",
};

const sessionRow = {
  id: "session-1",
  farm_id: "farm-1",
  decision_id: "decision-1",
  activity_type: "fertiliser_spreading",
  origin: "prompt",
  status: "active",
  primary_field_id: null,
  field_segments: [],
  active_intervals: [],
  interruption_gaps: [],
  device_metadata: null,
  cancelled_reason: null,
  created_at: "2026-09-02T09:00:00Z",
  updated_at: "2026-09-02T09:00:00Z",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("insertJobSession", () => {
  it("rejects a farm the current session does not own before ever attempting the insert", async () => {
    const client = makeFakeClient({ farmResult: { data: null, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertJobSession(baseInput)).rejects.toThrow(/does not belong to the current session/);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("inserts with every field mapped to its real column name", async () => {
    const client = makeFakeClient({ insertResult: { data: sessionRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertJobSession(baseInput);

    expect(client.insert).toHaveBeenCalledWith({
      id: "session-1",
      farm_id: "farm-1",
      decision_id: "decision-1",
      activity_type: "fertiliser_spreading",
      origin: "prompt",
      status: "active",
      primary_field_id: null,
      field_segments: [],
      active_intervals: [],
      device_metadata: null,
    });
    expect(result.id).toBe("session-1");
    expect(result.status).toBe("active");
  });

  it("recovers a retried insert (23505) by returning the existing matching row", async () => {
    const client = makeFakeClient({
      insertResult: { data: null, error: { code: "23505" } },
      fetchResult: { data: sessionRow, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertJobSession(baseInput);
    expect(result.id).toBe("session-1");
  });

  it("fails closed when a conflicting row has different content", async () => {
    const client = makeFakeClient({
      insertResult: { data: null, error: { code: "23505" } },
      fetchResult: { data: { ...sessionRow, activity_type: "slurry_spreading" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertJobSession(baseInput)).rejects.toThrow(/already exists with different content/);
  });
});

describe("updateJobSessionStatus", () => {
  it("sends only the patch fields provided, always including status", async () => {
    const client = makeFakeClient({
      updateResult: { data: { ...sessionRow, status: "paused" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await updateJobSessionStatus("farm-1", "session-1", { status: "paused" });
    expect(client.update).toHaveBeenCalledWith({ status: "paused" });
    expect(result.status).toBe("paused");
  });

  it("propagates a real check_violation from an illegal transition unchanged", async () => {
    const client = makeFakeClient({
      updateResult: { data: null, error: { code: "23514", message: "invalid status transition" } },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(updateJobSessionStatus("farm-1", "session-1", { status: "confirmed_actual" })).rejects.toMatchObject({
      code: "23514",
    });
  });
});

describe("getJobSessionById", () => {
  it("returns null, not an error, when no matching session exists", async () => {
    const client = makeFakeClient({ fetchResult: { data: null, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(getJobSessionById("farm-1", "missing")).resolves.toBeNull();
  });

  it("returns the mapped record when found", async () => {
    const client = makeFakeClient({ fetchResult: { data: sessionRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await getJobSessionById("farm-1", "session-1");
    expect(result?.id).toBe("session-1");
  });
});

describe("listActiveJobSessionsForFarm", () => {
  it("discloses truncation rather than silently presenting a capped list as complete", async () => {
    const extra = Array.from({ length: 201 }, (_, i) => ({ ...sessionRow, id: `session-${i}` }));
    const client = makeFakeClient({ listResult: { data: extra, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listActiveJobSessionsForFarm("farm-1");
    expect(result.sessions).toHaveLength(200);
    expect(result.truncated).toBe(true);
  });
});

/** A dedicated, minimal fake client for `listConfirmedJobSessionsForFarm`/
 * `listJobSessionDecisionIdsForFarm` — the shared `makeFakeClient` above
 * already multiplexes several other call shapes onto one mock; these two
 * readers' own real shapes (`.select("*, actuals:job_actuals(*)")
 * .eq().eq().order().limit()` and `.select("decision_id").eq().limit()`)
 * are simpler and clearer kept separate. */
function makeReaderFakeClient(result: { data: unknown; error: { message?: string } | null }) {
  const limit = vi.fn().mockResolvedValue(result);
  const order = vi.fn().mockReturnValue({ limit });
  const eqInner = vi.fn().mockReturnValue({ order, limit });
  const eqOuter = vi.fn().mockReturnValue({ eq: eqInner, limit });
  const select = vi.fn().mockReturnValue({ eq: eqOuter });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select };
}

describe("listConfirmedJobSessionsForFarm", () => {
  it("selects the highest-revision Actual as current when a session has multiple revisions", async () => {
    const row = {
      ...sessionRow,
      status: "confirmed_actual",
      actuals: [
        { id: "actual-1", revision: 1, payload: {} },
        { id: "actual-2", revision: 2, payload: {} },
      ],
    };
    const client = makeReaderFakeClient({ data: [row], error: null });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listConfirmedJobSessionsForFarm("farm-1");
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].actual?.id).toBe("actual-2");
  });

  it("leaves actual undefined for a session with no confirmed Actual rows", async () => {
    const row = { ...sessionRow, status: "confirmed_actual", actuals: [] };
    const client = makeReaderFakeClient({ data: [row], error: null });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listConfirmedJobSessionsForFarm("farm-1");
    expect(result.sessions[0].actual).toBeUndefined();
  });

  it("discloses truncation rather than silently presenting a capped list as complete", async () => {
    const extra = Array.from({ length: 201 }, (_, i) => ({ ...sessionRow, id: `session-${i}`, status: "confirmed_actual", actuals: [] }));
    const client = makeReaderFakeClient({ data: extra, error: null });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listConfirmedJobSessionsForFarm("farm-1");
    expect(result.sessions).toHaveLength(200);
    expect(result.truncated).toBe(true);
  });
});

describe("listJobSessionDecisionIdsForFarm", () => {
  it("returns the real set of decision ids this farm has a Job Session for", async () => {
    const client = makeReaderFakeClient({ data: [{ decision_id: "decision-1" }, { decision_id: "decision-2" }], error: null });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listJobSessionDecisionIdsForFarm("farm-1");
    expect(result.decisionIds).toEqual(new Set(["decision-1", "decision-2"]));
    expect(result.truncated).toBe(false);
  });
});
