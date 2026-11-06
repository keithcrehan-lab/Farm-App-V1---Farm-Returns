import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tracked, type Field } from "@/domain/types";
import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/field-production-cycles", () => ({
  getFieldProductionCycle: vi.fn(),
  insertFieldProductionCycleIfAbsent: vi.fn(),
  listFieldProductionCyclesForSeason: vi.fn(),
  upsertFieldProductionCycle: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import {
  getFieldProductionCycle,
  insertFieldProductionCycleIfAbsent,
  listFieldProductionCyclesForSeason,
  upsertFieldProductionCycle,
} from "@/lib/farm-data/field-production-cycles";
import { carryForwardFieldCyclesAction, previewBulkProductionCyclesAction, setBulkFieldCropSystemAction } from "./bulk-production-cycles";

const farm = { id: "farm-1", ownerName: "Keith" } as Awaited<ReturnType<typeof getFarmForCurrentUser>>;

function field(id: string, overrides: Partial<Field> = {}): Field {
  return {
    id,
    farmId: "farm-1",
    name: `Field ${id}`,
    areaHa: 4,
    centroid: [-8, 53],
    fertility: {
      pIndex: tracked(2, "verified", "Lab"),
      kIndex: tracked(3, "verified", "Lab"),
      verifiedTest: { sampleDate: "2026-01-10", laboratory: "Lab", sampleRef: "S1", p: 4, k: 90, pH: 6.3 },
    },
    history: [],
    ...overrides,
  };
}

function cycle(fieldId: string, season: string, overrides: Partial<FieldProductionCycle> = {}): FieldProductionCycle {
  return {
    id: `${fieldId}-${season}`,
    fieldId,
    season,
    cropSystem: "GRASS_GRAZING",
    status: "active",
    evidence: { cropSystem: { value: "GRASS_GRAZING", method: "FARMER_DECLARED", source: "Keith" } },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Stored cycles by `${fieldId}:${season}`, read by the mocked data layer. */
let stored: Record<string, FieldProductionCycle>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date("2026-11-06T10:00:00.000Z"), toFake: ["Date"] });
  stored = {};
  vi.mocked(getFarmForCurrentUser).mockResolvedValue(farm);
  vi.mocked(listFieldsForFarm).mockResolvedValue([field("a"), field("b"), field("c")]);
  vi.mocked(getFieldProductionCycle).mockImplementation(async (fieldId, season) => stored[`${fieldId}:${season}`] ?? null);
  vi.mocked(listFieldProductionCyclesForSeason).mockImplementation(async (ids, season) => ids.flatMap((id) => (stored[`${id}:${season}`] ? [stored[`${id}:${season}`]] : [])));
  vi.mocked(upsertFieldProductionCycle).mockImplementation(async (input) => cycle(input.fieldId, input.season, { ...input }));
  vi.mocked(insertFieldProductionCycleIfAbsent).mockImplementation(async (input) => cycle(input.fieldId, input.season, { ...input }));
});
afterEach(() => vi.useRealTimers());

