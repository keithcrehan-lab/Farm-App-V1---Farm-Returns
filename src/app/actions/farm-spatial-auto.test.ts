import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({
  createField: vi.fn(),
  setFieldBoundary: vi.fn(),
  applyDerivedLegalSpatialEvidence: vi.fn(),
  listFieldsForFarm: vi.fn(),
  archiveField: vi.fn(),
  restoreField: vi.fn(),
  updateFieldCommonageStatus: vi.fn(),
  updateFieldDetails: vi.fn(),
  updateFieldIndex: vi.fn(),
  updateFieldWaterBufferContext: vi.fn(),
}));
vi.mock("@/server/spatial-reference-evidence", () => ({ assessInternalSpatialEvidence: vi.fn() }));
vi.mock("@/server/legal-spatial-evidence", () => ({ assessPublicLegalSpatialEvidence: vi.fn() }));
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn(), updateFarmProfileForCurrentUser: vi.fn() }));

import { addFieldAction, setFieldBoundaryAction } from "./farm";
import { createField, setFieldBoundary, applyDerivedLegalSpatialEvidence } from "@/lib/farm-data/fields";
import { assessInternalSpatialEvidence } from "@/server/spatial-reference-evidence";

const polygon: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[-8.47,53.51],[-8.46,53.51],[-8.46,53.52],[-8.47,53.52],[-8.47,53.51]]] };
const field = { id: "field-1", farmId: "farm-1", name: "Hill Field", polygon } as any;
const resolvedField = { ...field, commonageStatus: { value: "not_commonage" } } as any;

const internal = {
  legal: {
    assessedAt: "2026-11-01T13:52:00Z",
    commonage: { state: "resolved", value: "not_commonage", source: "Farm Return cache · DAFM LPIS 2025", sourceDate: "2025-12-31" },
    water: { state: "resolved", featureType: "surface_water", nearestFeature: "EPA mapped river/stream", distanceM: 179, source: "Farm Return cache · EPA Water Flow Network 2026-06-24", sourceDate: "2026-06-24" },
    localOverride: { state: "unknown", source: "Local authority Article 18 schedules" },
  },
  groundwaterFeatures: [],
  coverage: { dafm_lpis_2025: true, epa_water_flow_network: true },
  basis: "INTERNAL_CACHE",
};

describe("automatic spatial evidence after field mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assessInternalSpatialEvidence).mockResolvedValue(internal as never);
    vi.mocked(applyDerivedLegalSpatialEvidence).mockResolvedValue(resolvedField);
  });

  it("persists internal LPIS/EPA evidence immediately when a new mapped field is created", async () => {
    vi.mocked(createField).mockResolvedValue(field);
    const result = await addFieldAction("farm-1", { name: "Hill Field", polygon });
    expect(assessInternalSpatialEvidence).toHaveBeenCalledWith(polygon);
    expect(applyDerivedLegalSpatialEvidence).toHaveBeenCalledWith("field-1", expect.objectContaining({
      commonage: expect.objectContaining({ value: "not_commonage" }),
      water: expect.objectContaining({ distanceM: 179 }),
    }));
    expect(result).toBe(resolvedField);
  });

  it("re-runs internal spatial matching after a boundary edit", async () => {
    vi.mocked(setFieldBoundary).mockResolvedValue(field);
    await setFieldBoundaryAction("field-1", polygon, 2.5, [-8.465,53.515]);
    expect(assessInternalSpatialEvidence).toHaveBeenCalledWith(polygon);
    expect(applyDerivedLegalSpatialEvidence).toHaveBeenCalledTimes(1);
  });
});
