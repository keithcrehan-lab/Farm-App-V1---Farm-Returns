import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("shows the app's own prompts as suggestions inside today, not a separate list", async () => {
    renderPlan();
    // Mock-mode seed data always has at least one field, so there is
    // always at least one real (possibly evidence-gap) Prompt to suggest.
    await waitFor(() => expect(screen.getByText("Suggested")).toBeTruthy());
    expect(screen.queryByText("Genuine opportunities")).toBeNull();
  });

  it("offers today, week, season and year views, with the month grid kept under week", async () => {
    renderPlan();
    for (const name of ["Today", "Week", "Season", "Year"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("tab", { name: "Week" }));
    fireEvent.click(screen.getByRole("radio", { name: "Month" }));
    expect(screen.getByRole("button", { name: "Next month" })).toBeTruthy();
  });

  it("keeps Up next on screen whichever view is open", async () => {
    renderPlan();
    for (const name of ["Today", "Week", "Season", "Year"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(screen.getByRole("complementary", { name: "Up next" })).toBeTruthy();
    }
  });

  it("shows the activity swim lanes on the season and year views", async () => {
    renderPlan();
    for (const view of ["Season", "Year"]) {
      fireEvent.click(screen.getByRole("tab", { name: view }));
      for (const lane of ["Cattle", "Grass", "Fertiliser", "Contractors", "Compliance"]) {
        expect(screen.getByRole("group", { name: `${lane} lane` })).toBeTruthy();
      }
    }
  });
});
