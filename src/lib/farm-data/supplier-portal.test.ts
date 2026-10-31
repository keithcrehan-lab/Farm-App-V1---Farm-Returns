import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc, auth: { getUser } }) }));

import {
  SupplierPortalError,
  getMySupplierPortalContext,
  getMySupplierRfq,
  saveMySupplierQuoteDraft,
  toSupplierPortalError,
} from "./supplier-portal";

const ROUTE = "11111111-1111-4111-8111-111111111111";

function rfqPayload(extra: Record<string, unknown> = {}) {
  return {
    routeId: ROUTE,
    routedAt: "2026-10-31T10:00:00+00:00",
    firstViewedAt: null,
    declinedAt: null,
    declineReason: null,
    request: {
      requestedAt: "2026-10-30T10:00:00+00:00",
      withdrawn: false,
      revisionNumber: 1,
      revisedAt: "2026-10-30T10:00:00+00:00",
      product: "CAN 27%N",
      quantity: "10",
      unit: "tonnes",
      packaging: null,
      deliveryWindowStart: "2026-11-10",
      deliveryWindowEnd: "2026-11-20",
      townOrCity: "Navan",
      county: "Meath",
      eircodeRoutingKey: "C15",
      ...extra,
    },
    quotes: [],
    events: [],
  };
}

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset();
});

describe("supplier portal persistence", () => {
  it("returns no context and makes no RPC call when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await getMySupplierPortalContext()).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns null (no access) when the session has no active membership", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getMySupplierPortalContext()).toBeNull();
    expect(rpc).toHaveBeenCalledWith("supplier_portal_get_my_context");
  });

  it("strips any farmer-identifying field the RPC might return, even if the database regressed", async () => {
    rpc.mockResolvedValue({ data: rfqPayload({ farmId: "farm-1", contactName: "Mary", contactPhone: "087", addressLine1: "Main St", eircode: "C15 AB12" }), error: null });
    const rfq = await getMySupplierRfq(ROUTE);
    expect(Object.keys(rfq.request).sort()).toEqual(
      ["county", "deliveryWindowEnd", "deliveryWindowStart", "eircodeRoutingKey", "packaging", "product", "quantity", "requestedAt", "revisedAt", "revisionNumber", "townOrCity", "unit", "withdrawn"].sort(),
    );
    expect(JSON.stringify(rfq)).not.toMatch(/Mary|Main St|C15 AB12|farm-1/);
  });

  it("fails loudly on a malformed payload instead of rendering it", async () => {
    rpc.mockResolvedValue({ data: { ...rfqPayload(), request: { ...rfqPayload().request, quantity: 10.5 } }, error: null });
    await expect(getMySupplierRfq(ROUTE)).rejects.toBeInstanceOf(SupplierPortalError);
  });

  it("sends only the route reference, quote reference and draft content — no supplier id", async () => {
    rpc.mockResolvedValue({ data: { quoteId: "22222222-2222-4222-8222-222222222222", version: 1 }, error: null });
    await saveMySupplierQuoteDraft(ROUTE, null, {
      lines: [{ product: "CAN", description: null, quantity: "10", unit: "tonnes", unitPriceExVat: "385.00", vatRatePercent: "0" }],
      deliveryChargeExVat: "0.00",
      deliveryVatRatePercent: null,
      deliveryEarliest: "2026-11-10",
      deliveryLatest: "2026-11-20",
      validUntil: "2026-11-30",
      paymentTerms: null,
      notes: null,
    });
    const [name, params] = rpc.mock.calls[0];
    expect(name).toBe("supplier_portal_save_quote_draft");
    expect(Object.keys(params).sort()).toEqual(["p_expected_version", "p_header", "p_lines", "p_quote_id", "p_route_id"]);
    expect(JSON.stringify(params)).not.toMatch(/supplier_?id/i);
  });
});

describe("toSupplierPortalError", () => {
  it.each([
    [{ message: "SUPPLIER_PORTAL_NOT_FOUND: RFQ not found" }, "NOT_FOUND", "RFQ not found"],
    [{ message: "SUPPLIER_PORTAL_FORBIDDEN: nope", code: "42501" }, "FORBIDDEN", "nope"],
    [{ message: "SUPPLIER_PORTAL_STALE: expected version 1 but current is 2" }, "STALE", "expected version 1 but current is 2"],
    [{ message: "SUPPLIER_PORTAL_REQUEST_REVISED: changed" }, "REQUEST_REVISED", "changed"],
    [{ message: "relation does not exist", code: "42P01" }, "UNAVAILABLE", "The supplier portal is not set up on this database yet."],
    [{ message: "Could not find the function", code: "PGRST202" }, "UNAVAILABLE", "The supplier portal is not set up on this database yet."],
    [{ message: "permission denied for function", code: "42501" }, "FORBIDDEN", "Not permitted."],
    [{ message: "SUPPLIER_PORTAL_MADE_UP: x" }, "CONFLICT", "SUPPLIER_PORTAL_MADE_UP: x"],
  ])("maps %j to %s", (error, code, message) => {
    const mapped = toSupplierPortalError(error);
    expect(mapped.code).toBe(code);
    expect(mapped.message).toBe(message);
  });
});
