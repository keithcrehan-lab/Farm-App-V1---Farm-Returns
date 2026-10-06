import { beforeEach, describe, expect, it, vi } from "vitest";

// Every exported function of the nutrient and statutory modules is wrapped in a
// spy (behaviour unchanged) so the tests can prove the quote layer calls none.
const scienceSpies = vi.hoisted(() => [] as { name: string; fn: { mock: { calls: unknown[] }; mockClear: () => void } }[]);
function wrapExports(module: Record<string, unknown>, label: string) {
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(module)) {
    if (typeof value === "function" && !/^[A-Z]/.test(key)) {
      const spy = vi.fn(value as (...args: unknown[]) => unknown);
      scienceSpies.push({ name: `${label}.${key}`, fn: spy });
      wrapped[key] = spy;
    } else {
      wrapped[key] = value;
    }
  }
  return wrapped;
}
vi.mock("./nutrients", async (importOriginal) => wrapExports(await importOriginal(), "nutrients"));
vi.mock("./statutory-excretion", async (importOriginal) => wrapExports(await importOriginal(), "statutory-excretion"));
vi.mock("./statutory-manure-value", async (importOriginal) => wrapExports(await importOriginal(), "statutory-manure-value"));

import { aggregateFarmFertiliserPurchasing, buildFarmFertiliserQuoteBasket, type FarmFertiliserAggregationFieldInput, type FarmFertiliserQuoteBasket } from "./fertiliser-plan";
import type { FertiliserProduct, FieldPurchaseStatus } from "./types";
import {
  FERTILISER_QUOTE_DELIVERY_CAPABILITY,
  cancelFertiliserQuoteRequest,
  createFertiliserQuoteRequestDraft,
  fertiliserQuoteRequestIssues,
  markFertiliserQuoteRequestReady,
  parseRequestedTonnes,
  recordFertiliserQuoteDeliveryAttempt,
  renderFertiliserQuoteRequestText,
  setQuoteRequestDetails,
  setRequestedQuantity,
  type FertiliserQuoteRequest,
} from "./fertiliser-quote-request";

function product(name: string, npkAnalysis: string, totalKg: number, costEur: number | null): FertiliserProduct {
  return { name, npkAnalysis, rateKgHa: 0, totalKg, costEur: costEur as number };
}

function fieldInput(fieldId: string, fieldName: string, purchaseStatus: FieldPurchaseStatus, purchasedProducts: FertiliserProduct[] = []): FarmFertiliserAggregationFieldInput {
  return { fieldId, fieldName, plan: { purchaseStatus, purchasedProducts, calculationVersion: "nutrient_engine_v1.5.0" } };
}

const RECOMMENDED: FieldPurchaseStatus = { status: "RECOMMENDED" };
const PROVISIONAL = { status: "RECOMMENDED_CREDIT_NOT_COUNTED" } as FieldPurchaseStatus;
const UNKNOWN = { status: "UNKNOWN", reasonCode: "MISSING_SOIL_TEST" } as unknown as FieldPurchaseStatus;

function basketOf(fields: FarmFertiliserAggregationFieldInput[]): FarmFertiliserQuoteBasket {
  return buildFarmFertiliserQuoteBasket(aggregateFarmFertiliserPurchasing(fields), { farmId: "farm-1", createdAt: "2026-10-05T09:00:00.000Z" });
}

const READY_FIELDS = [
  fieldInput("f1", "Top Field", RECOMMENDED, [product("18-6-12", "18-6-12", 1400, 700)]),
  fieldInput("f2", "River Field", RECOMMENDED, [product("18-6-12", "18-6-12", 995.5, 500), product("Protected Urea", "46-0-0", 300, 120)]),
];

const META = { requestId: "11111111-1111-4111-8111-111111111111", createdAt: "2026-10-05T10:00:00.000Z" };

function draftOf(basket: FarmFertiliserQuoteBasket): FertiliserQuoteRequest {
  const result = createFertiliserQuoteRequestDraft(basket, META);
  if (!result.ok) throw new Error(`draft failed: ${result.issues.join(",")}`);
  return result.value;
}

function unwrap(result: { ok: true; value: FertiliserQuoteRequest } | { ok: false; issues: string[] }): FertiliserQuoteRequest {
  if (!result.ok) throw new Error(`unexpected failure: ${result.issues.join(",")}`);
  return result.value;
}

