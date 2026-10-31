import "server-only";

import { boundingBox } from "@/domain/field-boundary";

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";
const STATISTICS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";

export type SatelliteRenderMode = "natural" | "ndvi";

export interface SentinelHubConfig {
  clientId: string | null;
  clientSecret: string | null;
}

export interface NdviObservation {
  intervalFrom: string;
  intervalTo: string;
  meanNdvi: number;
  stDevNdvi: number | null;
  clearPixelCount: number;
  fieldCloudPercent: number | null;
}

let cachedToken: { value: string; expiresAtMs: number } | null = null;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function sentinelHubConfigFromEnv(): SentinelHubConfig {
  return {
    clientId: clean(process.env.CDSE_SENTINEL_HUB_CLIENT_ID),
    clientSecret: clean(process.env.CDSE_SENTINEL_HUB_CLIENT_SECRET),
  };
}

export function sentinelHubBlockReason(config = sentinelHubConfigFromEnv()): string | null {
  if (!config.clientId || !config.clientSecret) {
    return "Copernicus imagery credentials are not configured yet.";
  }
  return null;
}

async function getAccessToken(config: SentinelHubConfig, fetchImpl: typeof fetch): Promise<string> {
  const blocked = sentinelHubBlockReason(config);
  if (blocked) throw new Error(blocked);

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > now) return cachedToken.value;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId as string,
    client_secret: config.clientSecret as string,
  });

  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | { access_token?: unknown; expires_in?: unknown; error_description?: unknown }
    | null;

  if (!response.ok || typeof payload?.access_token !== "string") {
    const detail =
      typeof payload?.error_description === "string"
        ? payload.error_description
        : `OAuth token request failed with HTTP ${response.status}.`;
    throw new Error(detail);
  }

  const expiresIn =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 3600;
  cachedToken = { value: payload.access_token, expiresAtMs: now + expiresIn * 1000 };
  return payload.access_token;
}

