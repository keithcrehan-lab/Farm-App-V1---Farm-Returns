import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Direct tests for `job-actuals.ts`'s own Supabase-calling logic — same
 * mocking pattern as `job-sessions.test.ts`/`decisions.test.ts`.
 * `./job-sessions`'s `updateJobSessionStatus` is mocked directly (not via
 * a second fake Supabase client) — this file's own real job is verifying
 * `confirmJobSessionActual`'s own id-first retry-safety and revision
 * logic, not re-testing `updateJobSessionStatus` itself (already covered
 * by `job-sessions.test.ts`).
 *
 * Real call sequence this mock must support, in order:
 * 1. `farms.select().eq().maybeSingle()` — ownership check.
 * 2. `job_actuals.select("*").eq("id", ...).maybeSingle()` — the id-first
 *    retry check, *before* any revision is computed.
 * 3. (only if step 2 found nothing) `job_actuals.select("revision")
 *    .eq("job_session_id", ...).order().limit()` — current max revision.
 * 4. (only if step 2 found nothing) `job_actuals.insert(...).select("*")
 *    .single()` — the real insert.
 * `listActualsForJobSession`/`getCurrentActualForJobSession` use a
 * separate shape: `.select("*").eq("farm_id",...).eq("job_session_id",...)
 * .order().limit()`.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("./job-sessions", () => ({
  updateJobSessionStatus: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { updateJobSessionStatus } from "./job-sessions";
import { confirmJobSessionActual, getCurrentActualForJobSession, type ConfirmJobActualInput } from "./job-actuals";

const mockCreateClient = vi.mocked(createClient);
const mockUpdateJobSessionStatus = vi.mocked(updateJobSessionStatus);

function makeFakeClient(options: {
  farmResult?: { data: unknown; error: { message?: string } | null };
  existingByIdResult?: { data: unknown; error: { message?: string } | null };
  latestResult?: { data: unknown; error: { message?: string } | null };
  insertResult?: { data: unknown; error: { code?: string; message?: string } | null };
  listResult?: { data: unknown; error: { message?: string } | null };
}) {
  const maybeSingle = vi.fn().mockResolvedValue(options.farmResult ?? { data: { id: "farm-1" }, error: null });
  const farmsEq = vi.fn().mockReturnValue({ maybeSingle });
  const farmsSelect = vi.fn().mockReturnValue({ eq: farmsEq });

  const existingByIdMaybeSingle = vi.fn().mockResolvedValue(options.existingByIdResult ?? { data: null, error: null });

  const latestLimit = vi.fn().mockResolvedValue(options.latestResult ?? { data: [], error: null });
  const latestOrder = vi.fn().mockReturnValue({ limit: latestLimit });
  const latestEq = vi.fn().mockReturnValue({ order: latestOrder });

  const insertSingle = vi.fn().mockResolvedValue(options.insertResult ?? { data: null, error: null });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });

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
    if (table === "job_actuals") return { insert, select };
    throw new Error(`unexpected table ${table}`);
  });

  return { from, insert, insertSingle, select, existingByIdMaybeSingle, latestEq, latestOrder, latestLimit };
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
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("inserts revision 1 with the client-supplied id and supersedes_revision null for a session's first confirmation", async () => {
    const client = makeFakeClient({ insertResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockUpdateJobSessionStatus.mockResolvedValue({} as never);

    const result = await confirmJobSessionActual(baseInput);

    expect(client.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "actual-1", revision: 1, supersedes_revision: null, confirmed_by: "farmer" }),
    );
    expect(result.actual.revision).toBe(1);
    expect(result.sessionStatusUpdateError).toBeUndefined();
  });

  it("moves job_sessions.status to confirmed_actual on a session's first confirmation", async () => {
    const client = makeFakeClient({ insertResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockUpdateJobSessionStatus.mockResolvedValue({} as never);

    await confirmJobSessionActual(baseInput);

    expect(mockUpdateJobSessionStatus).toHaveBeenCalledWith("farm-1", "session-1", { status: "confirmed_actual" });
  });

  it("records the Actual even when the follow-up status update fails, and reports the failure rather than losing it", async () => {
    const client = makeFakeClient({ insertResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockUpdateJobSessionStatus.mockRejectedValue(new Error("network lost"));

    const result = await confirmJobSessionActual(baseInput);

    expect(result.actual.id).toBe("actual-1");
    expect(result.sessionStatusUpdateError).toBe("network lost");
  });

  it("inserts the next revision, with supersedes_revision set, and does not touch job_sessions.status for a genuinely new edit", async () => {
    const client = makeFakeClient({
      latestResult: { data: [{ revision: 1 }], error: null },
      insertResult: { data: { ...actualRow, id: "actual-2", revision: 2, supersedes_revision: 1 }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await confirmJobSessionActual({ ...baseInput, id: "actual-2", note: "corrected quantity" });

    expect(client.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "actual-2", revision: 2, supersedes_revision: 1 }),
    );
    expect(result.actual.revision).toBe(2);
    expect(mockUpdateJobSessionStatus).not.toHaveBeenCalled();
  });

  it("recovers a retried submission via the id-first check, without ever computing a new revision (the real bug this design fixes)", async () => {
    const client = makeFakeClient({ existingByIdResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockUpdateJobSessionStatus.mockResolvedValue({} as never);

    const result = await confirmJobSessionActual(baseInput);

    expect(result.actual.id).toBe("actual-1");
    expect(result.actual.revision).toBe(1);
    // The whole point: a retry must never reach the insert path at all,
    // so it can never mint a duplicate revision for the same submission.
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("re-attempts the session status move on a retried first-confirmation (safe: same-status update is a no-op)", async () => {
    const client = makeFakeClient({ existingByIdResult: { data: actualRow, error: null } });
    mockCreateClient.mockResolvedValue(client as never);
    mockUpdateJobSessionStatus.mockResolvedValue({} as never);

    await confirmJobSessionActual(baseInput);

    expect(mockUpdateJobSessionStatus).toHaveBeenCalledWith("farm-1", "session-1", { status: "confirmed_actual" });
  });

  it("does not re-attempt the session status move for a retried non-first revision", async () => {
    const client = makeFakeClient({ existingByIdResult: { data: { ...actualRow, id: "actual-2", revision: 2 }, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    await confirmJobSessionActual({ ...baseInput, id: "actual-2" });

    expect(mockUpdateJobSessionStatus).not.toHaveBeenCalled();
  });

  it("fails closed when a matching id already exists with different content", async () => {
    const client = makeFakeClient({
      existingByIdResult: { data: { ...actualRow, completion_type: "partial" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(confirmJobSessionActual(baseInput)).rejects.toThrow(/already exists with different content/);
  });

  it("fails closed with a clear error on a genuine insert-time race, rather than silently returning the wrong row", async () => {
    const client = makeFakeClient({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(confirmJobSessionActual(baseInput)).rejects.toThrow(/could not insert job_actuals row/);
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
