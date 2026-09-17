import { describe, expect, it } from "vitest";
import {
  buildFertiliserStockBand,
  currentFertiliserStockByProduct,
  fertiliserStockRecordQuantityKg,
  normaliseFertiliserProductKey,
  validateNewFertiliserStockRecordInput,
  type FertiliserStockRecord,
} from "./fertiliser-stock";

function record(overrides: Partial<FertiliserStockRecord> = {}): FertiliserStockRecord {
  return {
    id: "s1",
    farmId: "farm-1",
    product: "Urea",
    quantity: 100,
    unit: "kg",
    effectiveDate: "2026-09-01",
    source: "Farmer entered",
    recordedAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

describe("fertiliserStockRecordQuantityKg", () => {
  it("passes kg through unchanged", () => {
    expect(fertiliserStockRecordQuantityKg({ quantity: 100, unit: "kg" })).toBe(100);
  });
  it("converts tonnes to kg", () => {
    expect(fertiliserStockRecordQuantityKg({ quantity: 2.5, unit: "t" })).toBe(2500);
  });
});

describe("validateNewFertiliserStockRecordInput", () => {
  const today = "2026-09-17";
  const base = { product: "Urea", quantity: 100, unit: "kg" as const, effectiveDate: "2026-09-01", source: "Farmer entered" };

  it("accepts a valid input", () => {
    expect(validateNewFertiliserStockRecordInput(base, today)).toEqual([]);
  });
  it("rejects an empty product", () => {
    const errors = validateNewFertiliserStockRecordInput({ ...base, product: "  " }, today);
    expect(errors.some((e) => e.field === "product")).toBe(true);
  });
  it("rejects a non-positive quantity", () => {
    expect(validateNewFertiliserStockRecordInput({ ...base, quantity: 0 }, today).some((e) => e.field === "quantity")).toBe(true);
    expect(validateNewFertiliserStockRecordInput({ ...base, quantity: -5 }, today).some((e) => e.field === "quantity")).toBe(true);
    expect(validateNewFertiliserStockRecordInput({ ...base, quantity: Number.NaN }, today).some((e) => e.field === "quantity")).toBe(true);
  });
  it("rejects a future effective date", () => {
    expect(validateNewFertiliserStockRecordInput({ ...base, effectiveDate: "2026-12-25" }, today).some((e) => e.field === "effectiveDate")).toBe(true);
  });
  describe("calendar-date validity (Codex audit MEDIUM, round 1)", () => {
    it("rejects a nonexistent calendar date instead of silently rolling it over", () => {
      // new Date("2026-02-30") quietly rolls over to a real 2026-03-02 --
      // this must be caught, not passed through to the database.
      const errors = validateNewFertiliserStockRecordInput({ ...base, effectiveDate: "2026-02-30" }, today);
      expect(errors.some((e) => e.field === "effectiveDate")).toBe(true);
    });
    it("rejects a malformed date shape", () => {
      expect(validateNewFertiliserStockRecordInput({ ...base, effectiveDate: "17/09/2026" }, today).some((e) => e.field === "effectiveDate")).toBe(true);
      expect(validateNewFertiliserStockRecordInput({ ...base, effectiveDate: "not-a-date" }, today).some((e) => e.field === "effectiveDate")).toBe(true);
    });
    it("accepts a genuine leap-year 29 February", () => {
      expect(validateNewFertiliserStockRecordInput({ ...base, effectiveDate: "2028-02-29" }, "2028-03-01")).toEqual([]);
    });
    it("rejects 29 February in a non-leap year", () => {
      expect(validateNewFertiliserStockRecordInput({ ...base, effectiveDate: "2026-02-29" }, today).some((e) => e.field === "effectiveDate")).toBe(true);
    });
  });

  it("rejects an empty source", () => {
    expect(validateNewFertiliserStockRecordInput({ ...base, source: "" }, today).some((e) => e.field === "source")).toBe(true);
  });
});

describe("currentFertiliserStockByProduct", () => {
  it("returns nothing for a product with no record at all -- unknown is not zero", () => {
    const map = currentFertiliserStockByProduct([record({ product: "Urea" })]);
    expect(map.has(normaliseFertiliserProductKey("Lime"))).toBe(false);
  });

  it("picks the most recent record by effectiveDate", () => {
    const older = record({ id: "s1", effectiveDate: "2026-08-01", quantity: 50, recordedAt: "2026-08-01T09:00:00.000Z" });
    const newer = record({ id: "s2", effectiveDate: "2026-09-01", quantity: 100, recordedAt: "2026-09-01T09:00:00.000Z" });
    const map = currentFertiliserStockByProduct([older, newer]);
    expect(map.get("urea")?.quantityKg).toBe(100);
    expect(map.get("urea")?.effectiveDate).toBe("2026-09-01");
  });

  it("breaks a same-day tie by recordedAt -- the later correction wins", () => {
    const first = record({ id: "s1", effectiveDate: "2026-09-01", quantity: 100, recordedAt: "2026-09-01T09:00:00.000Z" });
    const correction = record({ id: "s2", effectiveDate: "2026-09-01", quantity: 120, recordedAt: "2026-09-01T14:00:00.000Z" });
    const map = currentFertiliserStockByProduct([first, correction]);
    expect(map.get("urea")?.quantityKg).toBe(120);
  });

  it("never sums records -- a new record is a full replacement, not a delta", () => {
    const map = currentFertiliserStockByProduct([
      record({ id: "s1", effectiveDate: "2026-08-01", quantity: 50, recordedAt: "2026-08-01T09:00:00.000Z" }),
      record({ id: "s2", effectiveDate: "2026-09-01", quantity: 100, recordedAt: "2026-09-01T09:00:00.000Z" }),
    ]);
    expect(map.get("urea")?.quantityKg).toBe(100);
    expect(map.get("urea")?.quantityKg).not.toBe(150);
  });

  it("tracks separate products independently", () => {
    const map = currentFertiliserStockByProduct([record({ product: "Urea", quantity: 100 }), record({ product: "Lime", quantity: 2000, unit: "t" })]);
    expect(map.get("urea")?.quantityKg).toBe(100);
    expect(map.get("lime")?.quantityKg).toBe(2000000);
  });

  describe("case/whitespace-insensitive product matching (Codex audit HIGH, round 1)", () => {
    it("treats 'Urea', 'urea' and ' Urea ' as the same real balance, never three separate ones", () => {
      const map = currentFertiliserStockByProduct([
        record({ id: "s1", product: "Urea", quantity: 100, effectiveDate: "2026-08-01", recordedAt: "2026-08-01T09:00:00.000Z" }),
        record({ id: "s2", product: "urea", quantity: 150, effectiveDate: "2026-09-01", recordedAt: "2026-09-01T09:00:00.000Z" }),
      ]);
      expect(map.size).toBe(1);
      expect(map.get(normaliseFertiliserProductKey(" Urea "))?.quantityKg).toBe(150);
    });

    it("preserves the real, as-typed spelling of whichever record currently wins, never a normalised key as the display value", () => {
      const map = currentFertiliserStockByProduct([record({ product: "  Protected Urea  ".trim(), quantity: 10 })]);
      const entry = map.get(normaliseFertiliserProductKey("protected urea"));
      expect(entry?.product).toBe("Protected Urea");
    });
  });
});

describe("buildFertiliserStockBand", () => {
  it("matches the brief's own worked example exactly: 100/1000 stock, no incoming tracked -> 10% solid, 90% shortfall", () => {
    const band = buildFertiliserStockBand({
      product: "Urea",
      remainingRequirementKg: 1000,
      currentStock: { product: "Urea", quantityKg: 100, effectiveDate: "2026-09-01", source: "Farmer entered", recordedAt: "2026-09-01T09:00:00.000Z" },
    });
    expect(band.status).toBe("recorded");
    if (band.status !== "recorded") throw new Error("unreachable");
    expect(band.stockPct).toBeCloseTo(10, 5);
    expect(band.shortfallPct).toBeCloseTo(90, 5);
    expect(band.incomingPct).toBe(0);
    expect(band.shortfallKg).toBe(900);
  });

  it("matches the brief's worked example WITH a confirmed-incoming figure supplied: 10% solid, 40% hatched, 50% empty", () => {
    const band = buildFertiliserStockBand({
      product: "Urea",
      remainingRequirementKg: 1000,
      currentStock: { product: "Urea", quantityKg: 100, effectiveDate: "2026-09-01", source: "Farmer entered", recordedAt: "2026-09-01T09:00:00.000Z" },
      confirmedIncomingKg: 400,
    });
    expect(band.status).toBe("recorded");
    if (band.status !== "recorded") throw new Error("unreachable");
    expect(band.stockPct).toBeCloseTo(10, 5);
    expect(band.incomingPct).toBeCloseTo(40, 5);
    expect(band.shortfallPct).toBeCloseTo(50, 5);
    expect(band.cappedStockKg + band.cappedIncomingKg + band.shortfallKg).toBe(1000);
  });

  it("returns not_recorded, never a false zero, when no stock record exists", () => {
    const band = buildFertiliserStockBand({ product: "Lime", remainingRequirementKg: 500 });
    expect(band.status).toBe("not_recorded");
  });

  it("handles a zero remaining requirement safely -- no division by zero, no bogus percentages", () => {
    const band = buildFertiliserStockBand({
      product: "Urea",
      remainingRequirementKg: 0,
      currentStock: { product: "Urea", quantityKg: 50, effectiveDate: "2026-09-01", source: "Farmer entered", recordedAt: "2026-09-01T09:00:00.000Z" },
    });
    expect(band.status).toBe("recorded");
    if (band.status !== "recorded") throw new Error("unreachable");
    expect(band.hasRemainingRequirement).toBe(false);
    expect(band.stockPct).toBe(0);
    expect(band.shortfallPct).toBe(0);
    expect(band.surplusKg).toBe(50);
  });

  it("shows a real surplus explicitly when stock exceeds the remaining requirement", () => {
    const band = buildFertiliserStockBand({
      product: "Urea",
      remainingRequirementKg: 100,
      currentStock: { product: "Urea", quantityKg: 150, effectiveDate: "2026-09-01", source: "Farmer entered", recordedAt: "2026-09-01T09:00:00.000Z" },
    });
    expect(band.status).toBe("recorded");
    if (band.status !== "recorded") throw new Error("unreachable");
    expect(band.surplusKg).toBe(50);
    expect(band.shortfallKg).toBe(0);
    expect(band.stockPct).toBe(100);
    expect(band.cappedStockKg).toBe(100);
  });

  it("never lets stock+incoming bands exceed 100% combined even when both individually would", () => {
    const band = buildFertiliserStockBand({
      product: "Urea",
      remainingRequirementKg: 100,
      currentStock: { product: "Urea", quantityKg: 80, effectiveDate: "2026-09-01", source: "Farmer entered", recordedAt: "2026-09-01T09:00:00.000Z" },
      confirmedIncomingKg: 80,
    });
    expect(band.status).toBe("recorded");
    if (band.status !== "recorded") throw new Error("unreachable");
    expect(band.stockPct + band.incomingPct + band.shortfallPct).toBeCloseTo(100, 5);
    expect(band.shortfallKg).toBe(0);
  });
});
