import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/decisions", () => ({
  submitPromptDecisionAction: vi.fn(),
}));
vi.mock("@/app/actions/job-sessions", () => ({
  startJobSessionFromPromptAction: vi.fn(),
}));
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { submitPromptDecisionAction } from "@/app/actions/decisions";
import { startJobSessionFromPromptAction } from "@/app/actions/job-sessions";
import { ExpandedPromptSheet } from "./ExpandedPromptSheet";
import type { Prompt } from "@/orchestration/prompt";

const mockSubmit = vi.mocked(submitPromptDecisionAction);
const mockStartJob = vi.mocked(startJobSessionFromPromptAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Not job-startable (GPS Job Session + Confirm Actual contract only turns
// spreading_window into a real "Start job" action — see
// ExpandedPromptSheet.tsx's own doc comment) — this fixture exercises the
// pre-existing plain Accept/Dismiss path unchanged.
const okPrompt: Prompt = {
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
};

const blockedPrompt: Prompt = {
  ...okPrompt,
  id: "prompt-2",
  title: "Spreading window status needs review — Field 7",
  basis: { status: "LEGAL_PROHIBITION", reasonCode: "CLOSED_PERIOD", consequence: "closed period in force" },
};

// The one job-startable kind — Codex round for the GPS Job Session +
// Confirm Actual contract.
const spreadingPrompt: Prompt = {
  id: "prompt-3",
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

  it("renders the real calculation version, not just handing it to Ask AI's own context (Codex audit HIGH, round 3)", () => {
    render(
      <ExpandedPromptSheet
        open
        onClose={() => {}}
        prompt={{ ...okPrompt, calculationVersion: "SPREADING_WINDOW_GATE_v1+CLOSED_PERIOD_CALENDAR_v3" }}
        canRecord
      />,
    );
    expect(screen.getByText("Calculation version:")).toBeTruthy();
    expect(screen.getByText("SPREADING_WINDOW_GATE_v1+CLOSED_PERIOD_CALENDAR_v3")).toBeTruthy();
  });

  it("offers Accept for an OK basis, and records it via the real server action with only real minimal facts (never the client's own evidence snapshot)", async () => {
    mockSubmit.mockResolvedValue({
      id: "decision-1",
      farmId: "farm-1",
      promptId: "prompt-1",
      calculationKind: "soil_test_age",
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
    // Codex audit HIGH (round 1): the server action recomputes the real
    // Prompt itself from these minimal facts — the client must never send
    // its own basis/inputsSnapshot/calculationVersion for the server to
    // trust verbatim.
    expect(mockSubmit).toHaveBeenCalledWith({
      promptKind: "soil_test_age",
      fieldId: "field-7",
      outcome: "accepted",
      material: undefined,
    });
  });

  it("offers Start job instead of Accept for a job-startable (spreading_window) OK basis, and starts a real Job Session", async () => {
    mockStartJob.mockResolvedValue({
      decision: { id: "decision-1" } as never,
      jobSession: { id: "session-1" } as never,
    });
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={spreadingPrompt} canRecord />);
    expect(screen.queryByText("Accept")).toBeNull();
    fireEvent.click(screen.getByText("Start job"));
    await waitFor(() => expect(mockStartJob).toHaveBeenCalledTimes(1));
    expect(mockStartJob).toHaveBeenCalledWith(
      expect.objectContaining({
        promptKind: "spreading_window",
        fieldId: "field-7",
        activityType: "fertiliser_spreading",
        origin: "prompt",
        material: "chemical_fertiliser",
      }),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/job\//)));
  });

  it("shows an honest demo-mode message instead of starting a real job when canRecord is false", async () => {
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={spreadingPrompt} canRecord={false} />);
    fireEvent.click(screen.getByText("Start job"));
    await waitFor(() => expect(screen.getByText(/demo mode/i)).toBeTruthy());
    expect(mockStartJob).not.toHaveBeenCalled();
  });

  it("resets its recorded state when a different Prompt is shown, never reusing a stale 'recorded' message", async () => {
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
    const { rerender } = render(<ExpandedPromptSheet open onClose={() => {}} prompt={okPrompt} canRecord />);
    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(screen.getByText(/accepted — recorded/i)).toBeTruthy());

    const otherPrompt: Prompt = { ...okPrompt, id: "prompt-3", title: "Calendar open — Home Field", fieldId: "field-9" };
    rerender(<ExpandedPromptSheet open onClose={() => {}} prompt={otherPrompt} canRecord />);

    expect(screen.queryByText(/accepted — recorded/i)).toBeNull();
    expect(screen.getByText("Accept")).toBeTruthy();
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

  it("shows a stable, generic error message when the server action rejects, never a fabricated success or the raw server error", async () => {
    mockSubmit.mockRejectedValue(new Error("insertDecision: farm farm-1 does not belong to the current session"));
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={okPrompt} canRecord />);
    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(screen.getByText(/something went wrong recording this decision/i)).toBeTruthy());
    // Codex audit LOW (round 1): the raw Postgres/Supabase error text must
    // never reach the screen — only a stable, generic message.
    expect(screen.queryByText(/does not belong to the current session/)).toBeNull();
  });

  it("fails closed with an honest message when the Prompt has no fieldId to recompute against", async () => {
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={{ ...okPrompt, fieldId: undefined }} canRecord />);
    fireEvent.click(screen.getByText("Accept"));
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("gives Ask AI the real evidence tier for an OK prompt, matching the visible Pill exactly — Phase C, contextual Ask AI completeness (2026-09-03)", () => {
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={okPrompt} canRecord />);
    // The screen's own visible tier badge.
    expect(screen.getByText("Official model")).toBeTruthy();
    fireEvent.click(screen.getByText("Ask AI"));
    // Ask AI's own context shows the identical real tier, not the raw
    // "OK" status string this fix replaced.
    expect(screen.getByText("Evidence:")).toBeTruthy();
    expect(screen.queryByText("OK")).toBeNull();
    expect(screen.getAllByText("Official model").length).toBeGreaterThanOrEqual(2);
  });

  it("gives Ask AI the raw blocked status for a non-OK prompt (no evidence tier exists to disclose)", () => {
    render(<ExpandedPromptSheet open onClose={() => {}} prompt={blockedPrompt} canRecord />);
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getByText("LEGAL_PROHIBITION")).toBeTruthy();
  });
});
