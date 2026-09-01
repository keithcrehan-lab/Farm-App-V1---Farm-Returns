import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/decisions", () => ({
  submitPromptDecisionAction: vi.fn(),
}));

import { submitPromptDecisionAction } from "@/app/actions/decisions";
import { ExpandedPromptSheet } from "./ExpandedPromptSheet";
import type { Prompt } from "@/orchestration/prompt";

const mockSubmit = vi.mocked(submitPromptDecisionAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const okPrompt: Prompt = {
  id: "prompt-1",
  farmId: "farm-1",
  kind: "spreading_window",
  title: "Calendar open — Field 7",
  description: "As of 2026-09-01, Field 7 is not inside the statutory closed period.",
  basis: { status: "OK", value: null, evidenceState: "IRISH_MODEL" },
  fieldId: "field-7",
  regulatory: "compliance_value",
  inputsSnapshot: { county: "Cork", material: "chemical_fertiliser" },
  createdAt: "2026-09-01T09:00:00Z",
};

const blockedPrompt: Prompt = {
  ...okPrompt,
  id: "prompt-2",
  title: "Spreading window status needs review — Field 7",
  basis: { status: "LEGAL_PROHIBITION", reasonCode: "CLOSED_PERIOD", consequence: "closed period in force" },
};

describe("ExpandedPromptSheet", () => {
  it("renders nothing when no prompt is supplied", () => {
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={undefined} canRecord={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the real evidence snapshot verbatim", () => {
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={okPrompt} fieldName="Field 7" canRecord />);
    expect(screen.getByText("county:")).toBeTruthy();
    expect(screen.getByText("Cork")).toBeTruthy();
  });

  it("offers Accept for an OK basis, and records it via the real server action", async () => {
    mockSubmit.mockResolvedValue({
      id: "decision-1",
      farmId: "farm-1",
      promptId: "prompt-1",
      calculationKind: "spreading_window",
      estimateSnapshot: okPrompt.basis,
      outcome: "accepted",
      decidedBy: "farmer",
      decidedAt: "2026-09-01T09:05:00Z",
      createdAt: "2026-09-01T09:05:00Z",
    });
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={okPrompt} canRecord />);
    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(screen.getByText(/accepted — recorded/i)).toBeTruthy());
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit.mock.calls[0][0]).toMatchObject({ promptId: "prompt-1", outcome: "accepted", decidedBy: "farmer" });
  });

  it("never offers Accept for a non-OK basis — only dismiss, matching decideAsFarmer's own invariant", () => {
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={blockedPrompt} canRecord />);
    expect(screen.queryByText("Accept")).toBeNull();
    expect(screen.getByText("Not now")).toBeTruthy();
  });

  it("in demo mode (canRecord=false), shows an honest message instead of attempting a write", async () => {
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={okPrompt} canRecord={false} />);
    fireEvent.click(screen.getByText("Not now"));
    await waitFor(() => expect(screen.getByText(/demo mode/i)).toBeTruthy());
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("shows a real error message when the server action rejects, rather than a fabricated success", async () => {
    mockSubmit.mockRejectedValue(new Error("insertDecision: farm farm-1 does not belong to the current session"));
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={okPrompt} canRecord />);
    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(screen.getByText(/does not belong to the current session/)).toBeTruthy());
  });
});
