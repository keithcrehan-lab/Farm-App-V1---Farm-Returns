import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runCsoFertiliserSync } from "./cso-fertiliser-sync";
import { VALID_MINIMAL_CSV, VALID_MINIMAL_METADATA_JSON, MISSING_VALUE_CSV, ALL_ROWS_MALFORMED_CSV, INVALID_DECIMAL_CSV } from "./cso-fertiliser-parser.fixtures";
import type { InsertObservationsResult } from "./cso-fertiliser-repository";

const FAKE_CLIENT = {} as SupabaseClient;
// A deterministic stand-in that still satisfies createMarketPriceObservation's
// own "64-character lowercase hex" shape check — this test cares that the
// SAME real hash function (node:crypto sha256, exercised for real in
// market-evidence.test.ts) is wired through correctly, not about testing
// hashing itself here.
const STABLE_HASH = (input: string) => {
  let acc = 0;
  for (let i = 0; i < input.length; i++) acc = (acc * 31 + input.charCodeAt(i)) >>> 0;
  return acc.toString(16).padStart(8, "0").repeat(8);
};
const STABLE_BATCH_ID = () => "batch-1";

function okCsv(body: string) {
  return vi.fn().mockResolvedValue({ status: "ok", body, retrievedAt: "2026-09-20T12:00:00.000Z", url: "https://cso.example/ajm09" });
}
function unavailableCsv(reason = "network error") {
  return vi.fn().mockResolvedValue({ status: "unavailable", reason, retrievedAt: "2026-09-20T12:00:00.000Z", url: "https://cso.example/ajm09" });
}
function okMetadata() {
  return vi.fn().mockResolvedValue({ status: "ok", body: VALID_MINIMAL_METADATA_JSON, retrievedAt: "2026-09-20T12:00:00.000Z", url: "https://cso.example/meta" });
}
function unavailableMetadata() {
  return vi.fn().mockResolvedValue({ status: "unavailable", reason: "meta down", retrievedAt: "2026-09-20T12:00:00.000Z", url: "https://cso.example/meta" });
}

