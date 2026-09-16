import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OperatorQuotesClient } from "./OperatorQuotesClient";
import type { OperatorDemandInbox } from "@/orchestration/quotes";
import type { QuoteRequest } from "@/lib/farm-data/quote-requests";

afterEach(() => {
  cleanup();
});

function request(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    id: "req-1",
    farmId: "farm-1",
    withdrawnAt: null,
    status: "requested",
    createdAt: "2026-09-15T09:00:00Z",
    currentRevision: {
      id: "rev-1",
      requestId: "req-1",
      farmId: "farm-1",
      revisionNumber: 1,
      product: "Protected Urea",
      quantity: 500,
      unit: "kg",
      packaging: null,
      quantityBasis: "estimated",
      estimateSnapshot: null,
      deliveryWindow: { start: "2026-10-01", end: "2026-10-15" },
      createdAt: "2026-09-15T09:00:00Z",
      disclosureVersion: "v1",
      disclosureAcceptedAt: "2026-09-15T08:59:00Z",
    },
    ...overrides,
  };
}

describe("OperatorQuotesClient — real admin demand retrieval (Grassland Fertiliser Pilot Completion, Checkpoint C, audit F3/F12)", () => {
  it("shows an honest 'not available' message rather than a fabricated empty inbox on a genuine fetch failure", () => {
    render(<OperatorQuotesClient inbox={{ requests: [], groups: [] }} unavailable />);
    expect(screen.getByText(/isn't available right now/i)).toBeTruthy();
  });

  it("renders every real submitted request with its own reference, farm id, product/quantity, and status — exact submitted demand, never hidden behind grouping", () => {
    const inbox: OperatorDemandInbox = {
      requests: [request(), request({ id: "req-2", farmId: "farm-2", status: "withdrawn", withdrawnAt: "2026-09-15T10:00:00Z" })],
      groups: [{ product: "Protected Urea", deliveryWindow: { start: "2026-10-01", end: "2026-10-15" }, resolvedTotalKg: 500, resolvedLineIds: ["rev-1"], unresolvedLines: [] }],
    };
    render(<OperatorQuotesClient inbox={inbox} unavailable={false} />);

    expect(screen.getByText("req-1", { exact: false })).toBeTruthy();
    expect(screen.getByText(/farm farm-1/i)).toBeTruthy();
    expect(screen.getByText(/farm farm-2/i)).toBeTruthy();
    expect(screen.getAllByText("Requested").length).toBeGreaterThan(0);
    expect(screen.getByText("Withdrawn")).toBeTruthy();
  });

  it("shows the real compatible-demand group total and never silently drops a real unresolved-unit line", () => {
    const inbox: OperatorDemandInbox = {
      requests: [request()],
      groups: [
        {
          product: "Protected Urea",
          deliveryWindow: { start: "2026-10-01", end: "2026-10-15" },
          resolvedTotalKg: 500,
          resolvedLineIds: ["rev-1"],
          unresolvedLines: [{ requestId: "req-3", revisionId: "rev-3", farmId: "farm-3", quantity: 10, unit: "bags" }],
        },
      ],
    };
    render(<OperatorQuotesClient inbox={inbox} unavailable={false} />);

    expect(screen.getByText(/500 kg total/i)).toBeTruthy();
    expect(screen.getByText(/1 real request in a unit with no known kg equivalent/i)).toBeTruthy();
  });

  // Codex audit HIGH round 8's own round-9 focused re-review LOW — the
  // 0dp -> 2dp aggregate-precision fix had no fractional regression
  // test at all (the existing case above only exercises a whole-number
  // 500).
  it("shows the real fractional compatible-demand group total at its genuine 2dp precision — never silently rounded to a whole number", () => {
    const inbox: OperatorDemandInbox = {
      requests: [],
      groups: [{ product: "Protected Urea", deliveryWindow: { start: "2026-10-01", end: "2026-10-15" }, resolvedTotalKg: 500.25, resolvedLineIds: ["rev-1"], unresolvedLines: [] }],
    };
    render(<OperatorQuotesClient inbox={inbox} unavailable={false} />);
    expect(screen.getByText(/500\.25 kg total/i)).toBeTruthy();
  });

  it("shows an honest empty state when there are genuinely no real requests on file", () => {
    render(<OperatorQuotesClient inbox={{ requests: [], groups: [] }} unavailable={false} />);
    expect(screen.getByText(/no real requests on file yet/i)).toBeTruthy();
    // Codex audit LOW (Checkpoint C round 5) — an empty `groups` array
    // means no real ACTIVE request exists at all, never "distinct or
    // withdrawn" (a real distinct active request still gets its own
    // group of size 1).
    expect(screen.getByText(/no real outstanding demand/i)).toBeTruthy();
  });

  // Codex audit HIGH (Checkpoint C round 8) — this screen's own header
  // promises "exactly as submitted"; a real fractional quantity must
  // never be silently truncated in the per-request display. Codex's own
  // genuine round-9 focused re-review found the first fix (a 6dp
  // ceiling) still truncated a value with more than 6 real fractional
  // digits — this test now uses exactly that class of value
  // (7 fractional digits) to prove the real fix, not just the earlier,
  // insufficient one.
  it("shows the real submitted quantity's own genuine precision, even beyond 6 fractional digits — never truncated, matching this screen's own 'exactly as submitted' claim", () => {
    const inbox: OperatorDemandInbox = {
      requests: [request({ currentRevision: { ...request().currentRevision, quantity: 1234.5678901 } })],
      groups: [],
    };
    render(<OperatorQuotesClient inbox={inbox} unavailable={false} />);
    expect(screen.getByText(/1,234\.5678901/)).toBeTruthy();
  });
});
