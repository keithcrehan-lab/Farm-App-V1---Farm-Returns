import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Farm Return Next Checkpoint 2, Vertical G — direct tests for
 * `insertNotification`/the three transition functions' own Supabase-
 * calling logic, mirroring `decisions.test.ts`/`telemetry.test.ts`'s
 * exact pattern (mocking `@/lib/supabase/server` directly).
 *
 * **Negative security cases** — same reasoning as `decisions.test.ts`:
 * `insertNotification` has exactly one client-side gate (the
 * farm-ownership check below), reading via the same RLS-respecting
 * session client every other query in this app uses. The transition
 * functions rely on RLS's own `using`/`with check` plus the real
 * `notifications_valid_transition` trigger for their negative-security
 * guarantees — necessarily verified against a live Supabase project, not
 * this mocked unit test — see the migration's own validation checklist.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  insertNotification,
  listActiveNotificationsForFarm,
  markNotificationActedOn,
  markNotificationDismissed,
  markNotificationViewed,
  MAX_ACTIVE_NOTIFICATIONS,
  type NotificationInput,
} from "./notifications";

const mockCreateClient = vi.mocked(createClient);

function makeInsertFakeClient(options: {
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
  // .eq().eq().eq().single() -- three chained eq calls for
  // farm_id/kind/dedupe_key on the 23505-recovery fetch.
  const fetchEq3 = vi.fn().mockReturnValue({ single: fetchSingle });
  const fetchEq2 = vi.fn().mockReturnValue({ eq: fetchEq3 });
  const fetchEq1 = vi.fn().mockReturnValue({ eq: fetchEq2 });
  const notificationsSelect = vi.fn().mockReturnValue({ eq: fetchEq1 });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "farms") return { select: farmsSelect };
    if (table === "notifications") return { insert, select: notificationsSelect };
    throw new Error(`unexpected table ${table}`);
  });

  return { from, farmsSelect, farmsEq, maybeSingle, insert, insertSelect, insertSingle, notificationsSelect, fetchEq1, fetchEq2, fetchEq3, fetchSingle };
}

const baseInput: NotificationInput = {
  farmId: "farm-1",
  kind: "spreading_window",
  dedupeKey: "field-3-2026-09-02",
  title: "Good spreading window tomorrow",
  body: "Good spreading window tomorrow — Fields 3, 4 and 6.",
};

