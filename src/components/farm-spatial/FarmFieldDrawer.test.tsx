import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { tracked, type Field } from "@/domain/types";
import { farmFieldLensView } from "@/lib/farm-spatial-field-lens";
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
    expect(screen.getByRole("link", { name: /field nutrient plan/i }).getAttribute("href")).toBe("/nutrients?field=f1");
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
