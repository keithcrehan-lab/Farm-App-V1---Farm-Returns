import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: mockRefresh }),
}));

vi.mock("@/app/actions/quote-requests", () => ({
  withdrawQuoteRequestAction: vi.fn(),
  // RequestQuoteSheet's own dependencies -- never opened in these
  // tests, but the module must still resolve.
  getQuoteRequestPrefillContextAction: vi.fn(),
  getFarmDeliveryDetailsAction: vi.fn(),
  saveFarmDeliveryDetailsAction: vi.fn(),
  submitQuoteRequestAction: vi.fn(),
}));

import { withdrawQuoteRequestAction } from "@/app/actions/quote-requests";
import { QuotesPageClient } from "./QuotesPageClient";
import type { QuoteRequest } from "@/lib/farm-data/quote-requests";
import { FarmProvider } from "@/store/farm-store";
import type { Farm } from "@/domain/types";

const mockWithdraw = vi.mocked(withdrawQuoteRequestAction);

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Farmer",
};

function renderPage(props: { requests: QuoteRequest[]; unavailable: boolean }) {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
      <QuotesPageClient {...props} />
    </FarmProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function requestedRequest(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    id: "req-1",
    farmId: "farm-1",
    withdrawnAt: null,
    status: "requested",
    createdAt: "2026-09-11T08:00:00.000Z",
    currentRevision: {
      id: "rev-1",
      requestId: "req-1",
      farmId: "farm-1",
      revisionNumber: 1,
      product: "Protected Urea",
      quantity: 500,
      unit: "kg",
      packaging: null,
      quantityBasis: "farmer_entered",
      estimateSnapshot: null,
      deliveryWindow: { start: "2026-10-01", end: "2026-10-15" },
      createdAt: "2026-09-11T08:00:00.000Z",
      disclosureVersion: "v1",
      disclosureAcceptedAt: "2026-09-11T08:00:00.000Z",
    },
    ...overrides,
  };
}

describe("QuotesPageClient — withdrawal", () => {
  it("withdrawal: a successful withdraw refreshes the list and the control disappears once re-rendered as withdrawn", async () => {
    mockWithdraw.mockResolvedValue({ ok: true });
    const { rerender } = renderPage({ requests: [requestedRequest()], unavailable: false });

    fireEvent.click(screen.getByRole("button", { name: /withdraw request/i }));
    await waitFor(() => expect(mockWithdraw).toHaveBeenCalledWith("req-1"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));

    // A real refresh would re-fetch and re-render with the request now
    // withdrawn — simulated here the same way Next's own router.refresh
    // eventually produces new server-provided props.
    rerender(
      <FarmProvider remote initialState={{ farm: FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
        <QuotesPageClient requests={[requestedRequest({ status: "withdrawn", withdrawnAt: "2026-09-11T09:00:00.000Z" })]} unavailable={false} />
      </FarmProvider>,
    );
    expect(screen.getByText("Withdrawn")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /withdraw request/i })).toBeNull();
  });

  it("withdrawal: a failed withdraw shows the server's own error and does not refresh", async () => {
    mockWithdraw.mockResolvedValue({ ok: false, error: "request not found, not owned by this farm, or already withdrawn" });
    renderPage({ requests: [requestedRequest()], unavailable: false });

    fireEvent.click(screen.getByRole("button", { name: /withdraw request/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/already withdrawn/i);
    expect(mockRefresh).not.toHaveBeenCalled();
    // The request is still shown as requested/withdrawable — a failed
    // withdraw must not silently flip the UI's own local status.
    expect(screen.getByRole("button", { name: /withdraw request/i })).toBeTruthy();
  });

  it("a withdrawn request never shows a withdraw control at all", () => {
    renderPage({ requests: [requestedRequest({ status: "withdrawn", withdrawnAt: "2026-09-11T09:00:00.000Z" })], unavailable: false });
    expect(screen.queryByRole("button", { name: /withdraw request/i })).toBeNull();
    expect(screen.getByText("Withdrawn")).toBeTruthy();
  });

  // Codex audit HIGH (Checkpoint C round 8) — this is the farmer's own
  // real submitted quantity, shown back to them; a real fractional
  // value must never be silently truncated. Codex's own genuine round-9
  // focused re-review found the first fix (a 6dp ceiling) still
  // truncated a value with more than 6 real fractional digits — this
  // test now uses exactly that class of value (7 fractional digits) to
  // prove the real fix, not just the earlier, insufficient one.
  it("shows the farmer's own real submitted quantity at its genuine precision, even beyond 6 fractional digits — never truncated", () => {
    renderPage({
      requests: [requestedRequest({ currentRevision: { ...requestedRequest().currentRevision, quantity: 1234.5678901 } })],
      unavailable: false,
    });
    expect(screen.getByText(/1,234\.5678901/)).toBeTruthy();
  });
});
