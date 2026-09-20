/**
 * Server-only HTTP client for the Central Statistics Office of Ireland's
 * official PxStat API, dataset AJM09 ("Fertiliser Price", €/tonne).
 * `import "server-only"` makes it a build error for any client component
 * to import this file, even by accident.
 *
 * ✅ LIVE API CONNECTION: VERIFIED — 2026-09-20, from this runtime.
 * `curl -s https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en`
 * returned HTTP 200, 2133 real data rows, header
 * `"STATISTIC","Statistic Label","TLIST(M1)","Month","C02069V02500","Type of Fertiliser","UNIT","VALUE"`,
 * months 2020-01 through 2026-07 (91 months × up to 26 fertiliser types;
 * some type/month combinations report an empty VALUE — a real missing
 * observation, not a zero — `cso-fertiliser-parser.ts` preserves that
 * distinction). AJM09 is confirmed still the correct, current, official
 * dataset code (not renamed/replaced) — its own JSON-stat metadata
 * (`PxStat.Data.Cube_API.ReadDataset/AJM09/JSON-stat/2.0/en`) reports
 * `extension.official: true`, `extension.product: "Agricultural Input
 * and Output Absolute Prices"`, and `updated: "2026-09-15T11:00:00.000Z"`.
 * That same metadata is the ONLY place this pipeline gets
 * `sourceUpdatedAt`/the "Planned Routine Revision" fact recorded in
 * `source-register.ts`'s `CSO_AG_PRICES` entry — neither VAT treatment
 * nor delivery basis is stated anywhere in it or in the human-readable
 * release page (also fetched and checked, 2026-09-20), which is why
 * `cso-fertiliser-mapping.ts` always assigns `vatTreatment: "unknown"`
 * and `deliveryBasis: "unknown"` — not inferred, per Phase 2 §4.
 *
 * CSV, not JSON-stat, is the chosen transport specifically for exact
 * decimal safety (Phase 2 §6): a CSV VALUE field is plain text the moment
 * it's split out of a row — this client and `cso-fertiliser-parser.ts`
 * never call `Number()`/`parseFloat` on it, so the official source's own
 * decimal text reaches `createMoneyAmount` unchanged. JSON-stat's `value`
 * array, by contrast, is already-parsed JSON numbers by the time
 * `JSON.parse` returns it — reintroducing exactly the float-import risk
 * Phase 1 closed. JSON-stat is used ONLY for the small metadata fetch
 * above (`updated`, a date string — no precision risk).
 */

import "server-only";

export const CSO_AJM09_CSV_URL =
  "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en";
export const CSO_AJM09_METADATA_URL =
  "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/JSON-stat/2.0/en";

export const CSO_CLIENT_DEFAULT_TIMEOUT_MS = 15_000;
export const CSO_CLIENT_DEFAULT_RETRIES = 2;
export const CSO_CLIENT_RETRY_BACKOFF_MS = 500;

export type CsoFetchResult =
  | { status: "ok"; body: string; retrievedAt: string; url: string }
  | { status: "unavailable"; reason: string; retrievedAt: string; url: string };

async function fetchText(
  url: string,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<CsoFetchResult> {
  const { timeoutMs = CSO_CLIENT_DEFAULT_TIMEOUT_MS, retries = CSO_CLIENT_DEFAULT_RETRIES } = options;

  let lastReason = "unknown error";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Fertiliser prices publish monthly — a short server-side cache is
      // enough to avoid hammering CSO on repeated manual sync triggers
      // within the same window, without ever going stale for a real
      // monthly cadence.
      const response = await fetch(url, { signal: controller.signal, next: { revalidate: 3600 } });
      clearTimeout(timeout);

      if (!response.ok) {
        // A real HTTP error — not a network fault, don't retry.
        return {
          status: "unavailable",
          reason: `CSO request failed: HTTP ${response.status} ${response.statusText}`,
          retrievedAt: new Date().toISOString(),
          url,
        };
      }

      const body = await response.text();
      return { status: "ok", body, retrievedAt: new Date().toISOString(), url };
    } catch (err) {
      clearTimeout(timeout);
      lastReason =
        err instanceof Error ? (err.name === "AbortError" ? `CSO request timed out after ${timeoutMs}ms` : err.message) : String(err);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, CSO_CLIENT_RETRY_BACKOFF_MS * (attempt + 1)));
      }
    }
  }

  return { status: "unavailable", reason: lastReason, retrievedAt: new Date().toISOString(), url };
}

/** Fetches the raw AJM09 CSV body as text — never parses it here (see
 * this module's header for why parsing/decimal-extraction is kept out of
 * the transport layer). Always resolves, never throws. */
export function fetchCsoFertiliserCsv(options?: { timeoutMs?: number; retries?: number }): Promise<CsoFetchResult> {
  return fetchText(CSO_AJM09_CSV_URL, options);
}

/** Fetches the small JSON-stat metadata document — used only for
 * `updated`/`extension.reasons`, both non-monetary. Always resolves,
 * never throws. */
export function fetchCsoFertiliserMetadata(options?: { timeoutMs?: number; retries?: number }): Promise<CsoFetchResult> {
  return fetchText(CSO_AJM09_METADATA_URL, options);
}
