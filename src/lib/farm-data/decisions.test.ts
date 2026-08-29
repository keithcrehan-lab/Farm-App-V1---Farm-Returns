import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Farm Return Next Checkpoint 2, Vertical D — direct tests for
 * `insertDecision`'s own Supabase-calling logic (farm-ownership check,
 * privileged insert, `23505` retry-safety, content-mismatch fail-closed
 * behaviour). Codex audit MEDIUM, `docs/farm-return-next/audit-logs/
 * 20260829T193529Z.md`: every prior test in this repo that touches a
 * `server-only` Supabase mutation module mocks the *whole module* from
 * its caller's side (e.g. `act/index.test.ts` mocking
 * `@/lib/farm-data/decisions` itself) rather than mocking
 * `@/lib/supabase/server` directly — real, confirmed by grep across this
 * repo before this file existed — but that convention leaves exactly the
 * logic *inside* this file with no coverage at all. This file is the
 * first in this repo to mock `@/lib/supabase/server`/
 * `@/lib/supabase/service-role` directly — a deliberate, reasoned
 * departure from the "don't mock Supabase" convention, not an oversight
 * of it.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { insertDecision, type DecisionInput } from "./decisions";

const mockCreateClient = vi.mocked(createClient);
const mockCreateServiceRoleClient = vi.mocked(createServiceRoleClient);

/** A minimal fake of the one Supabase client shape `insertDecision`'s
 * ownership check needs: `.from("farms").select(...).eq(...).maybeSingle()`. */
function makeFakeSessionClient(farmResult: { data: unknown; error: { message?: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(farmResult);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, maybeSingle };
}

/** A minimal fake of the privileged client's shape:
 * `.from("decisions").insert(...).select(...).single()`, plus the
 * `23505`-recovery `.from("decisions").select(...).eq(...).single()`
 * path. */
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

const baseInput: DecisionInput = {
  id: "decision-1",
  farmId: "farm-1",
  promptId: "prompt-1",
  calculationKind: "weight_observation_due",
  estimateSnapshot: { status: "OK", value: null, evidenceState: "MEASURED" },
  outcome: "accepted",
  edits: { animalId: "animal-1", weightKg: 320, observedDate: "2026-08-29" },
  decidedBy: "farmer",
  decidedAt: "2026-08-29T09:00:00Z",
};

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

afterEach(() => {
  vi.clearAllMocks();
});

describe("insertDecision", () => {
  it("rejects a farmId the current session doesn't own, before ever touching the privileged client", async () => {
    const sessionClient = makeFakeSessionClient({ data: null, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);

    await expect(insertDecision(baseInput)).rejects.toThrow(/farm farm-1 does not belong to the current session/);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("propagates a real error from the ownership check", async () => {
    const sessionClient = makeFakeSessionClient({ data: null, error: { message: "select failed" } });
    mockCreateClient.mockResolvedValue(sessionClient as never);

    await expect(insertDecision(baseInput)).rejects.toMatchObject({ message: "select failed" });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("once ownership is confirmed, inserts via the service-role client with every field mapped to its real column name", async () => {
    const sessionClient = makeFakeSessionClient({ data: { id: "farm-1" }, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);
    const serviceRoleClient = makeFakeServiceRoleClient({ insertResult: { data: decisionRow, error: null } });
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient as never);

    const result = await insertDecision(baseInput);

    expect(serviceRoleClient.from).toHaveBeenCalledWith("decisions");
    expect(serviceRoleClient.insert).toHaveBeenCalledWith({
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
    });
    expect(result.id).toBe("decision-1");
    expect(result.createdAt).toBe("2026-08-29T09:00:01Z");
  });

  it("propagates a non-conflict insert error unchanged, without attempting the 23505 recovery fetch", async () => {
    const sessionClient = makeFakeSessionClient({ data: { id: "farm-1" }, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);
    const serviceRoleClient = makeFakeServiceRoleClient({
      insertResult: { data: null, error: { code: "23514", message: "check violation" } },
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient as never);

    await expect(insertDecision(baseInput)).rejects.toMatchObject({ code: "23514" });
    expect(serviceRoleClient.fetchEq).not.toHaveBeenCalled();
  });

  it("on a 23505 conflict, fetches the existing row by id and returns it when content matches (real retry-safety)", async () => {
    const sessionClient = makeFakeSessionClient({ data: { id: "farm-1" }, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);
    const serviceRoleClient = makeFakeServiceRoleClient({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: decisionRow, error: null },
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient as never);

    const result = await insertDecision(baseInput);

    expect(serviceRoleClient.fetchEq).toHaveBeenCalledWith("id", "decision-1");
    expect(result.id).toBe("decision-1");
  });

  it("on a 23505 conflict with mismatched existing content, fails closed instead of silently returning stale data", async () => {
    const sessionClient = makeFakeSessionClient({ data: { id: "farm-1" }, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);
    const serviceRoleClient = makeFakeServiceRoleClient({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: { ...decisionRow, calculation_kind: "spreading_window" }, error: null },
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient as never);

    await expect(insertDecision(baseInput)).rejects.toThrow(/already exists with different content/);
  });

  // Codex audit HIGH, docs/farm-return-next/audit-logs/20260829T201312Z.md:
  // Postgres/PostgREST can return a timestamptz in a different (but
  // equivalent) textual representation than what was sent -- a plain
  // string comparison would treat the identical decision as "conflicting
  // content" and fail closed on a perfectly legitimate retry.
  it("on a 23505 conflict, treats a decidedAt returned in a different (but equivalent) timestamp format as matching, not a conflict", async () => {
    const sessionClient = makeFakeSessionClient({ data: { id: "farm-1" }, error: null });
    mockCreateClient.mockResolvedValue(sessionClient as never);
    const serviceRoleClient = makeFakeServiceRoleClient({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      // Same instant as baseInput.decidedAt ("2026-08-29T09:00:00Z"), but
      // in Postgres's own +00:00-offset textual form rather than Z.
      fetchResult: { data: { ...decisionRow, decided_at: "2026-08-29T09:00:00+00:00" }, error: null },
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient as never);

    const result = await insertDecision(baseInput);

    expect(result.id).toBe("decision-1");
  });
});
