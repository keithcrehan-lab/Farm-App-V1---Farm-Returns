import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/orchestration/supplier-portal", () => ({ supplierPortalToday: () => "2026-11-01" }));
vi.mock("@/lib/farm-data/quote-operators", () => ({ isQuoteOperatorForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/supplier-portal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/farm-data/supplier-portal")>();
  return {
    SupplierPortalError: actual.SupplierPortalError,
    getMySupplierPortalContext: vi.fn(),
    saveMySupplierQuoteDraft: vi.fn(),
    submitMySupplierQuote: vi.fn(),
    withdrawMySupplierQuote: vi.fn(),
    discardMySupplierQuoteDraft: vi.fn(),
    declineMySupplierRfq: vi.fn(),
    updateMySupplierPortalSettings: vi.fn(),
    getSupplierPortalOperatorOverview: vi.fn(),
    operatorCreateSupplier: vi.fn(),
    operatorGrantSupplierMember: vi.fn(),
    operatorRevokeSupplierMember: vi.fn(),
    operatorRouteRequestToSupplier: vi.fn(),
  };
});

import {
  SupplierPortalError,
  declineMySupplierRfq,
  discardMySupplierQuoteDraft,
  getMySupplierPortalContext,
  operatorCreateSupplier,
  operatorGrantSupplierMember,
  operatorRouteRequestToSupplier,
  saveMySupplierQuoteDraft,
  submitMySupplierQuote,
  updateMySupplierPortalSettings,
  withdrawMySupplierQuote,
} from "@/lib/farm-data/supplier-portal";
import { isQuoteOperatorForCurrentUser } from "@/lib/farm-data/quote-operators";
import {
  declineSupplierRfqAction,
  discardSupplierQuoteDraftAction,
  saveSupplierQuoteDraftAction,
  submitSupplierQuoteAction,
  updateSupplierSettingsAction,
  withdrawSupplierQuoteAction,
} from "./supplier-portal";
import { createSupplierAction, grantSupplierMemberAction, routeQuoteRequestToSupplierAction } from "./supplier-portal-operator";

const ROUTE_A = "11111111-1111-4111-8111-111111111111";
const QUOTE_A = "22222222-2222-4222-8222-222222222222";
const SUPPLIER_B = "33333333-3333-4333-8333-333333333333";
const REQUEST = "44444444-4444-4444-8444-444444444444";

const memberContext = {
  supplierId: "55555555-5555-4555-8555-555555555555",
  displayName: "Supplier A",
  role: "member" as const,
  contactEmail: null,
  contactPhone: null,
  serviceCounties: [],
  defaultQuoteValidityDays: null,
  quoteTerms: null,
};

const completeDraft = {
  lines: [{ product: "CAN 27%N", description: "", quantity: "10", unit: "tonnes", unitPriceExVat: "385", vatRatePercent: "0" }],
  deliveryChargeExVat: "0",
  deliveryVatRatePercent: "",
  deliveryEarliest: "2026-11-10",
  deliveryLatest: "2026-11-20",
  validUntil: "2026-11-30",
  paymentTerms: "",
  notes: "",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMySupplierPortalContext).mockResolvedValue(memberContext);
});

