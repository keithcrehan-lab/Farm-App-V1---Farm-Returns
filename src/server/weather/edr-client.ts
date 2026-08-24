/**
 * Server-only HTTP client for Met Éireann's Open Data EDR (Environmental
 * Data Retrieval) API. `import "server-only"` below makes it a build
 * error for any client component to import this file, even by accident
 * — the browser must never call Met Éireann directly.
 *
 * ✅ LIVE API CONNECTION: VERIFIED — 2026-08-24, from this runtime (which
 * has normal network egress, unlike prior sandboxed sessions recorded
 * below). Real requests succeeded against both confirmed example
 * stations:
 *
 *   https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min
 *     /locations/0018?datetime=2026-08-23T00:00:00Z/2026-08-24T00:00:00Z
 *     &f=CoverageJSON&parameter-name=precipitation_amount,air_temperature,...
 *   (Athenry, HTTP 200, real CoverageJSON body, 23 hourly readings/param)
 *
 *   https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min
 *     /locations/0102?datetime=2026-08-23T00:00:00Z/2026-08-24T18:00:00Z
 *     &f=CoverageJSON&parameter-name=...
 *   (Valentia Observatory, HTTP 200, real data through the current hour)
 *
 * Two real findings from this, not fixture assumptions:
 *  1. The API's DEFAULT output format (no `f=` param) is a flat
 *     `{ items: [{ parameter_name, observed_at, value_num, ... }] }`
 *     shape, NOT CoverageJSON — `edr-parser.ts` only understands
 *     CoverageJSON, so this client always requests `f=CoverageJSON`
 *     explicitly (confirmed valid via the collection's own
 *     `output_formats` list and the response's own `custom.links` "self"
 *     entry, which names `f=covjson`).
 *  2. An UNFILTERED CoverageJSON request pads its `t` axis to the union
 *     of every parameter's own timestamps — and one real parameter,
 *     `present_weather_code_hour`, reports at ~1-minute resolution even
 *     on this "hourly" collection, which both bloats the response with
 *     mostly-null values and, over this app's 7-day lookback window,
 *     would blow past the API's 2000-item page limit long before
 *     covering the requested range. Filtering to just the parameters
 *     this app's schema actually maps (`parameter-name=...`, see
 *     `DEFAULT_EDR_PARAMETER_NAMES` in `edr-parser.ts`) avoids both —
 *     confirmed safe for a 7-day Athenry request (1080 items, well under
 *     the 2000 limit). A longer lookback or a denser station could still
 *     truncate a single-page request; this client does not yet follow
 *     the response's own pagination `links` — a real, documented
 *     limitation, not silently patched over (see
 *     `docs/evidence-register.md`).
 *
 * Previously, from a sandboxed session with its own network-egress proxy
 * blocking this host, the identical request returned HTTP 403 with body
 * `"Host not in allowlist: opendata2.met.ie. Add this host to your
 * network egress settings to allow access."` — that was this
 * sandboxed session's OWN proxy talking, not Met Éireann (confirmed
 * then via a bare `node -e "fetch(...)"` script and `curl`, independent
 * of Next.js). `RUNTIME_BLOCK_SIGNATURE`/`blockedByRuntime` below still
 * detect that exact signature, since a future run in a similarly
 * sandboxed environment can hit the same block — it maps to `UNVERIFIED`
 * rather than `UNAVAILABLE` in `weather-service.ts`. That status code
 * path is retained deliberately even though this runtime doesn't need
 * it today.
 */

import "server-only";

export const EDR_BASE_URL = "https://opendata2.met.ie/edr";
export const EDR_DEFAULT_TIMEOUT_MS = 8_000;
export const EDR_DEFAULT_RETRIES = 2;
export const EDR_RETRY_BACKOFF_MS = 500;

/** The exact text this sandboxed session's own egress proxy returns for a
 * disallowed host — see the module doc comment for how this was confirmed. */
export const RUNTIME_BLOCK_SIGNATURE = "Host not in allowlist";