function readyRequest(basket = basketOf(READY_FIELDS), recipients = [{ name: "Agri Store", contact: "sales@agri.example" }]): FertiliserQuoteRequest {
  const withDetails = unwrap(setQuoteRequestDetails(draftOf(basket), { recipients, deliveryLocation: "Farm yard, Ballyduff, Co. Kerry", contact: "Pat 087 000 0000" }));
  return unwrap(markFertiliserQuoteRequestReady(withDetails, "2026-10-05T10:05:00.000Z"));
}

beforeEach(() => {
  for (const s of scienceSpies) s.fn.mockClear();
});

describe("createFertiliserQuoteRequestDraft", () => {
  it("1: a READY basket creates a whole-farm DRAFT request", () => {
    const request = draftOf(basketOf(READY_FIELDS));
    expect(request.status).toBe("DRAFT");
    expect(request.coverage).toBe("WHOLE_FARM");
    expect(request.basketStatus).toBe("READY");
    expect(request.isCompleteFarmRequirement).toBe(true);
    expect(request.requestId).toBe(META.requestId);
    expect(request.farmId).toBe("farm-1");
    expect(request.engineVersions).toEqual(["nutrient_engine_v1.5.0"]);
    expect(request.basketVersion).toBe("farm_fertiliser_quote_basket_v1.0.0");
    expect(request.lines).toHaveLength(2);
  });

  it("2: a READY_WITH_PROVISIONAL_ITEMS basket keeps its provisional status and lines", () => {
    const basket = basketOf([...READY_FIELDS, fieldInput("f3", "Bog Field", PROVISIONAL, [product("Protected Urea", "46-0-0", 200, 80)])]);
    const request = draftOf(basket);
    expect(request.basketStatus).toBe("READY_WITH_PROVISIONAL_ITEMS");
    expect(request.coverage).toBe("WHOLE_FARM_PROVISIONAL");
    expect(request.lines.find((l) => l.name === "Protected Urea")?.provisional).toBe(true);
    expect(request.lines.find((l) => l.name === "18-6-12")?.provisional).toBe(false);
    expect(renderFertiliserQuoteRequestText(request)).toContain("Some quantities are provisional");
  });

  it("3/4: an INCOMPLETE basket yields an explicitly PARTIAL request, never a whole-farm one", () => {
    const basket = basketOf([...READY_FIELDS, fieldInput("f4", "Hill Field", UNKNOWN)]);
    const request = draftOf(basket);
    expect(request.basketStatus).toBe("INCOMPLETE");
    expect(request.coverage).toBe("PARTIAL");
    expect(request.isCompleteFarmRequirement).toBe(false);
    expect(request.unresolvedFields.map((f) => f.fieldName)).toEqual(["Hill Field"]);
    const ready = unwrap(markFertiliserQuoteRequestReady(unwrap(setQuoteRequestDetails(request, { deliveryLocation: "Yard", contact: "Pat" })), "2026-10-05T10:05:00.000Z"));
    expect(ready.coverage).toBe("PARTIAL");
    expect(ready.basketStatus).toBe("INCOMPLETE");
    const text = renderFertiliserQuoteRequestText(ready);
    expect(text.split("\n")[0]).toBe("Farm Return fertiliser quote request (partial)");
    expect(text).toContain("covers only part of the farm's fertiliser requirement");
  });

  it("a PARTIAL request with provisional lines keeps both the partial and provisional warnings in supplier text", () => {
    const basket = basketOf([...READY_FIELDS, fieldInput("f3", "Bog Field", PROVISIONAL, [product("Protected Urea", "46-0-0", 200, 80)]), fieldInput("f4", "Hill Field", UNKNOWN)]);
    const ready = unwrap(markFertiliserQuoteRequestReady(unwrap(setQuoteRequestDetails(draftOf(basket), { deliveryLocation: "Yard", contact: "Pat" })), "2026-10-05T10:05:00.000Z"));
    expect(ready.status).toBe("READY_TO_SEND");
    expect(ready.coverage).toBe("PARTIAL");
    expect(ready.lines.some((l) => l.provisional)).toBe(true);
    const text = renderFertiliserQuoteRequestText(ready);
    expect(text).toContain("covers only part of the farm's fertiliser requirement");
    expect(text).toContain("Some quantities are provisional and may change.");
  });

  it("rejects an empty basket and a line missing product identity", () => {
    expect(createFertiliserQuoteRequestDraft(basketOf([]), META)).toEqual({ ok: false, issues: ["EMPTY_BASKET"] });
    const basket = basketOf(READY_FIELDS);
    const broken = { ...basket, lines: basket.lines.map((l, i) => (i === 0 ? { ...l, npkAnalysis: " " } : l)) };
    expect(createFertiliserQuoteRequestDraft(broken, META)).toEqual({ ok: false, issues: ["MISSING_PRODUCT_IDENTITY"] });
  });
});

