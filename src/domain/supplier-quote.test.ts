import { describe, expect, it } from "vitest";
import {
  SUPPLIER_QUOTE_MAX_LINES,
  SUPPLIER_QUOTE_TOTALS_METHOD,
  computeStoredSupplierQuoteTotals,
  computeSupplierQuoteTotals,
  deriveSupplierRfqStatus,
  formatScaledDecimal,
  nextSupplierQuoteStatus,
  parseScaledDecimal,
  summariseSupplierPortal,
  supplierQuoteSubmissionIssues,
  supplierRfqPermissions,
  validateSupplierQuoteDraft,
  type SupplierQuoteDraftInput,
  type SupplierRfqStatusFacts,
} from "./supplier-quote";

function draft(overrides: Partial<SupplierQuoteDraftInput> = {}): SupplierQuoteDraftInput {
  return {
    lines: [{ product: "CAN 27%N", description: null, quantity: "10", unit: "tonnes", unitPriceExVat: "385.00", vatRatePercent: "0" }],
    deliveryChargeExVat: "0.00",
    deliveryVatRatePercent: null,
    deliveryEarliest: "2026-11-10",
    deliveryLatest: "2026-11-20",
    validUntil: "2026-11-30",
    paymentTerms: null,
    notes: null,
    ...overrides,
  };
}

describe("parseScaledDecimal / formatScaledDecimal — exact decimals", () => {
  it.each([
    ["12", 2, BigInt(1200)],
    ["12.5", 2, BigInt(1250)],
    ["12.50", 2, BigInt(1250)],
    ["0.001", 3, BigInt(1)],
    [" 7.10 ", 2, BigInt(710)],
    [485.5, 2, BigInt(48550)],
  ])("parses %j at scale %d", (value, scale, expected) => {
    expect(parseScaledDecimal(value, scale)).toBe(expected);
  });

  it.each([["1.234", 2], ["-1", 2], ["1e3", 2], ["abc", 2], ["", 2], [Number.NaN, 2], [Infinity, 2], [0.1 + 0.2, 2], [null, 2], ["1,000", 2]])(
    "rejects %j at scale %d rather than rounding or coercing it",
    (value, scale) => {
      expect(parseScaledDecimal(value, scale)).toBeNull();
    },
  );

  it("formats scaled integers canonically", () => {
    expect(formatScaledDecimal(BigInt(48550), 2, true)).toBe("485.50");
    expect(formatScaledDecimal(BigInt(13500), 3)).toBe("13.5");
    expect(formatScaledDecimal(BigInt(5), 2, true)).toBe("0.05");
  });
});

