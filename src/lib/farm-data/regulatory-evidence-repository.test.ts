import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Campaign B minimal evidence UX — the two write paths the farmer's
 * declarations use (`createNeatSlurryEvidenceRecord`,
 * `createSpreadableAreaRecord`). Only the database is faked: the store/field
 * must be on the signed-in farm, capture provenance comes back from the
 * database (never the client), an unapplied migration is "not available",
 * and an area above the field's size is refused — never clamped.
 */
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import {
  EvidenceRecordRejectedError,
  RegulatoryEvidenceNotAvailableError,
  createNeatSlurryEvidenceRecord,
  createSpreadableAreaRecord,
} from "./regulatory-evidence";

const mockCreateClient = vi.mocked(createClient);
afterEach(() => vi.clearAllMocks());

const TODAY = new Date().toISOString().slice(0, 10);

type Result = { data: unknown; error: { code?: string; message?: string } | null };

/** A fake client: the farm-scoped lookup of the store/field (`lookup`) and
 * the insert result. Records every `.eq` filter on the lookup. */
function client(lookup: Result, insertResult: Result) {
  const eqs: [string, unknown][] = [];
  const insert = vi.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve(insertResult) }) });
  const lookupChain = {
    select: () => lookupChain,
    eq: (col: string, value: unknown) => {
      eqs.push([col, value]);
      return lookupChain;
    },
    maybeSingle: () => Promise.resolve(lookup),
  };
  const from = vi.fn((table: string) => (table === "housing" || table === "fields" ? lookupChain : { insert }));
  mockCreateClient.mockResolvedValue({ from, auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) } } as never);
  return { insert, eqs, from };
}

const NEAT_ROW = {
  id: "n1",
  farm_id: "farm-1",
  housing_id: "h1",
  status: "farmer_adjusted",
  neat_volume_m3: "0",
  effective_date: TODAY,
  source: "Farmer declaration on the housing screen",
  note: null,
  created_by: "user-1",
  created_at: `${TODAY}T10:00:00Z`,
};

const AREA_ROW = {
  id: "a1",
  farm_id: "farm-1",
  field_id: "f1",
  status: "farmer_adjusted",
  spreadable_area_ha: "3.5",
  gross_area_ha_at_record: 4,
  effective_date: TODAY,
  source: "Farmer declaration on the field's constraints",
  note: null,
  created_by: "user-1",
  created_at: `${TODAY}T10:00:00Z`,
};

const NEAT_INPUT = { housingId: "h1", status: "farmer_adjusted" as const, neatVolumeM3: 0, effectiveDate: TODAY, source: "Farmer declaration on the housing screen" };
const AREA_INPUT = { fieldId: "f1", status: "farmer_adjusted" as const, spreadableAreaHa: 3.5, effectiveDate: TODAY, source: "Farmer declaration on the field's constraints" };

describe("createNeatSlurryEvidenceRecord", () => {
  it("I/R: checks the store is on this farm, inserts a new record and maps back the database-stamped actor and capture time; explicit zero kept (E)", async () => {
    const { insert, eqs } = client({ data: { id: "h1" }, error: null }, { data: NEAT_ROW, error: null });
    const record = await createNeatSlurryEvidenceRecord("farm-1", NEAT_INPUT);
    expect(eqs).toEqual([
      ["id", "h1"],
      ["farm_id", "farm-1"],
    ]);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ farm_id: "farm-1", housing_id: "h1", neat_volume_m3: 0, status: "farmer_adjusted" }));
    expect(insert.mock.calls[0][0]).not.toHaveProperty("created_at");
    expect(record).toMatchObject({ neatVolumeM3: 0, recordedBy: "user-1", recordedAt: `${TODAY}T10:00:00Z` });
  });

  it("I: a store that is not on this farm is refused before any insert", async () => {
    const { insert } = client({ data: null, error: null }, { data: null, error: null });
    await expect(createNeatSlurryEvidenceRecord("farm-1", NEAT_INPUT)).rejects.toMatchObject({ errors: [{ field: "housingId" }] });
    expect(insert).not.toHaveBeenCalled();
  });

  it("F: 'no figure' is sent with no volume — never zero", async () => {
    const { insert } = client({ data: { id: "h1" }, error: null }, { data: { ...NEAT_ROW, status: "unavailable", neat_volume_m3: null }, error: null });
    const record = await createNeatSlurryEvidenceRecord("farm-1", { ...NEAT_INPUT, status: "unavailable", neatVolumeM3: undefined });
    expect(insert.mock.calls[0][0]).toMatchObject({ status: "unavailable", neat_volume_m3: null });
    expect(record.neatVolumeM3).toBeUndefined();
  });

  it("H: an unapplied migration is 'not available', never a saved record; RLS refusal is a rejection; other errors throw", async () => {
    client({ data: { id: "h1" }, error: null }, { data: null, error: { code: "42P01", message: "relation does not exist" } });
    await expect(createNeatSlurryEvidenceRecord("farm-1", NEAT_INPUT)).rejects.toBeInstanceOf(RegulatoryEvidenceNotAvailableError);
    client({ data: { id: "h1" }, error: null }, { data: null, error: { code: "PGRST205", message: "not in schema cache" } });
    await expect(createNeatSlurryEvidenceRecord("farm-1", NEAT_INPUT)).rejects.toBeInstanceOf(RegulatoryEvidenceNotAvailableError);
    client({ data: { id: "h1" }, error: null }, { data: null, error: { code: "42501", message: "new row violates row-level security policy" } });
    await expect(createNeatSlurryEvidenceRecord("farm-1", NEAT_INPUT)).rejects.toBeInstanceOf(EvidenceRecordRejectedError);
    client({ data: { id: "h1" }, error: null }, { data: null, error: { code: "08006", message: "connection failure" } });
    await expect(createNeatSlurryEvidenceRecord("farm-1", NEAT_INPUT)).rejects.toMatchObject({ code: "08006" });
  });
});

