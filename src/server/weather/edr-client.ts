/**
 * Server-only HTTP client for Met Éireann's Open Data EDR (Environmental
 * Data Retrieval) API. `import "server-only"` below makes it a build
 * error for any client component to import this file, even by accident
 * — the browser must never call Met Éireann directly.
 *
 * ⚠️ LIVE API CONNECTION: UNVERIFIED IN CURRENT RUNTIME.
 *
 * A real request was actually attempted from this exact code path (not
 * just curl) against the confirmed example URL:
 *
 *   https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min
 *     /locations/0018?datetime=2026-04-23T00:00:00Z/2026-04-24T00:00:00Z
 *
 * Result: HTTP 403, ~250ms, body `"Host not in allowlist: opendata2.met.ie.
 * Add this host to your network egress settings to allow access."` — this
 * is this sandboxed session's OWN network-egress proxy talking, not a
 * response from Met Éireann's real server (confirmed by the exact wording
 * and by an identical result from a bare `node -e "fetch(...)"` script
 * outside Next.js entirely, and from `curl` against the same host, both
 * run immediately before this note was written). `api.met.ie`,
 * `prodapi.metweb.ie`, `clidata.met.ie` and `www.met.ie` all fail the
 * same way. `isRuntimeBlocked` below detects this exact signature so
 * `weather-service.ts` can report it as `UNVERIFIED` rather than a
 * generic `UNAVAILABLE` — this is an environment limitation, not evidence
 * that Met Éireann's public Open Data API itself is unreachable or wrong.
 * Do not report this integration as LIVE until a real request succeeds
 * and its response is successfully parsed from a runtime that can reach
 * the host.
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

export function buildEdrObservationsUrl(request: Pick<EdrObservationsRequest, "collection" | "edrStationId" | "fromIso" | "toIso">): string {
  const { collection, edrStationId, fromIso, toIso } = request;
  return `${EDR_BASE_URL}/collections/${encodeURIComponent(collection)}/locations/${encodeURIComponent(edrStationId)}?datetime=${fromIso}/${toIso}`;
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
