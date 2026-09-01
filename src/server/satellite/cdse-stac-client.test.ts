import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSentinel2SearchUrl, searchSentinel2L2AScenes } from "./cdse-stac-client";
import { CDSE_STAC_LIVE_REAL_RESPONSE } from "./cdse-stac-client.real-fixtures";

const request = {
  bbox: [-8.5, 52.0, -8.0, 52.5] as [number, number, number, number],
  dateFrom: "2026-06-01T00:00:00Z",
  dateTo: "2026-06-30T23:59:59Z",
};

describe("buildSentinel2SearchUrl", () => {
  it("matches the real, live-confirmed request shape", () => {
    expect(buildSentinel2SearchUrl(request)).toBe(
      "https://catalogue.dataspace.copernicus.eu/stac/collections/sentinel-2-l2a/items?bbox=-8.5%2C52%2C-8%2C52.5&datetime=2026-06-01T00%3A00%3A00Z%2F2026-06-30T23%3A59%3A59Z&limit=20",
    );
  });

  it("respects a custom limit", () => {
    expect(buildSentinel2SearchUrl({ ...request, limit: 5 })).toContain("limit=5");
  });
});

describe("searchSentinel2L2AScenes", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses a real, live-captured CDSE STAC response into Sentinel2L2AItem[]", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => CDSE_STAC_LIVE_REAL_RESPONSE,
    }) as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes(request);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.items).toHaveLength(4);
    const clearScene = result.items.find((item) => item.id === "S2C_MSIL2A_20260713T114351_N0512_R123_T29UNT_20260713T163414");
    expect(clearScene).toMatchObject({
      cloudCoverPercent: 0.08,
      platform: "sentinel-2c",
      constellation: "sentinel-2",
      processingLevel: "L2",
      productType: "S2MSI2A",
    });
    expect(clearScene?.statistics).toBeDefined();
    expect(clearScene?.bbox).toHaveLength(4);
  });

  it("silently skips a malformed feature rather than failing the whole request", async () => {
    const malformedResponse = {
      ...CDSE_STAC_LIVE_REAL_RESPONSE,
      features: [...CDSE_STAC_LIVE_REAL_RESPONSE.features, { id: "malformed-missing-properties" }],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => malformedResponse,
    }) as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes(request);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    // Only the 4 real, well-formed features -- the malformed one is
    // dropped, not fatal to the request.
    expect(result.items).toHaveLength(4);
  });

  // Codex audit HIGH, docs/farm-return-next/audit-logs/20260901T152948Z.md:
  // the first version of parseStacFeature trusted any bare `typeof
  // number`, admitting non-finite/out-of-range values as real measured
  // evidence.
  it.each([
    ["a non-finite cloud cover", { "eo:cloud_cover": Number.NaN }],
    ["an out-of-range cloud cover (>100)", { "eo:cloud_cover": 150 }],
    ["a negative cloud cover", { "eo:cloud_cover": -5 }],
  ])("rejects a feature with %s rather than admitting it as real evidence", async (_label, propsOverride) => {
    const base = CDSE_STAC_LIVE_REAL_RESPONSE.features[0];
    const malformed = { ...base, properties: { ...base.properties, ...propsOverride } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: "FeatureCollection", features: [malformed] }),
    }) as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes(request);

    expect(result).toMatchObject({ status: "ok", items: [] });
  });

  it("rejects a feature with a non-finite bbox coordinate", async () => {
    const base = CDSE_STAC_LIVE_REAL_RESPONSE.features[0];
    const malformed = { ...base, bbox: [Number.POSITIVE_INFINITY, base.bbox[1], base.bbox[2], base.bbox[3]] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: "FeatureCollection", features: [malformed] }),
    }) as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes(request);

    expect(result).toMatchObject({ status: "ok", items: [] });
  });

  it("rejects a feature with an out-of-range latitude in its bbox", async () => {
    const base = CDSE_STAC_LIVE_REAL_RESPONSE.features[0];
    const malformed = { ...base, bbox: [base.bbox[0], 200, base.bbox[2], base.bbox[3]] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: "FeatureCollection", features: [malformed] }),
    }) as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes(request);

    expect(result).toMatchObject({ status: "ok", items: [] });
  });

  it("rejects a feature with an unparseable datetime", async () => {
    const base = CDSE_STAC_LIVE_REAL_RESPONSE.features[0];
    const malformed = { ...base, properties: { ...base.properties, datetime: "not-a-real-date" } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: "FeatureCollection", features: [malformed] }),
    }) as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes(request);

    expect(result).toMatchObject({ status: "ok", items: [] });
  });

  it("drops the whole statistics object (not partially) when any one entry is non-finite, rather than trusting the rest", async () => {
    const base = CDSE_STAC_LIVE_REAL_RESPONSE.features[0];
    const malformed = {
      ...base,
      properties: { ...base.properties, statistics: { vegetation: 13.76, water: Number.NaN } },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: "FeatureCollection", features: [malformed] }),
    }) as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes(request);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].statistics).toBeUndefined();
  });

  it("returns an empty items array (status ok) for a real response with zero features, not an error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: "FeatureCollection", features: [] }),
    }) as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes(request);

    expect(result).toMatchObject({ status: "ok", items: [] });
  });

  it("never throws — a network failure resolves to status unavailable with a reason", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes({ ...request, retries: 0 });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") throw new Error("expected unavailable");
    expect(result.reason).toMatch(/network down/);
  });

  it("does not retry on a real HTTP error response — it's a real answer, not a transient fault", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error", text: async () => "" });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes({ ...request, retries: 3 });

    expect(result.status).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on a network-level failure, succeeding on a later attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValueOnce({ ok: true, json: async () => CDSE_STAC_LIVE_REAL_RESPONSE });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes({ ...request, retries: 1 });

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out and resolves to status unavailable rather than hanging", async () => {
    // A real fetch never resolves/rejects on its own once aborted -- it
    // rejects with an AbortError the moment the passed-in AbortSignal
    // fires. This mock respects that real contract (rather than a fixed
    // guard timer racing the client's own timeout, which would test
    // nothing real) so this test genuinely exercises
    // searchSentinel2L2AScenes's own AbortController wiring, not an
    // unrelated artificial delay.
    global.fetch = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortError = new Error("The operation was aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }),
    ) as unknown as typeof fetch;

    const result = await searchSentinel2L2AScenes({ ...request, timeoutMs: 10, retries: 0 });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") throw new Error("expected unavailable");
    expect(result.reason).toMatch(/timed out after 10ms/);
  });
});
