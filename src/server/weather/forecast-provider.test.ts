import { describe, expect, it } from "vitest";
import { notImplementedForecastProvider } from "./forecast-provider";

describe("notImplementedForecastProvider", () => {
  it("always reports UNAVAILABLE with a real, honest reason, never fabricated points", async () => {
    const result = await notImplementedForecastProvider.getForecastForField({ centroid: [-8.5, 51.9] });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.points).toEqual([]);
    expect(result.reason).toMatch(/not implemented/i);
  });
});
