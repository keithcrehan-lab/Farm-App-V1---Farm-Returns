import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RegionalGrowthStatus } from "./RegionalGrowthStatus";

afterEach(cleanup);

describe("RegionalGrowthStatus", () => {
  it("clearly shows a missing approved Galway figure without changing a farm rate", () => {
    render(<RegionalGrowthStatus regional={{ status: "not_published", county: "Galway" }} />);
    const section = screen.getByRole("region", { name: "Regional grass growth" });
    expect(section.textContent).toContain("Regional growth · Co. Galway");
    expect(section.textContent).toContain("Awaiting county figures");
    expect(section.textContent).toContain("No approved county figure");
    expect(section.textContent).not.toContain("50");
  });

  it("displays a verified current rate, dates and linked original source", () => {
    render(<RegionalGrowthStatus regional={{
      status: "published", county: "Galway", growthKgDmHaDay: 34,
      validFrom: "2026-11-12", validTo: "2026-11-18", current: true,
      sourceUrl: "https://teagasc.ie/",
    }} />);
    const section = screen.getByRole("region", { name: "Regional grass growth" });
    expect(section.textContent).toContain("34");
    expect(section.textContent).toContain("kg DM/ha/day");
    expect(section.textContent).toContain("2026-11-12 to 2026-11-18");
    expect(screen.getByRole("link", { name: "Source" }).getAttribute("href")).toBe("https://teagasc.ie/");
  });

  it("flags an expired forecast instead of implying it is current", () => {
    render(<RegionalGrowthStatus theme="dark" regional={{
      status: "published", county: "Galway", growthKgDmHaDay: 34,
      validFrom: "2026-11-01", validTo: "2026-11-07", current: false,
      sourceUrl: "https://teagasc.ie/",
    }} />);
    expect(screen.getByText(/not a current forecast/i)).toBeTruthy();
  });

  it("distinguishes an unavailable lookup from an unpublished forecast", () => {
    render(<RegionalGrowthStatus regional={{ status: "unavailable", county: "Galway" }} />);
    expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
    expect(screen.getByText(/Awaiting county figures/i)).toBeTruthy();
  });
});
