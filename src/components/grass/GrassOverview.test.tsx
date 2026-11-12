import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { GrassOverview, type OverviewField } from "./GrassOverview";
import { GRASS_SETTINGS_KEY, resetGrassSettingsForTest } from "@/lib/grass-settings";
import type { DemandGroup, GrowthSelection } from "@/domain/grass-wedge-target";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const FIELDS: OverviewField[] = [
  { fieldId: "a", name: "Hill", areaHa: 2, coverKgDmHa: 1600, basis: "measured", ageDays: 2, occupants: [], historyCount: 3, use: "grazing" },
  { fieldId: "b", name: "Side", areaHa: 3, coverKgDmHa: 900, basis: "measured", ageDays: 2, occupants: ["Cows (10)"], historyCount: 1, use: "grazing" },
  { fieldId: "c", name: "Back", areaHa: 5, coverKgDmHa: 400, basis: "measured", ageDays: 2, occupants: [], historyCount: 1, use: "mixed" },
];
const GROUPS: DemandGroup[] = [{ groupId: "g2", label: "Cows", headCount: 10, fieldId: "b", dailyDemandKgDm: 250, kgDmPerHeadDay: 25 }];
const GROWTH: GrowthSelection = {
  chosen: { kind: "walks", rateKgDmHaDay: 16, at: "2026-11-10T00:00:00Z", label: "Measured on your walks", source: "walks" },
  others: [{ kind: "regional", rateKgDmHaDay: 50, at: "2026-11-11T00:00:00Z", label: "Teagasc county prediction", source: "Teagasc" }],
  reason: "Your own figure is used.",
};

function renderOverview(props: Partial<Parameters<typeof GrassOverview>[0]> = {}) {
  const onSelectField = vi.fn();
  render(
    <GrassOverview
      asOf="2026-06-12T12:00:00Z"
      fields={FIELDS}
      groups={GROUPS}
      growth={GROWTH}
      averageCoverKgDmHa={760}
      averageBasis="measured"
      horizon={0}
      horizons={[0, 3, 7]}
      horizonAvailable={() => true}
      onHorizon={vi.fn()}
      onSelectField={onSelectField}
      map={<div data-testid="the-map">map</div>}
      {...props}
    />,
  );
  return { onSelectField };
}