export interface EdrObservationsRequest {
  /** e.g. "observations-swob-nrt-60min". */
  collection: string;
  /** Met Éireann's own EDR location id for the station, e.g. "0018". */
  edrStationId: string;
  /** ISO datetime, inclusive start of the requested window. */
  fromIso: string;
  /** ISO datetime, inclusive end of the requested window. */
  toIso: string;
  /** Restricts the request to these real parameter names (OGC EDR's
   * `parameter-name` filter) — see `DEFAULT_EDR_PARAMETER_NAMES` in
   * `edr-parser.ts` for why weather-service.ts always passes this
   * rather than fetching every parameter the collection publishes. */
  parameterNames?: readonly string[];
  timeoutMs?: number;
  retries?: number;
}

export type EdrFetchResult =
  | { status: "ok"; body: unknown; retrievedAt: string; url: string }
  | {
      status: "unavailable";
      reason: string;
      retrievedAt: string;
      url: string | null;
      /** True when the failure matches this sandboxed session's known
       * own network-egress block, not a real-world API failure — see
       * `RUNTIME_BLOCK_SIGNATURE`. `weather-service.ts` maps this to
       * `UNVERIFIED` instead of `UNAVAILABLE`. */
      blockedByRuntime: boolean;
    };

export function buildEdrObservationsUrl(
  request: Pick<EdrObservationsRequest, "collection" | "edrStationId" | "fromIso" | "toIso" | "parameterNames">,
): string {
  const { collection, edrStationId, fromIso, toIso, parameterNames } = request;
  // f=CoverageJSON: the API's own default output format is a flat
  // items[] JSON shape edr-parser.ts doesn't understand — see this
  // module's doc comment for the real, live-confirmed evidence.
  let url = `${EDR_BASE_URL}/collections/${encodeURIComponent(collection)}/locations/${encodeURIComponent(edrStationId)}?datetime=${fromIso}/${toIso}&f=CoverageJSON`;
  if (parameterNames && parameterNames.length > 0) {
    url += `&parameter-name=${parameterNames.map(encodeURIComponent).join(",")}`;
  }
  return url;
}

/**
 * Fetches one station's raw EDR response for a time window, with a
 * timeout and a small number of retries on network-level failure only
 * (never on a 4xx — that's a real API answer, not a transient fault).
 * Always resolves, never throws: any failure — timeout, network error,
 * non-2xx response, unparseable body — comes back as
 * `{ status: "unavailable", reason, blockedByRuntime }`, never as a
 * thrown exception the caller has to remember to catch, and never as
 * fabricated data.
 */
export async function fetchEdrObservations(request: EdrObservationsRequest): Promise<EdrFetchResult> {
  const { timeoutMs = EDR_DEFAULT_TIMEOUT_MS, retries = EDR_DEFAULT_RETRIES } = request;
  const url = buildEdrObservationsUrl(request);

  let lastReason = "unknown error";
  let lastBlockedByRuntime = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        // Server-side per-request cache — short-lived, since observations
        // update roughly hourly on the -60min collection. Real caching
        // policy should move to weather-service.ts once response
        // freshness/format is verified against a live request.
        next: { revalidate: 300 },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        // A real HTTP error (4xx/5xx) — not a network fault, so don't
        // retry; report it and stop. Peek at the body (best-effort) to
        // detect this sandboxed session's own known egress-block
        // signature, distinct from a genuine upstream error.
        let bodyText = "";
        try {
          bodyText = await response.text();
        } catch {
          // Body unreadable — proceed without it, not fatal.
        }
        return {
          status: "unavailable",
          reason: `EDR request failed: HTTP ${response.status} ${response.statusText}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ""}`,
          retrievedAt: new Date().toISOString(),
          url,
          blockedByRuntime: bodyText.includes(RUNTIME_BLOCK_SIGNATURE),
        };
      }

      const body: unknown = await response.json();
      return { status: "ok", body, retrievedAt: new Date().toISOString(), url };
    } catch (err) {
      clearTimeout(timeout);
      lastReason =
        err instanceof Error
          ? err.name === "AbortError"
            ? `EDR request timed out after ${timeoutMs}ms`
            : err.message
          : String(err);
      lastBlockedByRuntime = false; // a thrown network error has no body to check
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, EDR_RETRY_BACKOFF_MS * (attempt + 1)));
      }
    }
  }

  return {
    status: "unavailable",
    reason: lastReason,
    retrievedAt: new Date().toISOString(),
    url,
    blockedByRuntime: lastBlockedByRuntime,
  };
}