describe("createSpreadableAreaRecord", () => {
  it("L/R: reads the gross area farm-scoped, never sends it, and maps back the database-stamped provenance", async () => {
    const { insert, eqs } = client({ data: { area_ha: 4 }, error: null }, { data: AREA_ROW, error: null });
    const record = await createSpreadableAreaRecord("farm-1", AREA_INPUT);
    expect(eqs).toEqual([
      ["id", "f1"],
      ["farm_id", "farm-1"],
    ]);
    expect(insert.mock.calls[0][0]).not.toHaveProperty("gross_area_ha_at_record");
    expect(record).toMatchObject({ spreadableAreaHa: 3.5, grossAreaHaAtRecord: 4, recordedBy: "user-1", recordedAt: `${TODAY}T10:00:00Z` });
  });

  it("N: an explicit zero is sent as zero", async () => {
    const { insert } = client({ data: { area_ha: 4 }, error: null }, { data: { ...AREA_ROW, spreadable_area_ha: "0" }, error: null });
    const record = await createSpreadableAreaRecord("farm-1", { ...AREA_INPUT, spreadableAreaHa: 0 });
    expect(insert.mock.calls[0][0]).toMatchObject({ spreadable_area_ha: 0 });
    expect(record.spreadableAreaHa).toBe(0);
  });

  it("O: more than the field's gross area is refused before any insert — never clamped", async () => {
    const { insert } = client({ data: { area_ha: 4 }, error: null }, { data: null, error: null });
    await expect(createSpreadableAreaRecord("farm-1", { ...AREA_INPUT, spreadableAreaHa: 4.01 })).rejects.toMatchObject({
      errors: [{ field: "spreadableAreaHa" }],
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("O: the database's own gross-area refusal (area changed meanwhile) is a rejection", async () => {
    client({ data: { area_ha: 4 }, error: null }, { data: null, error: { code: "23514", message: "field_spreadable_area_rejected:EXCEEDS_GROSS_AREA" } });
    await expect(createSpreadableAreaRecord("farm-1", AREA_INPUT)).rejects.toMatchObject({ errors: [{ field: "spreadableAreaHa" }] });
  });

  it("I: a field that is not on this farm is refused before any insert", async () => {
    const { insert } = client({ data: null, error: null }, { data: null, error: null });
    await expect(createSpreadableAreaRecord("farm-1", AREA_INPUT)).rejects.toMatchObject({ errors: [{ field: "fieldId" }] });
    expect(insert).not.toHaveBeenCalled();
  });

  it("Q: an unapplied migration is 'not available', never a saved record", async () => {
    client({ data: { area_ha: 4 }, error: null }, { data: null, error: { code: "42P01", message: "relation does not exist" } });
    await expect(createSpreadableAreaRecord("farm-1", AREA_INPUT)).rejects.toBeInstanceOf(RegulatoryEvidenceNotAvailableError);
  });
});