describe("validateSupplierQuoteDraft — input validation", () => {
  it("accepts a well-formed draft and canonicalises its decimals", () => {
    const result = validateSupplierQuoteDraft({ ...draft(), lines: [{ product: "  Urea ", quantity: "2.500", unit: "tonnes", unitPriceExVat: "410.5", vatRatePercent: "13.50" }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[0]).toEqual({ product: "Urea", description: null, quantity: "2.5", unit: "tonnes", unitPriceExVat: "410.50", vatRatePercent: "13.5" });
  });

  it("allows an incomplete draft (no VAT rate, no delivery charge, no validity yet)", () => {
    const result = validateSupplierQuoteDraft(draft({ deliveryChargeExVat: null, validUntil: null, lines: [{ ...draft().lines[0], vatRatePercent: null }] }));
    expect(result.ok).toBe(true);
  });

  it("drops client-supplied supplier/farm/total fields instead of carrying them forward", () => {
    const result = validateSupplierQuoteDraft({ ...draft(), supplierId: "other-supplier", farmId: "farm-x", totalIncVat: "1.00" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual(
      ["deliveryChargeExVat", "deliveryEarliest", "deliveryLatest", "deliveryVatRatePercent", "lines", "notes", "paymentTerms", "validUntil"].sort(),
    );
  });

  it.each([
    ["zero quantity", { quantity: "0" }, "lines.0.quantity"],
    ["negative price", { unitPriceExVat: "-1" }, "lines.0.unitPriceExVat"],
    ["sub-cent price", { unitPriceExVat: "1.005" }, "lines.0.unitPriceExVat"],
    ["four-decimal quantity", { quantity: "1.0001" }, "lines.0.quantity"],
    ["VAT above 100%", { vatRatePercent: "100.01" }, "lines.0.vatRatePercent"],
    ["unknown unit", { unit: "litres" }, "lines.0.unit"],
    ["blank product", { product: "   " }, "lines.0.product"],
    ["over-ceiling quantity", { quantity: "100000.001" }, "lines.0.quantity"],
  ])("rejects %s", (_label, lineOverride, path) => {
    const result = validateSupplierQuoteDraft({ ...draft(), lines: [{ ...draft().lines[0], ...lineOverride }] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.path)).toContain(path);
  });

  it("rejects an impossible calendar date and an inverted delivery window", () => {
    const result = validateSupplierQuoteDraft(draft({ validUntil: "2026-02-30", deliveryEarliest: "2026-11-20", deliveryLatest: "2026-11-10" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.path).sort()).toEqual(["deliveryLatest", "validUntil"]);
  });

  it("rejects more than the maximum number of lines", () => {
    const lines = Array.from({ length: SUPPLIER_QUOTE_MAX_LINES + 1 }, () => draft().lines[0]);
    expect(validateSupplierQuoteDraft({ ...draft(), lines }).ok).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateSupplierQuoteDraft(null).ok).toBe(false);
    expect(validateSupplierQuoteDraft([]).ok).toBe(false);
    expect(validateSupplierQuoteDraft({ ...draft(), lines: "x" }).ok).toBe(false);
  });
});

describe("supplierQuoteSubmissionIssues — completeness before submit", () => {
  it("accepts a complete draft", () => {
    expect(supplierQuoteSubmissionIssues(draft(), "2026-11-01")).toEqual([]);
  });

  it("requires lines, declared VAT, a delivery charge, delivery dates and an unexpired validity", () => {
    const issues = supplierQuoteSubmissionIssues(
      draft({ lines: [], deliveryChargeExVat: null, deliveryEarliest: null, deliveryLatest: null, validUntil: "2026-10-31" }),
      "2026-11-01",
    );
    expect(issues.map((i) => i.path).sort()).toEqual(["deliveryChargeExVat", "deliveryEarliest", "deliveryLatest", "lines", "validUntil"]);
  });

  it("requires a VAT rate on every line and on a non-zero delivery charge", () => {
    const issues = supplierQuoteSubmissionIssues(draft({ deliveryChargeExVat: "50.00", lines: [{ ...draft().lines[0], vatRatePercent: null }] }), "2026-11-01");
    expect(issues.map((i) => i.path).sort()).toEqual(["deliveryVatRatePercent", "lines.0.vatRatePercent"]);
  });

  it("accepts a validity date of today", () => {
    expect(supplierQuoteSubmissionIssues(draft({ validUntil: "2026-11-01" }), "2026-11-01")).toEqual([]);
  });
});

describe("computeSupplierQuoteTotals — exact totals", () => {
  it("multiplies quantity by unit price and adds delivery and VAT per line", () => {
    const totals = computeSupplierQuoteTotals(
      draft({
        lines: [
          { product: "CAN", description: null, quantity: "10", unit: "tonnes", unitPriceExVat: "385.00", vatRatePercent: "0" },
          { product: "Bags", description: null, quantity: "3", unit: "bags", unitPriceExVat: "12.99", vatRatePercent: "23" },
        ],
        deliveryChargeExVat: "75.00",
        deliveryVatRatePercent: "23",
      }),
    );
    // 10 × 385.00 = 3850.00 @0%; 3 × 12.99 = 38.97, VAT 8.9631 → 8.96; delivery 75.00, VAT 17.25
    expect(totals.lines).toEqual([
      { lineNumber: 1, exVatCents: 385000, vatCents: 0, incVatCents: 385000 },
      { lineNumber: 2, exVatCents: 3897, vatCents: 896, incVatCents: 4793 },
    ]);
    expect(totals.goodsExVatCents).toBe(388897);
    expect(totals.deliveryExVatCents).toBe(7500);
    expect(totals.totalExVatCents).toBe(396397);
    expect(totals.vatCents).toBe(896 + 1725);
    expect(totals.totalIncVatCents).toBe(396397 + 2621);
    expect(totals.vatBands).toEqual([
      { ratePercent: "0", netCents: 385000, vatCents: 0 },
      { ratePercent: "23", netCents: 3897 + 7500, vatCents: 2621 },
    ]);
    expect(totals.complete).toBe(true);
    expect(totals.method).toBe(SUPPLIER_QUOTE_TOTALS_METHOD);
  });

  it("rounds half-up to the cent per line, never via binary floats", () => {
    // 0.333 × 0.15 = 0.04995 → 0.05; 1.005 tonnes would be invalid, so use 3 × 0.10 (0.1×3 float = 0.30000000000000004)
    const totals = computeSupplierQuoteTotals(
      draft({
        lines: [
          { product: "A", description: null, quantity: "0.333", unit: "kg", unitPriceExVat: "0.15", vatRatePercent: "13.5" },
          { product: "B", description: null, quantity: "3", unit: "kg", unitPriceExVat: "0.10", vatRatePercent: "0" },
        ],
      }),
    );
    expect(totals.lines[0].exVatCents).toBe(5);
    expect(totals.lines[0].vatCents).toBe(1); // 5 × 13.5% = 0.675 → 1
    expect(totals.lines[1].exVatCents).toBe(30);
    expect(totals.goodsExVatCents).toBe(35);
  });

  it("keeps VAT UNKNOWN (null, never 0) while any rate or the delivery charge is undeclared", () => {
    const noRate = computeSupplierQuoteTotals(draft({ lines: [{ ...draft().lines[0], vatRatePercent: null }] }));
    expect(noRate.vatCents).toBeNull();
    expect(noRate.totalIncVatCents).toBeNull();
    expect(noRate.lines[0].vatCents).toBeNull();
    expect(noRate.goodsExVatCents).toBe(385000);
    expect(noRate.complete).toBe(false);

    const noDelivery = computeSupplierQuoteTotals(draft({ deliveryChargeExVat: null }));
    expect(noDelivery.deliveryExVatCents).toBeNull();
    expect(noDelivery.totalExVatCents).toBeNull();
    expect(noDelivery.totalIncVatCents).toBeNull();

    const deliveryNoRate = computeSupplierQuoteTotals(draft({ deliveryChargeExVat: "20.00", deliveryVatRatePercent: null }));
    expect(deliveryNoRate.totalExVatCents).toBe(387000);
    expect(deliveryNoRate.vatCents).toBeNull();
  });

  it("handles the input ceilings exactly", () => {
    const lines = Array.from({ length: SUPPLIER_QUOTE_MAX_LINES }, () => ({ product: "X", description: null, quantity: "100000", unit: "tonnes" as const, unitPriceExVat: "100000.00", vatRatePercent: "100" }));
    const totals = computeSupplierQuoteTotals(draft({ lines, deliveryChargeExVat: "100000.00", deliveryVatRatePercent: "100" }));
    expect(totals.goodsExVatCents).toBe(50 * 100000 * 100000 * 100);
    expect(Number.isSafeInteger(totals.totalIncVatCents!)).toBe(true);
  });

  it("throws on malformed stored input rather than guessing", () => {
    expect(() => computeSupplierQuoteTotals(draft({ lines: [{ ...draft().lines[0], quantity: "abc" }] }))).toThrow();
  });

  it("fails closed on an unsupported stored totals method", () => {
    expect(computeStoredSupplierQuoteTotals({ ...draft(), totalsMethod: "supplier_quote_totals_v0" })).toEqual({ method: "supplier_quote_totals_v0", unsupported: true });
    expect("complete" in computeStoredSupplierQuoteTotals({ ...draft(), totalsMethod: null })).toBe(true);
  });
});

describe("quote lifecycle", () => {
  it.each([
    ["draft", "save", "draft"],
    ["draft", "submit", "submitted"],
    ["draft", "discard", "discarded"],
    ["draft", "withdraw", null],
    ["submitted", "withdraw", "withdrawn"],
    ["submitted", "save", null],
    ["submitted", "submit", null],
    ["submitted", "discard", null],
    ["withdrawn", "save", null],
    ["withdrawn", "submit", null],
    ["discarded", "submit", null],
  ] as const)("%s --%s--> %s", (from, action, to) => {
    expect(nextSupplierQuoteStatus(from, action)).toBe(to);
  });
});

describe("deriveSupplierRfqStatus — precedence", () => {
  const base: SupplierRfqStatusFacts = { requestWithdrawn: false, declined: false, viewed: false, currentRevisionNumber: 1, liveQuote: null, today: "2026-11-01" };

  it.each<[string, Partial<SupplierRfqStatusFacts>, string]>([
    ["never viewed", {}, "NEW"],
    ["viewed, no quote", { viewed: true }, "OPEN"],
    ["draft", { viewed: true, liveQuote: { status: "draft", quotedRevisionNumber: 1, validUntil: null } }, "DRAFT"],
    ["submitted", { viewed: true, liveQuote: { status: "submitted", quotedRevisionNumber: 1, validUntil: "2026-11-01" } }, "QUOTE_SUBMITTED"],
    ["expired", { viewed: true, liveQuote: { status: "submitted", quotedRevisionNumber: 1, validUntil: "2026-10-31" } }, "QUOTE_EXPIRED"],
    ["farmer revised after quote", { viewed: true, currentRevisionNumber: 2, liveQuote: { status: "submitted", quotedRevisionNumber: 1, validUntil: "2026-10-31" } }, "QUOTE_NEEDS_REVIEW"],
    ["declined beats a stale quote", { declined: true, currentRevisionNumber: 2, liveQuote: { status: "draft", quotedRevisionNumber: 1, validUntil: null } }, "DECLINED"],
    ["farmer withdrawal beats everything", { requestWithdrawn: true, declined: true, liveQuote: { status: "submitted", quotedRevisionNumber: 1, validUntil: "2026-12-01" } }, "FARMER_WITHDRAWN"],
    ["a withdrawn quote is not live", { viewed: true, liveQuote: { status: "withdrawn", quotedRevisionNumber: 1, validUntil: "2026-12-01" } }, "OPEN"],
  ])("%s → %s", (_label, overrides, expected) => {
    expect(deriveSupplierRfqStatus({ ...base, ...overrides })).toBe(expected);
  });

  it("permits only lifecycle-valid actions", () => {
    expect(supplierRfqPermissions("FARMER_WITHDRAWN", "draft")).toMatchObject({ canEditDraft: false, canSubmit: false, canDiscard: true, canDecline: false });
    expect(supplierRfqPermissions("QUOTE_SUBMITTED", "submitted")).toMatchObject({ canEditDraft: false, canSubmit: false, canWithdraw: true, canDecline: false });
    expect(supplierRfqPermissions("OPEN", null)).toMatchObject({ canEditDraft: true, canSubmit: false, canDecline: true });
  });
});

describe("summariseSupplierPortal — overview KPIs", () => {
  it("counts statuses and sums only live, unexpired submitted quote values", () => {
    const kpis = summariseSupplierPortal(
      [
        { status: "NEW", liveQuote: null },
        { status: "OPEN", liveQuote: null },
        { status: "DRAFT", liveQuote: { status: "draft", validUntil: null, totalIncVatCents: 999 } },
        { status: "QUOTE_SUBMITTED", liveQuote: { status: "submitted", validUntil: "2026-11-05", totalIncVatCents: 10000 } },
        { status: "QUOTE_SUBMITTED", liveQuote: { status: "submitted", validUntil: "2026-12-30", totalIncVatCents: null } },
        { status: "QUOTE_EXPIRED", liveQuote: { status: "submitted", validUntil: "2026-10-01", totalIncVatCents: 5000 } },
        { status: "QUOTE_NEEDS_REVIEW", liveQuote: { status: "submitted", validUntil: "2026-11-30", totalIncVatCents: 7000 } },
        { status: "DECLINED", liveQuote: null },
        { status: "FARMER_WITHDRAWN", liveQuote: null },
      ],
      "2026-11-01",
    );
    expect(kpis).toEqual({
      totalRfqs: 9,
      newRfqs: 1,
      awaitingQuote: 3,
      drafts: 1,
      submitted: 2,
      needsReview: 1,
      expired: 1,
      closed: 2,
      expiringWithinWeek: 1,
      liveSubmittedValueCents: 10000,
      liveSubmittedValueUnknown: 1,
    });
  });

  it("returns honest zeros for an empty inbox", () => {
    expect(summariseSupplierPortal([], "2026-11-01").totalRfqs).toBe(0);
  });
});
