import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/server/satellite/cdse-stac-client", async () => {
  const actual = await vi.importActual<typeof import("@/server/satellite/cdse-stac-client")>("@/server/satellite/cdse-stac-client");
  return { ...actual, searchSentinel2L2AScenes: vi.fn() };
});
vi.mock("@/server/satellite/sentinel-hub-client", async () => {
  const actual = await vi.importActual<typeof import("@/server/satellite/sentinel-hub-client")>("@/server/satellite/sentinel-hub-client");
  return {
    ...actual,
    sentinelHubBlockReason: vi.fn(),
    fetchSentinel2NdviSeries: vi.fn(),
    renderSentinel2FieldImage: vi.fn(),
  };
});

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { searchSentinel2L2AScenes, type Sentinel2L2AItem } from "@/server/satellite/cdse-stac-client";
import { sentinelHubBlockReason } from "@/server/satellite/sentinel-hub-client";
import { getFieldSatelliteHistoryAction } from "./field-satellite-history";
import type { Field } from "@/domain/types";

const mockFarm = vi.mocked(getFarmForCurrentUser);
const mockFields = vi.mocked(listFieldsForFarm);
const mockSearch = vi.mocked(searchSentinel2L2AScenes);
const mockBlocked = vi.mocked(sentinelHubBlockReason);

const field: Field = {
  id: "field-1",
  farmId: "farm-1",
  name: "Top Field",
  areaHa: 2,
  polygon: {
    type: "Polygon",
    coordinates: [[[-8.5, 53], [-8.49, 53], [-8.49, 53.01], [-8.5, 53.01], [-8.5, 53]]],
  },
} as Field;

function scene(id: string, datetime: string, cloud = 20, offset = 0): Sentinel2L2AItem {
  return {
    id,
    datetime,
    platform: "sentinel-2c",
    constellation: "sentinel-2",
    cloudCoverPercent: cloud,
    processingLevel: "L2",
    productType: "S2MSI2A",
    processingVersion: "05.13",
    bbox: [-8.6 + offset, 52.9 + offset, -8.4 + offset, 53.1 + offset],
    geometry: {
      type: "Polygon",
      coordinates: [[[-8.6 + offset, 52.9 + offset], [-8.4 + offset, 52.9 + offset], [-8.4 + offset, 53.1 + offset], [-8.6 + offset, 53.1 + offset], [-8.6 + offset, 52.9 + offset]]],
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  mockFarm.mockResolvedValue({ id: "farm-1" } as never);
  mockFields.mockResolvedValue([field]);
  mockBlocked.mockReturnValue("Copernicus imagery credentials are not configured yet.");
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("field satellite history actions", () => {
  it("fails ownership closed before any satellite search", async () => {
    mockFarm.mockResolvedValue(null);
    expect(await getFieldSatelliteHistoryAction("field-1", "3M")).toBeNull();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("returns real intersecting passes, collapses tile duplicates, and discloses imagery capability", async () => {
    mockSearch.mockResolvedValue({
      status: "ok",
      retrievedAt: "2026-10-30T08:00:00Z",
      url: "https://stac.dataspace.copernicus.eu/v1/test",
      items: [
        scene("tile-a", "2026-10-23T11:30:00Z", 35),
        scene("tile-b", "2026-10-23T11:30:20Z", 12),
        scene("old", "2026-10-18T11:30:00Z", 8),
        scene("elsewhere", "2026-10-20T11:30:00Z", 5, 5),
      ],
    });

    const result = await getFieldSatelliteHistoryAction("field-1", "3M");
    expect(result).not.toBeNull();
    expect(result?.scenes.map((item) => item.id)).toEqual(["tile-b", "old"]);
    expect(result?.scenes[0]).toMatchObject({ cloudCoverPercent: 12, processingVersion: "05.13" });
    expect(result?.processingConfigured).toBe(false);
    expect(result?.processingBlockedReason).toMatch(/not configured/i);
    expect(mockSearch).toHaveBeenCalled();
  });
});
