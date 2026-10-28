import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Field } from "@/domain/types";
import type { FarmFieldSelectionView } from "@/lib/farm-field-selection";
import { FarmFieldDrawer } from "./FarmFieldDrawer";

afterEach(cleanup);

const field = { id: "f1", farmId: "farm", name: "Long Field", areaHa: 4.236, centroid: [-8, 53], fertility: {}, history: [] } as unknown as Field;

const selection: FarmFieldSelectionView = {
  area: "4.24 ha",
  useLine: "Planned · Grazing",
  statement: { text: "59 kg N/ha remaining after planned slurry.", tone: "fact" },
  context: [
    { label: "P", value: "Unknown", tone: "unknown" },
    { label: "Legal gate", value: "Commonage · Cannot determine", tone: "blocked" },
  ],
  primaryAction: { label: "Open nutrient plan", href: "/today/field/f1" },
  secondaryLinks: [
    { label: "Open field workspace", href: "/fields?field=f1" },
    { label: "History", href: "/fields?field=f1&chapter=history" },
  ],
};

describe("FarmFieldDrawer (Farm + Fields redesign)", () => {
  it("shows identity, one statement, quiet context, one primary action and deeper links, in that order", () => {
    const { container } = render(<FarmFieldDrawer field={field} lensId="nutrients" selection={selection} onClose={() => {}} />);
    const drawer = screen.getByRole("region", { name: "Long Field field" });
    expect(drawer.getAttribute("data-open")).toBe("true");
    expect(screen.getByRole("heading", { name: "Long Field" })).toBeTruthy();
    expect(container.querySelector("[data-selection-identity]")!.textContent).toBe("4.24 ha · Planned · Grazing");
    expect(container.querySelector("[data-selection-statement]")!.textContent).toBe("59 kg N/ha remaining after planned slurry.");
    expect(screen.getByText("Unknown")).toBeTruthy();
    const primary = container.querySelectorAll("[data-primary-action]");
    expect(primary).toHaveLength(1);
    expect(primary[0].getAttribute("href")).toBe("/today/field/f1");
    expect(screen.getByRole("link", { name: "History" }).getAttribute("href")).toBe("/fields?field=f1&chapter=history");
  });

  it("uses a deep forest surface with a thin straw/gold rule, not a card grid", () => {
    const { container } = render(<FarmFieldDrawer field={field} lensId="current" selection={selection} onClose={() => {}} />);
    const drawer = container.querySelector("[data-field-drawer]")!;
    expect(drawer.className).toContain("bg-fr-v2-forest-deep");
    expect(container.querySelector("[data-selection-rule]")!.className).toContain("bg-fr-v2-gold");
    expect(drawer.querySelectorAll("[class*='grid-cols']")).toHaveLength(0);
  });

  it("marks a blocked statement in words, not colour alone", () => {
    render(<FarmFieldDrawer field={field} lensId="current" selection={{ ...selection, statement: { text: "Closed period", tone: "blocked" } }} onClose={() => {}} />);
    expect(screen.getByText("Blocked")).toBeTruthy();
  });

  it("closes from the close button and from Escape, but leaves Escape to an open dialog", () => {
    const onClose = vi.fn();
    render(<FarmFieldDrawer field={field} lensId="grass" selection={selection} onClose={onClose} />);
    const close = screen.getByRole("button", { name: "Close Long Field" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    dialog.remove();
  });

  it("is hidden and inert with no selected field, and ignores Escape", () => {
    const onClose = vi.fn();
    const { container } = render(<FarmFieldDrawer field={undefined} lensId="current" selection={undefined} onClose={onClose} />);
    const drawer = container.querySelector("[data-field-drawer]")!;
    expect(drawer.getAttribute("data-open")).toBe("false");
    expect(drawer.hasAttribute("inert")).toBe(true);
    expect(drawer.className).toContain("motion-reduce:transition-none");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the last field rendered while it falls away after deselection", () => {
    const { rerender, container } = render(<FarmFieldDrawer field={field} lensId="current" selection={selection} onClose={() => {}} />);
    rerender(<FarmFieldDrawer field={undefined} lensId="current" selection={undefined} onClose={() => {}} />);
    const drawer = container.querySelector("[data-field-drawer]")!;
    expect(drawer.getAttribute("data-open")).toBe("false");
    expect(drawer.textContent).toContain("Long Field");
  });
});