const notificationRow = {
  id: "notif-1",
  farm_id: "farm-1",
  kind: "spreading_window",
  dedupe_key: "field-3-2026-09-02",
  title: "Good spreading window tomorrow",
  body: "Good spreading window tomorrow — Fields 3, 4 and 6.",
  field_id: null,
  state: "unread",
  created_at: "2026-09-01T09:00:00Z",
  state_changed_at: "2026-09-01T09:00:00Z",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("insertNotification", () => {
  it("does not import or use any privileged/service-role client — only @/lib/supabase/server", async () => {
    const fs: typeof import("node:fs") = await import("node:fs");
    const path: typeof import("node:path") = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(dir, "notifications.ts"), "utf8");
    const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line));
    expect(importLines.some((line) => /service-role/.test(line))).toBe(false);
    expect(importLines.some((line) => /createServiceRoleClient/.test(line))).toBe(false);
  });

  it("rejects a farmId the current session doesn't own", async () => {
    const client = makeInsertFakeClient({ farmResult: { data: null, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertNotification(baseInput)).rejects.toThrow(/farm farm-1 does not belong to the current session/);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("propagates a real error from the ownership check", async () => {
    const client = makeInsertFakeClient({ farmResult: { data: null, error: { message: "select failed" } } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertNotification(baseInput)).rejects.toMatchObject({ message: "select failed" });
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("once ownership is confirmed, inserts via the same session client with every field mapped to its real column name", async () => {
    const client = makeInsertFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: notificationRow, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertNotification(baseInput);

    expect(client.from).toHaveBeenCalledWith("farms");
    expect(client.from).toHaveBeenCalledWith("notifications");
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(client.insert).toHaveBeenCalledWith({
      farm_id: "farm-1",
      kind: "spreading_window",
      dedupe_key: "field-3-2026-09-02",
      title: "Good spreading window tomorrow",
      body: "Good spreading window tomorrow — Fields 3, 4 and 6.",
      field_id: null,
    });
    expect(result.id).toBe("notif-1");
    expect(result.state).toBe("unread");
  });

  it("propagates a non-conflict insert error unchanged, without attempting the 23505 recovery fetch", async () => {
    const client = makeInsertFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23514", message: "check violation" } },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertNotification(baseInput)).rejects.toMatchObject({ code: "23514" });
    expect(client.fetchEq1).not.toHaveBeenCalled();
  });

  it("on a 23505 conflict (same underlying situation re-computed), fetches the existing row and returns it when content matches", async () => {
    const client = makeInsertFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: notificationRow, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertNotification(baseInput);

    expect(client.fetchEq1).toHaveBeenCalledWith("farm_id", "farm-1");
    expect(client.fetchEq2).toHaveBeenCalledWith("kind", "spreading_window");
    expect(client.fetchEq3).toHaveBeenCalledWith("dedupe_key", "field-3-2026-09-02");
    expect(result.id).toBe("notif-1");
  });

  it("on a 23505 conflict with mismatched existing content, fails closed instead of silently returning stale data", async () => {
    const client = makeInsertFakeClient({
      farmResult: { data: { id: "farm-1" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: { ...notificationRow, title: "Different title entirely" }, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertNotification(baseInput)).rejects.toThrow(/already exists with different/);
  });
});

describe("listActiveNotificationsForFarm", () => {
  function makeListFakeClient(rows: unknown[]) {
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const inFn = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ in: inFn });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    return { from, select, eq, in: inFn, order, limit };
  }

  it("queries only unread/viewed state, ordered newest first, and maps rows", async () => {
    const client = makeListFakeClient([notificationRow]);
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listActiveNotificationsForFarm("farm-1");

    expect(client.eq).toHaveBeenCalledWith("farm_id", "farm-1");
    expect(client.in).toHaveBeenCalledWith("state", ["unread", "viewed"]);
    expect(client.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result.notifications).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  it("reports truncated: true and caps at MAX_ACTIVE_NOTIFICATIONS when the over-fetched row count exceeds the cap", async () => {
    const rows = Array.from({ length: MAX_ACTIVE_NOTIFICATIONS + 1 }, (_, i) => ({ ...notificationRow, id: `notif-${i}` }));
    const client = makeListFakeClient(rows);
    mockCreateClient.mockResolvedValue(client as never);

    const result = await listActiveNotificationsForFarm("farm-1");

    expect(result.notifications).toHaveLength(MAX_ACTIVE_NOTIFICATIONS);
    expect(result.truncated).toBe(true);
  });
});

describe("transition functions", () => {
  function makeTransitionFakeClient(result: { data: unknown; error: { code?: string; message?: string } | null }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const eq2 = vi.fn().mockReturnValue({ select });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const update = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ update });
    return { from, update, eq1, eq2, select, maybeSingle };
  }

  it("markNotificationViewed sends only { state: 'viewed' } scoped to id and farm_id", async () => {
    const client = makeTransitionFakeClient({ data: { ...notificationRow, state: "viewed" }, error: null });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await markNotificationViewed("notif-1", "farm-1");

    expect(client.update).toHaveBeenCalledWith({ state: "viewed" });
    expect(client.eq1).toHaveBeenCalledWith("id", "notif-1");
    expect(client.eq2).toHaveBeenCalledWith("farm_id", "farm-1");
    expect(result.state).toBe("viewed");
  });

  it("markNotificationActedOn sends { state: 'acted_on' }", async () => {
    const client = makeTransitionFakeClient({ data: { ...notificationRow, state: "acted_on" }, error: null });
    mockCreateClient.mockResolvedValue(client as never);

    await markNotificationActedOn("notif-1", "farm-1");

    expect(client.update).toHaveBeenCalledWith({ state: "acted_on" });
  });

  it("markNotificationDismissed sends { state: 'dismissed' }", async () => {
    const client = makeTransitionFakeClient({ data: { ...notificationRow, state: "dismissed" }, error: null });
    mockCreateClient.mockResolvedValue(client as never);

    await markNotificationDismissed("notif-1", "farm-1");

    expect(client.update).toHaveBeenCalledWith({ state: "dismissed" });
  });

  it("surfaces a clear, specific error for an invalid transition (23514 from notifications_valid_transition)", async () => {
    const client = makeTransitionFakeClient({ data: null, error: { code: "23514", message: "check violation" } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(markNotificationActedOn("notif-1", "farm-1")).rejects.toThrow(/invalid transition/);
  });

  it("propagates a non-check-violation error unchanged", async () => {
    const client = makeTransitionFakeClient({ data: null, error: { message: "network error" } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(markNotificationViewed("notif-1", "farm-1")).rejects.toMatchObject({ message: "network error" });
  });

  it("throws a clear not-found error when no row matches (wrong farm, or already gone)", async () => {
    const client = makeTransitionFakeClient({ data: null, error: null });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(markNotificationViewed("notif-1", "farm-1")).rejects.toThrow(/not found/);
  });
});
