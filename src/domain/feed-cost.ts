/**
 * Grass & silage feed-cost benchmarks — Phase 4 ("free livestock feed-cost
 * layer", docs/feed-engine.md's `silage`/`grass` cost drivers). Every
 * numeric constant here is taken directly from the "Farm Return Core Data
 * v4" workbook the user supplied (sheet "Feed_Cost_2026"), sourced to
 * Teagasc's "Producing beef from grass-forage-based systems" (1 Jul 2026,
 * the Spring 2026 Grange Feed Costings Model) — evidence class A-OFFICIAL.
 * See docs/evidence-register.md.
 *
 * The source table publishes every feedstuff's €/t DM on TWO bases side by
 * side — "economic" (including a land charge, i.e. the opportunity cost
 * of the land) and "cash" (excluding it) — and its own README explicitly
 * instructs: "Use economic vs cash-cost toggle in Finance." This module
 * never blends the two into one number; every consumer must pick a basis.
 *
 * Scope: this data model doesn't track a real grazed-DM tonnage or a
 * whole-farm silage tonnage anywhere yet, so both are *derived* here from
 * real inputs already in the data model (grazing hectares, each silage
 * plan's own expected DM yield) rather than read off a separate mock
 * total — "automatic first" (CLAUDE.md), using the benchmark table's own
 * DM-yield figures as the conversion factor for grass, since no
 * field-level grazing yield exists to use instead.
 */

export const FEED_COST_ENGINE_VERSION = "feed_cost_engine_v1.0.0";

export type FeedCostBasis = "economic" | "cash";

export interface FeedCostBenchmark {
  label: string;
  /** DM yield t/ha, where the source table publishes one for this row. */
  dmYieldTHa?: number;
  /** €/t DM utilised (post feed-out losses, not just grown) — the more
   * relevant figure for costing feed actually consumed. */
  eurPerTonneDmUtilised: { economic: number; cash: number };
  note?: string;
}

/**
 * "Grazed grass" row. DM yield (13 t/ha) doubles as the conversion factor
 * `calculateGrazedGrassCostEur` below uses to turn grazing hectares into
 * an estimated DM tonnage — the same role Green Book DM-yield figures
 * play elsewhere in this app (src/domain/nutrients.ts's silage tables).
 */
export const GRAZED_GRASS_BENCHMARK: FeedCostBenchmark = {
  label: "Grazed grass",
  dmYieldTHa: 13,
  eurPerTonneDmUtilised: { economic: 140, cash: 69 },
};

/**
 * "1st + 2nd cut bale silage" row — the closest published bale-silage
 * system to this farm's actual one, but NOT an exact match: the source
 * table's figures are for a 2-cut system, while this farm's only silage
 * field takes a single cut (mock-farm.ts's "silage-back-1" plan,
 * cutNumber 1). Used here as a €/tonne-DM proxy — bale wrapping and
 * contractor charges are the dominant cost driver per tonne, not cut
 * count — but this approximation is surfaced in the UI, not hidden.
 */
export const BALE_SILAGE_BENCHMARK: FeedCostBenchmark = {
  label: "1st + 2nd cut bale silage",
  dmYieldTHa: 10.7,
  eurPerTonneDmUtilised: { economic: 341, cash: 286 },
  note: "Closest published bale-silage benchmark to this farm's single-cut system — a per-tonne-DM proxy, not an exact match (the source table's own figure is for a 2-cut system).",
};

/**
 * Whole-farm grazed grass cost — grazing hectares x the benchmark's own
 * DM yield x its €/t DM utilised for the chosen cost basis.
 */
export function calculateGrazedGrassCostEur(grazingAreaHa: number, basis: FeedCostBasis): number {
  const dmTonnes = grazingAreaHa * (GRAZED_GRASS_BENCHMARK.dmYieldTHa ?? 0);
  return dmTonnes * GRAZED_GRASS_BENCHMARK.eurPerTonneDmUtilised[basis];
}

/** Silage cost from an already-known DM tonnage (e.g. summed from real
 * per-field silage plans) x the bale-silage benchmark's €/t DM. */
export function calculateSilageCostEur(silageDmTonnes: number, basis: FeedCostBasis): number {
  return silageDmTonnes * BALE_SILAGE_BENCHMARK.eurPerTonneDmUtilised[basis];
}

// ---------------------------------------------------------------------------
// Mineral cost — "Farm Return Gap Closure Data v5" workbook, sheet
// "Minerals_Bedding". Teagasc Future Beef demonstration-farm examples,
// evidence class A-OFFICIAL — the sheet's own "App treatment" column is
// explicit: "Use as sourced example/benchmark, not universal current
// retail price."
// ---------------------------------------------------------------------------

export interface MineralCostBenchmark {
  costId: string;
  label: string;
  animalSystem: string;
  eurPerHeadPerDay: number;
  evidenceClass: string;
  sourceDate: string;
  context: string;
}

/**
 * Sheet row MB-002, "Mineral in straw-based diet" — Dry suckler cow,
 * €0.15/head/day. The closest real match to this farm's actual suckler
 * cow group: a dry, spring-calving system on moderate-quality silage
 * (`SUCKLER_COW_WINTER_RULES.dry_spring_calving_cow` in livestock.ts) —
 * the same economical winter-maintenance context this benchmark describes,
 * even though this farm's shed is slatted rather than straw-bedded (a
 * different attribute from the *diet* straw-feeding this figure costs).
 * Sheet row MB-001 ("Pre-calving mineral", €0.12/head/day) was
 * deliberately not used instead — it's a narrower pre-calving-only phase,
 * not the full dry-cow wintering period this farm's housing data covers.
 */
export const SUCKLER_DRY_COW_MINERAL_BENCHMARK: MineralCostBenchmark = {
  costId: "MB-002",
  label: "Mineral in straw-based diet",
  animalSystem: "Dry suckler cow",
  eurPerHeadPerDay: 0.15,
  evidenceClass: "A-OFFICIAL",
  sourceDate: "2024",
  context: "Teagasc example diet: minerals cost 15c/cow/day.",
};

/** Mineral cost for a group of dry suckler cows over a given number of
 * housing/winter days — headCount x days x the benchmark's €/head/day. */
export function calculateSucklerCowMineralCostEur(headCount: number, housingDays: number): number {
  return headCount * Math.max(0, housingDays) * SUCKLER_DRY_COW_MINERAL_BENCHMARK.eurPerHeadPerDay;
}
