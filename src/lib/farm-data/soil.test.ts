import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint B (Codex audit round
 * 6 CRITICAL) — direct tests for `addSoilTestToField`'s own real
 * optimistic-concurrency retry loop, following the established
 * "mock `@/lib/supabase/server` directly" precedent
 * (`decisions.test.ts`/`job-actuals.test.ts`) since the defect and its
 * fix live entirely inside this file's own Supabase-calling logic.
 *
 * Real call sequence per attempt:
 * 1. `fields.select("*").eq("id", fieldId).single()` — read.
 * 2. `fields.update({fertility}).eq("id", fieldId).eq("updated_at", <the
 *    value just read>).select("*").maybeSingle()` — the CAS write.
 *    `data === null` (never a thrown error) means the CAS lost the race
 *    and the loop retries from a fresh read.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { addSoilTestToField, type NewSoilTestInput } from "./soil";
import type { FieldRow } from "./row-types";

const mockCreateClient = vi.mocked(createClient);

afterEach(() => {
  vi.clearAllMocks();
});

function fieldRow(overrides: Partial<FieldRow> = {}): FieldRow {
  return {
    id: "field-1",
    farm_id: "farm-1",
    name: "Back Meadow",
    area_ha: 4.2,
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
    updated_at: "2026-06-01T09:00:00Z",
    ...overrides,
  };
}

const INPUT: NewSoilTestInput = {
  sampleDate: "2026-06-01",
  laboratory: "Southern Agri Labs",
  sampleRef: "SAL-2026-0113",
  p: 6.72,
  k: 88.4,
  pH: 6.4,
};

/** Queues one result per real Supabase call, consumed strictly in the
 * order this file's own real code issues them — `selectResults[i]`
 * feeds the i-th read, `updateResults[i]` the i-th CAS write. */
function makeFakeClient(selectResults: { data: unknown; error: unknown }[], updateResults: { data: unknown; error: unknown }[]) {
  let selectIndex = 0;
  let updateIndex = 0;

  const single = vi.fn().mockImplementation(() => {
    if (selectIndex >= selectResults.length) throw new Error("test setup: ran out of queued select results");
    return Promise.resolve(selectResults[selectIndex++]);
  });
  const selectEq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq: selectEq });

  const maybeSingle = vi.fn().mockImplementation(() => {
    if (updateIndex >= updateResults.length) throw new Error("test setup: ran out of queued update results");
    return Promise.resolve(updateResults[updateIndex++]);
  });
  const updateSelect = vi.fn().mockReturnValue({ maybeSingle });
  const updateEqUpdatedAt = vi.fn().mockReturnValue({ select: updateSelect });
  const updateEqId = vi.fn().mockReturnValue({ eq: updateEqUpdatedAt });
  const update = vi.fn().mockReturnValue({ eq: updateEqId });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table !== "fields") throw new Error(`unexpected table ${table}`);
    return { select, update };
  });

  return { from, select, selectEq, single, update, updateEqId, updateEqUpdatedAt, updateSelect, maybeSingle };
}

