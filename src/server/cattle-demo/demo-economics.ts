/**
 * Cattle C10 — demonstration economics (server-only, local demonstration mode
 * only): fixture direct-cost entries, a DEVELOPMENT FIXTURE mart provider and
 * default plan assumptions. Every figure here is reference UI data — not a
 * real cost, price or mart report — and is labelled as such wherever shown.
 * None of it is ever an input to C8 or the Plan kernel.
 */

import "server-only";

import type { AnimalCostEntry, AnimalPlanAssumptions, MartComparableResult, MartProviderDescription, MartRef, MartValuationProvider, MartValuationRequest } from "@/domain/animal-plan";
import { animalIdOf } from "./demo-herd";

/** Freshness setting for the fixture provider (a product setting, not science). */
export const DEMO_MART_STALE_AFTER_DAYS = 14;

const fixtureCost = (tag: string, n: number, o: Omit<AnimalCostEntry, "entryId" | "animalId" | "currency" | "source">): AnimalCostEntry => ({
  entryId: `SYNTH-COST-${tag}-${n}`,
  animalId: animalIdOf(tag),
  currency: "EUR",
  source: { kind: "DEMONSTRATION_FIXTURE", ref: null },
  ...o,
});

/**
 * 1427: a full ledger (direct + allocated). 1431: feed only (partial — the
 * profile says so). 1433: one veterinary entry. Every other animal: none
 * recorded (shown as "No costs recorded", never €0).
 */
export const DEMO_COST_ENTRIES: readonly AnimalCostEntry[] = [
  fixtureCost("1427", 1, { category: "FEED", amount: "412.80", effectiveDate: "2026-06-30", attribution: "ALLOCATED", allocationBasis: "1/38 of the synthetic summer concentrate delivery", note: null }),
  fixtureCost("1427", 2, { category: "FEED", amount: "236.40", effectiveDate: "2026-09-30", attribution: "ALLOCATED", allocationBasis: "1/38 of the synthetic autumn concentrate delivery", note: null }),
  fixtureCost("1427", 3, { category: "MEDICINE", amount: "18.60", effectiveDate: "2026-06-02", attribution: "DIRECT", allocationBasis: null, note: "Synthetic wormer dose" }),
  fixtureCost("1427", 4, { category: "VETERINARY", amount: "35.00", effectiveDate: "2026-03-08", attribution: "DIRECT", allocationBasis: null, note: "Synthetic booster visit share" }),
  fixtureCost("1427", 5, { category: "BEDDING", amount: "64.00", effectiveDate: "2026-02-28", attribution: "ALLOCATED", allocationBasis: "Synthetic straw, spring housing, per head", note: null }),
  fixtureCost("1427", 6, { category: "OTHER", amount: "22.50", effectiveDate: "2026-05-01", attribution: "DIRECT", allocationBasis: null, note: "Synthetic tagging and testing" }),
  fixtureCost("1431", 1, { category: "FEED", amount: "538.20", effectiveDate: "2026-09-30", attribution: "ALLOCATED", allocationBasis: "1/38 of the synthetic concentrate deliveries", note: null }),
  fixtureCost("1433", 1, { category: "VETERINARY", amount: "41.00", effectiveDate: "2026-07-14", attribution: "DIRECT", allocationBasis: null, note: "Synthetic lameness visit" }),
];

const FIXTURE_PROVIDER: MartProviderDescription = { providerId: "SYNTH-MART-FIXTURE", name: "Development fixture (not a live mart feed)", kind: "DEVELOPMENT_FIXTURE", isLive: false };
const MARTS: MartRef[] = [
  { martId: "SYNTH-MART-BLESSINGTON", martName: "Blessington" },
  { martId: "SYNTH-MART-CARNEW", martName: "Carnew" },
  { martId: "SYNTH-MART-STALE", martName: "Example mart (old report)" },
];

/**
 * Fixture comparables: synthetic €/kg ranges per broad category. The
 * provider matches on sex and a weight band; there is no live data behind it.
 */
