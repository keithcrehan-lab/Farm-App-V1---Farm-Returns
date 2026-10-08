import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FarmLensControl } from "./FarmLensControl";
import { FarmLensContext } from "./FarmLensContext";
import { FarmObjectRail } from "./FarmObjectRail";
import { FARM_LENSES, farmLensById } from "@/lib/farm-spatial-lenses";
import { primaryNavItems, moreNavItems } from "@/components/shell/nav-items";
import { tracked, type Housing, type LivestockGroup } from "@/domain/types";

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
  const groups: LivestockGroup[] = [
    { id: "g-wean", farmId: "f", category: "weanling", label: "Weanlings", count: tracked(15, "verified", "Farmer"), system: "housed", value: tracked(0, "estimated", "Farm Return assumption") },
    { id: "g-cows", farmId: "f", category: "suckler_cow", label: "Cows", count: tracked(20, "estimated", "Farm Return assumption"), system: "grazing", value: tracked(0, "estimated", "Farm Return assumption") },
  ];
  // Only the fields the rail reads; slurry storage is not part of it.
  const sheds = [
    { id: "h-1", shedName: "Main shed", shedType: "slatted", linkedGroupIds: ["g-wean"] },
    { id: "h-2", shedName: "Old shed", shedType: "straw_bedded", linkedGroupIds: [] },
  ] as unknown as Housing[];

  function renderRail(counts = { cattleHeadCount: 35, cattleGroupCount: 2, shedCount: 2 }, g = groups, h = sheds) {
    render(<FarmObjectRail counts={counts} livestockGroups={g} housing={h} />);
    return screen.getByRole("navigation", { name: "Farm objects" });
  }

  it("shows real cattle and shed counts as selectable objects, and Sheep as an unsupported shell with no count", () => {
    const rail = renderRail();
    const cattle = within(rail).getByRole("button", { name: /cattle/i });
    expect(cattle.getAttribute("aria-expanded")).toBe("false");
    expect(within(cattle).getByText("35")).toBeTruthy();
    expect(within(cattle).getByText("2 groups")).toBeTruthy();
    const shedsButton = within(rail).getByRole("button", { name: /sheds/i });
    expect(within(shedsButton).getByText("2")).toBeTruthy();
    const sheep = within(rail).getByRole("button", { name: /sheep/i });
    expect(within(sheep).getByText("Not yet supported")).toBeTruthy();
    expect(within(sheep).queryByText(/^\d+$/)).toBeNull();
  });

  it("never shows a fabricated 0 when nothing is recorded", () => {
    renderRail({ cattleHeadCount: 0, cattleGroupCount: 0, shedCount: 0 }, [], []);
    expect(screen.getAllByText("None recorded")).toHaveLength(2);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("Cattle lists real groups with provenance and honest locations, never a field", () => {
    const rail = renderRail();
    fireEvent.click(within(rail).getByRole("button", { name: /cattle/i }));
    const panel = within(rail).getByRole("region", { name: "Cattle groups" });
    const wean = within(panel).getByRole("link", { name: /weanlings/i });
    expect(wean.getAttribute("href")).toBe("/livestock/g-wean");
    expect(within(wean).getByText("15 head")).toBeTruthy();
    expect(within(wean).getByText("Housed · Main shed")).toBeTruthy();
    const cows = within(panel).getByRole("link", { name: /cows/i });
    expect(within(cows).getByText("Estimated")).toBeTruthy();
    expect(within(cows).getByText("Grazing · field not recorded")).toBeTruthy();
    expect(within(panel).getByText(/moving groups between fields aren't available yet/i)).toBeTruthy();
    expect(within(panel).getByRole("link", { name: /livestock/i }).getAttribute("href")).toBe("/livestock");
  });

  it("describes the planned individual animal detail without any animal record", () => {
    const rail = renderRail();
    fireEvent.click(within(rail).getByRole("button", { name: /cattle/i }));
    const ia = rail.querySelector("[data-individual-animal-ia]") as HTMLElement;
    for (const label of ["Tag", "Age", "Weight", "Target weight", "Group · location"]) expect(within(ia).getByText(label)).toBeTruthy();
    expect(within(ia).getByText("Not yet supported")).toBeTruthy();
    expect(within(ia).queryByText(/\d/)).toBeNull();
  });

  it("Sheds lists real sheds with canonical occupancy and states head capacity is not recorded", () => {
    const rail = renderRail();
    fireEvent.click(within(rail).getByRole("button", { name: /sheds/i }));
    const panel = within(rail).getByRole("region", { name: "Sheds" });
    expect(within(panel).getByText("Main shed")).toBeTruthy();
    expect(within(panel).getByText("15 head · 1 group")).toBeTruthy();
    expect(within(panel).getByText("Straw bedded")).toBeTruthy();
    expect(within(panel).getByText("No groups assigned")).toBeTruthy();
    expect(within(panel).getByText(/head capacity and spaces free aren't recorded yet/i)).toBeTruthy();
    expect(within(panel).queryByText(/spaces free$/)).toBeNull();
  });

  it("Sheep opens an honest shell with no count and no destination", () => {
    const rail = renderRail();
    fireEvent.click(within(rail).getByRole("button", { name: /sheep/i }));
    const panel = within(rail).getByRole("region", { name: "Sheep" });
    expect(within(panel).getByText(/sheep groups aren't supported yet/i)).toBeTruthy();
    expect(within(panel).queryByRole("link")).toBeNull();
    expect(within(panel).queryByText(/\d/)).toBeNull();
  });

  it("one object at a time: selecting again, the close button or Escape closes it", () => {
    const rail = renderRail();
    const cattle = within(rail).getByRole("button", { name: /cattle/i });
    fireEvent.click(cattle);
    fireEvent.click(within(rail).getByRole("button", { name: /sheds/i }));
    expect(within(rail).queryByRole("region", { name: "Cattle groups" })).toBeNull();
    expect(cattle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(within(rail).getByRole("button", { name: "Close Sheds" }));
    expect(within(rail).queryByRole("region")).toBeNull();
    fireEvent.click(cattle);
    fireEvent.keyDown(cattle, { key: "Escape" });
    expect(within(rail).queryByRole("region")).toBeNull();
    fireEvent.click(cattle);
    fireEvent.click(cattle);
    expect(within(rail).queryByRole("region")).toBeNull();
  });

  it("collapses its motion under reduced motion and uses no rounded cards", () => {
    const rail = renderRail();
    fireEvent.click(within(rail).getByRole("button", { name: /cattle/i }));
    const panel = within(rail).getByRole("region", { name: "Cattle groups" });
    expect(panel.className).toContain("motion-reduce:transition-none");
    expect(panel.querySelectorAll("[class*='rounded-[1'], [class*='rounded-2xl'], [class*='rounded-xl']")).toHaveLength(0);
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
