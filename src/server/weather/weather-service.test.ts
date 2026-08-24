import { describe, expect, it, vi } from "vitest";
import { getWeatherForField } from "./weather-service";
import * as edrClient from "./edr-client";
import { DEFAULT_EDR_PARAMETER_NAMES } from "./edr-parser";
import type { MetEireannStation } from "@/domain/weather-stations";

const ATHENRY: MetEireannStation = {
  id: "athenry",
  canonicalName: "Athenry",
  aliases: [],
  latitude: 53.289167,
  longitude: -8.785556,
  elevationM: 40,
  edrStationId: "0018",
  openDataArchiveName: "Athenry",
  presentInOpenObservationsArchive: true,
  stationIdVerification: "VERIFIED",
  metadataVerification: "VERIFIED",
  sourceUrls: [],
};

const CORK_AIRPORT_NO_ID: MetEireannStation = {
  id: "cork_airport",
  canonicalName: "Cork Airport",
  aliases: [],
  latitude: 51.8472,
  longitude: -8.48611,
  elevationM: 155,
  edrStationId: null,
  openDataArchiveName: null,
  presentInOpenObservationsArchive: false,
  stationIdVerification: "UNVERIFIED",
  metadataVerification: "VERIFIED",
  sourceUrls: [],
};

const now = new Date("2026-08-24T12:00:00Z");
// A point right on Athenry's own coordinates, so it's unambiguously nearest.
const athenryField = { centroid: [-8.785556, 53.289167] as [number, number] };
const corkField = { centroid: [-8.48611, 51.8472] as [number, number] };

