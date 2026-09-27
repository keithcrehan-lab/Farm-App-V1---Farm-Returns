/**
 * Fertiliser Overview and Stock Visuals campaign — pure slurry TANK
 * STORAGE view-model arithmetic for the farm-wide overview's tank
 * illustrations. Reuses, never recomputes: `Housing.storageCapacityM3`/
 * `storageFillPct` (farmer-captured directly as a real "% of storage
 * volume" figure — see `housing/page.tsx`'s own "Current fill (%)" form
 * field — so this module never commits the "percentage of depth equals
 * percentage of volume" mistake the brief explicitly warns against: this
 * app has never asked a farmer for a depth reading) and
 * `SlurryAllocation.volumeM3` (`src/lib/farm-data/slurry.ts`, Phase 6/11)
 * for allocated/unallocated. Deliberately never
 * `Housing.slurryEstimate.volumeM3` — that figure is a still-placeholder
 * PROJECTED-PRODUCTION estimate (no real S.I. 588/2025 excretion-rate
 * coefficient exists yet, `housing.ts`'s own `placeholderSlurryEstimate`
 * doc comment) — mixing it with a real captured fill level would conflate
 * "slurry physically in the tank now" with "slurry this housing period is
 * projected to produce", exactly what the brief's DATA INTEGRITY section
 * forbids ("Do not confuse physical slurry now with projected future
 * production").
 */
import type { Housing, SlurryAllocation } from "./types";
import { storeObservedVolumeM3 } from "./slurry-allocation-lifecycle";

export const SLURRY_STORAGE_VIEW_VERSION = "slurry_storage_view_v1.0.0";

export interface SlurryTankView {
  housingId: string;
  shedName: string;
  capacityM3: number;
  /** `capacityM3 * (fillPct / 100)` — real, physical volume currently in
   * the tank, never a projection. */
  volumeM3: number;
  /** `Housing.storageFillPct`, unmodified — already a real %-of-volume
   * figure, not derived from a depth reading (see this module's own
   * header). */
  fillPct: number;
  status: "estimated" | "farmer_recorded";
  recordedAt?: string;
  /** Real sum of every `SlurryAllocation.volumeM3` this housing feeds
   * (`src/lib/farm-data/slurry.ts`) — never re-derived, the same figures
   * `SuggestedAllocationCard`/the Housing screen already display. */
  allocatedM3: number;
  /** `max(0, volumeM3 - allocatedM3)` — never negative. */
  unallocatedM3: number;
  /** True when the real allocated total exceeds this tank's own
   * currently-recorded volume — most commonly a real allocation set
   * against a fill level that has since dropped (e.g. after spreading
   * without a fresh fill-level update). Disclosed, never silently
   * clamped away — `unallocatedM3` above is the safe `0` floor, but this
   * flag is what lets the UI say WHY. */
  allocationExceedsVolume: boolean;
}

export function buildSlurryTankView(housing: Housing, allocations: readonly SlurryAllocation[]): SlurryTankView {
  // Phase 1A: the fill observation less completed withdrawals since it
  // (`slurry-allocation-lifecycle.ts`) — slurry already spread never reads
  // as available again. Equal to the observed volume when none recorded.
  const volumeM3 = storeObservedVolumeM3(housing) - (housing.storeWithdrawnSinceObservationM3 ?? 0);
  const allocatedM3 = allocations.filter((a) => a.housingId === housing.id).reduce((sum, a) => sum + a.volumeM3, 0);
  return {
    housingId: housing.id,
    shedName: housing.shedName,
    capacityM3: housing.storageCapacityM3,
    volumeM3,
    fillPct: housing.storageFillPct,
    status: housing.storageFillStatus,
    recordedAt: housing.storageFillRecordedAt,
    allocatedM3,
    unallocatedM3: Math.max(0, volumeM3 - allocatedM3),
    allocationExceedsVolume: allocatedM3 > volumeM3,
  };
}

export interface FarmSlurryStorageOverview {
  tanks: SlurryTankView[];
  totalCapacityM3: number;
  totalVolumeM3: number;
  /** `totalVolumeM3 / totalCapacityM3 * 100` — real total volume over
   * real total capacity, NEVER an average of each tank's own `fillPct`
   * (brief: "Overall fill is total volume divided by total capacity, not
   * an average of percentages" — averaging percentages across unequal
   * tank sizes would silently over-weight a small tank against a large
   * one). `0` when there is genuinely no real capacity recorded at all
   * (never divides by zero). */
  farmFillPct: number;
  totalAllocatedM3: number;
  totalUnallocatedM3: number;
}

// ---------------------------------------------------------------------------
// Codex audit HIGH (round 1): the tank illustration component
// (`src/components/farm/SlurryTankVisual.tsx`) was clamping fill
// percentage, deriving a fill height and computing the allocated-vs-
// unallocated split itself — real arithmetic living outside `src/domain/`
// (AGENTS.md's own never-rule). This is the pure fix: the domain layer
// exposes the bounded 0-1 DISPLAY PROPORTIONS a tank illustration needs;
// the component's own job is only to multiply these by its own SVG pixel
// constants, never to derive or clamp a real figure itself.
// ---------------------------------------------------------------------------

export interface SlurryTankDisplayProportions {
  /** 0-1, clamped — real fill height as a fraction of the tank's own
   * drawable height. Clamped defensively (a real `fillPct` should never
   * be outside 0-100 by construction, but this is the one place a
   * malformed value could otherwise draw a graphic taller than the tank
   * itself or with a negative height). */
  fillFraction: number;
  /** 0-1, clamped — real allocated volume as a fraction of the real fill
   * height (not of the whole tank) — the bottom portion of the drawn
   * liquid. `0` when there is genuinely no real volume to allocate a
   * fraction of (never divides by zero). */
  allocatedFractionOfFill: number;
}

export function computeSlurryTankDisplayProportions(tank: Pick<SlurryTankView, "fillPct" | "volumeM3" | "allocatedM3">): SlurryTankDisplayProportions {
  const fillFraction = Math.min(1, Math.max(0, tank.fillPct / 100));
  const allocatedFractionOfFill = tank.volumeM3 > 0 ? Math.min(1, Math.max(0, tank.allocatedM3 / tank.volumeM3)) : 0;
  return { fillFraction, allocatedFractionOfFill };
}

export function buildFarmSlurryStorageOverview(housingList: readonly Housing[], allocations: readonly SlurryAllocation[]): FarmSlurryStorageOverview {
  const tanks = housingList.map((h) => buildSlurryTankView(h, allocations));
  const totalCapacityM3 = tanks.reduce((sum, t) => sum + t.capacityM3, 0);
  const totalVolumeM3 = tanks.reduce((sum, t) => sum + t.volumeM3, 0);
  const totalAllocatedM3 = tanks.reduce((sum, t) => sum + t.allocatedM3, 0);
  return {
    tanks,
    totalCapacityM3,
    totalVolumeM3,
    farmFillPct: totalCapacityM3 > 0 ? (totalVolumeM3 / totalCapacityM3) * 100 : 0,
    totalAllocatedM3,
    totalUnallocatedM3: Math.max(0, totalVolumeM3 - totalAllocatedM3),
  };
}
