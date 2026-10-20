import { describe, expect, it } from "vitest";
import {
  computeAnimalPlanEconomics,
  summariseAnimalCosts,
  valueAnimalAtMart,
  addDays,
  daysBetween,
  isPlanDate,
  utcDateOfInstant,
  type AnimalCostEntry,
  type AnimalPlanAssumptions,
  type AnimalPlanEconomicsInput,
  type MartComparable,
  type MartComparableResult,
  type MartValuationRequest,
} from "./index";

const A = "SYNTH-ANIMAL-1";
const entry = (o: Partial<AnimalCostEntry> & Pick<AnimalCostEntry, "entryId" | "amount">): AnimalCostEntry => ({
  animalId: A,
  category: "FEED",
  currency: "EUR",
  effectiveDate: "2026-09-01",
  source: { kind: "DEMONSTRATION_FIXTURE", ref: null },
  attribution: "DIRECT",
  allocationBasis: null,
  note: null,
  ...o,
});

const FIXTURE_PROVIDER = { providerId: "SYNTH-FIXTURE", name: "Development fixture", kind: "DEVELOPMENT_FIXTURE" as const, isLive: false };
const comparable = (o: Partial<MartComparable> = {}): MartComparable => ({
  provider: FIXTURE_PROVIDER,
  mart: { martId: "SYNTH-MART", martName: "Synthetic mart" },
  reportDate: "2026-10-14",
  category: { label: "Synthetic bullocks 500–600 kg", sex: "MALE", weightBandKg: [500, 600], breedType: null },
  basis: "EUR_PER_KG_LIVEWEIGHT",
  observedLow: "3.00",
  central: "3.50",
  observedHigh: "4.00",
  centralDerivation: "OBSERVED_AVERAGE",
  sampleSize: 12,
  quality: null,
  ...o,
});
const available = (o: Partial<MartComparable> = {}): MartComparableResult => ({ state: "AVAILABLE", comparable: comparable(o) });
const request = (o: Partial<MartValuationRequest> = {}): MartValuationRequest => ({ animalId: A, martId: "SYNTH-MART", liveweightKg: 500, sex: "MALE", breedLabel: null, ageMonths: 14, asOfDate: "2026-10-16", ...o });

describe("plan dates — date-only, zone-free", () => {
  it("validates real calendar dates only", () => {
    expect(isPlanDate("2026-02-29")).toBe(false);
    expect(isPlanDate("2028-02-29")).toBe(true);
    expect(isPlanDate("2026-10-16T00:00:00Z")).toBe(false);
  });
  it("counts whole days across month, year and DST boundaries identically", () => {
    expect(daysBetween("2026-10-16", "2026-11-20")).toBe(35);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2); // EU DST change weekend
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
    expect(utcDateOfInstant("2026-10-16T23:30:00Z")).toBe("2026-10-16");
  });
});

describe("cost ledger — recorded costs only, never zero for unknown", () => {
  it("no entries ⇒ NONE_RECORDED with no total (not €0)", () => {
    const s = summariseAnimalCosts([], A, "2026-10-16");
    expect(s.state).toBe("NONE_RECORDED");
    expect(s.total).toBeNull();
    expect(s.byCategory.every((c) => c.amount === null && c.entryCount === 0)).toBe(true);
  });
  it("totals exactly, keeps direct vs allocated, leaves empty categories unknown", () => {
    const s = summariseAnimalCosts(
      [
        entry({ entryId: "c1", amount: "120.10" }),
        entry({ entryId: "c2", amount: "80.05", attribution: "ALLOCATED", allocationBasis: "1/40 of a synthetic delivery" }),
        entry({ entryId: "c3", amount: "35", category: "VETERINARY" }),
        entry({ entryId: "c4", amount: "999", animalId: "SYNTH-OTHER" }),
      ],
      A,
      "2026-10-16",
    );
    expect(s.state).toBe("RECORDED");
    expect(s.total).toBe("235.15");
    expect(s.direct).toBe("155.1");
    expect(s.allocated).toBe("80.05");
    expect(s.byCategory.find((c) => c.category === "FEED")).toMatchObject({ amount: "200.15", directAmount: "120.1", allocatedAmount: "80.05", entryCount: 2 });
    expect(s.byCategory.find((c) => c.category === "BEDDING")).toMatchObject({ amount: null, entryCount: 0 });
  });
  it("future-dated entries are listed, not counted; malformed or mixed currency fails closed", () => {
    const future = summariseAnimalCosts([entry({ entryId: "c1", amount: "10" }), entry({ entryId: "c2", amount: "5", effectiveDate: "2026-12-01" })], A, "2026-10-16");
    expect(future.total).toBe("10");
    expect(future.futureEntryIds).toEqual(["c2"]);
    expect(summariseAnimalCosts([entry({ entryId: "c1", amount: "-4" })], A, "2026-10-16")).toMatchObject({ state: "INVALID", total: null });
    expect(summariseAnimalCosts([entry({ entryId: "c1", amount: "4", attribution: "ALLOCATED" })], A, "2026-10-16").issues).toEqual([{ entryId: "c1", code: "COST_ENTRY_ALLOCATION_BASIS_MISSING" }]);
    expect(summariseAnimalCosts([entry({ entryId: "c1", amount: "4" }), entry({ entryId: "c1", amount: "5" })], A, "2026-10-16").state).toBe("INVALID");
    expect(summariseAnimalCosts([entry({ entryId: "c1", amount: "4" }), entry({ entryId: "c2", amount: "5", currency: "GBP" })], A, "2026-10-16")).toMatchObject({ state: "MIXED_CURRENCY", total: null });
  });
});

