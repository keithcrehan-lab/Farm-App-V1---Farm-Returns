import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { FarmYourFarmPanel, yourFarmSummaryParts, type FarmYourFarmPanelProps } from "./FarmYourFarmPanel";
import { tracked, type Housing, type LivestockGroup } from "@/domain/types";

afterEach(cleanup);

const groups: LivestockGroup[] = [
  { id: "g-wean", farmId: "f", category: "weanling", label: "Weanlings", count: tracked(15, "verified", "Farmer"), system: "housed", value: tracked(0, "estimated", "Farm Return assumption") },
  { id: "g-cows", farmId: "f", category: "suckler_cow", label: "Cows", count: tracked(20, "estimated", "Farm Return assumption"), system: "grazing", value: tracked(0, "estimated", "Farm Return assumption") },
];
const sheds = [
  { id: "h-1", shedName: "Main shed", shedType: "slatted", linkedGroupIds: ["g-wean"] },
  { id: "h-2", shedName: "Old shed", shedType: "straw_bedded", linkedGroupIds: [] },
] as unknown as Housing[];

const BASE: Omit<FarmYourFarmPanelProps, "expanded" | "onExpandedChange"> = {
  counts: { cattleHeadCount: 35, cattleGroupCount: 2, shedCount: 2 },
  fieldCount: 12,
  mappedFieldCount: 10,
  farmAreaHa: 48.25,
  livestockGroups: groups,
  housing: sheds,
};

function Harness(props: Partial<FarmYourFarmPanelProps> & { onChange?: (expanded: boolean) => void; initiallyExpanded?: boolean }) {
  const { onChange, initiallyExpanded = false, ...rest } = props;
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return (
    <FarmYourFarmPanel
      {...BASE}
      {...rest}
      expanded={expanded}
      onExpandedChange={(next) => {
        onChange?.(next);
        setExpanded(next);
      }}
    />
  );
}

function panel() {
  return screen.getByRole("region", { name: "Your Farm" });
}
/** A summary card (the toggle's own name also mentions cattle/sheds). */
function card(name: string) {
  const el = panel().querySelector(`[data-your-farm-card="${name}"]`);
  if (!el) throw new Error(`no ${name} card`);
  return el as HTMLElement;
}
function toggle() {
  return within(panel()).getByRole("button", { name: /show farm summary|hide farm summary/i });
}