describe("canonical vs requested quantities", () => {
  it("5/6: keeps the canonical quantity and stores the requested quantity separately, starting at the 0.01 t round-up", () => {
    const request = draftOf(basketOf(READY_FIELDS));
    const line = request.lines.find((l) => l.name === "18-6-12")!;
    expect(line.canonicalQuantityKg).toBe(2395.5);
    expect(line.canonicalDisplayTonnes).toBe(2.4);
    expect(line.requestedTonnes).toBe(2.4);
    expect(line.requestedQuantityKg).toBe(2400);
    expect(line.requestedBelowCanonical).toBe(false);

    const edited = unwrap(setRequestedQuantity(request, line.productKey, 3.25));
    const editedLine = edited.lines.find((l) => l.productKey === line.productKey)!;
    expect(editedLine.requestedTonnes).toBe(3.25);
    expect(editedLine.requestedQuantityKg).toBe(3250);
    expect(editedLine.canonicalQuantityKg).toBe(2395.5);
    expect(editedLine.canonicalDisplayTonnes).toBe(2.4);
  });

  it("7: editing a requested quantity never mutates the canonical basket or the prior request", () => {
    const basket = basketOf(READY_FIELDS);
    const snapshot = structuredClone(basket);
    const request = draftOf(basket);
    const before = structuredClone(request);
    setRequestedQuantity(request, request.lines[0].productKey, 9.99);
    setQuoteRequestDetails(request, { deliveryLocation: "Yard", contact: "Pat" });
    expect(basket).toEqual(snapshot);
    expect(request).toEqual(before);
  });

  it("discloses a requested quantity below the canonical requirement — never silent", () => {
    const request = draftOf(basketOf(READY_FIELDS));
    const line = request.lines.find((l) => l.name === "18-6-12")!;
    const edited = unwrap(setRequestedQuantity(request, line.productKey, 2.39));
    expect(edited.lines.find((l) => l.productKey === line.productKey)!.requestedBelowCanonical).toBe(true);
  });

  it("8/9: rejects zero, negative, non-finite and sub-0.01 t requested quantities", () => {
    const request = draftOf(basketOf(READY_FIELDS));
    const key = request.lines[0].productKey;
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.234]) {
      expect(setRequestedQuantity(request, key, bad)).toEqual({ ok: false, issues: ["INVALID_REQUESTED_QUANTITY"] });
    }
    expect(setRequestedQuantity(request, "nope|0-0-0", 1)).toEqual({ ok: false, issues: ["UNKNOWN_PRODUCT"] });
    for (const bad of ["0", "-1", "", "abc", "1.234", "1e3", "0.00"]) expect(parseRequestedTonnes(bad)).toBeNull();
    expect(parseRequestedTonnes(" 2.4 ")).toBe(2.4);
    expect(parseRequestedTonnes(".5")).toBe(0.5);
  });
});

describe("product identity and cost", () => {
  it("10: preserves product name + N-P-K identity with no invented catalogue id", () => {
    const basket = basketOf(READY_FIELDS);
    const request = draftOf(basket);
    expect(request.lines.map((l) => [l.productKey, l.name, l.npkAnalysis])).toEqual(basket.lines.map((l) => [l.productKey, l.name, l.npkAnalysis]));
    expect(Object.keys(request.lines[0])).not.toContain("productId");
    expect(renderFertiliserQuoteRequestText(request)).toContain("Product: Protected Urea (N-P-K 46-0-0) — Quantity: 0.30 tonnes");
  });

  it("11: the estimated cost stays the basket's estimate for the canonical quantity", () => {
    const request = draftOf(basketOf(READY_FIELDS));
    const line = request.lines.find((l) => l.name === "18-6-12")!;
    expect(line.estimatedCostEur).toBe(1200);
    expect(line.costBasis).toBe("ESTIMATE");
    const edited = unwrap(setRequestedQuantity(request, line.productKey, 5));
    expect(edited.lines.find((l) => l.productKey === line.productKey)!.estimatedCostEur).toBe(1200);
  });

  it("12: a missing price stays null, never €0, and no price reaches the supplier text", () => {
    const request = draftOf(basketOf([fieldInput("f1", "Top Field", RECOMMENDED, [product("Protected Urea", "46-0-0", 300, null)])]));
    expect(request.lines[0].estimatedCostEur).toBeNull();
    expect(renderFertiliserQuoteRequestText(request)).not.toMatch(/€|EUR|cost/i);
  });
});

