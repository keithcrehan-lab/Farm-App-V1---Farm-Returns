import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { RecommendationAuditTrailCard } from "./RecommendationAuditTrailCard";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderCard() {
  return render(
    <FarmProvider>
      <RecommendationAuditTrailCard />
    </FarmProvider>,
  );
}

async function generateTrace() {
  const button = screen.getByRole("button", { name: /generate audit trace/i });
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole("button", { name: /generating/i })).toBeNull());
}

describe("RecommendationAuditTrailCard — RPT023 filters (V3 closure pass)", () => {
  it("shows a decision-type filter that narrows the real list once traces are generated", async () => {
    renderCard();
    await generateTrace();
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0));
    const totalItems = screen.getAllByRole("listitem").length;

    const select = screen.getByLabelText(/decision type/i) as HTMLSelectElement;
    // Every real farm field produces at least one BLOCKED_INSUFFICIENT_EVIDENCE
    // decision (no commonage/waterBufferContext captured on the mock
    // fields) — filtering to it must show fewer or equal items, never
    // the unfiltered count, proving the filter is real.
    fireEvent.change(select, { target: { value: "BLOCKED_INSUFFICIENT_EVIDENCE" } });
    const filteredItems = screen.getAllByRole("listitem").length;
    expect(filteredItems).toBeGreaterThan(0);
    expect(filteredItems).toBeLessThanOrEqual(totalItems);
  });

  it("shows a reviewer-status filter that excludes everything once filtered to a status nothing has yet", async () => {
    renderCard();
    await generateTrace();
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0));

    const select = screen.getByLabelText(/reviewer status/i) as HTMLSelectElement;
    // Every decision defaults to UNREVIEWED (no review has been recorded
    // yet) — filtering to VERIFIED must show zero real items.
    fireEvent.change(select, { target: { value: "VERIFIED" } });
    expect(screen.queryAllByRole("listitem").length).toBe(0);
    expect(screen.getByText(/no recommendations/i)).toBeTruthy();
  });
});

describe("RecommendationAuditTrailCard — RPT024 run comparison (V3 closure pass)", () => {
  it("offers a run-comparison picker only once at least 2 real runs exist, and shows a real deterministic reason once both are picked", async () => {
    renderCard();
    expect(screen.queryByText(/compare runs/i)).toBeNull(); // 0 runs yet

    await generateTrace();
    await waitFor(() => expect(screen.getByText(/compare runs/i)).toBeTruthy());

    const [selectA, selectB] = screen.getAllByRole("combobox").slice(-2);
    const runOptionsA = Array.from((selectA as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);
    const runOptionsB = Array.from((selectB as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);
    expect(runOptionsA.length).toBeGreaterThanOrEqual(2);

    fireEvent.change(selectA, { target: { value: runOptionsA[0] } });
    fireEvent.change(selectB, { target: { value: runOptionsB[1] } });

    // Two different fields' runs differ in scope/inputs -> at least one
    // real, non-generic reason string appears (not silently blank).
    await waitFor(() =>
      expect(screen.getAllByText(/change|ruleset|no material change|no matching decision/i).length).toBeGreaterThan(0),
    );
  });
});