describe("mart valuation — source metadata, range, freshness, never live by accident", () => {
  it("€/kg basis: estimate = liveweight × price (low / central / high), with source metadata", () => {
    const v = valueAnimalAtMart(available(), request(), 14);
    expect(v.state).toBe("ESTIMATED");
    expect(v.estimate).toEqual({ low: "1500", central: "1750", high: "2000" });
    expect(v.estimateDerivation).toBe("DERIVED_FROM_PER_KG_AND_LIVEWEIGHT");
    expect(v).toMatchObject({ mart: { martName: "Synthetic mart" }, reportDate: "2026-10-14", freshness: { ageDays: 2, state: "CURRENT" }, provider: { isLive: false, kind: "DEVELOPMENT_FIXTURE" } });
  });
  it("stale report is flagged, not hidden; €/head is observed as reported", () => {
    expect(valueAnimalAtMart(available({ reportDate: "2026-09-01" }), request(), 14).freshness).toEqual({ ageDays: 45, staleAfterDays: 14, state: "STALE" });
    const perHead = valueAnimalAtMart(available({ basis: "EUR_PER_HEAD", observedLow: "1600", central: "1700", observedHigh: "1800" }), request({ liveweightKg: null }), 14);
    expect(perHead).toMatchObject({ state: "ESTIMATED", estimateDerivation: "OBSERVED_PER_HEAD", estimate: { central: "1700" } });
  });
  it("missing weight, missing comparable, unavailable provider and malformed data never produce a figure", () => {
    expect(valueAnimalAtMart(available(), request({ liveweightKg: null }), 14)).toMatchObject({ state: "NO_WEIGHT", estimate: null });
    expect(valueAnimalAtMart({ state: "NO_COMPARABLE", provider: FIXTURE_PROVIDER, mart: null, reason: "NO_CATEGORY" }, request(), 14)).toMatchObject({ state: "NO_COMPARABLE", estimate: null, price: null });
    expect(valueAnimalAtMart({ state: "UNAVAILABLE", provider: FIXTURE_PROVIDER, reason: "OFFLINE" }, request(), 14)).toMatchObject({ state: "UNAVAILABLE", estimate: null });
    expect(valueAnimalAtMart(available({ observedLow: "4.5" }), request(), 14).state).toBe("INVALID_PROVIDER_DATA");
    expect(valueAnimalAtMart(available({ provider: { ...FIXTURE_PROVIDER, isLive: true } }), request(), 14).state).toBe("INVALID_PROVIDER_DATA");
    expect(valueAnimalAtMart(available({ reportDate: "2026-10-20" }), request(), 14).state).toBe("INVALID_PROVIDER_DATA");
  });
});

const COSTS = summariseAnimalCosts([entry({ entryId: "c1", amount: "500" }), entry({ entryId: "c2", amount: "100", category: "VETERINARY" })], A, "2026-10-16");
const VALUATION = valueAnimalAtMart(available(), request({ liveweightKg: 500 }), 14);
const assumptions = (o: Partial<AnimalPlanAssumptions> = {}): AnimalPlanAssumptions => ({
  saleDate: "2026-11-15",
  concentrateKgPerDay: "4",
  concentratePricePerTonne: "350",
  forageCostPerDay: "1.10",
  housingDate: "2026-11-01",
  housingCostPerDay: "0.60",
  scenario: "BASE",
  ...o,
});
const input = (o: Partial<AnimalPlanEconomicsInput> = {}): AnimalPlanEconomicsInput => ({
  asOfDate: "2026-10-16",
  assumptions: assumptions(),
  currentlyHoused: false,
  currentWeightKg: 500,
  projection: { state: "PROJECTED", kg: 530 },
  costs: COSTS,
  valuation: VALUATION,
  ...o,
});
const amount = (m: { state: string; amount?: string }) => (m.state === "KNOWN" ? m.amount : m.state);

