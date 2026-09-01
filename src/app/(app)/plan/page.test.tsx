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

  it("lists real genuine opportunities once mounted", async () => {
    renderPlan();
    await waitFor(() => expect(screen.getByText("Genuine opportunities")).toBeTruthy());
    // Mock-mode seed data always has at least one field, so there is
    // always at least one real (possibly evidence-gap) Prompt to show —
    // never the "nothing to review" empty state for the seeded mock farm.
    await waitFor(() => expect(screen.queryByText(/nothing to review right now/i)).toBeNull());
  });
});
