import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { TodayPriorityHud } from "./TodayPriorityHud";

afterEach(() => {
  cleanup();
});

describe("TodayPriorityHud", () => {
  it("renders the real counts for every priority band, using the agreed farmer-facing labels", () => {
    render(<TodayPriorityHud counts={{ HIGH: 1, MEDIUM: 2, LOW: 0, VERY_LOW: 1 }} />);
    const hud = screen.getByLabelText("1 high priority, 2 medium priority, 0 low priority, 1 for later");
    expect(within(hud).getByText("High priority")).toBeTruthy();
    expect(within(hud).getByText("Medium priority")).toBeTruthy();
    expect(within(hud).getByText("Low priority")).toBeTruthy();
    expect(within(hud).getByText("For later")).toBeTruthy();
  });

  it("renders an honest all-zero state", () => {
    render(<TodayPriorityHud counts={{ HIGH: 0, MEDIUM: 0, LOW: 0, VERY_LOW: 0 }} />);
    expect(screen.getByLabelText("0 high priority, 0 medium priority, 0 low priority, 0 for later")).toBeTruthy();
  });
});
