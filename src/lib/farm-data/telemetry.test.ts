import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Farm Return Next Checkpoint 2, Vertical A — direct tests for
 * `insertTelemetryEvent`'s own Supabase-calling logic, mirroring
 * `decisions.test.ts`'s exact pattern (mocking `@/lib/supabase/server`
 * directly — see that file's own header comment for why this repo
 * departs from its usual "mock the whole module from the caller's side"
 * convention for this specific class of function).
 *
 * **Negative security cases** — same reasoning as `decisions.test.ts`:
 * `insertTelemetryEvent` has exactly one client-side gate (the
 * farm-ownership check below), which reads via the same RLS-respecting
 * session client every other query in this app uses. The database-level
 * half of the guarantee (a same-session insert for a farm the session
 * doesn't own is independently rejected by
 * `telemetry_events_owner_insert`'s own `with check`) is necessarily
 * verified against a live Supabase project, not this mocked unit test —
 * see the migration's own validation checklist.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { insertTelemetryEvent, type TelemetryEventInput } from "./telemetry";

const mockCreateClient = vi.mocked(createClient);

/** A fake of the one Supabase client shape this file needs:
 * `.from("farms").select(...).eq(...).maybeSingle()` for the ownership
 * check, and `.from("telemetry_events").insert(...).select(...).single()`
 * / `.from("telemetry_events").select(...).eq(...).single()` for the
 * insert and its `23505`-recovery path. */
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
  const telemetrySelect = vi.fn().mockReturnValue({ eq: fetchEq });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "farms") return { select: farmsSelect };
    if (table === "telemetry_events") return { insert, select: telemetrySelect };
    throw new Error(`unexpected table ${table}`);
  });

  return { from, farmsSelect, farmsEq, maybeSingle, insert, insertSelect, insertSingle, telemetrySelect, fetchEq, fetchSingle };
}

const baseInput: TelemetryEventInput = {
  id: "event-1",
  farmId: "farm-1",
  source: "phone_gps",
  recordedAt: "2026-09-01T09:00:00Z",
  payload: { lat: 52.5, lng: -7.9, accuracyM: 5 },
};

const telemetryRow = {
  id: "event-1",
  farm_id: "farm-1",
  source: "phone_gps",
  recorded_at: "2026-09-01T09:00:00Z",
  payload: { lat: 52.5, lng: -7.9, accuracyM: 5 },
  created_at: "2026-09-01T09:00:01Z",
  job_session_id: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("insertTelemetryEvent", () => {
  it("does not import or use any privileged/service-role client — only @/lib/supabase/server", async () => {
    const fs: typeof import("node:fs") = await import("node:fs");
    const path: typeof import("node:path") = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(dir, "telemetry.ts"), "utf8");
    const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line));
    expect(importLines.some((line) => /service-role/.test(line))).toBe(false);
    expect(importLines.some((line) => /createServiceRoleClient/.test(line))).toBe(false);
  });

  it("rejects a farmId the current session doesn't own — User A cannot insert a telemetry event for a farm they don't have access to", async () => {
    const client = makeFakeClient({ farmResult: { data: null, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertTelemetryEvent(baseInput)).rejects.toThrow(/farm farm-1 does not belong to the current session/);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("propagates a real error from the ownership check", async () => {
    const client = makeFakeClient({ farmResult: { data: null, error: { message: "select failed" } } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertTelemetryEvent(baseInput)).rejects.toMatchObject({ message: "select failed" });
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("once ownership is confirmed, inserts via the same session client with every field mapped to its real column name", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: telemetryRow, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertTelemetryEvent(baseInput);

    expect(client.from).toHaveBeenCalledWith("farms");
    expect(client.from).toHaveBeenCalledWith("telemetry_events");
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(client.insert).toHaveBeenCalledWith({
      id: "event-1",
      farm_id: "farm-1",
      source: "phone_gps",
      recorded_at: "2026-09-01T09:00:00Z",
      payload: { lat: 52.5, lng: -7.9, accuracyM: 5 },
      // GPS Job Session + Confirm Actual contract addition
      // (20260902020000_telemetry_events_job_session_link.sql) — absent
      // from baseInput, so null, matching insertTelemetryEvent's own
      // `event.jobSessionId ?? null` default.
      job_session_id: null,
    });
    expect(result.id).toBe("event-1");
    expect(result.createdAt).toBe("2026-09-01T09:00:01Z");
  });

  it("maps a supplied jobSessionId onto job_session_id", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: { ...telemetryRow, job_session_id: "session-1" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertTelemetryEvent({ ...baseInput, jobSessionId: "session-1" });

    expect(client.insert).toHaveBeenCalledWith(
      expect.objectContaining({ job_session_id: "session-1" }),
    );
    expect(result.jobSessionId).toBe("session-1");
  });

  it("propagates a non-conflict insert error unchanged, without attempting the 23505 recovery fetch", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23514", message: "check violation" } },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertTelemetryEvent(baseInput)).rejects.toMatchObject({ code: "23514" });
    expect(client.fetchEq).not.toHaveBeenCalled();
  });

  it("on a 23505 conflict, fetches the existing row by id and returns it when content matches (real retry-safety — the offline outbox's own flush loop retrying after a lost network response)", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: telemetryRow, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertTelemetryEvent(baseInput);

    expect(client.fetchEq).toHaveBeenCalledWith("id", "event-1");
    expect(result.id).toBe("event-1");
  });

  it("on a 23505 conflict with mismatched existing content, fails closed instead of silently returning stale data", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: { ...telemetryRow, payload: { lat: 51.9, lng: -8.4 } }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertTelemetryEvent(baseInput)).rejects.toThrow(/already exists with different content/);
  });

  it("on a 23505 conflict, treats a recordedAt returned in a different (but equivalent) timestamp format as matching, not a conflict", async () => {
    const client = makeFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      // Same instant as baseInput.recordedAt ("2026-09-01T09:00:00Z"), but
      // in Postgres's own +00:00-offset textual form rather than Z.
      fetchResult: { data: { ...telemetryRow, recorded_at: "2026-09-01T09:00:00+00:00" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertTelemetryEvent(baseInput);

    expect(result.id).toBe("event-1");
  });
});
