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
import { insertJob, listJobsWithDecisionsForFarm, listJobDecisionIdsForFarm, MAX_JOB_DECISION_ID_ROWS, type NewJobInput } from "./jobs";

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

describe("listJobsWithDecisionsForFarm", () => {
  const decisionRow = {
    id: "decision-1",
    farm_id: "farm-1",
    prompt_id: "prompt-1",
    calculation_kind: "weight_observation_due",
    estimate_snapshot: { status: "OK", value: null, evidenceState: "MEASURED" },
    outcome: "accepted",
    edits: { animalId: "animal-1", weightKg: 320, observedDate: "2026-08-29" },
    decided_by: "farmer",
    decided_at: "2026-08-29T09:00:00Z",
    field_id: null,
    calculation_version: null,
    inputs_snapshot: null,
    created_at: "2026-08-29T09:00:01Z",
  };

  const weightObservationRow = {
    id: "observation-1",
    farm_id: "farm-1",
    animal_id: "animal-1",
    weight_kg: 320,
    observed_date: "2026-08-29",
    source: "GPS job mode",
    created_at: "2026-08-29T09:00:00Z",
  };

  function makeListClient(result: { data: unknown; error: { message?: string; code?: string } | null }) {
    const limit = vi.fn().mockResolvedValue(result);
    const order = vi.fn().mockReturnValue({ limit });
    const in_ = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ in: in_ });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    return { from, select, eq, in: in_, order, limit };
  }

  it("queries jobs with the embedded decision and weight observation, scoped to the given farm, newest first, over-fetched by one to detect truncation", async () => {
    const client = makeListClient({
      data: [{ ...jobRow, weight_observation_id: "observation-1", decision: decisionRow, weightObservation: weightObservationRow }],
      error: null,
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listJobsWithDecisionsForFarm("farm-1");

    expect(client.from).toHaveBeenCalledWith("jobs");
    expect(client.select).toHaveBeenCalledWith("*, decision:decisions(*), weightObservation:livestock_weight_observations(*)");
    expect(client.eq).toHaveBeenCalledWith("farm_id", "farm-1");
    // Records is scoped to completed history only -- proposed/scheduled/
    // in_progress jobs are still in-flight work, not yet a historical
    // record (Codex audit MEDIUM, 20260901T100458Z.md).
    expect(client.in).toHaveBeenCalledWith("status", ["confirmed", "dismissed"]);
    expect(client.order).toHaveBeenCalledWith("created_at", { ascending: false });
    // MAX_JOB_HISTORY_ROWS (200) + 1 -- the extra row is how truncation is
    // detected, and is never included in the returned jobs (Codex audit
    // MEDIUM, 20260901T095654Z.md).
    expect(client.limit).toHaveBeenCalledWith(201);
    expect(result.truncated).toBe(false);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].id).toBe("job-1");
    expect(result.jobs[0].decision.id).toBe("decision-1");
    expect(result.jobs[0].decision.outcome).toBe("accepted");
    // The real Actual, not decision.edits, is what this reader surfaces
    // as the source of truth (Codex audit HIGH, 20260901T094442Z.md).
    expect(result.jobs[0].weightObservation).toEqual({
      id: "observation-1",
      animalId: "animal-1",
      weightKg: 320,
      observedDate: "2026-08-29",
      source: "GPS job mode",
    });
  });

  it("omits weightObservation entirely for a job with no weight_observation_id", async () => {
    const client = makeListClient({ data: [{ ...jobRow, decision: decisionRow, weightObservation: null }], error: null });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listJobsWithDecisionsForFarm("farm-1");

    expect(result.jobs[0].weightObservation).toBeUndefined();
  });

  it("returns an empty jobs array for a farm with no job history, not an error, and truncated: false", async () => {
    const client = makeListClient({ data: [], error: null });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listJobsWithDecisionsForFarm("farm-1");

    expect(result).toEqual({ jobs: [], truncated: false });
  });

  it("when more than MAX_JOB_HISTORY_ROWS rows come back, truncates to the cap and reports truncated: true, discarding the extra probe row", async () => {
    const rows = Array.from({ length: 201 }, (_, i) => ({
      ...jobRow,
      id: `job-${i}`,
      decision: { ...decisionRow, id: `decision-${i}` },
      weightObservation: null,
    }));
    const client = makeListClient({ data: rows, error: null });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listJobsWithDecisionsForFarm("farm-1");

    expect(result.truncated).toBe(true);
    expect(result.jobs).toHaveLength(200);
    // The 201st (extra probe) row is never surfaced to a caller.
    expect(result.jobs.some((j) => j.id === "job-200")).toBe(false);
  });

  it("propagates a real query error (e.g. the migration not yet applied) unchanged, rather than swallowing it", async () => {
    const client = makeListClient({ data: null, error: { message: "relation \"public.jobs\" does not exist", code: "42P01" } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(listJobsWithDecisionsForFarm("farm-1")).rejects.toMatchObject({
      message: "relation \"public.jobs\" does not exist",
    });
  });
});

describe("listJobDecisionIdsForFarm", () => {
  function makeIdsClient(result: { data: unknown; error: { message?: string; code?: string } | null }) {
    const limit = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    return { from, select, eq, limit };
  }

  it("returns the real set of decision ids this farm has any job for, scoped to the farm", async () => {
    const client = makeIdsClient({ data: [{ decision_id: "decision-1" }, { decision_id: "decision-2" }], error: null });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listJobDecisionIdsForFarm("farm-1");

    expect(client.from).toHaveBeenCalledWith("jobs");
    expect(client.select).toHaveBeenCalledWith("decision_id");
    expect(client.eq).toHaveBeenCalledWith("farm_id", "farm-1");
    expect(client.limit).toHaveBeenCalledWith(MAX_JOB_DECISION_ID_ROWS + 1);
    expect(result).toEqual({ decisionIds: new Set(["decision-1", "decision-2"]), truncated: false });
  });

  it("discloses truncation rather than silently returning an incomplete exclusion set", async () => {
    const rows = Array.from({ length: MAX_JOB_DECISION_ID_ROWS + 1 }, (_, i) => ({ decision_id: `decision-${i}` }));
    const client = makeIdsClient({ data: rows, error: null });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listJobDecisionIdsForFarm("farm-1");

    expect(result.decisionIds.size).toBe(MAX_JOB_DECISION_ID_ROWS);
    expect(result.truncated).toBe(true);
  });

  it("propagates a real fetch error rather than returning an empty/false result", async () => {
    const client = makeIdsClient({ data: null, error: { message: "select failed" } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(listJobDecisionIdsForFarm("farm-1")).rejects.toMatchObject({ message: "select failed" });
  });
});
