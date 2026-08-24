import { afterEach, describe, expect, it, vi } from "vitest";
import { RUNTIME_BLOCK_SIGNATURE, buildEdrObservationsUrl, fetchEdrObservations } from "./edr-client";

const request = {
  collection: "observations-swob-nrt-60min",
  edrStationId: "0018",
  fromIso: "2026-04-23T00:00:00Z",
  toIso: "2026-04-24T00:00:00Z",
};

describe("buildEdrObservationsUrl", () => {
  it("matches exactly the one confirmed real example URL shape", () => {
    expect(buildEdrObservationsUrl(request)).toBe(
      "https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min/locations/0018?datetime=2026-04-23T00:00:00Z/2026-04-24T00:00:00Z",
    );
  });
});

describe("fetchEdrObservations", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns status ok with the parsed JSON body on a successful response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: "Coverage" }),
    }) as unknown as typeof fetch;

    const result = await fetchEdrObservations(request);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.body).toEqual({ type: "Coverage" });
      expect(result.url).toContain("0018");
    }
  });

  it("never throws — a network failure resolves to status unavailable with a reason", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const result = await fetchEdrObservations({ ...request, retries: 0 });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toMatch(/network down/);
    }
  });

  it("does not retry on a real HTTP error response (4xx/5xx) — it's a real answer, not a transient fault", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: "Not Found", text: async () => "" });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchEdrObservations({ ...request, retries: 3 });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toMatch(/404/);
      expect(result.blockedByRuntime).toBe(false);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("flags blockedByRuntime when the 403 body matches this sandboxed session's own known egress-block signature", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => `${RUNTIME_BLOCK_SIGNATURE}: opendata2.met.ie. Add this host to your network egress settings to allow access.`,
    }) as unknown as typeof fetch;

    const result = await fetchEdrObservations({ ...request, retries: 0 });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.blockedByRuntime).toBe(true);
      expect(result.reason).toContain(RUNTIME_BLOCK_SIGNATURE);
    }
  });

  it("does not flag blockedByRuntime for an unrelated real HTTP error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid API key",
    }) as unknown as typeof fetch;

    const result = await fetchEdrObservations({ ...request, retries: 0 });
    if (result.status === "unavailable") {
      expect(result.blockedByRuntime).toBe(false);
    }
  });

  it("retries on network-level failure up to the configured count, then gives up gracefully", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("transient"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchEdrObservations({ ...request, retries: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(result.status).toBe("unavailable");
  });

  it("succeeds on a retry after an initial transient failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ type: "Coverage" }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchEdrObservations({ ...request, retries: 1 });
    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
