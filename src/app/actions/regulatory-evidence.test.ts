import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/regulatory-evidence", async () => {
  class EvidenceRecordRejectedError extends Error {
    constructor(readonly errors: unknown[]) {
      super("rejected");
    }
  }
  class RegulatoryEvidenceNotAvailableError extends Error {}
  return { EvidenceRecordRejectedError, RegulatoryEvidenceNotAvailableError, createNeatSlurryEvidenceRecord: vi.fn(), createSpreadableAreaRecord: vi.fn() };
});

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import {
  EvidenceRecordRejectedError,
  RegulatoryEvidenceNotAvailableError,
  createNeatSlurryEvidenceRecord,
  createSpreadableAreaRecord,
} from "@/lib/farm-data/regulatory-evidence";
import { recordNeatSlurryDeclarationAction, recordSpreadableAreaDeclarationAction } from "./regulatory-evidence";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getFarmForCurrentUser).mockResolvedValue({ id: "farm-a" } as never);
});

describe("regulatory evidence declaration actions", () => {
  it("I: binds the write to the signed-in user's farm and records a farmer declaration — never verified", async () => {
    vi.mocked(createNeatSlurryEvidenceRecord).mockResolvedValue({ id: "n1" } as never);
    const result = await recordNeatSlurryDeclarationAction({ housingId: "h1", neatVolumeM3: 0, effectiveDate: "2026-09-28" });
    expect(result).toEqual({ status: "saved", record: { id: "n1" } });
    expect(createNeatSlurryEvidenceRecord).toHaveBeenCalledWith("farm-a", {
      housingId: "h1",
      status: "farmer_adjusted",
      neatVolumeM3: 0,
      effectiveDate: "2026-09-28",
      source: "Farmer declaration on the housing screen",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/housing");
  });

  it("F: no volume is recorded as 'no figure' (unavailable), never as zero", async () => {
    vi.mocked(createNeatSlurryEvidenceRecord).mockResolvedValue({ id: "n1" } as never);
    await recordNeatSlurryDeclarationAction({ housingId: "h1", effectiveDate: "2026-09-28" });
    const sent = vi.mocked(createNeatSlurryEvidenceRecord).mock.calls[0][1];
    expect(sent).toMatchObject({ status: "unavailable" });
    expect(sent).not.toHaveProperty("neatVolumeM3");
  });

  it("spreadable area: always a farmer declaration on the signed-in farm", async () => {
    vi.mocked(createSpreadableAreaRecord).mockResolvedValue({ id: "a1" } as never);
    await recordSpreadableAreaDeclarationAction({ fieldId: "f1", spreadableAreaHa: 3.5, effectiveDate: "2026-09-28", note: "Excludes yard" });
    expect(createSpreadableAreaRecord).toHaveBeenCalledWith("farm-a", {
      fieldId: "f1",
      status: "farmer_adjusted",
      spreadableAreaHa: 3.5,
      effectiveDate: "2026-09-28",
      source: "Farmer declaration on the field's constraints",
      note: "Excludes yard",
    });
  });

  it("H/Q: refusals and an unapplied migration are returned, nothing is revalidated as saved", async () => {
    vi.mocked(createSpreadableAreaRecord).mockRejectedValue(new EvidenceRecordRejectedError([{ field: "spreadableAreaHa", message: "Too big" }]));
    expect(await recordSpreadableAreaDeclarationAction({ fieldId: "f1", spreadableAreaHa: 9, effectiveDate: "2026-09-28" })).toEqual({
      status: "rejected",
      errors: [{ field: "spreadableAreaHa", message: "Too big" }],
    });
    vi.mocked(createNeatSlurryEvidenceRecord).mockRejectedValue(new RegulatoryEvidenceNotAvailableError());
    expect(await recordNeatSlurryDeclarationAction({ housingId: "h1", neatVolumeM3: 5, effectiveDate: "2026-09-28" })).toEqual({ status: "not_available" });
    expect(revalidatePath).not.toHaveBeenCalled();
    vi.mocked(createNeatSlurryEvidenceRecord).mockRejectedValue(new Error("boom"));
    await expect(recordNeatSlurryDeclarationAction({ housingId: "h1", neatVolumeM3: 5, effectiveDate: "2026-09-28" })).rejects.toThrow("boom");
  });

  it("I: no signed-in farm, no write", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(null as never);
    await expect(recordSpreadableAreaDeclarationAction({ fieldId: "f1", spreadableAreaHa: 1, effectiveDate: "2026-09-28" })).rejects.toThrow();
    expect(createSpreadableAreaRecord).not.toHaveBeenCalled();
  });
});