describe("runCsoFertiliserSync", () => {
  it("builds and inserts observations from a valid response, skipping nothing that has a real value", async () => {
    const insertMock = vi.fn().mockResolvedValue({ insertedCount: 2, skippedAsDuplicateCount: 0, inserted: [] } satisfies InsertObservationsResult);
    const result = await runCsoFertiliserSync(FAKE_CLIENT, {
      fetchCsv: okCsv(VALID_MINIMAL_CSV),
      fetchMetadata: okMetadata(),
      insert: insertMock,
      hash: STABLE_HASH,
      generateBatchId: STABLE_BATCH_ID,
    });
    expect(result.status).toBe("ok");
    expect(result.observationsBuilt).toBe(2);
    expect(result.insertedCount).toBe(2);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const insertedObservations = insertMock.mock.calls[0][1];
    expect(insertedObservations).toHaveLength(2);
    expect(insertedObservations[0].ingestionBatchId).toBe("batch-1");
  });

  it("17. external source unavailable: never calls insert, leaving stored observations untouched", async () => {
    const insertMock = vi.fn();
    const result = await runCsoFertiliserSync(FAKE_CLIENT, {
      fetchCsv: unavailableCsv("connection reset"),
      fetchMetadata: okMetadata(),
      insert: insertMock,
      hash: STABLE_HASH,
      generateBatchId: STABLE_BATCH_ID,
    });
    expect(result.status).toBe("source_unavailable");
    expect(result.reason).toBe("connection reset");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("unrecognised schema: never calls insert", async () => {
    const insertMock = vi.fn();
    const result = await runCsoFertiliserSync(FAKE_CLIENT, {
      fetchCsv: okCsv(ALL_ROWS_MALFORMED_CSV),
      fetchMetadata: okMetadata(),
      insert: insertMock,
      hash: STABLE_HASH,
      generateBatchId: STABLE_BATCH_ID,
    });
    expect(result.status).toBe("source_schema_unrecognised");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("a missing metadata fetch degrades gracefully — sourceUpdatedAt is null but the sync still succeeds", async () => {
    const insertMock = vi.fn().mockResolvedValue({ insertedCount: 2, skippedAsDuplicateCount: 0, inserted: [] } satisfies InsertObservationsResult);
    const result = await runCsoFertiliserSync(FAKE_CLIENT, {
      fetchCsv: okCsv(VALID_MINIMAL_CSV),
      fetchMetadata: unavailableMetadata(),
      insert: insertMock,
      hash: STABLE_HASH,
      generateBatchId: STABLE_BATCH_ID,
    });
    expect(result.status).toBe("ok");
    const insertedObservations = insertMock.mock.calls[0][1];
    expect(insertedObservations[0].sourceUpdatedAt).toBeNull();
  });

  it("a genuinely missing (empty) observation is skipped, never built as a fabricated zero", async () => {
    const insertMock = vi.fn().mockResolvedValue({ insertedCount: 1, skippedAsDuplicateCount: 0, inserted: [] } satisfies InsertObservationsResult);
    const result = await runCsoFertiliserSync(FAKE_CLIENT, {
      fetchCsv: okCsv(MISSING_VALUE_CSV),
      fetchMetadata: okMetadata(),
      insert: insertMock,
      hash: STABLE_HASH,
      generateBatchId: STABLE_BATCH_ID,
    });
    expect(result.observationsSkippedMissingValue).toBe(1);
    expect(result.observationsBuilt).toBe(1);
    const insertedObservations = insertMock.mock.calls[0][1];
    expect(insertedObservations.every((o: { price: { amount: string } }) => o.price.amount !== "0")).toBe(true);
  });

  it("18. a partially malformed retrieval builds only the valid rows — malformed rows never corrupt the valid batch", async () => {
    const insertMock = vi.fn().mockResolvedValue({ insertedCount: 1, skippedAsDuplicateCount: 0, inserted: [] } satisfies InsertObservationsResult);
    const result = await runCsoFertiliserSync(FAKE_CLIENT, {
      fetchCsv: okCsv(INVALID_DECIMAL_CSV),
      fetchMetadata: okMetadata(),
      insert: insertMock,
      hash: STABLE_HASH,
      generateBatchId: STABLE_BATCH_ID,
    });
    expect(result.status).toBe("ok");
    expect(result.observationsBuilt).toBe(1);
    expect(result.observationsRejectedByParser).toBe(1);
    const insertedObservations = insertMock.mock.calls[0][1];
    expect(insertedObservations).toHaveLength(1);
    expect(insertedObservations[0].sourceSeriesCode).toBe("008");
  });

  it("an unsupported product mapping is still built and inserted, but with a null mappedProduct — no fabricated product price", async () => {
    const insertMock = vi.fn().mockResolvedValue({ insertedCount: 1, skippedAsDuplicateCount: 0, inserted: [] } satisfies InsertObservationsResult);
    const csvWithUnsupportedCode = `"STATISTIC","Statistic Label","TLIST(M1)","Month","C02069V02500","Type of Fertiliser","UNIT","VALUE"\n"AJM09C01","Fertiliser Price","202607","2026 July","027","Compound 25-4-0","Euro per Tonne","608"\n`;
    const result = await runCsoFertiliserSync(FAKE_CLIENT, {
      fetchCsv: okCsv(csvWithUnsupportedCode),
      fetchMetadata: okMetadata(),
      insert: insertMock,
      hash: STABLE_HASH,
      generateBatchId: STABLE_BATCH_ID,
    });
    expect(result.status).toBe("ok");
    const insertedObservations = insertMock.mock.calls[0][1];
    expect(insertedObservations[0].mappingKind).toBe("UNSUPPORTED_MAPPING");
    expect(insertedObservations[0].mappedProduct).toBeNull();
  });
});
