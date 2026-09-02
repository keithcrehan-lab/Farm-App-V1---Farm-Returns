import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Direct tests for `job-actuals.ts`'s own Supabase-calling logic — same
 * mocking pattern as `job-sessions.test.ts`/`decisions.test.ts`.
 * `./job-sessions`'s `updateJobSessionStatus`/`getJobSessionById` are
 * mocked directly (not via a second fake Supabase client) — this file's
 * own real job is verifying `confirmJobSessionActual`'s own logic, not
 * re-testing those functions themselves (already covered by
 * `job-sessions.test.ts`).
 *
 * Real call sequence this mock must support, in order:
 * 1. `farms.select().eq().maybeSingle()` — ownership check.
 * 2. `getJobSessionById` (mocked directly) — the real session, for the
 *    activityType-binding check and (implicitly, via the database's own
 *    trigger in real use) the "session must have reached
 *    completed_estimated" check.
 * 3. `job_actuals.select("*").eq("id", ...).maybeSingle()` — the id-first
 *    retry check, *before* any reconciliation or revision computation.
 * 4. (only if step 3 found nothing) `reconcileAndVerifyPayload`'s own
 *    real `fields`/`livestock_groups`/`individual_animals` refetches,
 *    then `job_actuals.select("revision").eq("job_session_id", ...)
 *    .order().limit()` — current max revision.
 * 5. (only if step 3 found nothing) `.rpc("confirm_job_session_actual",
 *    {...})` — the real atomic insert + status-move (Codex audit MEDIUM,
 *    round 5, `20260902030000_confirm_job_session_actual_atomic.sql`).
 * `listActualsForJobSession`/`getCurrentActualForJobSession` use a
 * separate shape: `.select("*").eq("farm_id",...).eq("job_session_id",...)
 * .order().limit()`.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("./job-sessions", () => ({
  updateJobSessionStatus: vi.fn(),
  getJobSessionById: vi.fn(),
}));
vi.mock("./livestock", () => ({
  listLivestockGroupsForFarm: vi.fn(),
}));
vi.mock("./individual-animals", () => ({
  listIndividualAnimalsForFarm: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getJobSessionById, updateJobSessionStatus } from "./job-sessions";
import { listLivestockGroupsForFarm } from "./livestock";
import { listIndividualAnimalsForFarm } from "./individual-animals";
import { confirmJobSessionActual, getCurrentActualForJobSession, type ConfirmJobActualInput } from "./job-actuals";
import type { FieldRow } from "./row-types";
import type { JobSessionRecord } from "./mappers";

/** Minimal, real-shaped `fields` row — `reconcileAndVerifyPayload`
 * (`job-actuals.ts`, Codex audit HIGH round 1) refetches real fields for
 * a fresh (non-retry) submission, so every test that reaches the insert
 * path needs at least this one field ("field-7", 6.8 ha, matching
 * `baseInput.payload.fieldIds`/`areaHa` below) resolvable via a real
 * `rowToField` call. */
const FIELD_ROW: FieldRow = {
  id: "field-7",
  farm_id: "farm-1",
  name: "Field 7",
  area_ha: 6.8,
  centroid_lng: -8.49,
  centroid_lat: 51.9,
  polygon: null,
  polygon_source: null,
  polygon_captured_at: null,
  lpis_ref: null,
  planned_use: null,
  mapped_soil: null,
  fertility: {},
  commonage_status: null,
  water_buffer_context: null,
  history: [],
  thumbnail: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockCreateClient = vi.mocked(createClient);
const mockUpdateJobSessionStatus = vi.mocked(updateJobSessionStatus);
const mockGetJobSessionById = vi.mocked(getJobSessionById);
const mockListLivestockGroupsForFarm = vi.mocked(listLivestockGroupsForFarm);
const mockListIndividualAnimalsForFarm = vi.mocked(listIndividualAnimalsForFarm);

const SESSION: Partial<JobSessionRecord> = {
  id: "session-1",
  farmId: "farm-1",
  activityType: "fertiliser_spreading",
  status: "completed_estimated",
};

function makeFakeClient(options: {
  farmResult?: { data: unknown; error: { message?: string } | null };
  fieldsResult?: { data: unknown; error: { message?: string } | null };
  existingByIdResult?: { data: unknown; error: { message?: string } | null };
  latestResult?: { data: unknown; error: { message?: string } | null };
  confirmRpcResult?: { data: unknown; error: { code?: string; message?: string } | null };
  listResult?: { data: unknown; error: { message?: string } | null };
}) {
  const maybeSingle = vi.fn().mockResolvedValue(options.farmResult ?? { data: { id: "farm-1" }, error: null });
  const farmsEq = vi.fn().mockReturnValue({ maybeSingle });
  const farmsSelect = vi.fn().mockReturnValue({ eq: farmsEq });

  // reconcileAndVerifyPayload's own real fields refetch:
  // .from("fields").select("*").eq("farm_id",...).order("created_at",...)
  const fieldsOrder = vi.fn().mockResolvedValue(options.fieldsResult ?? { data: [FIELD_ROW], error: null });
  const fieldsEq = vi.fn().mockReturnValue({ order: fieldsOrder });
  const fieldsSelect = vi.fn().mockReturnValue({ eq: fieldsEq });

  const existingByIdMaybeSingle = vi.fn().mockResolvedValue(options.existingByIdResult ?? { data: null, error: null });

  const latestLimit = vi.fn().mockResolvedValue(options.latestResult ?? { data: [], error: null });
  const latestOrder = vi.fn().mockReturnValue({ limit: latestLimit });
  const latestEq = vi.fn().mockReturnValue({ order: latestOrder });

  // The one real write for a genuinely new submission — atomic insert +
  // status move, Codex audit MEDIUM round 5
  // (20260902030000_confirm_job_session_actual_atomic.sql). No more
  // `.from("job_actuals").insert(...)` — that table's raw `insert` grant
  // is revoked; this RPC is the one sanctioned way a row is created.
  const rpc = vi.fn().mockResolvedValue(options.confirmRpcResult ?? { data: null, error: null });

  // The list shape: .eq("farm_id",...).eq("job_session_id",...).order().limit()
  const listLimit = vi.fn().mockResolvedValue(options.listResult ?? { data: [], error: null });
  const listOrder = vi.fn().mockReturnValue({ limit: listLimit });
  const listEqInner = vi.fn().mockReturnValue({ order: listOrder });

  const select = vi.fn().mockImplementation((columns: string) => {
    if (columns === "revision") return { eq: latestEq };
    // "*" is used by both the id-check and the list query -- the id-check
    // always runs first in confirmJobSessionActual's own real sequence,
    // so this dispatches on which .eq() call happens: the id-check's own
    // `.eq("id", ...)` is a single call ending in `.maybeSingle()`, while
    // the list query chains a *second* `.eq()`. Exposing both via one
    // object (whose `.eq()` itself returns an object supporting both
    // `.maybeSingle()` directly and a further `.eq()`) lets either real
    // call path work without the mock needing to know which one a given
    // test exercises.
    return { eq: vi.fn().mockReturnValue({ maybeSingle: existingByIdMaybeSingle, eq: listEqInner }) };
  });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "farms") return { select: farmsSelect };
    if (table === "fields") return { select: fieldsSelect };
    if (table === "job_actuals") return { select };
    throw new Error(`unexpected table ${table}`);
  });

  return { from, rpc, select, existingByIdMaybeSingle, latestEq, latestOrder, latestLimit };
}

