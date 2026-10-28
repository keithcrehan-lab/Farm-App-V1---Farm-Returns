import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MobileBottomNav } from "./MobileBottomNav";

const pathname = vi.hoisted(() => ({ current: "/today" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

afterEach(() => {
  cleanup();
  pathname.current = "/today";
});

describe("MobileBottomNav (Farm + Fields redesign)", () => {
  it("keeps a compact five-slot bar: Farm, Plan, Cattle, Records and More", () => {
    render(<MobileBottomNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Farm", "Plan", "Cattle", "Records"]);
    expect(within(nav).getByRole("button", { name: /more/i })).toBeTruthy();
    expect(within(nav).queryByText("What Matters")).toBeNull();
  });

  it("reaches Housing, Finance and What Matters through More", () => {
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    const more = screen.getByRole("navigation", { name: "More" });
    const hrefs = within(more).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs.slice(0, 3)).toEqual(["/housing", "/finance", "/what-matters"]);
    expect(hrefs).toContain("/fields");
  });

  it("marks Cattle current on a real group page", () => {
    pathname.current = "/cattle/groups/g-1";
    render(<MobileBottomNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Cattle" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Farm" }).getAttribute("aria-current")).toBeNull();
  });
});
