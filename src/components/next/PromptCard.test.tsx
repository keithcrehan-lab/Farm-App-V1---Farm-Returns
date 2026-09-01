import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { PromptCard, PromptListRow } from "./PromptCard";
import type { Prompt } from "@/orchestration/prompt";

afterEach(() => {
  cleanup();
});

const prompt: Prompt = {
  id: "prompt-1",
  farmId: "farm-1",
  kind: "spreading_window",
  title: "Calendar open — Field 7",
  description: "As of 2026-09-01, Field 7 is not inside the statutory closed period for chemical fertiliser.",
  basis: { status: "OK", value: null, evidenceState: "IRISH_MODEL" },
  fieldId: "field-7",
  createdAt: "2026-09-01T09:00:00Z",
};

describe("PromptCard", () => {
  it("renders the real prompt's title and description", () => {
    render(<PromptCard prompt={prompt} onViewDetails={() => {}} />);
    expect(screen.getByText("Calendar open — Field 7")).toBeTruthy();
    expect(screen.getByText(/statutory closed period/)).toBeTruthy();
  });

  it("calls onViewDetails when the details button is pressed, never a fabricated 'Start job' action", () => {
    const onViewDetails = vi.fn();
    render(<PromptCard prompt={prompt} onViewDetails={onViewDetails} />);
    expect(screen.queryByText(/start job/i)).toBeNull();
    fireEvent.click(screen.getByText("View details"));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });
});

describe("PromptListRow", () => {
  it("renders the prompt and calls onViewDetails on click", () => {
    const onViewDetails = vi.fn();
    render(<PromptListRow prompt={prompt} onViewDetails={onViewDetails} />);
    fireEvent.click(screen.getByText("Calendar open — Field 7"));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });
});
