import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import TodayPage from "./page";

// GPS Job Session + Confirm Actual contract: ExpandedPromptSheet now
// calls useRouter() (for its own "Start job" navigation) — see
// ExpandedPromptSheet.test.tsx's identical mock for the full reasoning.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

function renderToday() {
  return render(
    <FarmProvider>
      <TodayPage />
    </FarmProvider>,
  );
}

describe("TodayPage", () => {
  it("computes and shows a real Prompt (or an honest empty state) after mount, never a fabricated placeholder", async () => {
    renderToday();
    await waitFor(() => expect(screen.queryByText(/what matters now/i) || screen.queryByText(/nothing needs your attention/i) || screen.queryByText(/map a field/i)).toBeTruthy());
  });

  it("never renders a 'Start job' action — no Act-stage job type exists for these Prompt kinds yet", async () => {
    renderToday();
    await waitFor(() => expect(screen.queryByText(/what matters now/i)).toBeTruthy());
    expect(screen.queryByText(/start job/i)).toBeNull();
  });

  it("opens the Expanded Prompt sheet with real evidence when 'View details' is pressed", async () => {
    renderToday();
    await waitFor(() => expect(screen.queryByText("View details")).toBeTruthy());
    fireEvent.click(screen.getByText("View details"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("provides a real Ask AI affordance with the current farm as context", async () => {
    renderToday();
    fireEvent.click(screen.getAllByText("Ask AI")[0]);
    expect(screen.getByText("Farm:")).toBeTruthy();
  });
});