function isoWindowAround(acquiredAt: string): { from: string; to: string } {
  const acquired = new Date(acquiredAt);
  if (!Number.isFinite(acquired.getTime())) throw new Error("Invalid acquisition timestamp.");

  // The public STAC catalogue timestamp and Sentinel Hub's internal acquisition
  // timestamp are not guaranteed to be identical to the minute. A tiny window can
  // therefore return HTTP 200 with a fully transparent PNG (no matching pixels).
  // Keep the selected observation pinned to its UTC acquisition day instead.
  const from = new Date(Date.UTC(
    acquired.getUTCFullYear(),
    acquired.getUTCMonth(),
    acquired.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

const NATURAL_COLOR_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  return [2.7*s.B04, 2.7*s.B03, 2.7*s.B02, s.dataMask];
}`;

const NDVI_IMAGE_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "SCL", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  var obscured = [3,7,8,9,10,11].includes(s.SCL);
  var valid = s.dataMask === 1 && !obscured && (s.B08 + s.B04) !== 0;
  if (!valid) return [0,0,0,0];
  var ndvi = index(s.B08, s.B04);
  var rgb = valueInterpolate(
    ndvi,
    [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1],
    [
      [0.45,0.35,0.25],
      [0.72,0.64,0.42],
      [0.78,0.76,0.42],
      [0.55,0.68,0.30],
      [0.30,0.55,0.18],
      [0.12,0.40,0.10],
      [0.04,0.28,0.07]
    ]
  );
  return [rgb[0], rgb[1], rgb[2], 1];
}`;

export async function renderSentinel2FieldImage(
  request: {
    polygon: GeoJSON.Polygon;
    acquisitionTimestamp: string;
    mode: SatelliteRenderMode;
    width?: number;
    height?: number;
  },
  options: { fetchImpl?: typeof fetch; config?: SentinelHubConfig } = {},
): Promise<{ png: Uint8Array; contentType: "image/png"; bounds: [number, number, number, number] }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = options.config ?? sentinelHubConfigFromEnv();
  const token = await getAccessToken(config, fetchImpl);
  const window = isoWindowAround(request.acquisitionTimestamp);
  const [minLng, minLat, maxLng, maxLat] = boundingBox(request.polygon);
  const width = Math.max(maxLng - minLng, 0.0001);
  const height = Math.max(maxLat - minLat, 0.0001);
  const padX = width * 0.22;
  const padY = height * 0.22;
  const contextBounds: [number, number, number, number] = [
    minLng - padX,
    minLat - padY,
    maxLng + padX,
    maxLat + padY,
  ];

  const response = await fetchImpl(PROCESS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "image/png",
    },
    body: JSON.stringify({
      input: {
        bounds: {
          bbox: contextBounds,
          properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
        },
        data: [
          {
            type: "sentinel-2-l2a",
            dataFilter: {
              timeRange: window,
              mosaickingOrder: "mostRecent",
            },
          },
        ],
      },
      output: {
        width: request.width ?? 1280,
        height: request.height ?? 900,
        responses: [{ identifier: "default", format: { type: "image/png" } }],
      },
      evalscript: request.mode === "ndvi" ? NDVI_IMAGE_EVALSCRIPT : NATURAL_COLOR_EVALSCRIPT,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(
      `Sentinel Hub image request failed: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
    );
  }
  return {
    png: new Uint8Array(await response.arrayBuffer()),
    contentType: "image/png",
    bounds: contextBounds,
  };
}

const NDVI_STATISTICS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "cloud", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: ["ndvi", "cloud"] }
    ]
  };
}
function evaluatePixel(s) {
  var obscured = [3,7,8,9,10,11].includes(s.SCL);
  var validNdvi = s.dataMask === 1 && !obscured && (s.B08 + s.B04) !== 0;
  return {
    ndvi: [validNdvi ? index(s.B08, s.B04) : 0],
    cloud: [obscured ? 1 : 0],
    dataMask: [validNdvi ? 1 : 0, s.dataMask]
  };
}`;

interface StatsBand {
  stats?: {
    mean?: unknown;
    stDev?: unknown;
    sampleCount?: unknown;
    noDataCount?: unknown;
  };
}
interface StatsInterval {
  interval?: { from?: unknown; to?: unknown };
  outputs?: {
    ndvi?: { bands?: { B0?: StatsBand } };
    cloud?: { bands?: { B0?: StatsBand } };
  };
}

export async function fetchSentinel2NdviSeries(
  request: { polygon: GeoJSON.Polygon; dateFrom: string; dateTo: string },
  options: { fetchImpl?: typeof fetch; config?: SentinelHubConfig } = {},
): Promise<NdviObservation[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = options.config ?? sentinelHubConfigFromEnv();
  const token = await getAccessToken(config, fetchImpl);

  const response = await fetchImpl(STATISTICS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      input: {
        bounds: {
          geometry: request.polygon,
          properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
        },
        data: [{ type: "sentinel-2-l2a", dataFilter: { mosaickingOrder: "leastCC" } }],
      },
      aggregation: {
        timeRange: { from: request.dateFrom, to: request.dateTo },
        aggregationInterval: { of: "P1D" },
        evalscript: NDVI_STATISTICS_EVALSCRIPT,
        resx: 10,
        resy: 10,
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: StatsInterval[]; error?: unknown }
    | null;
  if (!response.ok) {
    throw new Error(`Sentinel Hub statistics request failed: HTTP ${response.status}`);
  }

  const out: NdviObservation[] = [];
  for (const row of payload?.data ?? []) {
    const from = row.interval?.from;
    const to = row.interval?.to;
    const ndvi = row.outputs?.ndvi?.bands?.B0?.stats;
    const cloud = row.outputs?.cloud?.bands?.B0?.stats;
    if (typeof from !== "string" || typeof to !== "string") continue;
    if (typeof ndvi?.mean !== "number" || !Number.isFinite(ndvi.mean)) continue;
    const sampleCount =
      typeof ndvi.sampleCount === "number" && Number.isFinite(ndvi.sampleCount)
        ? ndvi.sampleCount
        : 0;
    if (sampleCount <= 0) continue;

    out.push({
      intervalFrom: from,
      intervalTo: to,
      meanNdvi: ndvi.mean,
      stDevNdvi:
        typeof ndvi.stDev === "number" && Number.isFinite(ndvi.stDev) ? ndvi.stDev : null,
      clearPixelCount: sampleCount,
      fieldCloudPercent:
        typeof cloud?.mean === "number" && Number.isFinite(cloud.mean)
          ? Math.max(0, Math.min(100, cloud.mean * 100))
          : null,
    });
  }
  return out;
}

export function __resetSentinelHubTokenCacheForTests(): void {
  cachedToken = null;
}
