import { describe, expect, it, vi } from "vitest";
import { getWeatherForField } from "./weather-service";
import * as edrClient from "./edr-client";
import type { MetEireannStation } from "@/domain/weather-stations";

const ATHENRY: MetEireannStation = {
  id: "athenry",
  name: "Athenry",
  latitude: 53.289167,
  longitude: -8.785556,
  elevationM: 40,
  edrStationId: "0018",
  collections: null,
  active: null,
  verifiedAt: "2026-08-24",
};

const CORK_AIRPORT_NO_ID: MetEireannStation = {
  id: "cork_airport",
  name: "Cork Airport",
  latitude: 51.8472,
  longitude: -8.48611,
  elevationM: 155,
  edrStationId: null,
  collections: null,
  active: null,
  verifiedAt: null,
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
    expect(result.reason).toMatch(/no.*stations/i);
    expect(result.observations).toEqual([]);
  });

  it("returns UNAVAILABLE with the nearest station identified when it has no confirmed EDR id", async () => {
    const result = await getWeatherForField(corkField, { now, stations: [CORK_AIRPORT_NO_ID] });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.station?.id).toBe("cork_airport");
    expect(result.reason).toMatch(/no confirmed.*edr station id/i);
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
