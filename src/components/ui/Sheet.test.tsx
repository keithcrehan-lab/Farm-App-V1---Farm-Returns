import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Sheet } from "./Sheet";

/** A real, stateful nesting harness — closing either Sheet must actually
 * unmount it (popping it off the module-level open-sheet stack), not
 * just invoke a spy, or a second Escape press couldn't be told apart
 * from the first still hitting the (never-actually-closed) inner Sheet. */
function NestedSheets({ onCloseOuter, onCloseInner }: { onCloseOuter: () => void; onCloseInner: () => void }) {
  const [outerOpen, setOuterOpen] = useState(true);
  const [innerOpen, setInnerOpen] = useState(true);
  return (
    <Sheet
      open={outerOpen}
      onClose={() => {
        setOuterOpen(false);
        onCloseOuter();
      }}
      title="Outer"
    >
      <Sheet
        open={innerOpen}
        onClose={() => {
          setInnerOpen(false);
          onCloseInner();
        }}
        title="Inner"
      >
        inner content
      </Sheet>
    </Sheet>
  );
}

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

  // Codex audit MEDIUM (round 3): two nested open Sheets (e.g.
  // ExpandedPromptSheet + AskAIButton's own overlay) each register an
  // independent document-level Escape listener — an Escape press must
  // close only the topmost one, not both at once.
  it("closes only the topmost of two nested open Sheets on Escape, then the next on a second Escape", () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    render(<NestedSheets onCloseOuter={onCloseOuter} onCloseInner={onCloseInner} />);
    expect(screen.getAllByRole("dialog")).toHaveLength(2);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCloseOuter).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("dialog")).toHaveLength(0);
  });

  // Codex audit MEDIUM (round 4,
  // docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round4.md):
  // the round-3 fix assigned each Sheet's "topmost" position only once,
  // at first mount — so two *independent* (non-nested) Sheets reopening
  // in a different order than they first rendered would leave Escape
  // permanently targeting whichever one happened to render second, ever.
  it("treats an independently-reopened Sheet as topmost again, not whichever Sheet rendered first historically", () => {
    function TwoIndependentSheets() {
      const [aOpen, setAOpen] = useState(true);
      const [bOpen, setBOpen] = useState(false);
      return (
        <>
          <Sheet open={aOpen} onClose={() => setAOpen(false)} title="A">
            content A
          </Sheet>
          <Sheet open={bOpen} onClose={() => setBOpen(false)} title="B">
            content B
          </Sheet>
          <button type="button" onClick={() => setAOpen(false)}>
            close A
          </button>
          <button type="button" onClick={() => setBOpen(true)}>
            open B
          </button>
          <button type="button" onClick={() => setAOpen(true)}>
            reopen A
          </button>
        </>
      );
    }
    render(<TwoIndependentSheets />);
    // A rendered (and opened) first; B not yet open.
    fireEvent.click(screen.getByText("close A"));
    fireEvent.click(screen.getByText("open B"));
    // B is now the only, and therefore topmost, open Sheet.
    fireEvent.click(screen.getByText("reopen A"));
    // A was reopened most recently — Escape must target A, not B, even
    // though B rendered (as a component) before A's reopen.
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("content B")).toBeTruthy();
    expect(screen.queryByText("content A")).toBeNull();
  });

  // Codex audit MEDIUM (round 4): each Sheet independently
  // captured/restored `document.body.style.overflow` and the
  // previously-focused element. With two Sheets opening in one commit,
  // the second effect to run captured the first's already-locked state
  // as "the value to restore" — closing the inner Sheet first
  // prematurely unlocked page scroll while the outer Sheet was still
  // open, and closing the outer afterward then left the page
  // permanently scroll-locked.
  it("keeps the page scroll-locked until the last of two nested Sheets closes, and restores the original state after", async () => {
    const originalOverflow = document.body.style.overflow;
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    render(<NestedSheets onCloseOuter={onCloseOuter} onCloseInner={onCloseInner} />);
    // Let the queued microtask that assigns initial focus to the
    // topmost Sheet run before asserting anything focus-related.
    await Promise.resolve();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" }); // closes the inner Sheet
    // The closing Sheet's own render-phase `wasOpen` reset (the same
    // derived-state mechanism that assigns a fresh position on open, see
    // Sheet.tsx's own doc comment) needs one more microtask tick to
    // settle before focus/DOM assertions, same as the initial open above.
    await Promise.resolve();
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByText("Outer")).toBeTruthy();
    // Codex audit LOW (round 5): closing the inner Sheet must hand focus
    // to the remaining outer Sheet's own panel, not silently leave focus
    // wherever it happened to land (or restore it all the way back to
    // the pre-any-modal target while the outer Sheet is still open).
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    fireEvent.keyDown(document, { key: "Escape" }); // closes the outer Sheet
    await Promise.resolve();
    expect(document.body.style.overflow).toBe(originalOverflow);
    expect(document.activeElement).toBe(outsideButton);

    outsideButton.remove();
  });
});
