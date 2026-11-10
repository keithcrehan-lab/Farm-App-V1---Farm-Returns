import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { locateMostMap, normaliseCounty, parseCountyReadings } = await import("./most-growth");

describe("locateMostMap", () => {
  it("finds the map nearest the caption, its full-size URL and its week", () => {
    const html = `<img src="https://teagasc.ie/wp-content/uploads/2025/04/logo-teagasc2x.png" alt="Teagasc logo">
      <p>Grass Growth Predictions</p>
      <figure><img src="https://teagasc.ie/wp-content/uploads/WhatsApp-Image-2026-11-06-at-11.03.33-250x300.jpeg" alt="">
      <figcaption>MoSt Grass Growth Predictions for each county for 7 days (from 6th November 2026)</figcaption></figure>`;
    expect(locateMostMap(html)).toEqual({
      imageUrl: "https://teagasc.ie/wp-content/uploads/WhatsApp-Image-2026-11-06-at-11.03.33.jpeg",
      validFrom: "2026-11-06",
      validTo: "2026-11-12",
      caption: "MoSt Grass Growth Predictions for each county for 7 days (from 6th November 2026)",
    });
  });

  it("returns null when the caption or date is missing", () => {
    expect(locateMostMap("<p>No map this week</p>")).toBeNull();
    expect(locateMostMap(`<img src="/wp-content/uploads/a.jpg"><p>MoSt Grass Growth Predictions coming soon</p>`)).toBeNull();
  });
});

describe("parseCountyReadings", () => {
  it("keeps valid counties and drops impossible or unknown values", () => {
    const text = 'Here you go: {"counties":[{"county":"Clare","growth":12,"confidence":"high"},{"county":"Co. Cork","growth":"14.5"},{"county":"Atlantis","growth":9},{"county":"Kerry","growth":900}]}';
    expect(parseCountyReadings(text)).toEqual([
      { county: "Clare", growth: 12, confidence: "high" },
      { county: "Cork", growth: 14.5, confidence: "low" },
    ]);
    expect(parseCountyReadings("not json")).toEqual([]);
  });

  it("normalises county names", () => {
    expect(normaliseCounty("County Galway")).toBe("Galway");
    expect(normaliseCounty("Londonderry")).toBe("Derry");
    expect(normaliseCounty("Narnia")).toBeNull();
  });
});