describe("details, preview and lifecycle", () => {
  it("13: the final preview is a deterministic rendering of the request payload", () => {
    const request = readyRequest();
    const withNote = unwrap(
      setQuoteRequestDetails(request, {
        recipients: request.details.recipients,
        deliveryLocation: request.details.deliveryLocation,
        contact: request.details.contact,
        deliveryWindow: { start: "2026-11-01", end: "2026-11-14" },
        farmerNote: "Bulk bags preferred",
      }),
    );
    expect(renderFertiliserQuoteRequestText(withNote)).toBe(
      [
        "Farm Return fertiliser quote request",
        `Reference: ${META.requestId}`,
        "",
        "Product: 18-6-12 (N-P-K 18-6-12) — Quantity: 2.40 tonnes",
        "Product: Protected Urea (N-P-K 46-0-0) — Quantity: 0.30 tonnes",
        "",
        "Delivery: Farm yard, Ballyduff, Co. Kerry",
        "Delivery window: 2026-11-01 to 2026-11-14",
        "Contact: Pat 087 000 0000",
        "Notes: Bulk bags preferred",
        "Bag quantities not specified. This is a request for a quote, not an order.",
      ].join("\n"),
    );
    expect(renderFertiliserQuoteRequestText(withNote)).toBe(renderFertiliserQuoteRequestText(structuredClone(withNote)));
    expect(renderFertiliserQuoteRequestText(withNote)).not.toContain("sales@agri.example");
    expect(renderFertiliserQuoteRequestText(withNote)).not.toContain("nutrient_engine");
  });

  it("14: preserves supplier recipients, trimming and de-duplicating", () => {
    const request = unwrap(
      setQuoteRequestDetails(draftOf(basketOf(READY_FIELDS)), {
        recipients: [{ name: " Agri Store ", contact: " 061 123 " }, { name: "agri store" }, { name: "Co-op", contact: "" }],
      }),
    );
    expect(request.details.recipients).toEqual([
      { name: "Agri Store", contact: "061 123" },
      { name: "Co-op", contact: null },
    ]);
    expect(setQuoteRequestDetails(request, { recipients: [{ name: "  " }] })).toEqual({ ok: false, issues: ["INVALID_RECIPIENT"] });
  });

  it("requires delivery location and contact before READY_TO_SEND, and validates the delivery window", () => {
    const draft = draftOf(basketOf(READY_FIELDS));
    expect(fertiliserQuoteRequestIssues(draft)).toEqual(["MISSING_DELIVERY_LOCATION", "MISSING_CONTACT"]);
    expect(markFertiliserQuoteRequestReady(draft, "2026-10-05T10:05:00.000Z")).toEqual({ ok: false, issues: ["MISSING_DELIVERY_LOCATION", "MISSING_CONTACT"] });
    expect(setQuoteRequestDetails(draft, { deliveryWindow: { start: "2026-11-14", end: "2026-11-01" } })).toEqual({ ok: false, issues: ["INVALID_DELIVERY_WINDOW"] });
    expect(setQuoteRequestDetails(draft, { deliveryWindow: { start: "2026-02-30", end: "2026-03-01" } })).toEqual({ ok: false, issues: ["INVALID_DELIVERY_WINDOW"] });
  });

  it("15: with no supplier integration the request reaches READY_TO_SEND, never SENT", () => {
    expect(FERTILISER_QUOTE_DELIVERY_CAPABILITY.status).toBe("UNAVAILABLE");
    const request = readyRequest();
    expect(request.status).toBe("READY_TO_SEND");
    expect(request.readyAt).toBe("2026-10-05T10:05:00.000Z");
    expect(request.deliveryAttempts).toEqual([]);
  });

  it("16: only a successful real delivery attempt with a provider reference marks SENT", () => {
    const request = readyRequest();
    const attempt = { attemptedAt: "2026-10-05T11:00:00.000Z", recipientName: "Agri Store", outcome: "SUCCEEDED" as const, providerReference: null, failureReason: null };
    expect(recordFertiliserQuoteDeliveryAttempt(request, attempt)).toEqual({ ok: false, issues: ["MISSING_PROVIDER_REFERENCE"] });
    expect(recordFertiliserQuoteDeliveryAttempt(request, { ...attempt, recipientName: "Stranger", providerReference: "msg-1" })).toEqual({
      ok: false,
      issues: ["UNKNOWN_RECIPIENT"],
    });
    expect(recordFertiliserQuoteDeliveryAttempt(draftOf(basketOf(READY_FIELDS)), { ...attempt, providerReference: "msg-1" })).toEqual({
      ok: false,
      issues: ["INVALID_STATUS_TRANSITION"],
    });
    const sent = unwrap(recordFertiliserQuoteDeliveryAttempt(request, { ...attempt, providerReference: "msg-1" }));
    expect(sent.status).toBe("SENT");
    expect(sent.deliveryAttempts).toHaveLength(1);
    // A SENT request accepts no further attempt — never two SENT records.
    expect(recordFertiliserQuoteDeliveryAttempt(sent, { ...attempt, providerReference: "msg-2" })).toEqual({ ok: false, issues: ["INVALID_STATUS_TRANSITION"] });
    expect(cancelFertiliserQuoteRequest(sent, "2026-10-05T12:00:00.000Z")).toEqual({ ok: false, issues: ["INVALID_STATUS_TRANSITION"] });
  });

  it("17: a failed delivery attempt is FAILED, recorded and retryable", () => {
    const request = readyRequest();
    const failed = unwrap(
      recordFertiliserQuoteDeliveryAttempt(request, {
        attemptedAt: "2026-10-05T11:00:00.000Z",
        recipientName: "Agri Store",
        outcome: "FAILED",
        providerReference: null,
        failureReason: "timeout",
      }),
    );
    expect(failed.status).toBe("FAILED");
    expect(failed.deliveryAttempts[0].failureReason).toBe("timeout");
    expect(failed.lines).toEqual(request.lines);
    const retried = unwrap(
      recordFertiliserQuoteDeliveryAttempt(failed, {
        attemptedAt: "2026-10-05T11:05:00.000Z",
        recipientName: "Agri Store",
        outcome: "SUCCEEDED",
        providerReference: "msg-9",
        failureReason: null,
      }),
    );
    expect(retried.status).toBe("SENT");
    expect(retried.deliveryAttempts).toHaveLength(2);
  });

  it("18: a repeated prepare action is idempotent — same request, same id, no second record", () => {
    const request = readyRequest();
    const again = unwrap(markFertiliserQuoteRequestReady(request, "2026-10-05T10:09:00.000Z"));
    expect(again).toBe(request);
    expect(again.readyAt).toBe("2026-10-05T10:05:00.000Z");
  });

  it("editing a READY_TO_SEND request returns it to DRAFT; cancelling works from any unsent state", () => {
    const request = readyRequest();
    const edited = unwrap(setRequestedQuantity(request, request.lines[0].productKey, 3));
    expect(edited.status).toBe("DRAFT");
    expect(edited.readyAt).toBeNull();
    const cancelled = unwrap(cancelFertiliserQuoteRequest(edited, "2026-10-05T12:00:00.000Z"));
    expect(cancelled.status).toBe("CANCELLED");
    expect(setRequestedQuantity(cancelled, cancelled.lines[0].productKey, 2)).toEqual({ ok: false, issues: ["INVALID_STATUS_TRANSITION"] });
  });
});

