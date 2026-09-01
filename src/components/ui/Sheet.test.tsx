import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Sheet } from "./Sheet";

afterEach(() => {
  cleanup();
});

describe("Sheet", () => {
  it("renders nothing when closed", () => {
    render(
      <Sheet open={false} onClose={() => {}} title="Test">
        content
      </Sheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders its title and children when open", () => {
    render(
      <Sheet open onClose={() => {}} title="Test title">
        <p>body content</p>
      </Sheet>,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Test title")).toBeTruthy();
    expect(screen.getByText("body content")).toBeTruthy();
  });

  it("calls onClose when the Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Test">
        content
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Test">
        content
      </Sheet>,
    );
    const closeButtons = screen.getAllByLabelText("Close");
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the header close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Test">
        content
      </Sheet>,
    );
    const closeButtons = screen.getAllByLabelText("Close");
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
