import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/job-sessions", () => ({ listConfirmedJobSessionsForFarm: vi.fn() }));
vi.mock("@/server/satellite/cdse-stac-client", () => ({ searchSentinel2L2AScenes: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listConfirmedJobSessionsForFarm, type JobSessionWithActual } from "@/lib/farm-data/job-sessions";
import { searchSentinel2L2AScenes } from "@/server/satellite/cdse-stac-client";
import { getFieldAwarenessForCurrentUser } from "./index";
import type { Farm, Field } from "@/domain/types";
import type { Sentinel2L2AItem } from "@/server/satellite/cdse-stac-client";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockListSessions = vi.mocked(listConfirmedJobSessionsForFarm);
const mockSearchScenes = vi.mocked(searchSentinel2L2AScenes);

afterEach(() => {
  vi.clearAllMocks();
});

const FARM_A: Farm = {
  id: "farm-a",
  name: "Farm A",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Farmer A",
};

// A small real square around Cork, closed ring, no holes.
const SQUARE_POLYGON: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-8.5, 52.0],
      [-8.49, 52.0],
      [-8.49, 52.01],
      [-8.5, 52.01],
      [-8.5, 52.0],
    ],
  ],
};

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-a",
    name: "Home Field",
    areaHa: 4.5,
    centroid: [-8.495, 52.005],
    fertility: {},
    history: [],
    ...overrides,
  };
}

function scene(overrides: Partial<Sentinel2L2AItem> = {}): Sentinel2L2AItem {
  return {
    id: "scene-1",
    bbox: [-8.5, 52.0, -8.49, 52.01],
    geometry: SQUARE_POLYGON,
    datetime: "2026-09-07T10:00:00.000Z",
    platform: "sentinel-2c",
    constellation: "sentinel-2",
    cloudCoverPercent: 5,
    processingLevel: "L2",
    productType: "S2MSI2A",
    processingVersion: "05.12",
    ...overrides,
  };
}

function confirmedSession(overrides: Partial<JobSessionWithActual> = {}): JobSessionWithActual {
  return {
    id: "session-1",
    farmId: "farm-a",
    status: "confirmed_actual",
    primaryFieldId: "field-1",
    hasGpsTrace: true,
    actual: {
      id: "actual-1",
      farmId: "farm-a",
      jobSessionId: "session-1",
      revision: 1,
      activityType: "silage",
      completionType: "whole",
      payload: {},
      confirmedBy: "farmer",
      confirmedAt: "2026-09-05T09:00:00.000Z",
      createdAt: "2026-09-05T09:00:00.000Z",
    },
    ...overrides,
  } as JobSessionWithActual;
}

describe("getFieldAwarenessForCurrentUser", () => {
  it("returns null when there is no current farm — never attempts a lookup", async () => {
    mockGetFarm.mockResolvedValue(null);
    const result = await getFieldAwarenessForCurrentUser("field-1");
    expect(result).toBeNull();
    expect(mockListFields).not.toHaveBeenCalled();
  });

  it("returns null when the requested field does not belong to the current farm — indistinguishable from a genuine cross-farm attempt", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ id: "field-1" })]);
    const result = await getFieldAwarenessForCurrentUser("field-owned-by-another-farm");
    expect(result).toBeNull();
    // Never calls satellite search or activity lookup for a field it
    // could not verify belongs to this farm.
    expect(mockSearchScenes).not.toHaveBeenCalled();
    expect(mockListSessions).not.toHaveBeenCalled();
  });

  it("never attempts satellite coverage for a field with no mapped boundary", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: undefined })]);
    mockListSessions.mockResolvedValue({ sessions: [], truncated: false });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result).not.toBeNull();
    expect(result!.hasMappedBoundary).toBe(false);
    expect(result!.freshness).toBe("unavailable");
    expect(mockSearchScenes).not.toHaveBeenCalled();
  });

  it("assembles a real snapshot from a mapped field with real satellite coverage", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
    mockSearchScenes.mockResolvedValue({
      status: "ok",
      items: [scene()],
      retrievedAt: "2026-09-08T12:00:00.000Z",
      url: "https://catalogue.dataspace.copernicus.eu/stac/x",
    });
    mockListSessions.mockResolvedValue({ sessions: [], truncated: false });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result).not.toBeNull();
    expect(result!.hasMappedBoundary).toBe(true);
    expect(result!.fieldId).toBe("field-1");
    expect(result!.farmId).toBe("farm-a");
    expect(mockSearchScenes).toHaveBeenCalledTimes(1);
  });

  it("treats a real provider failure as insufficient evidence, never a crash", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
    mockSearchScenes.mockResolvedValue({ status: "unavailable", reason: "timeout", retrievedAt: "2026-09-08T12:00:00.000Z", url: null });
    mockListSessions.mockResolvedValue({ sessions: [], truncated: false });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result).not.toBeNull();
    expect(result!.coverage.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(result!.freshness).toBe("unavailable");
  });

  it("includes only real confirmed activity for the requested field, dropping other fields' sessions", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
    mockSearchScenes.mockResolvedValue({
      status: "ok",
      items: [scene()],
      retrievedAt: "2026-09-08T12:00:00.000Z",
      url: "https://catalogue.dataspace.copernicus.eu/stac/x",
    });
    mockListSessions.mockResolvedValue({
      sessions: [confirmedSession({ primaryFieldId: "field-1" }), confirmedSession({ id: "session-2", primaryFieldId: "field-9" })],
      truncated: false,
    });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result!.recentActivity).toHaveLength(1);
    expect(result!.recentActivity[0].fieldId).toBe("field-1");
    expect(result!.recentActivity[0].activityType).toBe("silage");
  });

  it("drops a confirmed session whose activity type is not one of the five known real values, rather than mislabelling it", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
    mockSearchScenes.mockResolvedValue({
      status: "ok",
      items: [scene()],
      retrievedAt: "2026-09-08T12:00:00.000Z",
      url: "https://catalogue.dataspace.copernicus.eu/stac/x",
    });
    mockListSessions.mockResolvedValue({
      sessions: [
        confirmedSession({
          actual: {
            id: "actual-1",
            farmId: "farm-a",
            jobSessionId: "session-1",
            revision: 1,
            activityType: "some_future_unrecognised_type",
            completionType: "whole",
            payload: {},
            confirmedBy: "farmer",
            confirmedAt: "2026-09-05T09:00:00.000Z",
            createdAt: "2026-09-05T09:00:00.000Z",
          },
        }),
      ],
      truncated: false,
    });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result!.recentActivity).toHaveLength(0);
  });

  it("fetches satellite coverage and confirmed activity concurrently, not sequentially", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
    mockSearchScenes.mockResolvedValue({
      status: "ok",
      items: [scene()],
      retrievedAt: "2026-09-08T12:00:00.000Z",
      url: "https://catalogue.dataspace.copernicus.eu/stac/x",
    });
    mockListSessions.mockResolvedValue({ sessions: [], truncated: false });

    await getFieldAwarenessForCurrentUser("field-1");

    expect(mockSearchScenes).toHaveBeenCalledTimes(1);
    expect(mockListSessions).toHaveBeenCalledTimes(1);
    expect(mockListSessions).toHaveBeenCalledWith("farm-a");
  });
});