describe("addSoilTestToField — optimistic concurrency (Codex audit round 6 CRITICAL)", () => {
  it("writes on the first attempt when no concurrent update happened — a genuine single read-then-write", async () => {
    const row1 = fieldRow();
    const updatedRow = fieldRow({ updated_at: "2026-06-01T09:00:01Z" });
    const client = makeFakeClient([{ data: row1, error: null }], [{ data: updatedRow, error: null }]);
    mockCreateClient.mockResolvedValue(client as never);

    const result = await addSoilTestToField("field-1", INPUT);

    expect(result.id).toBe("field-1");
    expect(client.select).toHaveBeenCalledTimes(1);
    expect(client.update).toHaveBeenCalledTimes(1);
    // The CAS write is conditioned on the exact `updated_at` just read —
    // never a blind unconditional overwrite.
    expect(client.updateEqUpdatedAt).toHaveBeenCalledWith("updated_at", row1.updated_at);
  });

  // The real defect this round closes: a lost CAS race (another real
  // write landed between this call's own read and write) must retry
  // from a FRESH read, never silently overwrite the winner or discard
  // this real submission.
  it("retries from a fresh read when the first CAS write loses to a genuine concurrent update, and never loses either submission", async () => {
    const staleRow = fieldRow({ updated_at: "2026-06-01T09:00:00Z" });
    // The row as it now genuinely exists after a concurrent write landed
    // first — a different verifiedTest already applied by that winner.
    const freshRow = fieldRow({
      updated_at: "2026-06-01T09:05:00Z",
      fertility: { verifiedTest: { sampleDate: "2026-05-01", laboratory: "Other Lab", sampleRef: "OTHER-1", p: 5, k: 80, pH: 6.0 } },
    });
    const finalRow = fieldRow({ updated_at: "2026-06-01T09:05:01Z" });

    const client = makeFakeClient(
      [{ data: staleRow, error: null }, { data: freshRow, error: null }],
      // Attempt 1's CAS write loses the race (data: null, no error) —
      // attempt 2's CAS write (conditioned on freshRow's own updated_at)
      // succeeds.
      [{ data: null, error: null }, { data: finalRow, error: null }],
    );
    mockCreateClient.mockResolvedValue(client as never);

    const result = await addSoilTestToField("field-1", INPUT);

    expect(result.id).toBe("field-1");
    expect(client.select).toHaveBeenCalledTimes(2); // fresh re-read happened
    expect(client.update).toHaveBeenCalledTimes(2);
    // Attempt 2's CAS write was conditioned on the FRESH row's own
    // updated_at, not the stale one from attempt 1 — proves the retry
    // genuinely re-read rather than blindly re-submitting the same CAS
    // token (which would deterministically lose again).
    expect(client.updateEqUpdatedAt).toHaveBeenNthCalledWith(1, "updated_at", staleRow.updated_at);
    expect(client.updateEqUpdatedAt).toHaveBeenNthCalledWith(2, "updated_at", freshRow.updated_at);
    // This real submission's own new lab result (SAL-2026-0113) must
    // still have been chained onto the FRESH real history (OTHER-1),
    // never onto the stale, now-outdated one — proves the real
    // concurrent submission was not silently lost/overwritten.
    const secondUpdateCallArgs = client.update.mock.calls[1][0] as { fertility: { verifiedTest: { sampleRef: string; previous?: { sampleRef: string } } } };
    expect(secondUpdateCallArgs.fertility.verifiedTest.sampleRef).toBe("SAL-2026-0113");
    expect(secondUpdateCallArgs.fertility.verifiedTest.previous?.sampleRef).toBe("OTHER-1");
  });

  it("throws a real, honest error after exhausting every retry — never loops forever or silently gives up returning a stale value", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => fieldRow({ updated_at: `2026-06-01T09:0${i}:00Z` }));
    const client = makeFakeClient(
      rows.map((r) => ({ data: r, error: null })),
      Array.from({ length: 5 }, () => ({ data: null, error: null })), // every CAS write loses
    );
    mockCreateClient.mockResolvedValue(client as never);

    await expect(addSoilTestToField("field-1", INPUT)).rejects.toThrow(/updated by another real submission/i);
    expect(client.select).toHaveBeenCalledTimes(5);
    expect(client.update).toHaveBeenCalledTimes(5);
  });

  it("propagates a genuine read error immediately, without attempting a write", async () => {
    const client = makeFakeClient([{ data: null, error: { message: "connection lost" } }], []);
    mockCreateClient.mockResolvedValue(client as never);

    await expect(addSoilTestToField("field-1", INPUT)).rejects.toEqual({ message: "connection lost" });
    expect(client.update).not.toHaveBeenCalled();
  });

  it("propagates a genuine write error (not a lost-race null) immediately, without retrying", async () => {
    const row1 = fieldRow();
    const client = makeFakeClient([{ data: row1, error: null }], [{ data: null, error: { message: "constraint violation" } }]);
    mockCreateClient.mockResolvedValue(client as never);

    await expect(addSoilTestToField("field-1", INPUT)).rejects.toEqual({ message: "constraint violation" });
    expect(client.select).toHaveBeenCalledTimes(1); // no retry on a real error
  });
});
