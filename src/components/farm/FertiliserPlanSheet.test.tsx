import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/decisions", () => ({ submitPromptDecisionAction: vi.fn() }));

import { submitPromptDecisionAction } from "@/app/actions/decisions";
import { FertiliserPlanSheet } from "./FertiliserPlanSheet";
import type { FertiliserRecommendationSummary } from "@/orchestration/prompt/fertiliser-recommendation";

const mockSubmit = vi.mocked(submitPromptDecisionAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function recommendation(overrides: Partial<FertiliserRecommendationSummary> = {}): FertiliserRecommendationSummary {
  return {
    fieldId: "field-1",
    areaHa: 4,
    requirementKgHa: { n: 35, p: 4, k: 0 },
    products: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7 }],
    calculationVersion: "nutrient_engine_v1.0.0",
    ...overrides,
  };
}

function renderSheet(props: Partial<React.ComponentProps<typeof FertiliserPlanSheet>> = {}) {
  const onClose = vi.fn();
  const onPlanned = vi.fn();
  const utils = render(
    <FertiliserPlanSheet
      open
      onClose={onClose}
      fieldId="field-1"
      fieldName="Field 7"
      recommendation={recommendation()}
      canRecord
      onPlanned={onPlanned}
      {...props}
    />,
  );
  return { ...utils, onClose, onPlanned };
}

describe("FertiliserPlanSheet", () => {
  it("prefills the recommended product/quantity as the default plan", () => {
    renderSheet();
    expect((screen.getByLabelText(/quantity/i) as HTMLInputElement).value).toBe("266.7");
    expect(screen.getByText(/18-6-12: 266.7 kg/)).toBeTruthy();
  });

  it("shows the real spreading-window timing status when supplied, and nothing when it isn't", () => {
    const { rerender } = renderSheet({ timing: { title: "Spreading is open", description: "Chemical fertiliser spreading is currently permitted." } });
    expect(screen.getByText("Spreading is open")).toBeTruthy();
    expect(screen.getByText(/currently permitted/)).toBeTruthy();

    rerender(
      <FertiliserPlanSheet open onClose={vi.fn()} fieldId="field-1" fieldName="Field 7" recommendation={recommendation()} canRecord onPlanned={vi.fn()} />,
    );
    expect(screen.queryByText(/timing/i)).toBeNull();
  });

  it("accepting as recommended submits outcome 'accepted' with no edits at all", async () => {
    mockSubmit.mockResolvedValue({} as never);
    const { onPlanned } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /accept as recommended/i }));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith({
      promptKind: "fertiliser_recommendation",
      fieldId: "field-1",
      outcome: "accepted",
      edits: undefined,
    });
    expect(onPlanned).toHaveBeenCalled();
  });

  it("saving a plan submits outcome 'edited' with the real plannedProduct/plannedQuantityKg", async () => {
    mockSubmit.mockResolvedValue({} as never);
    renderSheet();
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: /save my plan/i }));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith({
      promptKind: "fertiliser_recommendation",
      fieldId: "field-1",
      outcome: "edited",
      edits: { plannedProduct: "18-6-12", plannedQuantityKg: 200 },
    });
  });

  it("includes plannedDate in the edits when the farmer sets one", async () => {
    mockSubmit.mockResolvedValue({} as never);
    renderSheet();
    fireEvent.change(screen.getByLabelText(/planned date/i), { target: { value: "2026-09-20" } });
    fireEvent.click(screen.getByRole("button", { name: /save my plan/i }));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ edits: expect.objectContaining({ plannedDate: "2026-09-20" }) }));
  });

  it("dismissing submits outcome 'dismissed'", async () => {
    mockSubmit.mockResolvedValue({} as never);
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith({
      promptKind: "fertiliser_recommendation",
      fieldId: "field-1",
      outcome: "dismissed",
      edits: undefined,
    });
  });

  it("disables 'Save my plan' when the quantity is invalid, but never disables 'Accept as recommended'", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: "0" } });
    expect((screen.getByRole("button", { name: /save my plan/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /accept as recommended/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows an honest demo-mode message and never calls the real action when canRecord is false", async () => {
    renderSheet({ canRecord: false });
    fireEvent.click(screen.getByRole("button", { name: /accept as recommended/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/demo mode/i);
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
