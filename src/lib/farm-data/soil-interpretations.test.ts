import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Direct tests for `insertSoilInterpretation`'s own real
 * retry-safety/verify-before-trust logic (Codex audit CRITICAL, round 2
 * of the Fertiliser Vertical V1, Checkpoint 2 audit, 2026-09-12) —
 * mirrors `telemetry.test.ts`'s exact pattern (mocking
 * `@/lib/supabase/server` directly) for this specific class of function.
 */
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { insertSoilInterpretation, type NewSoilInterpretationInput } from "./soil-interpretations";
import type { SoilInterpretation } from "@/domain/soil-interpretation";

const mockCreateClient = vi.mocked(createClient);

const EXISTING_ROW = {
  id: "interp-existing",
  farm_id: "farm-1",
  lab_result_id: "lab-result-1",
  field_id: "field-1",
  methodology_version: "soil_interpretation_v1.0.0",
  p_index_status: "OK",
  p_index_value: 2,
  p_index_conservative_treatment: false,
  k_index_value: 2,
  ph: 6.3,
  lime_requirement_t_ha: null,
  crop_group: "grassland",
  soil_material: "mineral",
  calculated_at: "2026-09-13T10:00:00.000Z",
  created_at: "2026-09-13T10:00:00.000Z",
};

/** A fake of the one Supabase client shape this file needs: the initial
 * insert, and the `(lab_result_id, methodology_version)` lookup its
 * `23505`-recovery path performs. */
function makeFakeClient(options: {
  insertResult: { data: unknown; error: { code?: string; message?: string } | null };
  fetchResult?: { data: unknown; error: { message?: string } | null };
}) {
  const insertSingle = vi.fn().mockResolvedValue(options.insertResult);
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });

  const fetchMaybeSingle = vi.fn().mockResolvedValue(options.fetchResult ?? { data: null, error: null });
  const fetchEq2 = vi.fn().mockReturnValue({ maybeSingle: fetchMaybeSingle });
  const fetchEq1 = vi.fn().mockReturnValue({ eq: fetchEq2 });
  const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq1 });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "soil_interpretations") return { insert, select: fetchSelect };
    throw new Error(`unexpected table ${table}`);
  });

  return { from, insert, insertSelect, insertSingle, fetchSelect, fetchEq1, fetchEq2, fetchMaybeSingle };
}

function newInput(overrides: Partial<SoilInterpretation> = {}): NewSoilInterpretationInput {
  return {
    id: "interp-1",
    farmId: "farm-1",
    fieldId: "field-1",
    interpretation: {
      labResultId: "lab-result-1",
      methodologyVersion: "soil_interpretation_v1.0.0",
      calculatedAt: "2026-09-13T11:00:00.000Z", // deliberately different from EXISTING_ROW's — must never affect the match decision
      pIndexOutcome: { status: "OK", value: 2, evidenceState: "IRISH_MODEL" },
      pIndex: 2,
      pIndexConservativeTreatment: false,
      kIndex: 2,
      pH: 6.3,
      cropGroup: "grassland",
      soilMaterial: "mineral",
      ...overrides,
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("insertSoilInterpretation", () => {
  it("inserts and returns the new row on a genuine first attempt", async () => {
    const client = makeFakeClient({ insertResult: { data: EXISTING_ROW, error: null } });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertSoilInterpretation(newInput());

    expect(result.id).toBe(EXISTING_ROW.id);
    expect(client.fetchSelect).not.toHaveBeenCalled();
  });

  it("on a conflict, returns the existing row when its real content genuinely matches this call's own input — a safe resumed retry", async () => {
    const client = makeFakeClient({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: EXISTING_ROW, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertSoilInterpretation(newInput());

    expect(result.id).toBe(EXISTING_ROW.id);
    expect(result.pIndexValue).toBe(2);
  });

  it("CRITICAL fix: on a conflict, throws rather than trusting an existing row whose real content does not match — never silently accepts fabricated data", async () => {
    const tamperedRow = { ...EXISTING_ROW, p_index_value: 4, k_index_value: 4 }; // a different, unexplained classification
    const client = makeFakeClient({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: tamperedRow, error: null },
    });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertSoilInterpretation(newInput())).rejects.toThrow(/different content/);
  });

  it("never lets a difference in calculatedAt alone (the one field that legitimately differs between an original run and a resumed retry) cause a false mismatch", async () => {
    const client = makeFakeClient({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      fetchResult: { data: EXISTING_ROW, error: null }, // EXISTING_ROW.calculated_at !== newInput()'s calculatedAt
    });
    mockCreateClient.mockResolvedValue(client as never);

    const result = await insertSoilInterpretation(newInput());
    expect(result.id).toBe(EXISTING_ROW.id);
  });

  it("propagates a genuinely different database error unchanged", async () => {
    const client = makeFakeClient({ insertResult: { data: null, error: { message: "connection reset" } } });
    mockCreateClient.mockResolvedValue(client as never);

    await expect(insertSoilInterpretation(newInput())).rejects.toEqual({ message: "connection reset" });
  });
});
