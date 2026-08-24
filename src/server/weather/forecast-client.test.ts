import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLocationForecastUrl, fetchLocationForecast } from "./forecast-client";

const request = { latitude: 51.9, longitude: -8.4863 };

describe("buildLocationForecastUrl", () => {
  it("matches the real, live-confirmed request shape (HTTP, not HTTPS — see module doc comment)", () => {
    expect(buildLocationForecastUrl(request)).toBe(
      "http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=51.9&long=-8.4863",
    );
  });
});

describe("fetchLocationForecast", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns status ok with the raw XML text on a successful response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<weatherdata></weatherdata>",
    }) as unknown as typeof fetch;

    const result = await fetchLocationForecast(request);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.xmlText).toBe("<weatherdata></weatherdata>");
      expect(result.url).toContain("lat=51.9");
    }
  });

  it("never throws — a network failure resolves to status unavailable with a reason", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const result = await fetchLocationForecast({ ...request, retries: 0 });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toMatch(/network down/);
    }
  });

  it("does not retry on a real HTTP error response — it's a real answer, not a transient fault", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error", text: async () => "" });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchLocationForecast({ ...request, retries: 3 });
    expect(result.status).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on network-level failure up to the configured count, then gives up gracefully", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("transient"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchLocationForecast({ ...request, retries: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.status).toBe("unavailable");
  });
});