const FIXTURE_TABLE: { martId: string; reportDate: string; sex: "MALE" | "FEMALE"; band: [number, number]; label: string; low: string; central: string; high: string; sample: number }[] = [
  { martId: "SYNTH-MART-BLESSINGTON", reportDate: "2026-10-16", sex: "MALE", band: [450, 600], label: "Continental-cross bullocks 450–600 kg", low: "3.59", central: "3.82", high: "4.05", sample: 64 },
  { martId: "SYNTH-MART-BLESSINGTON", reportDate: "2026-10-16", sex: "MALE", band: [600, 750], label: "Continental-cross bullocks 600–750 kg", low: "3.48", central: "3.70", high: "3.92", sample: 41 },
  { martId: "SYNTH-MART-BLESSINGTON", reportDate: "2026-10-16", sex: "FEMALE", band: [400, 600], label: "Continental-cross heifers 400–600 kg", low: "3.62", central: "3.86", high: "4.10", sample: 38 },
  { martId: "SYNTH-MART-BLESSINGTON", reportDate: "2026-10-16", sex: "MALE", band: [200, 450], label: "Weanling and store bullocks 200–450 kg", low: "3.70", central: "4.05", high: "4.40", sample: 52 },
  { martId: "SYNTH-MART-CARNEW", reportDate: "2026-10-14", sex: "MALE", band: [450, 750], label: "Bullocks 450–750 kg", low: "3.45", central: "3.71", high: "3.95", sample: 29 },
  { martId: "SYNTH-MART-CARNEW", reportDate: "2026-10-14", sex: "FEMALE", band: [400, 650], label: "Heifers 400–650 kg", low: "3.50", central: "3.78", high: "4.02", sample: 22 },
  { martId: "SYNTH-MART-STALE", reportDate: "2026-08-28", sex: "MALE", band: [450, 750], label: "Bullocks 450–750 kg", low: "3.30", central: "3.55", high: "3.80", sample: 17 },
];

export const DEMO_MART_PROVIDER: MartValuationProvider = {
  describe: () => FIXTURE_PROVIDER,
  listMarts: () => MARTS.map((m) => ({ ...m })),
  findComparable(request: MartValuationRequest): MartComparableResult {
    const mart = MARTS.find((m) => m.martId === request.martId) ?? null;
    if (mart === null) return { state: "NO_COMPARABLE", provider: FIXTURE_PROVIDER, mart: null, reason: "MART_NOT_KNOWN_TO_PROVIDER" };
    if (request.sex === null) return { state: "NO_COMPARABLE", provider: FIXTURE_PROVIDER, mart, reason: "ANIMAL_SEX_UNKNOWN" };
    const kg = request.liveweightKg;
    const rows = FIXTURE_TABLE.filter((r) => r.martId === mart.martId && r.sex === request.sex);
    // Without a known weight the band can't be chosen; the provider still names the category if only one exists.
    const row = kg === null ? (rows.length === 1 ? rows[0] : null) : (rows.find((r) => kg >= r.band[0] && kg < r.band[1]) ?? null);
    if (row === null) return { state: "NO_COMPARABLE", provider: FIXTURE_PROVIDER, mart, reason: kg === null ? "WEIGHT_NEEDED_TO_CHOOSE_CATEGORY" : "NO_COMPARABLE_WEIGHT_BAND" };
    return {
      state: "AVAILABLE",
      comparable: {
        provider: FIXTURE_PROVIDER,
        mart,
        reportDate: row.reportDate,
        category: { label: row.label, sex: row.sex, weightBandKg: row.band, breedType: null },
        basis: "EUR_PER_KG_LIVEWEIGHT",
        observedLow: row.low,
        central: row.central,
        observedHigh: row.high,
        centralDerivation: "OBSERVED_AVERAGE",
        sampleSize: row.sample,
        quality: "Development fixture — synthetic figures for interface review only",
      },
    };
  },
};

export const DEMO_DEFAULT_MART = "SYNTH-MART-BLESSINGTON";

/** Default plan-draft assumptions (demonstration values; the farmer edits them). */
export function demoDefaultAssumptions(saleDate: string, housed: boolean): AnimalPlanAssumptions {
  return {
    saleDate,
    concentrateKgPerDay: "4",
    concentratePricePerTonne: "340",
    forageCostPerDay: "1.20",
    housingDate: housed ? null : "2026-11-08",
    housingCostPerDay: "0.55",
    scenario: "BASE",
  };
}