describe("getWeatherForField", () => {
  it("returns UNAVAILABLE with a real reason when the registry is empty", async () => {
    const result = await getWeatherForField(athenryField, { now, stations: [] });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.station).toBeNull();
    expect(result.nearestGeographicStation).toBeNull();
    expect(result.fallbackUsed).toBe(false);
    expect(result.reason).toMatch(/no.*stations/i);
    expect(result.observations).toEqual([]);
  });

  it("returns UNAVAILABLE, with the nearest geographic station still identified, when no queryable station exists at all", async () => {
    const result = await getWeatherForField(corkField, { now, stations: [CORK_AIRPORT_NO_ID] });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.station).toBeNull();
    expect(result.nearestGeographicStation?.id).toBe("cork_airport");
    expect(result.reason).toMatch(/no station with a confirmed.*edr id/i);
  });

  it("falls back past an unqueryable nearer station to a farther queryable one, and reports the fallback explicitly", async () => {
    vi.spyOn(edrClient, "fetchEdrObservations").mockResolvedValue({
      status: "unavailable",
      reason: "simulated failure so the test doesn't need a full parse fixture",
      retrievedAt: now.toISOString(),
      url: null,
      blockedByRuntime: false,
    });

    const result = await getWeatherForField(corkField, { now, stations: [CORK_AIRPORT_NO_ID, ATHENRY] });
    expect(result.nearestGeographicStation?.id).toBe("cork_airport");
    expect(result.station?.id).toBe("athenry"); // the real fallback: farther, but queryable
    expect(result.fallbackUsed).toBe(true);
    vi.restoreAllMocks();
  });

  it("reports fallbackUsed=false when the nearest geographic station is itself queryable", async () => {
    vi.spyOn(edrClient, "fetchEdrObservations").mockResolvedValue({
      status: "unavailable",
      reason: "simulated failure",
      retrievedAt: now.toISOString(),
      url: null,
      blockedByRuntime: false,
    });

    const result = await getWeatherForField(athenryField, { now, stations: [ATHENRY, CORK_AIRPORT_NO_ID] });
    expect(result.station?.id).toBe("athenry");
    expect(result.nearestGeographicStation?.id).toBe("athenry");
    expect(result.fallbackUsed).toBe(false);
    vi.restoreAllMocks();
  });

  it("returns UNAVAILABLE (never throws, never fabricates data) when the EDR fetch fails", async () => {
    vi.spyOn(edrClient, "fetchEdrObservations").mockResolvedValue({
      status: "unavailable",
      reason: "simulated network failure",
      retrievedAt: now.toISOString(),
      url: null,
      blockedByRuntime: false,
    });

    const result = await getWeatherForField(athenryField, { now, stations: [ATHENRY] });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.station?.edrStationId).toBe("0018");
    expect(result.reason).toBe("simulated network failure");
    expect(result.observations).toEqual([]);
    vi.restoreAllMocks();
  });

  it("parses a successful response and reports LIVE for a recent observation", async () => {
    vi.spyOn(edrClient, "fetchEdrObservations").mockResolvedValue({
      status: "ok",
      retrievedAt: now.toISOString(),
      url: "https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min/locations/0018",
      body: {
        domain: { axes: { t: { values: ["2026-08-24T11:00:00Z", "2026-08-24T12:00:00Z"] } } },
        ranges: {
          rainfall: { axisNames: ["t"], shape: [2], values: [0.4, 0.1] },
        },
      },
    });

    const result = await getWeatherForField(athenryField, { now, stations: [ATHENRY] });
    expect(result.status).toBe("LIVE");
    expect(result.observations).toHaveLength(2);
    expect(result.observations[1].rainfallMm).toBeCloseTo(0.1, 5);
    const oneHourWindow = result.rollingRainfall.find((w) => w.windowHours === 1);
    expect(oneHourWindow?.totalMm).toBeCloseTo(0.1, 5);
    vi.restoreAllMocks();
  });

  it("reports STALE when the latest parsed observation is old", async () => {
    vi.spyOn(edrClient, "fetchEdrObservations").mockResolvedValue({
      status: "ok",
      retrievedAt: now.toISOString(),
      url: "https://opendata2.met.ie/edr/...",
      body: {
        domain: { axes: { t: { values: ["2026-08-20T12:00:00Z"] } } },
        ranges: { rainfall: { axisNames: ["t"], shape: [1], values: [0] } },
      },
    });

    const result = await getWeatherForField(athenryField, { now, stations: [ATHENRY] });
    expect(result.status).toBe("STALE");
    vi.restoreAllMocks();
  });

  it("returns UNVERIFIED (not UNAVAILABLE) when the fetch failure matches this sandboxed session's own runtime block", async () => {
    vi.spyOn(edrClient, "fetchEdrObservations").mockResolvedValue({
      status: "unavailable",
      reason: "EDR request failed: HTTP 403 Forbidden — Host not in allowlist: opendata2.met.ie.",
      retrievedAt: now.toISOString(),
      url: "https://opendata2.met.ie/edr/...",
      blockedByRuntime: true,
    });

    const result = await getWeatherForField(athenryField, { now, stations: [ATHENRY] });
    expect(result.status).toBe("UNVERIFIED");
    expect(result.reason).toContain("Host not in allowlist");
    vi.restoreAllMocks();
  });

  it("requests exactly the confirmed real parameter names — never the collection's full unfiltered parameter set", async () => {
    const fetchSpy = vi.spyOn(edrClient, "fetchEdrObservations").mockResolvedValue({
      status: "unavailable",
      reason: "simulated failure",
      retrievedAt: now.toISOString(),
      url: null,
      blockedByRuntime: false,
    });

    await getWeatherForField(athenryField, { now, stations: [ATHENRY] });
    expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ parameterNames: DEFAULT_EDR_PARAMETER_NAMES }));
    vi.restoreAllMocks();
  });

  it("returns UNAVAILABLE when the response parses to zero observations", async () => {
    vi.spyOn(edrClient, "fetchEdrObservations").mockResolvedValue({
      status: "ok",
      retrievedAt: now.toISOString(),
      url: "https://opendata2.met.ie/edr/...",
      body: {},
    });

    const result = await getWeatherForField(athenryField, { now, stations: [ATHENRY] });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reason).toMatch(/no observations/i);
    vi.restoreAllMocks();
  });
});