describe("science boundary", () => {
  it("19/20/21: the quote workflow calls no nutrient or statutory function and leaves canonical calculations unchanged", () => {
    const fields = [...READY_FIELDS, fieldInput("f3", "Bog Field", PROVISIONAL, [product("Protected Urea", "46-0-0", 200, 80)])];
    const aggregation = aggregateFarmFertiliserPurchasing(fields);
    const basket = buildFarmFertiliserQuoteBasket(aggregation, { farmId: "farm-1", createdAt: "2026-10-05T09:00:00.000Z" });
    const aggregationSnapshot = structuredClone(aggregation);
    const basketSnapshot = structuredClone(basket);
    expect(scienceSpies.length).toBeGreaterThan(0);
    for (const s of scienceSpies) s.fn.mockClear();

    const request = readyRequest(basket);
    const edited = unwrap(setRequestedQuantity(request, request.lines[0].productKey, 7.5));
    const ready = unwrap(markFertiliserQuoteRequestReady(edited, "2026-10-05T10:10:00.000Z"));
    renderFertiliserQuoteRequestText(ready);
    recordFertiliserQuoteDeliveryAttempt(ready, {
      attemptedAt: "2026-10-05T11:00:00.000Z",
      recipientName: "Agri Store",
      outcome: "FAILED",
      providerReference: null,
      failureReason: "x",
    });

    const called = scienceSpies.filter((s) => s.fn.mock.calls.length > 0).map((s) => s.name);
    expect(called).toEqual([]);
    expect(aggregation).toEqual(aggregationSnapshot);
    expect(basket).toEqual(basketSnapshot);
    expect(aggregateFarmFertiliserPurchasing(fields)).toEqual(aggregationSnapshot);
  });
});
