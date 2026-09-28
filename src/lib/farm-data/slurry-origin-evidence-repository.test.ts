import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `createSlurryOriginEvidenceRecord` — the one write path for origin
 * declarations. Only the database is faked: the insert payload never
 * carries the plan snapshot or capture provenance (database-stamped), and
 * database refusals come back as plain issue codes.
 */
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { SlurryOriginEvidenceRejectedError, createSlurryOriginEvidenceRecord } from "./regulatory-evidence";

const mockCreateClient = vi.mocked(createClient);
afterEach(() => vi.clearAllMocks());

const INPUT = { allocationId: "sa-1", planRevision: 3, origin: "imported_organic_manure" as const, status: "farmer_adjusted" as const, source: " Farmer declaration " };

function client(result: { data: unknown; error: { code?: string; message?: string } | null }) {
  const insert = vi.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve(result) }) });
  mockCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as never);
  return insert;
}

describe("createSlurryOriginEvidenceRecord", () => {
  it("sends only the declaration and the revision seen — never the snapshot or actor — and maps the stamped row back", async () => {
    const insert = client({
      data: {
        id: "o1",
        farm_id: "farm-1",
        allocation_id: "sa-1",
        origin: "imported_organic_manure",
        status: "farmer_adjusted",
        source: "Farmer declaration",
        note: null,
        plan_revision_at_record: 3,
        field_id_at_record: "field-1",
        housing_id_at_record: "housing-1",
        volume_m3_at_record: 45,
        created_by: "user-1",
        created_at: "2026-09-28T10:00:00Z",
      },
      error: null,
    });
    const record = await createSlurryOriginEvidenceRecord("farm-1", INPUT);
    expect(insert).toHaveBeenCalledWith({
      farm_id: "farm-1",
      allocation_id: "sa-1",
      origin: "imported_organic_manure",
      status: "farmer_adjusted",
      source: "Farmer declaration",
      note: null,
      plan_revision_at_record: 3,
    });
    expect(record).toMatchObject({ origin: "imported_organic_manure", planRevisionAtRecord: 3, volumeM3AtRecord: 45, recordedBy: "user-1", recordedAt: "2026-09-28T10:00:00Z" });
  });

  it("invalid input is refused before reaching the database", async () => {
    const insert = client({ data: null, error: null });
    await expect(createSlurryOriginEvidenceRecord("farm-1", { ...INPUT, origin: "store_owner" as never })).rejects.toBeInstanceOf(SlurryOriginEvidenceRejectedError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("database refusals (plan changed, no longer planned, not found) come back as issue codes", async () => {
    for (const code of ["PLAN_CHANGED", "NOT_PLANNED", "ALLOCATION_NOT_FOUND"]) {
      client({ data: null, error: { code: "23514", message: `slurry_origin_evidence_rejected:${code}` } });
      await expect(createSlurryOriginEvidenceRecord("farm-1", INPUT)).rejects.toMatchObject({ issues: [code] });
    }
  });

  it("an unapplied migration is 'not available' — never a silent success", async () => {
    client({ data: null, error: { code: "42P01", message: "relation does not exist" } });
    await expect(createSlurryOriginEvidenceRecord("farm-1", INPUT)).rejects.toMatchObject({ issues: ["NOT_AVAILABLE"] });
  });

  it("any other database error is thrown as is", async () => {
    client({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(createSlurryOriginEvidenceRecord("farm-1", INPUT)).rejects.toMatchObject({ code: "42501" });
  });
});
