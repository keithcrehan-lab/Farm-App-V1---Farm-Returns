/**
 * Whole-farm summary counts — simple, not scientific/financial (no
 * versioned formula or evidence citation needed), but still a thin pure
 * wrapper rather than inline arithmetic in a component, same rationale
 * `calculateLivestockPortfolioValueEur` (finance.ts) already gives for its
 * "even though the sum itself is simple" case: Soil coverage and the
 * Dashboard share one definition rather than two components each counting
 * `fields` their own way.
 */

import type { Field, Housing, LivestockGroup } from "./types";
import { storeReconciledVolumeM3 } from "./slurry-allocation-lifecycle";

export interface FarmCoverageStats {
  /** Fields with a real drawn boundary (`Field.polygon` set via the Mapbox
   * field-boundary feature) — "mapped" means traced on real imagery, not
   * just "exists in the farm model". A field can be added (Phase 2) before
   * it's ever mapped. */
  totalFieldsMapped: number;
  /** Fields with a real lab-verified soil test (`SoilFertility.verifiedTest`,
   * set by `addSoilTest`) — distinct from a farmer-typed/estimated P/K
   * index, which every field starts with. */
  totalVerifiedTests: number;
}

export function calculateFarmCoverageStats(fields: Field[]): FarmCoverageStats {
  return {
    totalFieldsMapped: fields.filter((f) => f.polygon !== undefined).length,
    totalVerifiedTests: fields.filter((f) => f.fertility.verifiedTest !== undefined).length,
  };
}

/**
 * V3 closure pass, Priority 8 — replaces the Dashboard's previous
 * hardcoded `"2,850 m³"` literal with a real sum of each shed's own
 * captured `storageCapacityM3 * storageFillPct` — real farm data already
 * captured on `Housing` (Phase 2), not a derived/estimated agronomic
 * figure needing its own source citation (same "simple, not scientific"
 * rationale as `calculateFarmCoverageStats` above). Deliberately NOT
 * `Housing.slurryEstimate.volumeM3` — `finance.ts`'s own comment already
 * flags that figure as "still-mock... needs a real excretion-rate
 * coefficient this session doesn't have in hand"; capacity × fill% uses
 * only directly-captured tank measurements, no unresolved coefficient.
 */
export function calculateFarmSlurryAvailableM3(housing: Housing[]): number {
  // Phase 1A: reconciled volume — completed withdrawals stay deducted.
  return housing.reduce((sum, h) => sum + storeReconciledVolumeM3(h), 0);
}

/**
 * Real Mode Completion Phase 6 — "The Dashboard should become an
 * adaptive summary of the actual farm. For a new farm, show setup
 * progress and next actions... do not invent KPIs simply to fill visual
 * space." Every count here is a direct real total (no scoring/weighting),
 * and `nextAction` is a fixed, documented priority order over genuinely
 * missing setup — not a computed "completeness %" (no defined methodology
 * for one exists anywhere in this app, same reasoning that already keeps
 * "Plan Confidence"/"Carbon Score" as an honest "Not yet available" state
 * rather than a fabricated percentage).
 */
export interface FarmSetupProgress {
  totalFields: number;
  fieldsMapped: number;
  soilTestsVerified: number;
  livestockGroupCount: number;
  livestockHeadCount: number;
  housingCount: number;
  /** `null` once every step below has at least one real record — the
   * Dashboard's setup-progress panel is meant to disappear at that point,
   * not linger as an empty checklist (brief: "progressively become
   * richer"). */
  nextAction: { label: string; href: string } | null;
}

export function calculateFarmSetupProgress(
  fields: Field[],
  livestockGroups: LivestockGroup[],
  housing: Housing[],
): FarmSetupProgress {
  const { totalFieldsMapped, totalVerifiedTests } = calculateFarmCoverageStats(fields);
  const livestockHeadCount = livestockGroups.reduce((sum, g) => sum + g.count.value, 0);

  let nextAction: FarmSetupProgress["nextAction"] = null;
  if (fields.length === 0) {
    nextAction = { label: "Map your first field", href: "/fields" };
  } else if (totalFieldsMapped === 0) {
    nextAction = { label: "Draw a real boundary for your fields", href: "/fields" };
  } else if (totalVerifiedTests === 0) {
    nextAction = { label: "Add a real soil test", href: "/soil" };
  } else if (livestockGroups.length === 0) {
    nextAction = { label: "Add your livestock", href: "/livestock" };
  } else if (housing.length === 0) {
    nextAction = { label: "Add your winter housing", href: "/housing" };
  }

  return {
    totalFields: fields.length,
    fieldsMapped: totalFieldsMapped,
    soilTestsVerified: totalVerifiedTests,
    livestockGroupCount: livestockGroups.length,
    livestockHeadCount,
    housingCount: housing.length,
    nextAction,
  };
}

/**
 * Farm Spatial V2 (Phase 2 shell) — whole-farm area for the Farm
 * identity line (`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §4, "NEW
 * PURE HELPER REQUIRED"). A plain sum of each active field's own
 * `areaHa` (derived from its real boundary, `Field.areaHa`'s own
 * comment) — archived fields never count. `null` when the farm has no
 * active field at all, so the UI omits the figure rather than showing a
 * fabricated "0 ha" farm.
 */
export function calculateActiveFarmAreaHa(fields: readonly Field[]): number | null {
  const active = fields.filter((f) => !f.archivedAt);
  if (active.length === 0) return null;
  return active.reduce((sum, f) => sum + f.areaHa, 0);
}

/**
 * Farm Spatial V2 (Phase 2 shell) — the persistent object rail's real
 * counts (`IMPLEMENTATION_MAP.md` §8). A pure mapping of the canonical
 * `calculateFarmSetupProgress` counts — never a second livestock sum.
 * Every `LivestockCategory` is a cattle category, so cattle head/group
 * counts are its persisted-group totals; sheds are its `housingCount`.
 * Sheep have no category in the farm model, so no sheep count exists
 * here — the rail shows an honest "not yet supported" shell instead.
 */
export interface FarmObjectRailCounts {
  cattleHeadCount: number;
  cattleGroupCount: number;
  shedCount: number;
}

export function calculateFarmObjectRailCounts(
  progress: Pick<FarmSetupProgress, "livestockHeadCount" | "livestockGroupCount" | "housingCount">,
): FarmObjectRailCounts {
  return {
    cattleHeadCount: progress.livestockHeadCount,
    cattleGroupCount: progress.livestockGroupCount,
    shedCount: progress.housingCount,
  };
}