describe("setBulkFieldCropSystemAction", () => {
  it("changes only the crop on an existing cycle, keeping status, dates and evidence", async () => {
    const target = { value: 5, method: "FARMER_DECLARED" as const, source: "Keith" };
    stored["a:2026"] = cycle("a", "2026", {
      status: "closed",
      startDate: "2026-02-01",
      endDate: "2026-06-01",
      evidence: { cropSystem: { value: "GRASS_GRAZING", method: "FARMER_DECLARED", source: "Keith" }, productionTargetTDMHa: target },
    });
    const result = await setBulkFieldCropSystemAction({ fieldIds: ["a"], season: "2026", cropSystem: "GRASS_HAY" });
    expect(result.status === "completed" && result.outcomes[0].outcome).toBe("saved");
    const saved = vi.mocked(upsertFieldProductionCycle).mock.calls[0][0];
    expect(saved).toMatchObject({ cropSystem: "GRASS_HAY", status: "closed", startDate: "2026-02-01", endDate: "2026-06-01" });
    expect(saved.evidence.productionTargetTDMHa).toBe(target);
    expect(saved.evidence.cropSystem?.previous?.value).toBe("GRASS_GRAZING");
    expect(saved.evidence.cropSystem?.source).toBe("Keith");
  });

  it("creates a planned cycle for a future season and an active one for this season", async () => {
    await setBulkFieldCropSystemAction({ fieldIds: ["a"], season: "2027", cropSystem: "GRASS_HAY" });
    await setBulkFieldCropSystemAction({ fieldIds: ["b"], season: "2026", cropSystem: "GRASS_HAY" });
    const calls = vi.mocked(upsertFieldProductionCycle).mock.calls.map(([input]) => input.status);
    expect(calls).toEqual(["planned", "active"]);
  });

  it("writes nothing for a field already on the chosen crop, so the provenance chain doesn't grow", async () => {
    stored["a:2026"] = cycle("a", "2026");
    const result = await setBulkFieldCropSystemAction({ fieldIds: ["a"], season: "2026", cropSystem: "GRASS_GRAZING" });
    expect(result.status === "completed" && result.outcomes[0].outcome).toBe("unchanged");
    expect(upsertFieldProductionCycle).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a mixed result per field and keeps going after a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(upsertFieldProductionCycle).mockImplementationOnce(async () => {
      throw new Error("write failed");
    });
    const result = await setBulkFieldCropSystemAction({ fieldIds: ["a", "b"], season: "2026", cropSystem: "GRASS_HAY" });
    expect(result.status === "completed" && result.outcomes.map((item) => [item.fieldId, item.outcome])).toEqual([["a", "failed"], ["b", "saved"]]);
    expect(revalidatePath).toHaveBeenCalledWith("/fields");
  });

  it("never touches a field outside the signed-in farm or a deleted field", async () => {
    vi.mocked(listFieldsForFarm).mockResolvedValue([field("a"), field("deleted", { archivedAt: "2026-11-01T00:00:00.000Z" })]);
    const result = await setBulkFieldCropSystemAction({ fieldIds: ["other-farm", "deleted", "a"], season: "2026", cropSystem: "GRASS_HAY" });
    expect(result.status === "completed" && result.outcomes.map((item) => item.outcome)).toEqual(["failed", "failed", "saved"]);
    expect(vi.mocked(upsertFieldProductionCycle).mock.calls.map(([input]) => input.fieldId)).toEqual(["a"]);
  });

  it("rejects seasons and crops the workflow doesn't offer", async () => {
    await expect(setBulkFieldCropSystemAction({ fieldIds: ["a"], season: "2025", cropSystem: "GRASS_HAY" })).resolves.toMatchObject({ status: "rejected" });
    await expect(setBulkFieldCropSystemAction({ fieldIds: ["a"], season: "2028", cropSystem: "GRASS_HAY" })).resolves.toMatchObject({ status: "rejected" });
    await expect(setBulkFieldCropSystemAction({ fieldIds: ["a"], season: "2026", cropSystem: "NOT_A_CROP" as never })).resolves.toMatchObject({ status: "rejected" });
    await expect(setBulkFieldCropSystemAction({ fieldIds: [], season: "2026", cropSystem: "GRASS_HAY" })).resolves.toMatchObject({ status: "rejected" });
    expect(upsertFieldProductionCycle).not.toHaveBeenCalled();
  });

  it("rejects when nobody is signed in", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(null);
    await expect(setBulkFieldCropSystemAction({ fieldIds: ["a"], season: "2026", cropSystem: "GRASS_HAY" })).resolves.toMatchObject({ status: "rejected" });
  });
});