const baseInput: ConfirmJobActualInput = {
  id: "actual-1",
  farmId: "farm-1",
  jobSessionId: "session-1",
  activityType: "fertiliser_spreading",
  completionType: "whole",
  payload: { activityType: "fertiliser_spreading", completionType: "whole", fieldIds: ["field-7"], product: "CAN", quantity: 250, quantityUnit: "kg", areaHa: 6.8 },
  confirmedAt: "2026-09-02T11:00:00Z",
};

const actualRow = {
  id: "actual-1",
  farm_id: "farm-1",
  job_session_id: "session-1",
  revision: 1,
  supersedes_revision: null,
  activity_type: "fertiliser_spreading",
  completion_type: "whole",
  payload: baseInput.payload,
  note: null,
  confirmed_by: "farmer",
  confirmed_at: "2026-09-02T11:00:00Z",
  created_at: "2026-09-02T11:00:01Z",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("confirmJobSessionActual", () => {
  it("rejects a farm the current session does not own before ever attempting the insert", async () => {
    const client = makeFakeClient({ farmResult: { data: null, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(confirmJobSessionActual(baseInput)).rejects.toThrow(/does not belong to the current session/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects when no real job_sessions row is found", async () => {
    const client = makeFakeClient({});
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(null);

    await expect(confirmJobSessionActual(baseInput)).rejects.toThrow(/no job_sessions row/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects when the caller's activityType does not match the session's real activityType (Codex audit HIGH, round 2)", async () => {
    const client = makeFakeClient({});
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue({ ...SESSION, activityType: "livestock_work" } as never);

    await expect(confirmJobSessionActual(baseInput)).rejects.toThrow(/does not match session .* real activityType/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("inserts revision 1 with the client-supplied id and supersedes_revision null for a session's first confirmation", async () => {
    const client = makeFakeClient({ confirmRpcResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);
    mockUpdateJobSessionStatus.mockResolvedValue({} as never);

    const result = await confirmJobSessionActual(baseInput);

    expect(client.rpc).toHaveBeenCalledWith(
      "confirm_job_session_actual",
      expect.objectContaining({ p_id: "actual-1", p_revision: 1, p_supersedes_revision: null, p_confirmed_by: "farmer" }),
    );
    expect(result.actual.revision).toBe(1);
    expect(result.sessionStatusUpdateError).toBeUndefined();
  });

  it("de-duplicates a repeated fieldId before summing its area (Codex audit HIGH, round 2)", async () => {
    const client = makeFakeClient({ confirmRpcResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);
    mockUpdateJobSessionStatus.mockResolvedValue({} as never);

    await confirmJobSessionActual({
      ...baseInput,
      payload: { ...baseInput.payload, fieldIds: ["field-7", "field-7"] },
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "confirm_job_session_actual",
      expect.objectContaining({ p_payload: expect.objectContaining({ areaHa: 6.8 }) }),
    );
  });

  it("verifies livestockGroupId ownership and fails closed for a cross-farm reference (Codex audit HIGH, round 2)", async () => {
    const client = makeFakeClient({ confirmRpcResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue({ ...SESSION, activityType: "livestock_work" } as never);
    mockListLivestockGroupsForFarm.mockResolvedValue([{ id: "group-1", farmId: "farm-1" } as never]);

    const good = await confirmJobSessionActual({
      ...baseInput,
      activityType: "livestock_work",
      payload: { activityType: "livestock_work", completionType: "whole", livestockGroupId: "group-1", action: "dosed" },
    });
    expect(good.actual.id).toBe("actual-1");

    mockListLivestockGroupsForFarm.mockResolvedValue([{ id: "group-1", farmId: "farm-1" } as never]);
    await expect(
      confirmJobSessionActual({
        ...baseInput,
        id: "actual-2",
        activityType: "livestock_work",
        payload: { activityType: "livestock_work", completionType: "whole", livestockGroupId: "another-farms-group", action: "dosed" },
      }),
    ).rejects.toThrow(/livestock group another-farms-group does not belong to farm/);
  });

  it("fails closed on a non-string fieldIds entry rather than silently filtering it out (Codex audit HIGH, round 3)", async () => {
    const client = makeFakeClient({ confirmRpcResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);

    await expect(
      confirmJobSessionActual({
        ...baseInput,
        payload: { ...baseInput.payload, fieldIds: ["field-7", { maliciousObject: true }] },
      }),
    ).rejects.toThrow(/fieldIds must contain only string ids/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on a non-string livestockGroupId rather than silently skipping ownership verification (Codex audit HIGH, round 3)", async () => {
    const client = makeFakeClient({ confirmRpcResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue({ ...SESSION, activityType: "livestock_work" } as never);

    await expect(
      confirmJobSessionActual({
        ...baseInput,
        activityType: "livestock_work",
        payload: { activityType: "livestock_work", completionType: "whole", livestockGroupId: { id: "group-1" }, action: "dosed" },
      }),
    ).rejects.toThrow(/livestockGroupId must be a string/);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(mockListLivestockGroupsForFarm).not.toHaveBeenCalled();
  });

  it("fails closed on a non-string animalId rather than silently skipping ownership verification (Codex audit HIGH, round 3)", async () => {
    const client = makeFakeClient({ confirmRpcResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue({ ...SESSION, activityType: "livestock_work" } as never);

    await expect(
      confirmJobSessionActual({
        ...baseInput,
        activityType: "livestock_work",
        payload: { activityType: "livestock_work", completionType: "whole", animalId: 12345, action: "dosed" },
      }),
    ).rejects.toThrow(/animalId must be a string/);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(mockListIndividualAnimalsForFarm).not.toHaveBeenCalled();
  });

  it("verifies animalId ownership and fails closed for a cross-farm reference", async () => {
    const client = makeFakeClient({ confirmRpcResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue({ ...SESSION, activityType: "livestock_work" } as never);
    mockListIndividualAnimalsForFarm.mockResolvedValue([{ id: "animal-1", farmId: "farm-1" } as never]);

    await expect(
      confirmJobSessionActual({
        ...baseInput,
        activityType: "livestock_work",
        payload: { activityType: "livestock_work", completionType: "whole", animalId: "another-farms-animal", action: "dosed" },
      }),
    ).rejects.toThrow(/animal another-farms-animal does not belong to farm/);
  });

  it("confirms a session's first submission via the one atomic RPC call, with no separate status-update call at all (Codex audit MEDIUM, round 5)", async () => {
    const client = makeFakeClient({ confirmRpcResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);

    const result = await confirmJobSessionActual(baseInput);

    expect(client.rpc).toHaveBeenCalledWith("confirm_job_session_actual", expect.objectContaining({ p_id: "actual-1" }));
    expect(result.actual.id).toBe("actual-1");
    expect(result.sessionStatusUpdateError).toBeUndefined();
    // The old two-step design's own race (insert commits, then a
    // *separate* status-update call that a concurrent cancel could
    // interleave with) is closed by never taking this second step at all
    // for a genuinely new submission -- see this file's own header
    // comment and the migration's own header comment for the full
    // account.
    expect(mockUpdateJobSessionStatus).not.toHaveBeenCalled();
  });

  it("propagates a clear error when the atomic RPC itself fails, rather than reporting a partial success", async () => {
    const client = makeFakeClient({ confirmRpcResult: { data: null, error: { message: "job_actuals: activity_type does not match" } } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);

    await expect(confirmJobSessionActual(baseInput)).rejects.toThrow(/could not confirm job_actuals row/);
    expect(mockUpdateJobSessionStatus).not.toHaveBeenCalled();
  });

  it("records the Actual even when the follow-up status update fails on an id-matched retry, and reports the failure rather than losing it (the atomic RPC's own path never leaves this partial state — this scenario is now only reachable via the id-matched retry branch, where no insert happens and the round-5 race never applied)", async () => {
    const client = makeFakeClient({ existingByIdResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);
    mockUpdateJobSessionStatus.mockRejectedValue(new Error("network lost"));

    const result = await confirmJobSessionActual(baseInput);

    expect(result.actual.id).toBe("actual-1");
    expect(result.sessionStatusUpdateError).toBe("network lost");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("computes the correct revision/supersedes_revision for a genuinely new edit (revision > 1) and lets the atomic RPC handle the status move — Codex audit HIGH round 2 (a revision === 1 proxy for 'should I attempt this' was itself the bug that stranded a session at completed_estimated) + Codex audit MEDIUM round 5 (the status move is now inside the same atomic RPC call, not a separate updateJobSessionStatus call)", async () => {
    const client = makeFakeClient({
      latestResult: { data: [{ revision: 1 }], error: null },
      confirmRpcResult: { data: { ...actualRow, id: "actual-2", revision: 2, supersedes_revision: 1 }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);

    const result = await confirmJobSessionActual({ ...baseInput, id: "actual-2", note: "corrected quantity" });

    expect(client.rpc).toHaveBeenCalledWith(
      "confirm_job_session_actual",
      expect.objectContaining({ p_id: "actual-2", p_revision: 2, p_supersedes_revision: 1 }),
    );
    expect(result.actual.revision).toBe(2);
    // The atomic RPC (20260902030000_confirm_job_session_actual_atomic.sql)
    // now performs the insert *and* the status move to confirmed_actual in
    // one transaction -- this path never calls the separate
    // updateJobSessionStatus function at all (that remains real, and is
    // still used by the id-matched retry branch below, where no insert is
    // happening and the original two-step race never applied).
    expect(mockUpdateJobSessionStatus).not.toHaveBeenCalled();
    expect(result.sessionStatusUpdateError).toBeUndefined();
  });

  it("recovers a retried submission via the id-first check, without ever computing a new revision (the real bug this design fixes)", async () => {
    const client = makeFakeClient({ existingByIdResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);
    mockUpdateJobSessionStatus.mockResolvedValue({} as never);

    const result = await confirmJobSessionActual(baseInput);

    expect(result.actual.id).toBe("actual-1");
    expect(result.actual.revision).toBe(1);
    // The whole point: a retry must never reach the insert path at all,
    // so it can never mint a duplicate revision for the same submission.
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("re-attempts the session status move on any id-matched retry, including a non-first revision (always safe: same-status update is a no-op)", async () => {
    const client = makeFakeClient({ existingByIdResult: { data: { ...actualRow, id: "actual-2", revision: 2 }, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);
    mockUpdateJobSessionStatus.mockResolvedValue({} as never);

    await confirmJobSessionActual({ ...baseInput, id: "actual-2" });

    expect(mockUpdateJobSessionStatus).toHaveBeenCalledWith("farm-1", "session-1", { status: "confirmed_actual" });
  });

  it("fails closed when a matching id already exists with different content", async () => {
    const client = makeFakeClient({
      existingByIdResult: { data: { ...actualRow, completion_type: "partial" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);

    await expect(confirmJobSessionActual(baseInput)).rejects.toThrow(/already exists with different content/);
  });

  it("does not reject a retry as mismatched purely because the real mapped field area changed since the original insert (Codex audit MEDIUM, round 2)", async () => {
    // The stored row's own areaHa (6.8) reflects the field's mapped area
    // *at the time of the original insert*; this retry's fake client
    // would recompute a different real area (7.5) if reconciliation ran
    // before the id-check -- it must not, so the retry is still
    // recognised as the same logical submission.
    const client = makeFakeClient({
      existingByIdResult: { data: actualRow, error: null },
      fieldsResult: { data: [{ ...FIELD_ROW, area_ha: 7.5 }], error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);
    mockUpdateJobSessionStatus.mockResolvedValue({} as never);

    const result = await confirmJobSessionActual(baseInput);
    expect(result.actual.id).toBe("actual-1");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("fails closed with a clear error on a genuine insert-time race (a concurrent submission won the id/revision slot), rather than silently returning the wrong row", async () => {
    const client = makeFakeClient({
      confirmRpcResult: { data: null, error: { code: "23505", message: "duplicate key" } },
    });
    mockCreateClient.mockResolvedValue(client as never);
    mockGetJobSessionById.mockResolvedValue(SESSION as never);

    await expect(confirmJobSessionActual(baseInput)).rejects.toThrow(/could not confirm job_actuals row/);
  });
});

describe("getCurrentActualForJobSession", () => {
  it("returns null when no Actual has ever been confirmed", async () => {
    const client = makeFakeClient({ listResult: { data: [], error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(getCurrentActualForJobSession("farm-1", "session-1")).resolves.toBeNull();
  });

  it("returns the highest-revision row as current", async () => {
    const client = makeFakeClient({
      listResult: {
        data: [
          { ...actualRow, id: "actual-2", revision: 2 },
          { ...actualRow, id: "actual-1", revision: 1 },
        ],
        error: null,
      },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await getCurrentActualForJobSession("farm-1", "session-1");
    expect(result?.id).toBe("actual-2");
  });
});
