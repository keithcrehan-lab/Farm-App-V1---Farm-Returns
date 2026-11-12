import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { StepTip, StepTipButton } from "./StepTip";
import { STEP_TIPS_STORAGE_KEY, isStepTipVisible, parseStepTipState, resetStepTipsForTest } from "@/lib/step-tips";

function Screen({ id, text }: { id: string; text: string }) {
  return (
    <div>
      <StepTipButton id={id} />
      <StepTip id={id}>{text}</StepTip>
    </div>
  );
}

describe("step-by-step tips", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStepTipsForTest();
  });
  afterEach(cleanup);

  it("shows a tip the first time, and Got it closes it for good", () => {
    const first = render(<Screen id="scan-select" text="Tap the fields that are yours." />);
    expect(screen.getByText("Tap the fields that are yours.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show the tip for this step" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText("Tap the fields that are yours.")).not.toBeInTheDocument();
    first.unmount();

    // A later visit (fresh page, same device) keeps it closed.
    resetStepTipsForTest();
    render(<Screen id="scan-select" text="Tap the fields that are yours." />);
    expect(screen.queryByText("Tap the fields that are yours.")).not.toBeInTheDocument();
  });

  it("closing one tip leaves the next step's tip showing", () => {
    render(
      <>
        <Screen id="scan-select" text="Tap the fields that are yours." />
        <Screen id="scan-name" text="Name each field." />
      </>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Got it" })[0]);
    expect(screen.queryByText("Tap the fields that are yours.")).not.toBeInTheDocument();
    expect(screen.getByText("Name each field.")).toBeInTheDocument();
  });

  it("Skip all tips closes every tip, and the ? button brings one back", () => {
    render(
      <>
        <Screen id="scan-select" text="Tap the fields that are yours." />
        <Screen id="scan-name" text="Name each field." />
      </>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Skip all tips" })[0]);
    expect(screen.queryByText("Tap the fields that are yours.")).not.toBeInTheDocument();
    expect(screen.queryByText("Name each field.")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Show the tip for this step" })[1]);
    expect(screen.getByText("Name each field.")).toBeInTheDocument();
    expect(screen.queryByText("Tap the fields that are yours.")).not.toBeInTheDocument();

    // Closing the tip that was asked for closes it again.
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText("Name each field.")).not.toBeInTheDocument();
  });

  it("ignores damaged saved state and shows the tips", () => {
    window.localStorage.setItem(STEP_TIPS_STORAGE_KEY, "{not json");
    resetStepTipsForTest();
    render(<Screen id="scan-select" text="Tap the fields that are yours." />);
    expect(screen.getByText("Tap the fields that are yours.")).toBeInTheDocument();
    expect(isStepTipVisible(parseStepTipState('{"dismissed":["a",3],"skipAll":false}'), "a")).toBe(false);
    expect(isStepTipVisible(parseStepTipState('{"dismissed":"a","skipAll":"yes"}'), "a")).toBe(true);
  });
});
