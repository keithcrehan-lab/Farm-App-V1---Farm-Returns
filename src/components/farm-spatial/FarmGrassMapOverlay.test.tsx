import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FarmGrassMapOverlay } from "./FarmGrassMapOverlay";

afterEach(cleanup);

describe("Farm grass map: regional growth", () => {
  const summary = {
    averageCoverKgDmHa: 1854,
    growthRateKgDmHaDay: 50,
    knownFieldCount: 10,
    totalFieldCount: 10,
  };
  it("shows manual growth and pending county forecast separately while collapsed", () => {
    const { container } = render(<FarmGrassMapOverlay summary={{
      ...summary,
      regionalGrowth: { status: "not_published", county: "Galway" },
    }} onViewChange={() => {}} estimateLabel="50 kg DM/ha/day · entered by you" />);
    expect(container.querySelector("[data-grass-map-overlay]")?.getAttribute("data-expanded")).toBeNull();
    expect(screen.getByRole("region", { name: "Regional grass growth" }).textContent).toContain("Awaiting county figures");
    expect(container.textContent).toContain("Growth 50 kg DM/ha/day · entered by you");
    expect(container.textContent).toContain("50");
  });

  it("shows a published county forecast separately from farmer's 50", () => {
    const { container } = render(<FarmGrassMapOverlay summary={{
      ...summary, regionalGrowth: {
        status: "published", county: "Galway", growthKgDmHaDay: 34,
        validFrom: "2026-11-12", validTo: "2026-11-18", current: true,
        sourceUrl: "https://teagasc.ie/",
      },
    }} />);
    expect(screen.getByRole("region", { name: "Regional grass growth" }).textContent).toContain("34");
    expect(container.textContent).toContain("50");
  });
});