describe("Grass V2 overview", () => {
  beforeEach(() => { window.localStorage.clear(); resetGrassSettingsForTest(); });
  afterEach(cleanup);

  it("opens on the wedge, mounts the map when first shown, and keeps it while switching back", () => {
    renderOverview();
    const view = screen.getByRole("group", { name: "Grass view" });
    expect(within(view).getByRole("button", { name: "Grass wedge" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("the-map")).not.toBeInTheDocument();
    fireEvent.click(within(view).getByRole("button", { name: "Farm map" }));
    expect(screen.getByTestId("the-map").parentElement).not.toHaveClass("hidden");
    fireEvent.click(within(view).getByRole("button", { name: "Grass wedge" }));
    expect(screen.getByTestId("the-map").parentElement).toHaveClass("hidden");
  });

  it("leaves silage and tillage fields out of the grazing area, and asks for unset field uses", () => {
    window.localStorage.setItem(GRASS_SETTINGS_KEY, JSON.stringify({ targets: { rotationDays: 21, residualKgDmHa: 150 }, guideDone: true }));
    resetGrassSettingsForTest();
    renderOverview({ fields: [...FIELDS, { fieldId: "s", name: "Silage", areaHa: 8, coverKgDmHa: 2500, occupants: [], historyCount: 1, use: "silage_1st_cut" }] });
    // Still 10 ha of grazing: 250 ÷ 10 × 21 + 150 = 675.
    expect(screen.getByText("Target pre-grazing 675 kg DM/ha")).toBeInTheDocument();
    cleanup();
    renderOverview({ fields: [...FIELDS, { fieldId: "u", name: "Bottom", areaHa: 4, occupants: [], historyCount: 0 }] });
    expect(screen.getByRole("link", { name: "Set the use of Bottom" })).toHaveAttribute("href", "/fields?field=u&focus=field-use");
  });

  it("only offers the mid-season preset in the main grazing season", () => {
    renderOverview({ asOf: "2026-11-12T12:00:00Z" });
    fireEvent.click(screen.getAllByRole("button", { name: "Set rotation length" })[0]);
    expect(screen.queryByRole("button", { name: "Fill in the Teagasc mid-season guide" })).not.toBeInTheDocument();
    expect(screen.getByText(/enter the longer rotation you're running now/)).toBeInTheDocument();
  });

  it("shows one growth figure with its source, and the other figure beside it", () => {
    renderOverview();
    expect(screen.getByText("Measured on your walks")).toBeInTheDocument();
    expect(screen.getByText("Teagasc county prediction: 50")).toBeInTheDocument();
  });

  it("asks for grazing targets before drawing the line, then draws it once they're saved", () => {
    renderOverview();
    expect(screen.getAllByText(/Set your rotation length and grazing residual/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Set rotation length" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Fill in the Teagasc mid-season guide" }));
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    // 250 kg DM/day ÷ 10 ha × 21 + 150 = 675
    expect(screen.getByText("Target pre-grazing 675 kg DM/ha")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(GRASS_SETTINGS_KEY)!).targets).toEqual({ rotationDays: 21, residualKgDmHa: 150 });
  });

  it("sends the farmer straight to the missing liveweight when demand is incomplete", () => {
    renderOverview({ groups: [{ groupId: "g9", label: "weanlings", headCount: 12, fieldId: "a", missingReason: "we need their average liveweight before working out their grass demand" }] });
    window.localStorage.setItem(GRASS_SETTINGS_KEY, JSON.stringify({ targets: { rotationDays: 21, residualKgDmHa: 150 } }));
    cleanup();
    resetGrassSettingsForTest();
    renderOverview({ groups: [{ groupId: "g9", label: "weanlings", headCount: 12, fieldId: "a", missingReason: "we need their average liveweight before working out their grass demand" }] });
    expect(screen.getByText("Complete your grazing demand")).toBeInTheDocument();
    expect(screen.getByText(/Your 12 weanlings are recorded on grass/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add cattle liveweight" })).toHaveAttribute("href", "/cattle/groups/g9");
  });

  it("shows the first-time guide until it's dismissed, and brings it back on request", () => {
    renderOverview();
    const guide = screen.getByRole("dialog", { name: "Grass guide" });
    fireEvent.click(within(guide).getByRole("button", { name: "Next tip" }));
    expect(within(guide).getByText("Understand the red line")).toBeInTheDocument();
    fireEvent.click(within(guide).getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog", { name: "Grass guide" })).not.toBeInTheDocument();
    cleanup();
    resetGrassSettingsForTest();
    renderOverview();
    expect(screen.queryByRole("dialog", { name: "Grass guide" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show grass guide" }));
    expect(screen.getByRole("dialog", { name: "Grass guide" })).toBeInTheDocument();
  });

  it("previews taking a field out without changing anything", () => {
    window.localStorage.setItem(GRASS_SETTINGS_KEY, JSON.stringify({ targets: { rotationDays: 21, residualKgDmHa: 150 }, guideDone: true }));
    resetGrassSettingsForTest();
    const { onSelectField } = renderOverview({ selectedFieldId: "a" });
    fireEvent.click(screen.getByRole("button", { name: "What if it's taken out?" }));
    const scenario = screen.getByRole("region", { name: "Try a change" });
    expect(within(scenario).getByText("8 ha")).toBeInTheDocument();
    expect(within(scenario).getByText(/A preview only/)).toBeInTheDocument();
    expect(onSelectField).not.toHaveBeenCalled();
  });
});
