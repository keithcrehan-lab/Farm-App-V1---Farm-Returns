import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetSentinelHubTokenCacheForTests,
  fetchSentinel2NdviSeries,
  renderSentinel2FieldImage,
  sentinelHubBlockReason,
} from "./sentinel-hub-client";

const polygon: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[[-8.5, 53], [-8.49, 53], [-8.49, 53.01], [-8.5, 53.01], [-8.5, 53]]],
};

const config = { clientId: "client", clientSecret: "secret" };

afterEach(() => {
  __resetSentinelHubTokenCacheForTests();
  vi.restoreAllMocks();
});

describe("sentinel-hub-client", () => {
  it("fails closed when imagery credentials are absent", () => {
    expect(sentinelHubBlockReason({ clientId: null, clientSecret: null })).toMatch(/not configured/i);
  });

  it("renders an NDVI field image through OAuth + Process API without exposing credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-value", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } }));

    const result = await renderSentinel2FieldImage(
      { polygon, acquisitionTimestamp: "2026-10-23T11:30:00Z", mode: "ndvi", width: 500, height: 400 },
      { fetchImpl, config },
    );

    expect(result.png).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const tokenCall = fetchImpl.mock.calls[0];
    expect(String(tokenCall[0])).toContain("/protocol/openid-connect/token");
    expect(String(tokenCall[1]?.body)).toContain("client_id=client");
    expect(String(tokenCall[1]?.body)).toContain("client_secret=secret");

    const processCall = fetchImpl.mock.calls[1];
    expect(String(processCall[0])).toContain("/api/v1/process");
    const body = JSON.parse(String(processCall[1]?.body));
    expect(body.input.bounds.bbox[0]).toBeCloseTo(-8.5022, 6);
    expect(body.input.bounds.bbox[1]).toBeCloseTo(52.9978, 6);
    expect(body.input.bounds.bbox[2]).toBeCloseTo(-8.4878, 6);
    expect(body.input.bounds.bbox[3]).toBeCloseTo(53.0122, 6);
    expect(result.bounds).toEqual(body.input.bounds.bbox);
    expect(body.input.data[0].dataFilter.timeRange).toEqual({
      from: "2026-10-23T00:00:00.000Z",
      to: "2026-10-23T23:59:59.999Z",
    });
    expect(body.output).toMatchObject({ width: 500, height: 400 });
    expect(body.evalscript).toContain("B08");
    expect(body.evalscript).toContain("SCL");
    expect(JSON.stringify(processCall[1]?.headers)).not.toContain("secret");
  });

  it("parses field NDVI and field-cloud statistics from the Statistical API", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-value", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                interval: { from: "2026-10-23T00:00:00Z", to: "2026-10-24T00:00:00Z" },
                outputs: {
                  ndvi: { bands: { B0: { stats: { mean: 0.64, stDev: 0.08, sampleCount: 55, noDataCount: 5 } } } },
                  cloud: { bands: { B0: { stats: { mean: 0.12, stDev: 0.3, sampleCount: 60, noDataCount: 0 } } } },
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const points = await fetchSentinel2NdviSeries(
      { polygon, dateFrom: "2026-10-01T00:00:00Z", dateTo: "2026-10-30T00:00:00Z" },
      { fetchImpl, config },
    );

    expect(points).toEqual([
      {
        intervalFrom: "2026-10-23T00:00:00Z",
        intervalTo: "2026-10-24T00:00:00Z",
        meanNdvi: 0.64,
        stDevNdvi: 0.08,
        clearPixelCount: 55,
        fieldCloudPercent: 12,
      },
    ]);
    const statsCall = fetchImpl.mock.calls[1];
    const body = JSON.parse(String(statsCall[1]?.body));
    expect(body.aggregation).toMatchObject({ aggregationInterval: { of: "P1D" }, resx: 10, resy: 10 });
    expect(body.aggregation.evalscript).toContain("dataMask");
    expect(body.aggregation.evalscript).toContain("[3,7,8,9,10,11]");
  });
});
