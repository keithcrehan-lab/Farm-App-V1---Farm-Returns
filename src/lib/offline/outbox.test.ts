import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  clearAll,
  clearFarm,
  enqueue,
  flush,
  getAll,
  getPending,
  pruneSynced,
  reclaimStale,
  type OutboxItem,
} from "./outbox";

/**
 * Farm Return Next Checkpoint 2, Vertical A — direct tests for the
 * client-side IndexedDB offline outbox, against `fake-indexeddb` (a real,
 * spec-faithful IndexedDB implementation for Node/jsdom, not a hand-rolled
 * mock — jsdom itself has no IndexedDB implementation at all, and this
 * module's correctness genuinely depends on real IndexedDB transaction/
 * request semantics, not an approximation of them).
 *
 * **Every `describe` block below except the first two exists specifically
 * because it is a real, shipped bug this file's earlier versions failed
 * to catch** (`docs/farm-return-next/audit-logs/20260901T140609Z.md`
 * round 1, `20260901T142804Z.md` round 2): `"farm scoping"` (round 1
 * CRITICAL — no `farmId` scoping at all), `"concurrent flush safety"`
 * (round 1 HIGH — an unconditional reclaim let two concurrent flushes
 * double-process the same item), `"schema upgrade"` (round 2 HIGH — a
 * missing `DB_VERSION` bump would have left every existing user's browser
 * without the new `farmId` index), and `"reclaimStale"` /
 * `"claimToken-guarded completion"` (round 2 HIGH — a stale-reclaim
 * threshold baked into `flush()`'s own hot path could double-invoke
 * `syncFn` for a still-genuinely-running item).
 *
 * `globalThis.indexedDB` is replaced with a *fresh* `IDBFactory` before
 * every test (rather than relying on one shared fake database across
 * tests) so each test starts from a genuinely empty store, and
 * `__resetForTests()` clears this module's own memoized connection so it
 * reopens against that fresh factory rather than reusing a stale handle
 * from the previous test's now-replaced factory.
 */
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __resetForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function baseItem(overrides: Partial<Omit<OutboxItem, "syncState" | "attempts">> = {}) {
  return {
    id: "event-1",
    type: "telemetry_event" as const,
    farmId: "farm-1",
    payload: { lat: 52.5, lng: -7.9 },
    enqueuedAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

describe("enqueue / getPending / getAll", () => {
  it("enqueues a new item as pending with zero attempts", async () => {
    await enqueue(baseItem());
    const pending = await getPending("farm-1");
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: "event-1", syncState: "pending", attempts: 0 });
  });

  it("is a safe no-op when re-enqueuing an id already present, regardless of its current syncState", async () => {
    await enqueue(baseItem());
    // Simulate the item having already been synced by a prior flush.
    await flush("farm-1", async () => {});
    const afterFirstFlush = await getAll("farm-1");
    expect(afterFirstFlush[0].syncState).toBe("synced");

    // A caller (e.g. a re-running effect) enqueues the exact same id
    // again -- must not regress it back to "pending".
    await enqueue(baseItem());
    const afterReEnqueue = await getAll("farm-1");
    expect(afterReEnqueue).toHaveLength(1);
    expect(afterReEnqueue[0].syncState).toBe("synced");
  });

  it("getPending returns items ordered oldest-enqueuedAt-first", async () => {
    await enqueue(baseItem({ id: "b", enqueuedAt: "2026-09-01T09:02:00.000Z" }));
    await enqueue(baseItem({ id: "a", enqueuedAt: "2026-09-01T09:01:00.000Z" }));
    const pending = await getPending("farm-1");
    expect(pending.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("getPending excludes already-synced items", async () => {
    await enqueue(baseItem());
    await flush("farm-1", async () => {});
    const pending = await getPending("farm-1");
    expect(pending).toHaveLength(0);
  });
});

describe("farm scoping", () => {
  it("getPending only returns items for the requested farm, never another farm's", async () => {
    await enqueue(baseItem({ id: "a1", farmId: "farm-1" }));
    await enqueue(baseItem({ id: "b1", farmId: "farm-2" }));

    expect((await getPending("farm-1")).map((i) => i.id)).toEqual(["a1"]);
    expect((await getPending("farm-2")).map((i) => i.id)).toEqual(["b1"]);
  });

  it("getAll only returns items for the requested farm", async () => {
    await enqueue(baseItem({ id: "a1", farmId: "farm-1" }));
    await enqueue(baseItem({ id: "b1", farmId: "farm-2" }));
    await flush("farm-1", async () => {});
    await flush("farm-2", async () => {});

    expect((await getAll("farm-1")).map((i) => i.id)).toEqual(["a1"]);
    expect((await getAll("farm-2")).map((i) => i.id)).toEqual(["b1"]);
  });

  it("flush only processes the requested farm's items -- a second user's session on the same device cannot trigger sync of the first user's farm data", async () => {
    await enqueue(baseItem({ id: "a1", farmId: "farm-1" }));
    await enqueue(baseItem({ id: "b1", farmId: "farm-2" }));
    const syncFn = vi.fn().mockResolvedValue(undefined);

    const result = await flush("farm-1", syncFn);

    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(syncFn).toHaveBeenCalledWith(expect.objectContaining({ id: "a1", farmId: "farm-1" }));
    expect(result.synced).toEqual(["a1"]);
    // farm-2's item is untouched -- still pending, never even offered to syncFn.
    expect((await getPending("farm-2")).map((i) => i.id)).toEqual(["b1"]);
  });

  it("pruneSynced only prunes the requested farm's synced items", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await enqueue(baseItem({ id: "a1", farmId: "farm-1", enqueuedAt: twoDaysAgo }));
    await enqueue(baseItem({ id: "b1", farmId: "farm-2", enqueuedAt: twoDaysAgo }));
    await flush("farm-1", async () => {});
    await flush("farm-2", async () => {});

    const prunedCount = await pruneSynced("farm-1", 24 * 60 * 60 * 1000);

    expect(prunedCount).toBe(1);
    expect(await getAll("farm-1")).toHaveLength(0);
    expect(await getAll("farm-2")).toHaveLength(1);
  });

  it("clearFarm removes every item for that farm, any syncState, without touching another farm's items", async () => {
    await enqueue(baseItem({ id: "a1", farmId: "farm-1" }));
    await enqueue(baseItem({ id: "a2", farmId: "farm-1", enqueuedAt: "2026-09-01T09:01:00.000Z" }));
    await enqueue(baseItem({ id: "b1", farmId: "farm-2" }));
    await flush("farm-1", async (item) => {
      if (item.id === "a2") throw new Error("still not synced");
    });

    await clearFarm("farm-1");

    expect(await getAll("farm-1")).toHaveLength(0);
    expect((await getAll("farm-2")).map((i) => i.id)).toEqual(["b1"]);
  });

  it("clearAll removes every item for every farm -- the whole-origin sign-out purge", async () => {
    await enqueue(baseItem({ id: "a1", farmId: "farm-1" }));
    await enqueue(baseItem({ id: "b1", farmId: "farm-2" }));

    await clearAll();

    expect(await getAll("farm-1")).toHaveLength(0);
    expect(await getAll("farm-2")).toHaveLength(0);
  });
});

describe("flush", () => {
  it("marks a successfully-synced item synced and reports it in result.synced", async () => {
    await enqueue(baseItem());
    const syncFn = vi.fn().mockResolvedValue(undefined);

    const result = await flush("farm-1", syncFn);

    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(result.synced).toEqual(["event-1"]);
    expect(result.failed).toEqual([]);
    const all = await getAll("farm-1");
    expect(all[0]).toMatchObject({ syncState: "synced", attempts: 1 });
  });

  it("marks a failed item failed, records the error, and reports it in result.failed -- without throwing", async () => {
    await enqueue(baseItem());
    const syncFn = vi.fn().mockRejectedValue(new Error("network unreachable"));

    const result = await flush("farm-1", syncFn);

    expect(result.synced).toEqual([]);
    expect(result.failed).toEqual([{ id: "event-1", error: "network unreachable" }]);
    const all = await getAll("farm-1");
    expect(all[0]).toMatchObject({ syncState: "failed", lastError: "network unreachable", attempts: 1 });
  });

  it("a failed item remains retryable -- the next flush() picks it up again, incrementing attempts", async () => {
    await enqueue(baseItem());
    const syncFn = vi.fn().mockRejectedValueOnce(new Error("first attempt failed")).mockResolvedValueOnce(undefined);

    const first = await flush("farm-1", syncFn);
    expect(first.failed).toHaveLength(1);

    const second = await flush("farm-1", syncFn);
    expect(second.synced).toEqual(["event-1"]);
    const all = await getAll("farm-1");
    expect(all[0]).toMatchObject({ syncState: "synced", attempts: 2 });
  });

  it("partial-failure recovery: one item failing does not block or corrupt the rest of the batch", async () => {
    await enqueue(baseItem({ id: "ok-1", enqueuedAt: "2026-09-01T09:00:00.000Z" }));
    await enqueue(baseItem({ id: "bad-1", enqueuedAt: "2026-09-01T09:00:01.000Z" }));
    await enqueue(baseItem({ id: "ok-2", enqueuedAt: "2026-09-01T09:00:02.000Z" }));
    const syncFn = vi.fn().mockImplementation(async (item: OutboxItem) => {
      if (item.id === "bad-1") throw new Error("rejected by server");
    });

    const result = await flush("farm-1", syncFn);

    expect(syncFn).toHaveBeenCalledTimes(3);
    expect(result.synced.sort()).toEqual(["ok-1", "ok-2"]);
    expect(result.failed).toEqual([{ id: "bad-1", error: "rejected by server" }]);
  });

  it("processes items sequentially, not concurrently -- each syncFn call completes before the next begins", async () => {
    await enqueue(baseItem({ id: "first", enqueuedAt: "2026-09-01T09:00:00.000Z" }));
    await enqueue(baseItem({ id: "second", enqueuedAt: "2026-09-01T09:00:01.000Z" }));
    const order: string[] = [];
    const syncFn = vi.fn().mockImplementation(async (item: OutboxItem) => {
      order.push(`start:${item.id}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end:${item.id}`);
    });

    await flush("farm-1", syncFn);

    expect(order).toEqual(["start:first", "end:first", "start:second", "end:second"]);
  });

  it("never touches an item stuck in 'syncing' from a still-in-flight claim -- flush() itself does not reclaim stale items (reclaimStale does, separately)", async () => {
    await enqueue(baseItem());
    let releaseFirstAttempt: (() => void) | undefined;
    let notifySyncFnStarted: (() => void) | undefined;
    const syncFnStarted = new Promise<void>((resolve) => {
      notifySyncFnStarted = resolve;
    });
    const stuck = new Promise<void>((resolve) => {
      releaseFirstAttempt = resolve;
    });
    const firstSyncFn = vi.fn().mockImplementation(() => {
      notifySyncFnStarted?.();
      return stuck;
    });
    const flushPromise = flush("farm-1", firstSyncFn);
    await syncFnStarted;

    // A second flush() call while the item is "syncing" must not touch
    // it at all -- no reclaim, no second syncFn invocation.
    const secondSyncFn = vi.fn().mockResolvedValue(undefined);
    const secondResult = await flush("farm-1", secondSyncFn);
    expect(secondSyncFn).not.toHaveBeenCalled();
    expect(secondResult).toEqual({ synced: [], failed: [] });

    releaseFirstAttempt?.();
    await flushPromise;
    expect((await getAll("farm-1"))[0].syncState).toBe("synced");
  });
});

describe("concurrent flush safety", () => {
  it("two concurrent flush() calls for the same farm never both process the same item", async () => {
    await enqueue(baseItem({ id: "a", enqueuedAt: "2026-09-01T09:00:00.000Z" }));
    await enqueue(baseItem({ id: "b", enqueuedAt: "2026-09-01T09:00:01.000Z" }));
    const callsPerItem = new Map<string, number>();
    const syncFn = vi.fn().mockImplementation(async (item: OutboxItem) => {
      callsPerItem.set(item.id, (callsPerItem.get(item.id) ?? 0) + 1);
      // A small, real async gap -- long enough that both flush() calls'
      // own item-list reads genuinely race, not so long the test is slow.
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    const [resultA, resultB] = await Promise.all([flush("farm-1", syncFn), flush("farm-1", syncFn)]);

    // Every item was synced exactly once, by exactly one of the two
    // concurrent flushes -- never zero times (lost), never twice
    // (double-processed).
    expect(callsPerItem.get("a")).toBe(1);
    expect(callsPerItem.get("b")).toBe(1);
    expect([...resultA.synced, ...resultB.synced].sort()).toEqual(["a", "b"]);
    expect([...resultA.failed, ...resultB.failed]).toEqual([]);
  });
});

describe("reclaimStale", () => {
  it("leaves a 'syncing' item alone while it is more recent than olderThanMs", async () => {
    await enqueue(baseItem({ id: "stuck" }));
    let notifyStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    // Deliberately not awaited -- left permanently in flight for this
    // test, standing in for a genuinely still-running (not abandoned)
    // sync attempt.
    void flush("farm-1", () => {
      notifyStarted?.();
      return new Promise<void>(() => {});
    });
    await started;

    const reclaimedCount = await reclaimStale("farm-1", 60 * 60 * 1000);

    expect(reclaimedCount).toBe(0);
    expect((await getAll("farm-1"))[0].syncState).toBe("syncing");
  });

  it("reclaims a 'syncing' item older than olderThanMs back to pending, retryable on the next flush", async () => {
    await enqueue(baseItem({ id: "stuck" }));
    let notifyStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    void flush("farm-1", () => {
      notifyStarted?.();
      return new Promise<void>(() => {});
    });
    await started;

    const reclaimedCount = await reclaimStale("farm-1", -1);

    expect(reclaimedCount).toBe(1);
    expect((await getPending("farm-1")).map((i) => i.id)).toEqual(["stuck"]);

    const syncFn = vi.fn().mockResolvedValue(undefined);
    const result = await flush("farm-1", syncFn);
    expect(result.synced).toEqual(["stuck"]);
  });

  it("only reclaims 'syncing' items -- pending/failed/synced items are untouched and not double-counted", async () => {
    await enqueue(baseItem({ id: "already-pending" }));
    const reclaimedCount = await reclaimStale("farm-1", -1);
    expect(reclaimedCount).toBe(0);
  });

  it("only reclaims the requested farm's items", async () => {
    await enqueue(baseItem({ id: "a1", farmId: "farm-1" }));
    await enqueue(baseItem({ id: "b1", farmId: "farm-2" }));
    let notifyStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    void flush("farm-2", () => {
      notifyStarted?.();
      return new Promise<void>(() => {});
    });
    await started;

    const reclaimedCount = await reclaimStale("farm-1", -1);

    expect(reclaimedCount).toBe(0);
    expect((await getAll("farm-2"))[0].syncState).toBe("syncing");
  });
});

describe("claimToken-guarded completion", () => {
  it("a stale claim's late completion does not clobber a newer claim's already-synced state", async () => {
    await enqueue(baseItem());
    let releaseFirst: (() => void) | undefined;
    let notifyFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      notifyFirstStarted = resolve;
    });
    const firstStuck = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstSyncFn = vi.fn().mockImplementation(() => {
      notifyFirstStarted?.();
      return firstStuck;
    });
    const firstFlushPromise = flush("farm-1", firstSyncFn);
    await firstStarted;

    // The first claim is reclaimed as stale (its own tab is being
    // treated as abandoned) -- but its syncFn call above is, in this
    // test, still genuinely "running" (firstStuck has not resolved yet).
    const reclaimedCount = await reclaimStale("farm-1", -1);
    expect(reclaimedCount).toBe(1);

    // A second, later flush() legitimately re-claims and completes it.
    const secondSyncFn = vi.fn().mockResolvedValue(undefined);
    await flush("farm-1", secondSyncFn);
    expect((await getAll("farm-1"))[0].syncState).toBe("synced");

    // Now the FIRST attempt's syncFn finally resolves. Its own
    // completion write is keyed to its own (now-superseded) claimToken
    // and must be a no-op -- must NOT reset the item back to "syncing"
    // or otherwise clobber the second claim's already-synced state.
    releaseFirst?.();
    await firstFlushPromise;
    const finalState = await getAll("farm-1");
    expect(finalState).toHaveLength(1);
    expect(finalState[0].syncState).toBe("synced");
  });
});

describe("pruneSynced", () => {
  it("removes only synced items older than maxAgeMs, leaving pending/failed/recent-synced items untouched", async () => {
    // Real Date.now()-relative offsets, not vi.useFakeTimers() -- fake
    // timers replace setTimeout globally, which real IndexedDB request/
    // transaction event dispatch (even fake-indexeddb's faithful
    // implementation of it) can depend on internally, deadlocking the
    // test. pruneSynced's own cutoff logic only ever calls the real
    // Date.now(), so real relative timestamps exercise it identically
    // without needing to fake time at all.
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    await enqueue(baseItem({ id: "old-synced", enqueuedAt: twoDaysAgo }));
    await enqueue(baseItem({ id: "recent-synced", enqueuedAt: oneHourAgo }));
    // Old by enqueuedAt but never successfully synced (flush below makes
    // it "failed", not "synced") -- pruneSynced must leave it alone
    // regardless of age, since it only ever removes "synced" items.
    await enqueue(baseItem({ id: "old-but-unsynced", enqueuedAt: twoDaysAgo }));
    await flush("farm-1", async (item) => {
      if (item.id === "old-but-unsynced") throw new Error("still not synced");
    });

    const prunedCount = await pruneSynced("farm-1", 24 * 60 * 60 * 1000);

    expect(prunedCount).toBe(1);
    const remaining = await getAll("farm-1");
    expect(remaining.map((i) => i.id).sort()).toEqual(["old-but-unsynced", "recent-synced"]);
  });
});

describe("schema upgrade", () => {
  it("upgrades a real pre-existing v1 database (store + syncState index only, no farmId index) to v2 without losing data, and the farmId index works afterward", async () => {
    // Reproduces exactly the scenario Codex audit HIGH
    // (docs/farm-return-next/audit-logs/20260901T142804Z.md) named: a
    // real browser that already opened this database under the schema
    // before the farmId index/DB_VERSION fix shipped. Built directly
    // against the raw IndexedDB API with the literal v1 shape (not this
    // module's own openDb(), which now always creates both indexes) --
    // deliberately reproducing what a real earlier-shipped browser
    // database actually looked like.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("farm-return-outbox", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.createObjectStore("items", { keyPath: "id" });
        store.createIndex("syncState", "syncState", { unique: false });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("items", "readwrite");
        tx.objectStore("items").put({
          id: "pre-existing",
          type: "telemetry_event",
          farmId: "farm-1",
          payload: { lat: 52.5, lng: -7.9 },
          enqueuedAt: "2026-08-30T00:00:00.000Z",
          syncState: "pending",
          attempts: 0,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    // This module's own real openDb() (DB_VERSION 2) must upgrade this
    // v1 database in place, without throwing, and without losing the
    // pre-existing row -- reachable via the new farmId index afterward.
    const pending = await getPending("farm-1");
    expect(pending.map((i) => i.id)).toEqual(["pre-existing"]);
  });
});
