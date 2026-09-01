import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Farm Return Next Checkpoint 2, Vertical D — direct tests for
 * `insertDecision`'s own Supabase-calling logic (farm-ownership check,
 * insert, `23505` retry-safety, content-mismatch fail-closed behaviour).
 * Codex audit MEDIUM, `docs/farm-return-next/audit-logs/
 * 20260829T193529Z.md`: every prior test in this repo that touches a
 * `server-only` Supabase mutation module mocks the *whole module* from
 * its caller's side (e.g. `act/index.test.ts` mocking
 * `@/lib/farm-data/decisions` itself) rather than mocking
 * `@/lib/supabase/server` directly — real, confirmed by grep across this
 * repo before this file existed — but that convention leaves exactly the
 * logic *inside* this file with no coverage at all. This file is the
 * first in this repo to mock `@/lib/supabase/server` directly — a
 * deliberate, reasoned departure from the "don't mock Supabase"
 * convention, not an oversight of it.
 *
 * **Negative security cases (architectural review,
 * `docs/farm-return-next/BLOCKERS.md`'s "Decisions/jobs persistence"
 * entry, rule 8 of that review's brief: "prove that User A cannot ...
 * insert ... a Decision ... belonging to ... a farm they do not have
 * authorised access to").** `insertDecision` has exactly one client-side
 * gate against that: the farm-ownership check below, which reads via the
 * *same* RLS-respecting session client every other query in this app
 * uses — there is no separate privileged client in this file at all (see
 * the "does not import or use any privileged/service-role client" test),
 * so `decisions_owner_insert`'s own database-level `with check` is a real,
 * independent second enforcement layer behind this one, not merely
 * documented as such. The database-level half of that guarantee (a
 * same-session insert attempt for a farm the session doesn't own is
 * rejected by Postgres even if this file's own check were skipped) is
 * necessarily verified against a live Supabase project, not this mocked
 * unit test — see `docs/farm-return-next/BLOCKERS.md` and the migration's
 * own validation checklist for the exact steps a human with database
 * access must run.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { insertDecision, listDecisionsForFarm, MAX_DECISION_HISTORY_ROWS, type DecisionInput } from "./decisions";

const mockCreateClient = vi.mocked(createClient);

/** A fake of the one Supabase client shape this file needs:
 * `.from("farms").select(...).eq(...).maybeSingle()` for the ownership
 * check, and `.from("decisions").insert(...).select(...).single()` /
 * `.from("decisions").select(...).eq(...).single()` for the insert and
 * its `23505`-recovery path. Both `farms` and `decisions` calls go through
 * this one client — there is no second, privileged client anywhere in
 * this file. */
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
  const decisionsSelect = vi.fn().mockReturnValue({ eq: fetchEq });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "farms") return { select: farmsSelect };
    if (table === "decisions") return { insert, select: decisionsSelect };
    throw new Error(`unexpected table ${table}`);
  });

  return { from, farmsSelect, farmsEq, maybeSingle, insert, insertSelect, insertSingle, decisionsSelect, fetchEq, fetchSingle };
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
  it("does not import or use any privileged/service-role client — only @/lib/supabase/server", async () => {
    // A structural guarantee, not just a behavioural one: this module has
    // exactly one Supabase import. If a future change reintroduced a
    // second, privileged client, this assertion (that createClient is the
    // *only* client construction this file's exercised code path
    // triggers) would still pass even though the real risk is the import
    // itself — the accompanying source-text check below is what actually
    // guards against that.
    // Checks the real `import` statements only, not doc-comment prose —
    // this file's own header comment explains, by name, why the earlier
    // service-role client was removed, so a bare substring match on
    // "service-role" would false-positive on that explanation.
    const fs: typeof import("node:fs") = await import("node:fs");
    const path: typeof import("node:path") = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(dir, "decisions.ts"), "utf8");
    const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line));
    expect(importLines.some((line) => /service-role/.test(line))).toBe(false);
    expect(importLines.some((line) => /createServiceRoleClient/.test(line))).toBe(false);
  });

  it("rejects a farmId the current session doesn't own — User A cannot insert a Decision for a farm they don't have access to", async () => {
    const client = makeFakeClient({ farmResult: { data: null, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertDecision(baseInput)).rejects.toThrow(/farm farm-1 does not belong to the current session/);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("propagates a real error from the ownership check", async () => {
    const client = makeFakeClient({ farmResult: { data: null, error: { message: "select failed" } } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertDecision(baseInput)).rejects.toMatchObject({ message: "select failed" });
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("once ownership is confirmed, inserts via the same session client with every field mapped to its real column name", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: decisionRow, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertDecision(baseInput);

    // The ownership check and the insert both go through the single
    // client `createClient()` returned — proven here by both calls
    // landing on the same `from` mock, not two different client objects.
    expect(client.from).toHaveBeenCalledWith("farms");
    expect(client.from).toHaveBeenCalledWith("decisions");
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(client.insert).toHaveBeenCalledWith({
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
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23514", message: "check violation" } },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertDecision(baseInput)).rejects.toMatchObject({ code: "23514" });
    expect(client.fetchEq).not.toHaveBeenCalled();
  });

  it("on a 23505 conflict, fetches the existing row by id and returns it when content matches (real retry-safety)", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: decisionRow, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertDecision(baseInput);

    expect(client.fetchEq).toHaveBeenCalledWith("id", "decision-1");
    expect(result.id).toBe("decision-1");
  });

  it("on a 23505 conflict with mismatched existing content, fails closed instead of silently returning stale data", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: { ...decisionRow, calculation_kind: "spreading_window" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertDecision(baseInput)).rejects.toThrow(/already exists with different content/);
  });

  // Codex audit HIGH, docs/farm-return-next/audit-logs/20260829T201312Z.md:
  // Postgres/PostgREST can return a timestamptz in a different (but
  // equivalent) textual representation than what was sent -- a plain
  // string comparison would treat the identical decision as "conflicting
  // content" and fail closed on a perfectly legitimate retry.
  it("on a 23505 conflict, treats a decidedAt returned in a different (but equivalent) timestamp format as matching, not a conflict", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      // Same instant as baseInput.decidedAt ("2026-08-29T09:00:00Z"), but
      // in Postgres's own +00:00-offset textual form rather than Z.
      fetchResult: { data: { ...decisionRow, decided_at: "2026-08-29T09:00:00+00:00" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertDecision(baseInput);

    expect(result.id).toBe("decision-1");
  });
});

/** A fake of the `.from("decisions").select("*").eq(...).order(...).limit(...)`
 * chain `listDecisionsForFarm` uses — deliberately a separate, minimal
 * builder from `makeFakeClient` above (that one shapes the insert/23505
 * chains this function never calls). */
function makeFakeListClient(rows: unknown[], error: { message?: string } | null = null) {
  const limit = vi.fn().mockResolvedValue({ data: error ? null : rows, error });
  const order = vi.fn().mockReturnValue({ limit });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, order, limit };
}

describe("listDecisionsForFarm", () => {
  it("returns every real decision for the farm, mapped from its row, when under the cap", async () => {
    const client = makeFakeListClient([decisionRow]);
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listDecisionsForFarm("farm-1");

    expect(client.select).toHaveBeenCalledWith("*");
    expect(client.eq).toHaveBeenCalledWith("farm_id", "farm-1");
    expect(client.order).toHaveBeenCalledWith("decided_at", { ascending: false });
    expect(client.limit).toHaveBeenCalledWith(MAX_DECISION_HISTORY_ROWS + 1);
    expect(result).toEqual({ decisions: [expect.objectContaining({ id: "decision-1" })], truncated: false });
  });

  it("propagates a real fetch error rather than returning an empty/false result", async () => {
    const client = makeFakeListClient([], { message: "select failed" });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(listDecisionsForFarm("farm-1")).rejects.toMatchObject({ message: "select failed" });
  });

  it("discloses truncation rather than silently applying the cap", async () => {
    const rows = Array.from({ length: MAX_DECISION_HISTORY_ROWS + 1 }, (_, i) => ({
      ...decisionRow,
      id: `decision-${i}`,
    }));
    const client = makeFakeListClient(rows);
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listDecisionsForFarm("farm-1");

    expect(result.decisions).toHaveLength(MAX_DECISION_HISTORY_ROWS);
    expect(result.truncated).toBe(true);
  });
});
