import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("shows recommendations and one spreading-rules panel on today, not a list of per-field prompts", async () => {
    renderPlan();
    // Mock-mode seed data has four fields in Co. Cork during the closed period.
    await waitFor(() => expect(screen.getByText("Recommended for you")).toBeTruthy());
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getAllByText("Spreading rules")).toHaveLength(1);
    expect(screen.getByText("Prepare your 2027 fertiliser plan")).toBeTruthy();
    expect(screen.queryByText(/Spreading window status needs review/i)).toBeNull();
    expect(screen.queryByText("Genuine opportunities")).toBeNull();
    // No raw rule codes or engine identifiers on the primary screen.
    expect(document.body.textContent).not.toMatch(/[A-Z]{3,}_[A-Z_]{3,}/);
  });

  it("opens a recommendation's details with the evidence, and offers snooze and dismiss", async () => {
    renderPlan();
    await waitFor(() => expect(screen.getByText("Prepare your 2027 fertiliser plan")).toBeTruthy());
    const card = screen.getByText("Prepare your 2027 fertiliser plan").closest("li")!;
    fireEvent.click(within(card).getByRole("button", { name: "Details" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("What this is based on")).toBeTruthy();
    expect(within(dialog).getByText("How was this calculated?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Not relevant" }));
    // Mock mode is unsigned-in: the action must not appear to have saved.
    await waitFor(() => expect(screen.getByText("Sign in to save changes to your recommendations.")).toBeTruthy());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText(/Snoozed or dismissed \(1\)/)).toBeNull();
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
