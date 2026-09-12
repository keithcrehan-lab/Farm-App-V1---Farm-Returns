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
      payload: { fieldIds: ["field-1"] },
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

  it("treats a real provider failure as genuinely UNKNOWN (not a confirmed absence of coverage), never a crash", async () => {
    // Codex audit MEDIUM (round 1): a provider outage is a distinct,
    // honest state from "checked and found no usable observation" —
    // conflating the two previously told a farmer "no observation
    // exists" when the truth was "we couldn't check".
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
    mockSearchScenes.mockResolvedValue({ status: "unavailable", reason: "timeout", retrievedAt: "2026-09-08T12:00:00.000Z", url: null });
    mockListSessions.mockResolvedValue({ sessions: [], truncated: false });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result).not.toBeNull();
    expect(result!.coverage.status).toBe("UNKNOWN");
    expect(result!.freshness).toBe("unavailable");
  });

  it("never selects a fully cloud-obscured scene as usable — passes the disclosed cloud-cover ceiling through to the selector", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
    mockSearchScenes.mockResolvedValue({
      status: "ok",
      items: [scene({ cloudCoverPercent: 100 })],
      retrievedAt: "2026-09-08T12:00:00.000Z",
      url: "https://catalogue.dataspace.copernicus.eu/stac/x",
    });
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
      sessions: [
        confirmedSession({ primaryFieldId: "field-1" }),
        confirmedSession({
          id: "session-2",
          primaryFieldId: "field-9",
          actual: { ...confirmedSession().actual!, jobSessionId: "session-2", payload: { fieldIds: ["field-9"] } },
        }),
      ],
      truncated: false,
    });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result!.recentActivity).toHaveLength(1);
    expect(result!.recentActivity[0].fieldId).toBe("field-1");
    expect(result!.recentActivity[0].activityType).toBe("silage");
  });

  // Codex audit MEDIUM (round 3): the round-2 fix still trusted a bare
  // `primaryFieldId` as a fallback match — dropped entirely now, since
  // the confirmed Actual's own `payload.fieldIds` is authoritative for
  // every field-scoped activity type.
  it("never matches on primaryFieldId alone when the confirmed Actual's own payload.fieldIds does not include this field", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
    mockSearchScenes.mockResolvedValue({
      status: "ok",
      items: [scene()],
      retrievedAt: "2026-09-08T12:00:00.000Z",
      url: "https://catalogue.dataspace.copernicus.eu/stac/x",
    });
    mockListSessions.mockResolvedValue({
      sessions: [confirmedSession({ primaryFieldId: "field-1", actual: { ...confirmedSession().actual!, payload: { fieldIds: ["field-9"] } } })],
      truncated: false,
    });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result!.recentActivity).toHaveLength(0);
  });

  // Codex audit MEDIUM (round 2): the authoritative field list for
  // fertiliser/slurry/silage/field_inspection actuals is the payload's
  // own real `fieldIds`, not just the session's single `primaryFieldId`
  // — a real confirmed activity for a genuine secondary field was
  // previously silently dropped.
  it("includes a confirmed activity where the requested field is a secondary field in the actual's own payload.fieldIds, not the session's primaryFieldId", async () => {
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
          primaryFieldId: "field-9",
          actual: {
            id: "actual-1",
            farmId: "farm-a",
            jobSessionId: "session-1",
            revision: 1,
            activityType: "silage",
            completionType: "whole",
            payload: { fieldIds: ["field-9", "field-1"] },
            confirmedBy: "farmer",
            confirmedAt: "2026-09-05T09:00:00.000Z",
            createdAt: "2026-09-05T09:00:00.000Z",
          },
        }),
      ],
      truncated: false,
    });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result!.recentActivity).toHaveLength(1);
    expect(result!.recentActivity[0].fieldId).toBe("field-1");
    expect(result!.recentActivity[0].activityType).toBe("silage");
  });

  it("ignores a malformed (non-array/non-string) payload.fieldIds rather than throwing", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
    mockSearchScenes.mockResolvedValue({
      status: "ok",
      items: [scene()],
      retrievedAt: "2026-09-08T12:00:00.000Z",
      url: "https://catalogue.dataspace.copernicus.eu/stac/x",
    });
    mockListSessions.mockResolvedValue({
      sessions: [confirmedSession({ primaryFieldId: "field-9", actual: { ...confirmedSession().actual!, payload: { fieldIds: "not-an-array" } } })],
      truncated: false,
    });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result!.recentActivity).toHaveLength(0);
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

  // Codex audit MEDIUM (round 3): `listConfirmedJobSessionsForFarm`'s
  // own real cap could truncate a busy farm's confirmed sessions before
  // this layer ever filters by field — surfaced honestly rather than
  // silently presenting a possibly-incomplete activity list as complete.
  it("surfaces a real, honest warning when listConfirmedJobSessionsForFarm reports truncation", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
    mockSearchScenes.mockResolvedValue({
      status: "ok",
      items: [scene()],
      retrievedAt: "2026-09-08T12:00:00.000Z",
      url: "https://catalogue.dataspace.copernicus.eu/stac/x",
    });
    mockListSessions.mockResolvedValue({ sessions: [], truncated: true });

    const result = await getFieldAwarenessForCurrentUser("field-1");

    expect(result!.warnings).toContain("Some older confirmed activity may not be shown — your farm has a large number of confirmed jobs.");
  });

  // Codex audit MEDIUM (round 5): the 30-day lookback deliberately
  // searches a wider window than cdse-stac-client.ts's own real
  // DEFAULT_LIMIT (20) was sized for — a real scene beyond an
  // unpaginated first page could otherwise be silently missed.
  it("requests a generous search limit, wider than the STAC client's own default, given the 30-day lookback", async () => {
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

    expect(mockSearchScenes).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  // Codex audit MEDIUM (round 7): a real database error from the
  // confirmed-activity read (an optional, supporting feed) previously
  // discarded otherwise-valid, already-resolved satellite coverage —
  // the two were coupled through a single Promise.all.
  it("still returns valid satellite coverage when the confirmed-activity read genuinely fails", async () => {
    // Real bug found post-hoc: this test's own `freshness === "current"`
    // assertion depends on the gap between `scene().datetime` and
    // `getFieldAwarenessForCurrentUser`'s own internal `new Date()` —
    // never pinned here, so it silently started failing once real wall-
    // clock time drifted more than `currentMaxDays` (3) past the scene's
    // hardcoded date. Fixed by pinning the clock to a fixed instant
    // close to the scene/`retrievedAt` dates already used below, so this
    // test's own real intent (a scene retrieved ~1 day ago is "current")
    // stays true regardless of which real calendar day this suite runs
    // on — not a change to any production code.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T13:00:00.000Z"));
    try {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockGetFarm.mockResolvedValue(FARM_A);
      mockListFields.mockResolvedValue([field({ polygon: SQUARE_POLYGON })]);
      mockSearchScenes.mockResolvedValue({
        status: "ok",
        items: [scene()],
        retrievedAt: "2026-09-08T12:00:00.000Z",
        url: "https://catalogue.dataspace.copernicus.eu/stac/x",
      });
      mockListSessions.mockRejectedValue(new Error("real database connection error"));

      const result = await getFieldAwarenessForCurrentUser("field-1");

      expect(result).not.toBeNull();
      expect(result!.coverage.status).toBe("OK");
      expect(result!.freshness).toBe("current");
      expect(result!.recentActivity).toEqual([]);
      expect(result!.warnings).toContain("Could not check recent farm activity for this field just now.");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
