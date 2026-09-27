import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { FarmProvider } from "@/store/farm-store";
import SlurryPlanPage from "./page";

afterEach(() => {
  cleanup();
  push.mockReset();
  window.localStorage.clear();
});

function renderPage() {
  return render(
    <FarmProvider>
      <SlurryPlanPage />
    </FarmProvider>,
  );
}

describe("/spreading/plan", () => {
  it("still creates a plan through the existing form, which then appears as an active plan (Y)", async () => {
    renderPage();
    const planned = screen.getByRole("region", { name: "Planned spreading" });
    expect(within(planned).queryByText("Road Field")).toBeNull();
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "field-road" } });
    fireEvent.change(screen.getByLabelText("Volume to spread (m³)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("How will this slurry be spread?"), { target: { value: "LESS" } });
    fireEvent.change(screen.getByLabelText("Planned application date"), { target: { value: "2026-09-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Save spreading plan" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/today"));
    expect(within(planned).getByText("Road Field")).toBeTruthy();
    expect(within(planned).getByText("40 m³")).toBeTruthy();
  });

  it("the demo farm runs the same lifecycle: a cancelled plan moves to history", async () => {
    renderPage();
    const planned = screen.getByRole("region", { name: "Planned spreading" });
    const card = within(planned).getByText("Home Field").closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /^cancel$/i }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel plan" }));
    await screen.findByText(/Spreading plan cancelled/);
    expect(within(planned).queryByText("Home Field")).toBeNull();
    expect(screen.getByText("History (1)")).toBeTruthy();
  });
});
