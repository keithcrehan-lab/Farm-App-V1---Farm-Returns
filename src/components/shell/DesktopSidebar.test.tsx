import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DesktopSidebar } from "./DesktopSidebar";
import { moreNavItems, primaryNavItems } from "./nav-items";

const pathname = vi.hoisted(() => ({ current: "/today" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/store/farm-store", () => ({ useFarm: () => ({ ownerName: "Mary", name: "Hill Farm" }) }));

afterEach(() => {
  cleanup();
  pathname.current = "/today";
});

describe("DesktopSidebar (Farm Spatial V2 Phase 02B)", () => {
  it("always shows the six primary destinations (Farm + Fields redesign)", () => {
    render(<DesktopSidebar />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const item of primaryNavItems) expect(within(nav).getByText(item.label)).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Farm" }).getAttribute("aria-current")).toBe("page");
  });

  it("keeps legacy destinations behind one collapsed More control, not a permanent list", () => {
    render(<DesktopSidebar />);
    const more = screen.getByRole("button", { name: /more/i });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    for (const item of moreNavItems) expect(screen.queryByRole("link", { name: item.label })).toBeNull();
  });

  it("reaches every legacy destination through More", () => {
    render(<DesktopSidebar />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.getByRole("button", { name: /more/i }).getAttribute("aria-expanded")).toBe("true");
    const group = screen.getByRole("group", { name: "More" });
    for (const item of moreNavItems) {
      expect(within(group).getByRole("link", { name: item.label }).getAttribute("href")).toBe(item.href);
    }
    for (const href of ["/fields", "/supports", "/soil", "/fertiliser-plan", "/spreading", "/quotes"]) {
      expect(within(group).getAllByRole("link").map((a) => a.getAttribute("href"))).toContain(href);
    }
  });

  it("names the current legacy destination on the closed More control", () => {
    pathname.current = "/supports";
    render(<DesktopSidebar />);
    expect(screen.getByRole("button", { name: /more · supports/i })).toBeTruthy();
  });

  it("shows the Fields companion under Farm rather than repeating it on More", () => {
    pathname.current = "/fields";
    render(<DesktopSidebar />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Farm" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: /^more$/i })).toBeTruthy();
  });

  it("reaches What Matters through More, not the primary list", () => {
    render(<DesktopSidebar />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).queryByRole("link", { name: "What Matters" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(within(screen.getByRole("group", { name: "More" })).getByRole("link", { name: "What Matters" }).getAttribute("href")).toBe("/what-matters");
  });
});