describe("plan economics — exact definitions", () => {
  it("computes every figure by its stated formula", () => {
    const e = computeAnimalPlanEconomics(input());
    expect(e.validity).toEqual({ state: "VALID" });
    expect(e.remainingDays).toBe(30);
    expect(e.housedDays).toBe(14);
    expect(e.outdoorDays).toBe(16);
    expect(amount(e.forecastFeedCost)).toBe("75"); // 30 × (4 × 350 / 1000 + 1.10) = 30 × 2.5
    expect(amount(e.forecastHousingCost)).toBe("8.4"); // 14 × 0.60
    expect(amount(e.forecastDirectHoldingCost)).toBe("83.4");
    expect(amount(e.recordedDirectCosts)).toBe("600");
    expect(amount(e.totalDirectCostBySale)).toBe("683.4");
    expect(amount(e.projectedSaleValue)).toBe("1855"); // 530 × 3.50
    expect(amount(e.projectedDirectProfit)).toBe("1171.6"); // 1855 − 600 − 83.4
    expect(amount(e.currentEstimatedValue)).toBe("1750"); // 500 × 3.50
    expect(amount(e.currentSellNowMargin)).toBe("1150"); // 1750 − 600
    expect(amount(e.returnFromHolding)).toBe("21.6"); // 1171.6 − 1150
    expect(amount(e.costPerKgNow)).toBe("1.2");
    expect(e.projectedAdditionalKg).toEqual({ state: "KNOWN", value: "30" });
    expect(e.valuationStanding).toBe("FIXTURE");
  });

  it("projectedDirectProfit = sale value − recorded − forecast, and returnFromHolding = profit − sell-now margin, for positive, zero and negative outcomes", () => {
    // Chosen so the return from holding is exactly positive, zero and negative (exact decimals, no tolerance).
    const cases: [string, number, string, string][] = [
      ["positive", 540, "1.10", "56.6"], // 540 × 3.5 − 600 − 83.4 − 1150
      ["zero", 530, "1.82", "0"], // 1855 − 600 − (30 × 3.22 + 8.4) − 1150
      ["negative", 520, "1.10", "-13.4"],
    ];
    for (const [label, kg, forage, expected] of cases) {
      const e = computeAnimalPlanEconomics(input({ projection: { state: "PROJECTED", kg }, assumptions: assumptions({ forageCostPerDay: forage }) }));
      const sale = Number(amount(e.projectedSaleValue));
      const holding = Number(amount(e.forecastDirectHoldingCost));
      expect(Number(amount(e.projectedDirectProfit)), label).toBeCloseTo(sale - 600 - holding, 10);
      expect(Number(amount(e.returnFromHolding)), label).toBeCloseTo(Number(amount(e.projectedDirectProfit)) - Number(amount(e.currentSellNowMargin)), 10);
      expect(amount(e.returnFromHolding), label).toBe(expected);
    }
  });

  it("market scenario changes only the sale price (low / base / high from the observed range)", () => {
    const at = (scenario: AnimalPlanAssumptions["scenario"]) => computeAnimalPlanEconomics(input({ assumptions: assumptions({ scenario }) }));
    expect(amount(at("LOW").projectedSaleValue)).toBe("1590");
    expect(amount(at("BASE").projectedSaleValue)).toBe("1855");
    expect(amount(at("HIGH").projectedSaleValue)).toBe("2120");
    for (const s of ["LOW", "BASE", "HIGH"] as const) expect(amount(at(s).currentEstimatedValue)).toBe("1750");
  });

  it("feed and housing inputs change cost, never projected weight (no response model)", () => {
    const lean = computeAnimalPlanEconomics(input({ assumptions: assumptions({ concentrateKgPerDay: "0" }) }));
    const heavy = computeAnimalPlanEconomics(input({ assumptions: assumptions({ concentrateKgPerDay: "8" }) }));
    expect(lean.projectedWeightKg).toEqual(heavy.projectedWeightKg);
    expect(amount(lean.forecastFeedCost)).toBe("33");
    expect(amount(heavy.forecastFeedCost)).toBe("117");
  });

  it("missing inputs stay unknown — never zero", () => {
    const noCosts = computeAnimalPlanEconomics(input({ costs: summariseAnimalCosts([], A, "2026-10-16") }));
    expect(noCosts.recordedDirectCosts).toEqual({ state: "UNKNOWN", reasons: ["NO_COSTS_RECORDED"] });
    expect(noCosts.projectedDirectProfit.state).toBe("UNKNOWN");
    expect(noCosts.returnFromHolding.state).toBe("UNKNOWN");
    expect(amount(noCosts.projectedSaleValue)).toBe("1855");
    const noFeed = computeAnimalPlanEconomics(input({ assumptions: assumptions({ concentratePricePerTonne: null }) }));
    expect(noFeed.forecastFeedCost).toEqual({ state: "UNKNOWN", reasons: ["CONCENTRATE_PRICE_NOT_ENTERED"] });
    const noProjection = computeAnimalPlanEconomics(input({ projection: { state: "NOT_PROJECTED", reason: "INSUFFICIENT_EVIDENCE" } }));
    expect(noProjection.projectedSaleValue).toEqual({ state: "UNKNOWN", reasons: ["PROJECTION_INSUFFICIENT_EVIDENCE"] });
    const noValuation = computeAnimalPlanEconomics(input({ valuation: valueAnimalAtMart({ state: "UNAVAILABLE", provider: FIXTURE_PROVIDER, reason: "OFFLINE" }, request(), 14) }));
    expect(noValuation.currentEstimatedValue.state).toBe("UNKNOWN");
    expect(noValuation.valuationStanding).toBe("NONE");
  });

  it("invalid dates and numbers are reported and computed nothing", () => {
    const before = computeAnimalPlanEconomics(input({ assumptions: assumptions({ saleDate: "2026-10-01" }) }));
    expect(before.validity).toEqual({ state: "INVALID", issues: ["SALE_DATE_NOT_AFTER_TODAY"] });
    expect(before.projectedDirectProfit.state).toBe("UNKNOWN");
    const housingAfterSale = computeAnimalPlanEconomics(input({ assumptions: assumptions({ housingDate: "2026-12-01" }) }));
    expect(housingAfterSale.validity).toEqual({ state: "INVALID", issues: ["HOUSING_DATE_AFTER_SALE_DATE"] });
    expect(computeAnimalPlanEconomics(input({ assumptions: assumptions({ housingDate: "2026-10-01" }) })).validity).toEqual({ state: "INVALID", issues: ["HOUSING_DATE_BEFORE_TODAY"] });
    expect(computeAnimalPlanEconomics(input({ assumptions: assumptions({ forageCostPerDay: "-1" }) })).validity).toEqual({ state: "INVALID", issues: ["FORAGE_COST_INVALID"] });
    expect(computeAnimalPlanEconomics(input({ assumptions: assumptions({ saleDate: "2026-02-30" }) })).validity).toEqual({ state: "INVALID", issues: ["SALE_DATE_INVALID"] });
  });

  it("a housed animal is housed for every remaining day; no housing date while outdoors ⇒ no housing cost", () => {
    expect(computeAnimalPlanEconomics(input({ currentlyHoused: true })).housedDays).toBe(30);
    const outdoors = computeAnimalPlanEconomics(input({ assumptions: assumptions({ housingDate: null, housingCostPerDay: null }) }));
    expect(outdoors.housedDays).toBe(0);
    expect(amount(outdoors.forecastHousingCost)).toBe("0");
    expect(computeAnimalPlanEconomics(input({ currentlyHoused: null, assumptions: assumptions({ housingDate: null }) })).forecastHousingCost.state).toBe("UNKNOWN");
  });

  it("a per-head price cannot be projected to a different sale weight", () => {
    const perHead = valueAnimalAtMart(available({ basis: "EUR_PER_HEAD", observedLow: "1600", central: "1700", observedHigh: "1800" }), request(), 14);
    const e = computeAnimalPlanEconomics(input({ valuation: perHead }));
    expect(e.projectedSaleValue).toEqual({ state: "UNKNOWN", reasons: ["PER_HEAD_PRICE_NOT_PROJECTABLE_TO_SALE_WEIGHT"] });
    expect(amount(e.currentEstimatedValue)).toBe("1700");
  });
});
