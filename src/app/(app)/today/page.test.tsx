import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import TodayPage from "./page";

// GPS Job Session + Confirm Actual contract: ExpandedPromptSheet now
// calls useRouter() (for its own "Start job" navigation) — see
// ExpandedPromptSheet.test.tsx's identical mock for the full reasoning.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Phase C (contextual Ask AI completeness, 2026-09-03): the real mock
// farm/field data `<FarmProvider>` seeds doesn't deterministically
// produce a known evidence tier for whichever Prompt ends up primary —
// mocking this one call site's own Prompt source directly gives the new
// "Leading prompt" evidence-tier test a real, known fixture to assert
// against, the same technique `ExpandedPromptSheet.test.tsx`'s own
// fixtures already use one layer up.
vi.mock("@/orchestration/prompt/build-all", () => ({
  buildAllRealPrompts: vi.fn(() => [
    {
      id: "prompt-1",
      farmId: "farm-1",
      kind: "soil_test_age",
      title: "Soil test renewal due — Field 7",
      description: "Field 7's soil test is more than 4 years old.",
      basis: { status: "OK", value: null, evidenceState: "IRISH_MODEL" },
      fieldId: "field-7",
      regulatory: "compliance_value",
      inputsSnapshot: { county: "Cork" },
      createdAt: "2026-09-01T09:00:00Z",
    },
  ]),
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

  it("gives Ask AI the real evidence tier for the leading prompt, not a bare title with no provenance — Phase C, contextual Ask AI completeness (2026-09-03)", async () => {
    renderToday();
    await waitFor(() => expect(screen.queryByText(/what matters now/i)).toBeTruthy());
    fireEvent.click(screen.getAllByText("Ask AI")[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Leading prompt:")).toBeTruthy();
    expect(within(dialog).getByText("Soil test renewal due — Field 7")).toBeTruthy();
    expect(within(dialog).getByTestId("ask-ai-fact-tier").textContent).toBe("Official model");
  });
});
