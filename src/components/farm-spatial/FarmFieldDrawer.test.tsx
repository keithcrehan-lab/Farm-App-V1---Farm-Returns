import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { tracked, type Field } from "@/domain/types";
import { farmFieldLensView } from "@/lib/farm-spatial-field-lens";
import type { FieldNutrientPlanView } from "@/lib/field-nutrient-plan-presentation";
import { FarmFieldDrawer } from "./FarmFieldDrawer";

afterEach(cleanup);

const field = {
  id: "f1",
  farmId: "farm",
  name: "Long Field",
  areaHa: 4.236,
  centroid: [-8, 53],
  fertility: { pIndex: tracked(2, "verified", "Soil test") },
} as Field;

describe("FarmFieldDrawer", () => {
  it("shows the real field identity and the active lens's facts", () => {
    const view = farmFieldLensView("nutrients", field, { slurryAllocations: [] });
    render(<FarmFieldDrawer field={field} lensId="nutrients" view={view} onClose={() => {}} />);
    const drawer = screen.getByRole("region", { name: "Long Field field" });
    expect(drawer.getAttribute("data-open")).toBe("true");
    expect(screen.getByRole("heading", { name: "Long Field" })).toBeTruthy();
    expect(screen.getByText("4.24 ha")).toBeTruthy();
    expect(screen.getByText("Index 2")).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
    expect(screen.getByRole("link", { name: /nutrient planner/i }).getAttribute("href")).toBe("/nutrients?field=f1");
  });

  it("shows the plan's remaining N/P/K and organic allocation as given, Unknown never 0, and leads into the field nutrient plan", () => {
    const view = farmFieldLensView("nutrients", field, { slurryAllocations: [] });
    const unknown = { state: "unknown", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" } as const;
    const plan: FieldNutrientPlanView = {
      status: "available",
      rows: [
        { id: "requirement", label: "Requirement", cells: { n: { state: "value", kgHa: 60 }, p: { state: "value", kgHa: 20 }, k: unknown } },
        { id: "organic", label: "Organic contribution", cells: { n: { state: "value", kgHa: 17.2 }, p: { state: "value", kgHa: 5.7 }, k: unknown } },
        { id: "remaining", label: "Remaining", cells: { n: { state: "value", kgHa: 42.4 }, p: { state: "value", kgHa: 12.6 }, k: unknown } },
      ],
      unknownReasons: ["A soil P or K Index isn't recorded — add a soil test to complete the plan."],
      organic: { state: "planned", totalM3: 30.6, rateM3ha: 23, method: "LESS", methodAssumed: true, timingAssumed: true, creditAssessed: true },
      solution: { kind: "unavailable", label: "Withheld", message: "Withheld" },
      evidence: { calculationVersion: "v", engineVersion: "e", cropBasis: "grazing", plannedUseAssumed: true, requirementRuleRefs: [], limitations: [], remainingEvidence: {} },
    };
    const { container } = render(<FarmFieldDrawer field={field} lensId="nutrients" view={view} nutrientPlan={{ view: plan, href: "/today/field/f1" }} onClose={() => {}} />);
    const section = container.querySelector("[data-drawer-nutrient-plan]")!;
    expect(section.querySelector('[data-nutrient="n"]')!.textContent).toBe("42kg/ha");
    expect(section.querySelector('[data-nutrient="p"]')!.textContent).toBe("13kg/ha");
    expect(section.querySelector('[data-nutrient="k"]')!.textContent).toBe("Unknown");
    expect(section.textContent).toContain("add a soil test");
    expect(section.textContent).toContain("31 m³");
    expect(section.textContent).toContain("23 m³/ha · LESS (assumed)");
    expect(screen.getByRole("link", { name: "Open nutrient plan" }).getAttribute("href")).toBe("/today/field/f1");
  });

  it("shows an unavailable plan's honest message with no figures", () => {
    const view = farmFieldLensView("nutrients", field, { slurryAllocations: [] });
    const { container } = render(
      <FarmFieldDrawer field={field} lensId="nutrients" view={view} nutrientPlan={{ view: { status: "unavailable", message: "This field is tillage." }, href: "/today/field/f1" }} onClose={() => {}} />,
    );
    const section = container.querySelector("[data-drawer-nutrient-plan]")!;
    expect(section.textContent).toContain("This field is tillage.");
    expect(section.querySelector("[data-nutrient]")).toBeNull();
  });

  it("closes from the close button and from Escape", () => {
    const onClose = vi.fn();
    const view = farmFieldLensView("soil", field, { slurryAllocations: [] });
    render(<FarmFieldDrawer field={field} lensId="soil" view={view} onClose={onClose} />);
    const close = screen.getByRole("button", { name: "Close Long Field" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("is hidden and inert with no selected field, and ignores Escape", () => {
    const onClose = vi.fn();
    const { container } = render(<FarmFieldDrawer field={undefined} lensId="current" view={undefined} onClose={onClose} />);
    const drawer = container.querySelector("[data-field-drawer]")!;
    expect(drawer.getAttribute("data-open")).toBe("false");
    expect(drawer.hasAttribute("inert")).toBe(true);
    expect(drawer.className).toContain("motion-reduce:transition-none");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the last field rendered while it falls away after deselection", () => {
    const view = farmFieldLensView("current", field, { slurryAllocations: [] });
    const { rerender, container } = render(<FarmFieldDrawer field={field} lensId="current" view={view} onClose={() => {}} />);
    rerender(<FarmFieldDrawer field={undefined} lensId="current" view={undefined} onClose={() => {}} />);
    const drawer = container.querySelector("[data-field-drawer]")!;
    expect(drawer.getAttribute("data-open")).toBe("false");
    expect(drawer.textContent).toContain("Long Field");
  });
});