describe("carryForwardFieldCyclesAction", () => {
  it("handles a mix of carried, existing target and missing current cycles", async () => {
    stored["a:2026"] = cycle("a", "2026");
    stored["b:2026"] = cycle("b", "2026");
    stored["b:2027"] = cycle("b", "2027", { status: "planned" });
    const result = await carryForwardFieldCyclesAction({ fieldIds: ["a", "b", "c"], targetSeason: "2027" });
    expect(result.status === "completed" && result.outcomes.map((item) => [item.fieldId, item.outcome])).toEqual([
      ["a", "saved"],
      ["b", "skipped_has_target"],
      ["c", "skipped_no_current"],
    ]);
    expect(vi.mocked(insertFieldProductionCycleIfAbsent).mock.calls.map(([input]) => input.fieldId)).toEqual(["a"]);
  });

  it("only ever writes the target season", async () => {
    stored["a:2026"] = cycle("a", "2026");
    await carryForwardFieldCyclesAction({ fieldIds: ["a"], targetSeason: "2027" });
    expect(upsertFieldProductionCycle).not.toHaveBeenCalled();
    expect(vi.mocked(insertFieldProductionCycleIfAbsent).mock.calls[0][0]).toMatchObject({ season: "2027", status: "planned" });
  });

  it("never copies fertiliser already applied or the source cycle's dates", async () => {
    stored["a:2026"] = cycle("a", "2026", {
      startDate: "2026-02-01",
      evidence: {
        cropSystem: { value: "GRASS_GRAZING", method: "FARMER_DECLARED", source: "Keith" },
        chemicalNAppliedKgHa: { value: 40, method: "FARMER_DECLARED", source: "Keith" },
      },
    });
    await carryForwardFieldCyclesAction({ fieldIds: ["a"], targetSeason: "2027" });
    const inserted = vi.mocked(insertFieldProductionCycleIfAbsent).mock.calls[0][0];
    expect(inserted.evidence.chemicalNAppliedKgHa).toBeUndefined();
    expect(inserted.startDate).toBeUndefined();
  });

  it("reports a cycle saved between the read and the write as already set, not as carried", async () => {
    stored["a:2026"] = cycle("a", "2026");
    vi.mocked(insertFieldProductionCycleIfAbsent).mockResolvedValue(null);
    const result = await carryForwardFieldCyclesAction({ fieldIds: ["a"], targetSeason: "2027" });
    expect(result.status === "completed" && result.outcomes[0].outcome).toBe("skipped_has_target");
  });

  it("assesses a carried cycle on the future planning basis, without fertiliser evidence blocking it", async () => {
    stored["a:2026"] = cycle("a", "2026");
    const result = await carryForwardFieldCyclesAction({ fieldIds: ["a"], targetSeason: "2027" });
    expect(result.status === "completed" && result.outcomes[0].gateStatus).toBe("READY_FOR_CALCULATION");
  });

  it("reports a failed read or write for that field only", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stored["a:2026"] = cycle("a", "2026");
    stored["b:2026"] = cycle("b", "2026");
    vi.mocked(insertFieldProductionCycleIfAbsent).mockImplementationOnce(async () => {
      throw new Error("write failed");
    });
    const result = await carryForwardFieldCyclesAction({ fieldIds: ["a", "b"], targetSeason: "2027" });
    expect(result.status === "completed" && result.outcomes.map((item) => item.outcome)).toEqual(["failed", "saved"]);
  });

  it("refuses the current or a past season", async () => {
    await expect(carryForwardFieldCyclesAction({ fieldIds: ["a"], targetSeason: "2026" })).resolves.toMatchObject({ status: "rejected" });
    expect(insertFieldProductionCycleIfAbsent).not.toHaveBeenCalled();
  });
});

describe("previewBulkProductionCyclesAction", () => {
  it("classifies each active farm field and omits anything else", async () => {
    stored["a:2026"] = cycle("a", "2026");
    stored["b:2026"] = cycle("b", "2026");
    stored["b:2027"] = cycle("b", "2027", { cropSystem: "GRASS_HAY" });
    const preview = await previewBulkProductionCyclesAction({ fieldIds: ["a", "b", "c", "other-farm"], targetSeason: "2027" });
    expect(preview).toMatchObject({
      status: "ok",
      currentSeason: "2026",
      targetSeason: "2027",
      rows: [
        { fieldId: "a", currentCropSystem: "GRASS_GRAZING", carryForward: "CAN_CARRY" },
        { fieldId: "b", targetCropSystem: "GRASS_HAY", carryForward: "HAS_TARGET_CYCLE" },
        { fieldId: "c", carryForward: "NO_CURRENT_CYCLE" },
      ],
    });
  });
});