describe("FarmYourFarmPanel", () => {
  it("collapsed: one compact line of real field, cattle head and shed counts, behind an accessible toggle", () => {
    render(<Harness />);
    expect(panel().getAttribute("data-expanded")).toBe("false");
    expect(panel().querySelector("[data-your-farm-summary]")!.textContent).toBe("12 fields · 35 cattle · 2 sheds");
    const button = toggle();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.className).toContain("min-h-11");
    const body = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(body.hidden).toBe(true);
    expect(within(panel()).queryByRole("link")).toBeNull();
  });

  it("never fabricates a 0: nothing recorded reads as none recorded, with no number", () => {
    expect(yourFarmSummaryParts({ counts: { cattleHeadCount: 0, cattleGroupCount: 0, shedCount: 0 }, fieldCount: 0 })).toEqual([
      "No fields yet",
      "No cattle recorded",
      "No sheds recorded",
    ]);
    render(<Harness counts={{ cattleHeadCount: 0, cattleGroupCount: 0, shedCount: 0 }} fieldCount={0} mappedFieldCount={0} farmAreaHa={null} livestockGroups={[]} housing={[]} initiallyExpanded />);
    expect(within(panel()).queryByText(/\b0\b/)).toBeNull();
    expect(within(panel()).getAllByText("None recorded")).toHaveLength(3);
  });

  it("uses singular wording for one field, one shed", () => {
    expect(yourFarmSummaryParts({ counts: { cattleHeadCount: 1, cattleGroupCount: 1, shedCount: 1 }, fieldCount: 1 })).toEqual(["1 field", "1 cattle", "1 shed"]);
  });

  it("expanded: Fields, Cattle, Sheds and Grass cards; Fields and Grass link to their canonical screens", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(toggle());
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const cards = within(panel()).getByRole("list", { name: "Farm summary" });
    expect(Array.from(cards.querySelectorAll("[data-your-farm-card]")).map((el) => el.getAttribute("data-your-farm-card"))).toEqual(["fields", "cattle", "sheds", "grass"]);
    const fields = card("fields");
    expect(fields.tagName).toBe("A");
    expect(fields.getAttribute("href")).toBe("/fields");
    expect(within(fields).getByText("12")).toBeTruthy();
    expect(within(fields).getByText("10 of 12 mapped · 48.3 ha")).toBeTruthy();
    const grass = card("grass");
    expect(grass.tagName).toBe("A");
    expect(grass.getAttribute("href")).toBe("/grass");
    // No grass records loaded here: no cover figure is shown.
    expect(within(grass).queryByText(/\d/)).toBeNull();
  });

  it("shows the Grass view's real average cover only when it is supplied", () => {
    render(<Harness grassAverageCoverKgDmHa={1234.4} initiallyExpanded />);
    const grass = card("grass");
    expect(within(grass).getByText(/^1,?234$/)).toBeTruthy();
    expect(within(grass).getByText("kg DM/ha avg.")).toBeTruthy();
  });

  it("Cattle opens the rail's own real group detail, with its link to /cattle", () => {
    render(<Harness initiallyExpanded />);
    const cattle = card("cattle");
    expect(cattle.tagName).toBe("BUTTON");
    expect(within(cattle).getByText("35")).toBeTruthy();
    expect(within(cattle).getByText("head · 2 groups")).toBeTruthy();
    fireEvent.click(cattle);
    expect(cattle.getAttribute("aria-expanded")).toBe("true");
    const detail = within(panel()).getByRole("region", { name: "Cattle groups" });
    expect(cattle.getAttribute("aria-controls")).toBe(detail.id);
    expect(within(detail).getByRole("link", { name: /weanlings/i }).getAttribute("href")).toBe("/cattle/groups/g-wean");
    expect(within(detail).getByRole("link", { name: /^cattle/i }).getAttribute("href")).toBe("/cattle");
  });

  it("Sheds opens the rail's own real shed detail, with its link to /housing; one detail at a time", () => {
    render(<Harness initiallyExpanded />);
    fireEvent.click(card("cattle"));
    fireEvent.click(card("sheds"));
    expect(within(panel()).queryByRole("region", { name: "Cattle groups" })).toBeNull();
    expect(card("cattle").getAttribute("aria-expanded")).toBe("false");
    const detail = within(panel()).getByRole("region", { name: "Sheds" });
    expect(within(detail).getByText("Main shed")).toBeTruthy();
    expect(within(detail).getByText("15 head · 1 group")).toBeTruthy();
    expect(within(detail).getByRole("link", { name: /housing/i }).getAttribute("href")).toBe("/housing");
    fireEvent.click(within(detail).getByRole("button", { name: "Close Sheds" }));
    expect(within(panel()).queryByRole("region", { name: "Sheds" })).toBeNull();
  });

  it("Escape closes an open detail first, then collapses the panel and returns focus to the toggle", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initiallyExpanded />);
    const cattle = card("cattle");
    fireEvent.click(cattle);
    fireEvent.keyDown(cattle, { key: "Escape" });
    expect(within(panel()).queryByRole("region", { name: "Cattle groups" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(cattle, { key: "Escape" });
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(panel().getAttribute("data-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle());
  });

  it("collapsing closes any open detail, so it reopens on the cards", () => {
    render(<Harness initiallyExpanded />);
    fireEvent.click(card("sheds"));
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(within(panel()).queryByRole("region", { name: "Sheds" })).toBeNull();
  });

  it("matches the Farm Today dark glass style, bounds its height for small screens and honours reduced motion", () => {
    render(<Harness initiallyExpanded />);
    expect(panel().className).toContain("bg-fr-v2-forest-deep/88");
    expect(panel().className).toContain("backdrop-blur-md");
    const body = panel().querySelector("[data-your-farm-body]") as HTMLElement;
    expect(body.className).toContain("max-h-[min(50dvh,420px)]");
    expect(body.className).toContain("overflow-y-auto");
    for (const card of Array.from(panel().querySelectorAll("[data-your-farm-card]"))) {
      expect(card.className).toContain("motion-reduce:transition-none");
    }
  });
});
