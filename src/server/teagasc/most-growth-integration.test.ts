import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { extractLatestMostBatch, ROI_COUNTIES } = await import("./most-growth");

type InsertedRow = { county: string; status: string; reviewed_at?: string };
const counties = ROI_COUNTIES.map((county) => ({ county, growth: 20, confidence: "high" }));

function mockDatabase() {
  const inserted: InsertedRow[] = [];
  const query = {
    eq() { return this; },
    neq() { return this; },
    limit() { return this; },
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const db = {
    from: (table: string) => {
      expect(table).toBe("regional_grass_growth");
      return {
        select: () => query,
        insert: async (rows: InsertedRow[]) => {
          inserted.push(...rows);
          return { error: null };
        },
      };
    },
  };
  return { db, inserted };
}

function mockSource(reads: unknown[][]) {
  let apiCalls = 0;
  const fake = vi.fn(async (url: string) => {
    if (url.includes("api.anthropic.com")) {
      const reading = reads[apiCalls++] ?? [];
      return {
        ok: true,
        json: async () => ({ content: [{ type: "text", text: JSON.stringify({ counties: reading }) }] }),
      };
    }
    if (url.endsWith(".png")) {
      return {
        ok: true,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
      };
    }
    return {
      ok: true,
      text: async () => `<figure><img src="https://teagasc.ie/wp-content/uploads/2026/11/most-test.png"><figcaption>MoSt Grass Growth Predictions for each county for 7 days (from 12th November 2026)</figcaption></figure>`,
    };
  });
  vi.stubGlobal("fetch", fake);
  return { fake, getApiCalls: () => apiCalls };
}

describe("weekly Teagasc image import publication gates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
    vi.stubEnv("REGIONAL_GROWTH_AUTO_PUBLISH", "true");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("publishes only when two full, clear reads match", async () => {
    const { db, inserted } = mockDatabase();
    const { getApiCalls } = mockSource([counties, counties]);
    const result = await extractLatestMostBatch(db as never);
    expect(result).toMatchObject({ status: "created", counties: 26, autoPublished: true });
    expect(getApiCalls()).toBe(2);
    expect(inserted).toHaveLength(26);
    expect(inserted.every((r) => r.status === "approved" && Boolean(r.reviewed_at))).toBe(true);
  });

  it("keeps an incomplete map pending and does not spend on a second read", async () => {
    const { db, inserted } = mockDatabase();
    const { getApiCalls } = mockSource([counties.slice(1)]);
    const result = await extractLatestMostBatch(db as never);
    expect(result).toMatchObject({ status: "created", counties: 25, autoPublished: false });
    expect(getApiCalls()).toBe(1);
    expect(inserted.every((r) => r.status === "pending" && !r.reviewed_at)).toBe(true);
  });

  it("keeps conflicting AI transcriptions pending even if both claim high confidence", async () => {
    const { db, inserted } = mockDatabase();
    const second = counties.map((r) => r.county === "Galway" ? { ...r, growth: 21 } : r);
    const { getApiCalls } = mockSource([counties, second]);
    const result = await extractLatestMostBatch(db as never);
    expect(result).toMatchObject({ status: "created", autoPublished: false });
    expect(getApiCalls()).toBe(2);
    expect(inserted.every((r) => r.status === "pending")).toBe(true);
  });

  it("rejects mostly unreadable maps without inserting any figures", async () => {
    const { db, inserted } = mockDatabase();
    const { getApiCalls } = mockSource([counties.slice(0, 6)]);
    const result = await extractLatestMostBatch(db as never);
    expect(result).toMatchObject({ status: "failed" });
    expect(getApiCalls()).toBe(1);
    expect(inserted).toHaveLength(0);
  });
});
