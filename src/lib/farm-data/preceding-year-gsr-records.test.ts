import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Codex audit F003 (CRITICAL) — concurrent saves of the preceding-year
 * grassland stocking rate must never erase earlier evidence. Only the
 * database is faked: an in-memory insert-only table whose inserts yield
 * before committing, so two saves genuinely interleave. The previous
 * read-then-replace of `farms.preceding_year_gsr_records` lost the first
 * of two interleaved saves; each save is now one INSERT.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { appendPrecedingYearGsrRecordForCurrentUser, getFarmForCurrentUser } from "./farms";
import { resolvePrecedingYearGsr, type PrecedingYearGsrRecord } from "@/domain/preceding-year-gsr";

const mockCreateClient = vi.mocked(createClient);
afterEach(() => vi.clearAllMocks());

const FARM_ROW = {
  id: "farm-1",
  user_id: "user-1",
  name: "Home farm",
  county: "Cork",
  centroid_lng: -8.5,
  centroid_lat: 52,
  primary_enterprises: ["beef"],
  units: "metric",
  owner_name: "Farmer",
  onboarding_completed_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

type Row = Record<string, unknown>;

/** An in-memory Supabase: `farms` (one row, optionally with legacy JSON
 * records) and the insert-only `farm_preceding_year_gsr_records`, whose
 * capture time is stamped at commit like the database trigger
 * (clock_timestamp()). */
function fakeDatabase(options: { legacy?: PrecedingYearGsrRecord[]; sameMillisecond?: boolean; preMigrationRows?: Row[] } = {}) {
  const gsrRows: Row[] = [...(options.preMigrationRows ?? [])];
  const farmUpdates: Row[] = [];
  let clock = Date.parse("2026-11-03T10:00:00.000Z");
  let micros = 123_100;
  let nextId = 1;
  // The `record_order` sequence and its BEFORE INSERT trigger.
  let sequence = 0;

  const query = (table: string) => {
    const filters: [string, unknown][] = [];
    const rows = (): Row[] => {
      const source = table === "farms" ? [{ ...FARM_ROW, preceding_year_gsr_records: options.legacy ?? [] }] : gsrRows;
      return source.filter((row) => filters.every(([key, value]) => row[key] === value));
    };
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      single: async () => ({ data: rows()[0] ?? null, error: rows()[0] ? null : { code: "PGRST116" } }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: [...rows()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))), error: null }),
      insert: async (row: Row) => {
        // Yield first: the other save's insert runs before this one commits.
        await new Promise((resolve) => setTimeout(resolve, 0));
        let createdAt: string;
        if (options.sameMillisecond) {
          // PostgreSQL's microsecond timestamptz text: distinct instants
          // inside one JS millisecond (.123100, .123900, ...).
          createdAt = `2026-11-03 10:00:00.${String(micros).padStart(6, "0")}+00`;
          micros += 800;
        } else {
          clock += 1;
          createdAt = new Date(clock).toISOString();
        }
        // The trigger overrides any client-sent order.
        gsrRows.push({ ...row, id: `gsr-${nextId++}`, created_by: "user-1", created_at: createdAt, record_order: ++sequence });
        return { error: null };
      },
      update: (patch: Row) => {
        farmUpdates.push(patch);
        return builder;
      },
    };
    return builder;
  };

  mockCreateClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: query,
  } as never);
  return { gsrRows, farmUpdates };
}

const input = (gsrKgNHa: number, source: string) => ({
  referenceYear: "2026",
  gsrKgNHa,
  status: "verified" as const,
  source,
  recordedBy: "Farmer",
});

