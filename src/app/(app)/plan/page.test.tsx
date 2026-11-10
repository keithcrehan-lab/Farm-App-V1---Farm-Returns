import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import PlanPage from "./page";

afterEach(() => {
  cleanup();
});

function renderPlan() {
  return render(
    <FarmProvider>
      <PlanPage />
    </FarmProvider>,
  );
}

describe("PlanPage", () => {
  it("shows an honest 'no jobs scheduled' state rather than a fake calendar", async () => {
    renderPlan();
    await waitFor(() => expect(screen.getByText(/no jobs are scheduled yet/i)).toBeTruthy());
  });

  it("shows the app's own prompts as suggestions inside the week, not a separate list", async () => {
    renderPlan();
    // Mock-mode seed data always has at least one field, so there is
    // always at least one real (possibly evidence-gap) Prompt to suggest.
    await waitFor(() => expect(screen.getByText("Suggested")).toBeTruthy());
    expect(screen.queryByText("Genuine opportunities")).toBeNull();
  });

  it("offers week, season, year and month views", async () => {
    renderPlan();
    for (const name of ["Week", "Season", "Year", "Month"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
  });
});
