import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Farm Return Next Checkpoint 2, Vertical D — direct tests for
 * `insertJob`'s own Supabase-calling logic. See `decisions.test.ts`'s own
 * header comment for why this file mocks `@/lib/supabase/server` directly
 * (a deliberate departure from this repo's usual "mock the whole module,
 * not Supabase itself" convention, made for the same reason there), and
 * for the negative-security-case reasoning these tests follow.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { insertJob, type NewJobInput } from "./jobs";

const mockCreateClient = vi.mocked(createClient);

function makeFakeClient(options: {
  farmResult: { data: unknown; error: { message?: string } | null };
  insertResult?: { data: unknown; error: { code?: string; message?: string } | null };
  fetchResult?: { data: unknown; error: { message?: string } | null };
}) {
  const maybeSingle = vi.fn().mockResolvedValue(options.farmResult);
  const farmsEq = vi.fn().mockReturnValue({ maybeSingle });
  const farmsSelect = vi.fn().mockReturnValue({ eq: farmsEq });

  const insertSingle = vi.fn().mockResolvedValue(options.insertResult ?? { data: null, error: null });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });

  const fetchSingle = vi.fn().mockResolvedValue(options.fetchResult ?? { data: null, error: null });
  const fetchEq = vi.fn().mockReturnValue({ single: fetchSingle });
  const jobsSelect = vi.fn().mockReturnValue({ eq: fetchEq });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "farms") return { select: farmsSelect };
    if (table === "jobs") return { insert, select: jobsSelect };
    throw new Error(`unexpected table ${table}`);
  });

  return { from, farmsSelect, farmsEq, maybeSingle, insert, insertSelect, insertSingle, jobsSelect, fetchEq, fetchSingle };
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
  weight_observation_id: null,
  created_at: "2026-08-29T09:00:01Z",
  updated_at: "2026-08-29T09:00:01Z",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("insertJob", () => {
  it("does not import or use any privileged/service-role client — only @/lib/supabase/server", async () => {
    // Checks the real `import` statements only, not doc-comment prose —
    // this file's own header comment explains, by name, why the earlier
    // service-role client was removed, so a bare substring match on
    // "service-role" would false-positive on that explanation.
    const fs: typeof import("node:fs") = await import("node:fs");
    const path: typeof import("node:path") = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(dir, "jobs.ts"), "utf8");
    const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line));
    expect(importLines.some((line) => /service-role/.test(line))).toBe(false);
    expect(importLines.some((line) => /createServiceRoleClient/.test(line))).toBe(false);
  });

  it("rejects a farmId the current session doesn't own — User A cannot insert a Job for a farm they don't have access to", async () => {
    const client = makeFakeClient({ farmResult: { data: null, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertJob(baseInput)).rejects.toThrow(/farm farm-1 does not belong to the current session/);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("propagates a real error from the ownership check", async () => {
    const client = makeFakeClient({ farmResult: { data: null, error: { message: "select failed" } } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertJob(baseInput)).rejects.toMatchObject({ message: "select failed" });
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("once ownership is confirmed, inserts via the same session client with every field mapped to its real column name", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: jobRow, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertJob(baseInput);

    expect(client.from).toHaveBeenCalledWith("farms");
    expect(client.from).toHaveBeenCalledWith("jobs");
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(client.insert).toHaveBeenCalledWith({
      farm_id: "farm-1",
      decision_id: "decision-1",
      job_type: "record_weight_observation",
      status: "confirmed",
      weight_observation_id: null,
    });
    expect(result.id).toBe("job-1");
    expect(result.decisionId).toBe("decision-1");
    expect(result.weightObservationId).toBeUndefined();
  });

  it("maps a real weightObservationId to weight_observation_id, and back to weightObservationId on the returned record", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: { ...jobRow, weight_observation_id: "observation-1" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertJob({ ...baseInput, weightObservationId: "observation-1" });

    expect(client.insert).toHaveBeenCalledWith({
      farm_id: "farm-1",
      decision_id: "decision-1",
      job_type: "record_weight_observation",
      status: "confirmed",
      weight_observation_id: "observation-1",
    });
    expect(result.weightObservationId).toBe("observation-1");
  });

  it("propagates a non-conflict insert error unchanged, without attempting the 23505 recovery fetch", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23514", message: "check violation" } },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertJob(baseInput)).rejects.toMatchObject({ code: "23514" });
    expect(client.fetchEq).not.toHaveBeenCalled();
  });

  it("on a 23505 conflict, fetches the existing row by decision_id and returns it when content matches (real retry-safety)", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: jobRow, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertJob(baseInput);

    expect(client.fetchEq).toHaveBeenCalledWith("decision_id", "decision-1");
    expect(result.id).toBe("job-1");
  });

  it("on a 23505 conflict with mismatched existing content, fails closed instead of silently returning mismatched data", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: { ...jobRow, status: "dismissed" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertJob(baseInput)).rejects.toThrow(/already exists with different farmId\/jobType\/status\/weightObservationId/);
  });

  it("on a 23505 conflict, a mismatched weightObservationId alone (everything else matching) also fails closed", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: { ...jobRow, weight_observation_id: "observation-2" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertJob({ ...baseInput, weightObservationId: "observation-1" })).rejects.toThrow(
      /already exists with different farmId\/jobType\/status\/weightObservationId/,
    );
  });
});