describe("F003: preceding-year stocking-rate evidence is insert-only", () => {
  it("two interleaved saves both survive, and the later correction governs", async () => {
    const db = fakeDatabase();
    await Promise.all([
      appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(120, "DAFM Nitrates Statement 2026")),
      appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(95, "DAFM Nitrates Statement 2026 (corrected)")),
    ]);
    expect(db.gsrRows).toHaveLength(2);
    // The shared farms row is never rewritten.
    expect(db.farmUpdates).toEqual([]);

    const farm = await getFarmForCurrentUser();
    const records = farm?.precedingYearGsrRecords ?? [];
    expect(records.map((record) => record.gsrKgNHa).sort()).toEqual([120, 95].sort());
    // Capture time is the database's, so the save that committed last wins.
    const resolved = resolvePrecedingYearGsr(records, "2027-03-01");
    expect(resolved).toMatchObject({ status: "RESOLVED", gsrKgNHa: 95, source: "DAFM Nitrates Statement 2026 (corrected)" });
  });

  it("a later correction in a separate save remains effective, and the superseded record is kept", async () => {
    fakeDatabase();
    await appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(120, "First"));
    const farm = await appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(80, "Correction"));
    expect(farm.precedingYearGsrRecords?.map((r) => r.gsrKgNHa)).toEqual([120, 80]);
    expect(resolvePrecedingYearGsr(farm.precedingYearGsrRecords ?? [], "2027-03-01")).toMatchObject({ gsrKgNHa: 80 });
  });

  it("records already held in the legacy farms column are still read, merged by id", async () => {
    const legacy: PrecedingYearGsrRecord = {
      id: "legacy-1",
      referenceYear: "2025",
      gsrKgNHa: 140,
      status: "verified",
      source: "DAFM Nitrates Statement 2025",
      recordedAt: "2026-02-01T09:00:00.000Z",
    };
    fakeDatabase({ legacy: [legacy] });
    const farm = await appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(90, "DAFM Nitrates Statement 2026"));
    expect(farm.precedingYearGsrRecords?.map((r) => r.id)).toEqual(["legacy-1", "gsr-1"]);
  });

  it("the insert sends only the declaration — capture time and id are the database's", async () => {
    const db = fakeDatabase();
    await appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(90, "Statement"));
    expect(Object.keys(db.gsrRows[0]).sort()).toEqual(
      ["created_at", "created_by", "farm_id", "gsr_kg_n_ha", "id", "record_order", "recorded_by", "reference_year", "source", "status"].sort(),
    );
    expect(db.gsrRows[0].record_order).toBe(1);
  });

  it("F003: two corrections committed in the same millisecond — the later database order governs, with its own provenance", async () => {
    fakeDatabase({ sameMillisecond: true });
    await appendPrecedingYearGsrRecordForCurrentUser("farm-1", { ...input(120, "Farmer estimate"), status: "farmer_adjusted" });
    const farm = await appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(95, "DAFM Nitrates Statement 2026 (corrected)"));
    const records = farm.precedingYearGsrRecords ?? [];
    expect(new Set(records.map((record) => Date.parse(record.recordedAt))).size).toBe(1);
    expect(records.map((record) => record.recordOrder)).toEqual([1, 2]);
    expect(resolvePrecedingYearGsr(records, "2027-03-01")).toMatchObject({
      status: "RESOLVED",
      gsrKgNHa: 95,
      evidenceStatus: "verified",
      source: "DAFM Nitrates Statement 2026 (corrected)",
      orderBasis: "DATABASE_RECORD_ORDER",
    });
  });

  it("F003: concurrent same-millisecond saves stay lossless and are never a false conflict", async () => {
    const db = fakeDatabase({ sameMillisecond: true });
    await Promise.all([
      appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(120, "A")),
      appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(95, "B")),
      appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(80, "C")),
    ]);
    expect(db.gsrRows).toHaveLength(3);
    expect(new Set(db.gsrRows.map((row) => row.record_order)).size).toBe(3);
    const records = (await getFarmForCurrentUser())?.precedingYearGsrRecords ?? [];
    const last = db.gsrRows.find((row) => row.record_order === 3);
    expect(resolvePrecedingYearGsr(records, "2027-03-01")).toMatchObject({ status: "RESOLVED", recordId: last?.id, orderBasis: "DATABASE_RECORD_ORDER" });
  });

  it("F003: an order claimed by the farmer-writable legacy JSON is discarded; table rows without an order fall back to recorded time", async () => {
    const forgedLegacy = { id: "legacy-forged", referenceYear: "2026", gsrKgNHa: 10, status: "verified" as const, source: "Forged", recordedAt: "2027-01-01T00:00:00.000Z", recordOrder: 1e12 };
    fakeDatabase({ legacy: [forgedLegacy] });
    const farm = await appendPrecedingYearGsrRecordForCurrentUser("farm-1", input(95, "Statement"));
    const legacy = farm.precedingYearGsrRecords?.find((record) => record.id === "legacy-forged");
    expect(legacy?.recordOrder).toBeUndefined();
    expect(resolvePrecedingYearGsr(farm.precedingYearGsrRecords ?? [], "2027-03-01")).toMatchObject({ gsrKgNHa: 95, orderBasis: "DATABASE_RECORD_ORDER" });

    // A row inserted before the order migration has record_order null.
    fakeDatabase({
      preMigrationRows: [
        { id: "pre-1", farm_id: "farm-1", reference_year: "2026", gsr_kg_n_ha: 130, status: "verified", source: "Pre", recorded_by: null, created_at: "2026-10-01 09:00:00.000000+00", record_order: null },
      ],
    });
    const pre = (await getFarmForCurrentUser())?.precedingYearGsrRecords ?? [];
    expect(pre[0].recordOrder).toBeUndefined();
    expect(resolvePrecedingYearGsr(pre, "2027-03-01")).toMatchObject({ gsrKgNHa: 130, orderBasis: "LEGACY_RECORDED_AT" });
  });
});
