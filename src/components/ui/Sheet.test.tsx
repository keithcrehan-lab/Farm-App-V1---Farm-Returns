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

  // Passes `labelledBy` (suppresses the default header + its own close
  // button) so the panel's only focusable elements are the two buttons
  // below — isolates the trap logic from the header close button's own,
  // separately real, place in the tab order.
  it("traps Tab forward from the last focusable element back to the first", () => {
    render(
      <Sheet open onClose={() => {}} title="Test" labelledBy="test-heading">
        <h2 id="test-heading">Test</h2>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Sheet>,
    );
    const last = screen.getByText("Last");
    (last as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("First"));
  });

  it("traps Shift+Tab backward from the first focusable element to the last", () => {
    render(
      <Sheet open onClose={() => {}} title="Test" labelledBy="test-heading">
        <h2 id="test-heading">Test</h2>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Sheet>,
    );
    const first = screen.getByText("First");
    (first as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText("Last"));
  });

  it("includes the header's own close button in the trapped tab order when using the default header", () => {
    render(
      <Sheet open onClose={() => {}} title="Test">
        <button type="button">Only control</button>
      </Sheet>,
    );
    const onlyControl = screen.getByText("Only control");
    (onlyControl as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    // Wraps to the header's own close button (the first focusable
    // element when no custom header is supplied), not out of the dialog.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close");
    expect(document.activeElement).not.toBe(document.body);
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
