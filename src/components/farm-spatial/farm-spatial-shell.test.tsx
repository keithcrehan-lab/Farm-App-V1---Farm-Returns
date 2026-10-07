import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FarmLensControl } from "./FarmLensControl";
import { FarmLensContext } from "./FarmLensContext";
import { FarmObjectRail } from "./FarmObjectRail";
import { FARM_LENSES, farmLensById } from "@/lib/farm-spatial-lenses";
import { primaryNavItems, moreNavItems } from "@/components/shell/nav-items";

afterEach(cleanup);

describe("Farm Spatial V2 lenses", () => {
  it("defines exactly the five approved lenses in order", () => {
    expect(FARM_LENSES.map((l) => l.label)).toEqual(["Current", "Grass", "Nutrients", "Soil", "Conditions"]);
  });

  it("gives each non-Current lens its own domain colour, not green", () => {
    const active = FARM_LENSES.filter((l) => l.id !== "current").map((l) => l.accentClassName);
    expect(new Set(active).size).toBe(active.length);
    for (const className of active) expect(className).not.toMatch(/green|forest/);
  });

  it("states honestly what has no production source yet (grass, SMD, workability)", () => {
    expect(farmLensById("grass").unavailableNote).toMatch(/isn't available yet/i);
    expect(farmLensById("conditions").unavailableNote).toMatch(/soil moisture deficit.*aren't available yet/i);
  });
});

describe("FarmLensControl", () => {
  it("marks the active lens pressed and reports a selection", () => {
    const onChange = vi.fn();
    render(<FarmLensControl value="current" onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Farm lens" });
    expect(within(group).getByRole("button", { name: "Current" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(group).getByRole("button", { name: "Nutrients" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(within(group).getByRole("button", { name: "Nutrients" }));
    expect(onChange).toHaveBeenCalledWith("nutrients");
  });

  it("marks the active lens with its domain-colour rule, not a filled button (Phase 02B)", () => {
    render(<FarmLensControl value="soil" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "Farm lens" });
    for (const lens of FARM_LENSES) {
      const button = within(group).getByRole("button", { name: lens.label });
      expect(button.className).not.toMatch(/\bbg-/);
      const rule = button.querySelector("[data-lens-rule]")!;
      expect(rule.className).toContain(lens.accentClassName);
      expect(rule.className).toContain(lens.id === "soil" ? "opacity-100" : "opacity-0");
    }
  });
});

describe("FarmLensContext", () => {
  it("links the Nutrients lens to the existing real nutrient plan screens", () => {
    render(<FarmLensContext lensId="nutrients" />);
    expect(screen.getByText("Requirement · organic nutrients · fertiliser")).toBeTruthy();
    expect(screen.getByRole("link", { name: /farm nutrient plan/i }).getAttribute("href")).toBe("/fertiliser-plan");
    expect(screen.getByRole("link", { name: /field nutrient plan/i }).getAttribute("href")).toBe("/nutrients");
  });

  it("shows only the real facts it is given, never a suitability verdict", () => {
    render(<FarmLensContext lensId="conditions" facts={["Slurry · Closed period"]} />);
    expect(screen.getByText("Slurry · Closed period")).toBeTruthy();
    expect(screen.queryByText(/suitable/i)).toBeNull();
  });

  it("renders one editorial block: caption, facts, honest note and links, with no per-line pills (Phase 02B)", () => {
    const { container } = render(<FarmLensContext lensId="conditions" facts={["Slurry · Closed period"]} />);
    const block = container.querySelector("[data-lens-context]")!;
    expect(block).toBeTruthy();
    expect(within(block as HTMLElement).getByText("Rainfall · temperature · wind · spreading calendar")).toBeTruthy();
    expect(within(block as HTMLElement).getByText(/soil moisture deficit.*aren't available yet/i)).toBeTruthy();
    expect(within(block as HTMLElement).getByRole("link", { name: /spreading/i }).getAttribute("href")).toBe("/spreading");
    expect(block.querySelectorAll("[class*='rounded']")).toHaveLength(0);
  });
});

describe("FarmObjectRail", () => {
  it("shows real cattle and shed counts with links, and Sheep as an unsupported shell with no count", () => {
    render(<FarmObjectRail counts={{ cattleHeadCount: 35, cattleGroupCount: 2, shedCount: 1 }} />);
    const rail = screen.getByRole("navigation", { name: "Farm objects" });
    const cattle = within(rail).getByText("Cattle").closest("a")!;
    expect(cattle.getAttribute("href")).toBe("/livestock");
    expect(within(cattle).getByText("35")).toBeTruthy();
    expect(within(cattle).getByText("2 groups")).toBeTruthy();
    const sheds = within(rail).getByText("Sheds").closest("a")!;
    expect(sheds.getAttribute("href")).toBe("/housing");
    expect(within(sheds).getByText("1")).toBeTruthy();
    const sheep = within(rail).getByText("Sheep").parentElement!;
    expect(sheep.tagName).not.toBe("A");
    expect(sheep.getAttribute("aria-disabled")).toBe("true");
    expect(within(sheep).getByText("Not yet supported")).toBeTruthy();
    expect(within(sheep).queryByText(/^\d+$/)).toBeNull();
  });

  it("never shows a fabricated 0 when nothing is recorded", () => {
    render(<FarmObjectRail counts={{ cattleHeadCount: 0, cattleGroupCount: 0, shedCount: 0 }} />);
    expect(screen.getAllByText("None recorded")).toHaveLength(2);
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("Farm Spatial V2 primary navigation", () => {
  it("is Farm · What Matters · Plan · Market · Finance, with Farm on the map-led screen", () => {
    expect(primaryNavItems.map((i) => i.label)).toEqual(["Farm", "What Matters", "Plan", "Market", "Finance"]);
    expect(primaryNavItems.map((i) => i.href)).toEqual(["/today", "/what-matters", "/plan", "/quotes", "/finance"]);
  });

  it("marks What Matters as a placeholder (no route exists) and every other item as a real destination", () => {
    expect(primaryNavItems.filter((i) => i.placeholderNote).map((i) => i.label)).toEqual(["What Matters"]);
  });

  it("keeps every previously primary screen reachable under More, without duplicating a primary item", () => {
    const moreHrefs = moreNavItems.map((i) => i.href);
    for (const href of ["/fields", "/supports", "/records", "/dashboard", "/market-prices", "/nutrients", "/fertiliser-plan"]) {
      expect(moreHrefs).toContain(href);
    }
    for (const item of primaryNavItems) expect(moreHrefs).not.toContain(item.href);
  });
});
