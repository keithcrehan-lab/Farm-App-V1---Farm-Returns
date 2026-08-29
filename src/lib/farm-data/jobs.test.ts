import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Farm Return Next Checkpoint 2, Vertical D — direct tests for
 * `insertJob`'s own Supabase-calling logic. See `decisions.test.ts`'s own
 * header comment for why this file mocks `@/lib/supabase/server`/
 * `@/lib/supabase/service-role` directly (a deliberate departure from
 * this repo's usual "mock the whole module, not Supabase itself"
 * convention, made for the same reason there).
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { insertJob, type NewJobInput } from "./jobs";

const mockCreateClient = vi.mocked(createClient);
const mockCreateServiceRoleClient = vi.mocked(createServiceRoleClient);

function makeFakeSessionClient(farmResult: { data: unknown; error: { message?: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(farmResult);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, maybeSingle };
}

function makeFakeServiceRoleClient(options: {
  insertResult: { data: unknown; error: { code?: string; message?: string } | null };
  fetchResult?: { data: unknown; error: { message?: string } | null };
}) {
  const insertSingle = vi.fn().mockResolvedValue(options.insertResult);
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });

  const fetchSingle = vi.fn().mockResolvedValue(options.fetchResult ?? { data: null, error: null });
  const fetchEq = vi.fn().mockReturnValue({ single: fetchSingle });
  const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq });

  const from = vi.fn().mockImplementation(() => ({
    insert,
    select: fetchSelect,
  }));

  return { from, insert, insertSelect, insertSingle, fetchSelect, fetchEq, fetchSingle };
}

const baseInput: NewJobInput = {
  farmId: "farm-1",
  decisionId: "decision-1",
  jobType: "record_weight_observation",
  status: "confirmed",
};

const jobRow = {
  id: "job-1",
  farm_id: "farm-1",
  decision_id: "decision-1",
  job_type: "record_weight_observation",
  status: "confirmed",
  created_at: "2026-08-29T09:00:01Z",
  updated_at: "2026-08-29T09:00:01Z",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("insertJob", () => {
  it("rejects a farmId the current session doesn't own, before ever touching the privileged client", async () => {
    const sessionClient = makeFakeSessionClient({ data: null, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);

    await expect(insertJob(baseInput)).rejects.toThrow(/farm farm-1 does not belong to the current session/);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("propagates a real error from the ownership check", async () => {
    const sessionClient = makeFakeSessionClient({ data: null, error: { message: "select failed" } });
    mockCreateClient.mockResolvedValue(sessionClient as never);

    await expect(insertJob(baseInput)).rejects.toMatchObject({ message: "select failed" });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("once ownership is confirmed, inserts via the service-role client with every field mapped to its real column name", async () => {
    const sessionClient = makeFakeSessionClient({ data: { id: "farm-1" }, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);
    const serviceRoleClient = makeFakeServiceRoleClient({ insertResult: { data: jobRow, error: null } });
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient as never);

    const result = await insertJob(baseInput);

    expect(serviceRoleClient.from).toHaveBeenCalledWith("jobs");
    expect(serviceRoleClient.insert).toHaveBeenCalledWith({
      farm_id: "farm-1",
      decision_id: "decision-1",
      job_type: "record_weight_observation",
      status: "confirmed",
    });
    expect(result.id).toBe("job-1");
    expect(result.decisionId).toBe("decision-1");
  });

  it("propagates a non-conflict insert error unchanged, without attempting the 23505 recovery fetch", async () => {
    const sessionClient = makeFakeSessionClient({ data: { id: "farm-1" }, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);
    const serviceRoleClient = makeFakeServiceRoleClient({
      insertResult: { data: null, error: { code: "23514", message: "check violation" } },
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient as never);

    await expect(insertJob(baseInput)).rejects.toMatchObject({ code: "23514" });
    expect(serviceRoleClient.fetchEq).not.toHaveBeenCalled();
  });

  it("on a 23505 conflict, fetches the existing row by decision_id and returns it when content matches (real retry-safety)", async () => {
    const sessionClient = makeFakeSessionClient({ data: { id: "farm-1" }, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);
    const serviceRoleClient = makeFakeServiceRoleClient({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: jobRow, error: null },
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient as never);

    const result = await insertJob(baseInput);

    expect(serviceRoleClient.fetchEq).toHaveBeenCalledWith("decision_id", "decision-1");
    expect(result.id).toBe("job-1");
  });

  it("on a 23505 conflict with mismatched existing content, fails closed instead of silently returning stale data", async () => {
    const sessionClient = makeFakeSessionClient({ data: { id: "farm-1" }, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);
    const serviceRoleClient = makeFakeServiceRoleClient({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: { ...jobRow, status: "dismissed" }, error: null },
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient as never);

    await expect(insertJob(baseInput)).rejects.toThrow(/already exists with different farmId\/jobType\/status/);
  });
});