describe("supplier actions — unauthorised access", () => {
  it.each([
    ["save", () => saveSupplierQuoteDraftAction({ routeId: ROUTE_A, quoteId: null, expectedVersion: null, draft: completeDraft })],
    ["submit", () => submitSupplierQuoteAction({ routeId: ROUTE_A, quoteId: null, expectedVersion: null, draft: completeDraft })],
    ["withdraw", () => withdrawSupplierQuoteAction({ quoteId: QUOTE_A, expectedVersion: 2 })],
    ["discard", () => discardSupplierQuoteDraftAction({ quoteId: QUOTE_A, expectedVersion: 1 })],
    ["decline", () => declineSupplierRfqAction({ routeId: ROUTE_A })],
    ["settings", () => updateSupplierSettingsAction({ contactEmail: null, contactPhone: null, serviceCounties: [], defaultQuoteValidityDays: null, quoteTerms: null })],
  ])("a signed-in non-member is refused (%s) and nothing is written", async (_label, call) => {
    vi.mocked(getMySupplierPortalContext).mockResolvedValue(null);
    const result = await call();
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    for (const write of [saveMySupplierQuoteDraft, submitMySupplierQuote, withdrawMySupplierQuote, discardMySupplierQuoteDraft, declineMySupplierRfq, updateMySupplierPortalSettings]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("a non-admin member cannot change supplier settings", async () => {
    const result = await updateSupplierSettingsAction({ contactEmail: null, contactPhone: null, serviceCounties: [], defaultQuoteValidityDays: null, quoteTerms: null });
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(updateMySupplierPortalSettings).not.toHaveBeenCalled();
  });
});

describe("supplier actions — cross-supplier isolation", () => {
  it("never forwards a client-supplied supplier id, farm id or total to the persistence layer", async () => {
    vi.mocked(saveMySupplierQuoteDraft).mockResolvedValue({ quoteId: QUOTE_A, version: 1 });
    const result = await saveSupplierQuoteDraftAction({
      routeId: ROUTE_A,
      quoteId: null,
      expectedVersion: null,
      supplierId: SUPPLIER_B,
      draft: { ...completeDraft, supplierId: SUPPLIER_B, farmId: "farm-x", totalIncVat: "0.01" },
    });
    expect(result).toEqual({ ok: true, value: { quoteId: QUOTE_A, version: 1 } });
    const [routeId, existing, draft] = vi.mocked(saveMySupplierQuoteDraft).mock.calls[0];
    expect(routeId).toBe(ROUTE_A);
    expect(existing).toBeNull();
    expect(JSON.stringify(draft)).not.toContain(SUPPLIER_B);
    expect(draft).not.toHaveProperty("supplierId");
    expect(draft).not.toHaveProperty("farmId");
    expect(draft).not.toHaveProperty("totalIncVat");
  });

  it("reports another supplier's RFQ exactly like a missing one — no existence oracle", async () => {
    vi.mocked(saveMySupplierQuoteDraft).mockRejectedValue(new SupplierPortalError("NOT_FOUND", "RFQ not found"));
    const result = await saveSupplierQuoteDraftAction({ routeId: ROUTE_A, quoteId: null, expectedVersion: null, draft: completeDraft });
    expect(result).toEqual({ ok: false, code: "NOT_FOUND", message: "That RFQ or quote was not found for your supplier account." });
  });

  it("rejects a non-uuid reference before any database call", async () => {
    const result = await declineSupplierRfqAction({ routeId: "../other-supplier" });
    expect(result).toMatchObject({ ok: false, code: "INVALID" });
    expect(declineMySupplierRfq).not.toHaveBeenCalled();
  });
});

describe("supplier actions — input validation", () => {
  it("returns field-level issues for an invalid draft and writes nothing", async () => {
    const result = await saveSupplierQuoteDraftAction({
      routeId: ROUTE_A,
      quoteId: null,
      expectedVersion: null,
      draft: { ...completeDraft, lines: [{ ...completeDraft.lines[0], unitPriceExVat: "12.345", quantity: "-1" }] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID");
    expect(result.issues?.map((issue) => issue.path).sort()).toEqual(["lines.0.quantity", "lines.0.unitPriceExVat"]);
    expect(saveMySupplierQuoteDraft).not.toHaveBeenCalled();
  });

  it("rejects a quote id without its expected version (and vice versa)", async () => {
    expect(await saveSupplierQuoteDraftAction({ routeId: ROUTE_A, quoteId: QUOTE_A, expectedVersion: null, draft: completeDraft })).toMatchObject({ ok: false, code: "INVALID" });
    expect(await saveSupplierQuoteDraftAction({ routeId: ROUTE_A, quoteId: null, expectedVersion: 3, draft: completeDraft })).toMatchObject({ ok: false, code: "INVALID" });
    expect(saveMySupplierQuoteDraft).not.toHaveBeenCalled();
  });

  it("validates settings: counties must come from the list; email must be valid", async () => {
    vi.mocked(getMySupplierPortalContext).mockResolvedValue({ ...memberContext, role: "admin" });
    const bad = await updateSupplierSettingsAction({ contactEmail: "not-an-email", contactPhone: null, serviceCounties: ["Atlantis"], defaultQuoteValidityDays: 120, quoteTerms: null });
    expect(bad).toMatchObject({ ok: false, code: "INVALID" });
    expect(updateMySupplierPortalSettings).not.toHaveBeenCalled();

    const good = await updateSupplierSettingsAction({ contactEmail: " sales@example.ie ", contactPhone: "", serviceCounties: ["Meath", "Cork", "Cork"], defaultQuoteValidityDays: 14, quoteTerms: "  " });
    expect(good).toEqual({ ok: true, value: null });
    expect(updateMySupplierPortalSettings).toHaveBeenCalledWith({ contactEmail: "sales@example.ie", contactPhone: null, serviceCounties: ["Cork", "Meath"], defaultQuoteValidityDays: 14, quoteTerms: null });
  });
});

describe("supplier actions — lifecycle", () => {
  it("submit refuses an incomplete quote before writing anything", async () => {
    const result = await submitSupplierQuoteAction({
      routeId: ROUTE_A,
      quoteId: QUOTE_A,
      expectedVersion: 1,
      draft: { ...completeDraft, validUntil: "2026-10-31", lines: [{ ...completeDraft.lines[0], vatRatePercent: "" }] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INCOMPLETE");
    expect(result.issues?.map((issue) => issue.path).sort()).toEqual(["lines.0.vatRatePercent", "validUntil"]);
    expect(saveMySupplierQuoteDraft).not.toHaveBeenCalled();
    expect(submitMySupplierQuote).not.toHaveBeenCalled();
  });

  it("submit saves the draft then submits the exact saved version", async () => {
    vi.mocked(saveMySupplierQuoteDraft).mockResolvedValue({ quoteId: QUOTE_A, version: 4 });
    vi.mocked(submitMySupplierQuote).mockResolvedValue({ quoteId: QUOTE_A, version: 5 });
    const result = await submitSupplierQuoteAction({ routeId: ROUTE_A, quoteId: QUOTE_A, expectedVersion: 3, draft: completeDraft });
    expect(result).toEqual({ ok: true, value: { quoteId: QUOTE_A, version: 5 } });
    expect(saveMySupplierQuoteDraft).toHaveBeenCalledWith(ROUTE_A, { quoteId: QUOTE_A, expectedVersion: 3 }, expect.objectContaining({ validUntil: "2026-11-30" }));
    expect(submitMySupplierQuote).toHaveBeenCalledWith(QUOTE_A, 4);
  });

  it("when the farmer revised the request between save and submit, returns the new draft version so the editor can continue", async () => {
    vi.mocked(saveMySupplierQuoteDraft).mockResolvedValue({ quoteId: QUOTE_A, version: 2 });
    vi.mocked(submitMySupplierQuote).mockRejectedValue(new SupplierPortalError("REQUEST_REVISED", "the farmer changed this request"));
    const result = await submitSupplierQuoteAction({ routeId: ROUTE_A, quoteId: null, expectedVersion: null, draft: completeDraft });
    expect(result).toMatchObject({ ok: false, code: "REQUEST_REVISED", latest: { quoteId: QUOTE_A, version: 2 } });
  });

  it("surfaces a stale concurrent edit without retrying", async () => {
    vi.mocked(saveMySupplierQuoteDraft).mockRejectedValue(new SupplierPortalError("STALE", "expected version 1 but current is 2"));
    const result = await saveSupplierQuoteDraftAction({ routeId: ROUTE_A, quoteId: QUOTE_A, expectedVersion: 1, draft: completeDraft });
    expect(result).toMatchObject({ ok: false, code: "STALE" });
    expect(saveMySupplierQuoteDraft).toHaveBeenCalledTimes(1);
  });

  it("passes database lifecycle conflicts through (e.g. withdrawing a draft)", async () => {
    vi.mocked(withdrawMySupplierQuote).mockRejectedValue(new SupplierPortalError("CONFLICT", "only a submitted quote can be withdrawn (this quote is draft)"));
    const result = await withdrawSupplierQuoteAction({ quoteId: QUOTE_A, expectedVersion: 1, reason: " price change " });
    expect(result).toEqual({ ok: false, code: "CONFLICT", message: "only a submitted quote can be withdrawn (this quote is draft)" });
    expect(withdrawMySupplierQuote).toHaveBeenCalledWith(QUOTE_A, 1, "price change");
  });

  it("does not leak unexpected internal errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(discardMySupplierQuoteDraft).mockRejectedValue(new Error("connection reset: host db.internal:5432"));
    const result = await discardSupplierQuoteDraftAction({ quoteId: QUOTE_A, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, code: "CONFLICT", message: "Something went wrong. Please try again." });
  });
});

describe("operator actions — allow-list", () => {
  it.each([
    ["create supplier", () => createSupplierAction({ displayName: "X", contactEmail: null }), operatorCreateSupplier],
    ["grant member", () => grantSupplierMemberAction({ supplierId: SUPPLIER_B, userEmail: "a@b.ie", role: "admin" }), operatorGrantSupplierMember],
    ["route request", () => routeQuoteRequestToSupplierAction({ requestId: REQUEST, supplierId: SUPPLIER_B }), operatorRouteRequestToSupplier],
  ])("a supplier member who is not an operator cannot %s", async (_label, call, write) => {
    vi.mocked(isQuoteOperatorForCurrentUser).mockResolvedValue(false);
    expect(await call()).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(write).not.toHaveBeenCalled();
  });

  it("an operator can route a real request to a supplier", async () => {
    vi.mocked(isQuoteOperatorForCurrentUser).mockResolvedValue(true);
    vi.mocked(operatorRouteRequestToSupplier).mockResolvedValue(ROUTE_A);
    expect(await routeQuoteRequestToSupplierAction({ requestId: REQUEST, supplierId: SUPPLIER_B })).toEqual({ ok: true, value: ROUTE_A });
    expect(operatorRouteRequestToSupplier).toHaveBeenCalledWith(REQUEST, SUPPLIER_B);
  });
});
