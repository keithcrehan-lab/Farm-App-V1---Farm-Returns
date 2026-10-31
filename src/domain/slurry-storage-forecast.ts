/**
 * Slurry storage forecast — operational planning only.
 *
 * Livestock slurry production rates are S.I. 588/2025 Schedule 2, Table 2
 * (m³/head/week). This forecast is deliberately separate from statutory N/P
 * excretion (`statutory-excretion.ts`) and from the tank's current physical
 * observation (`slurry-storage.ts`). It answers: given the last observed
 * store volume, the cattle assigned/planned for this housing, and existing
 * reservations, how much slurry is expected to be available on a future
 * date?
 *
 * Source: Irish Statute Book, S.I. No. 588/2025, Schedule 2, Table 2.
 * Dairy cow changes from 0.33 to 0.40 m³/week on 2028-10-01 (table footnote 2).
 * This first implementation does NOT invent rainfall, yard-water or parlour-
 * water inflows because Housing does not yet capture the evidence needed to
 * route those flows to a particular store. Recorded capacity is treated as
 * the store's operational capacity; legal freeboard is not re-derived here.
 */
import type { Housing, LivestockGroup, SlurryAllocation } from "./types";
import { storeReconciledVolumeM3 } from "./slurry-allocation-lifecycle";

export const SLURRY_STORAGE_FORECAST_VERSION = "slurry_storage_forecast_v1.0.0";
export const SLURRY_STORAGE_RATE_SOURCE = "S.I. 588/2025 Schedule 2 Table 2";

const MS_PER_DAY = 86_400_000;
const DAIRY_RATE_CHANGE_DATE = "2028-10-01";

export interface SlurryStorageRate {
  m3PerHeadWeek: number;
  source: typeof SLURRY_STORAGE_RATE_SOURCE;
  classLabel: string;
}

export type SlurryStorageRateResolution =
  | { status: "READY"; value: SlurryStorageRate }
  | { status: "BLOCKED"; reasonCode: "MISSING_LIVESTOCK_AGE" | "INVALID_LIVESTOCK_AGE" };

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function parseDate(value: string): Date | undefined {
  const d = new Date(`${dateOnly(value)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function signedDaysBetween(start: string, end: string): number {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return 0;
  return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

function daysBetween(start: string, end: string): number {
  return Math.max(0, signedDaysBetween(start, end));
}

function addDays(date: string, days: number): string {
  const d = parseDate(date)!;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Current cattle class -> S.I. 588/2025 Table 2 storage rate. */
export function resolveSlurryStorageRate(
  group: Pick<LivestockGroup, "category" | "avgAgeMonths">,
  onDate: string,
  ageReferenceDate = onDate,
): SlurryStorageRateResolution {
  if (group.category === "dairy_cow") {
    return {
      status: "READY",
      value: {
        m3PerHeadWeek: dateOnly(onDate) >= DAIRY_RATE_CHANGE_DATE ? 0.4 : 0.33,
        source: SLURRY_STORAGE_RATE_SOURCE,
        classLabel: "Dairy cow",
      },
    };
  }
  if (group.category === "suckler_cow") {
    return { status: "READY", value: { m3PerHeadWeek: 0.29, source: SLURRY_STORAGE_RATE_SOURCE, classLabel: "Suckler cow" } };
  }
  if (group.avgAgeMonths === undefined) return { status: "BLOCKED", reasonCode: "MISSING_LIVESTOCK_AGE" };
  if (!Number.isFinite(group.avgAgeMonths) || group.avgAgeMonths < 0) return { status: "BLOCKED", reasonCode: "INVALID_LIVESTOCK_AGE" };

  // `avgAgeMonths` is the group's current age evidence. Age it forward for
  // planning so a group crossing 6/18 months moves onto the published rate
  // that applies on the forecast day rather than being frozen forever in the
  // class it occupied when the farmer last edited the group.
  const elapsedMonths = signedDaysBetween(ageReferenceDate, onDate) / 30.4375;
  const ageMonths = group.avgAgeMonths + elapsedMonths;
  if (ageMonths < 6) return { status: "READY", value: { m3PerHeadWeek: 0.08, source: SLURRY_STORAGE_RATE_SOURCE, classLabel: "Cattle 0-6 months" } };
  if (ageMonths < 18) return { status: "READY", value: { m3PerHeadWeek: 0.15, source: SLURRY_STORAGE_RATE_SOURCE, classLabel: "Cattle 6-18 months" } };
  return { status: "READY", value: { m3PerHeadWeek: 0.26, source: SLURRY_STORAGE_RATE_SOURCE, classLabel: ageMonths < 24 ? "Cattle 18-24 months" : "Cattle >2 years" } };
}

export interface SlurryForecastGroupContribution {
  groupId: string;
  label: string;
  headCount: number;
  fromDate: string;
  throughDate: string;
  producedM3: number;
  source: typeof SLURRY_STORAGE_RATE_SOURCE;
}

export type SlurryStoreForecast =
  | {
      status: "BLOCKED";
      housingId: string;
      shedName: string;
      targetDate: string;
      reasonCodes: string[];
      version: string;
    }
  | {
      status: "READY";
      housingId: string;
      shedName: string;
      targetDate: string;
      baseDate: string;
      capacityM3: number;
      currentReconciledM3: number;
      producedM3: number;
      projectedRawM3: number;
      projectedVolumeM3: number;
      projectedFillPct: number;
      reservedM3: number;
      projectedAvailableForNewPlanM3: number;
      overflowM3: number;
      dailyProductionM3AtTarget: number;
      projectedCapacityDate?: string;
      contributions: SlurryForecastGroupContribution[];
      assumptions: string[];
      version: string;
    };

function contributionWindow(
  housing: Housing,
  group: LivestockGroup,
  baseDate: string,
  targetDate: string,
): { start: string; end: string } | undefined {
  const target = dateOnly(targetDate);
  const base = dateOnly(baseDate);
  if (target <= base) return undefined;

  // Current location wins over a stale planned housing period.
  if (group.system === "housed" && group.housingId === housing.id) {
    const start = housing.housingPeriod.start > base && housing.housingPeriod.start < target ? housing.housingPeriod.start : base;
    const end = housing.housingPeriod.end >= start ? (housing.housingPeriod.end < target ? housing.housingPeriod.end : target) : target;
    return end > start ? { start, end } : undefined;
  }

  // A linked group currently at grass can still contribute in a future
  // explicitly recorded housing period. We never infer a future move without
  // that store/group link and dated housing period.
  if (group.system === "grazing" && housing.linkedGroupIds.includes(group.id)) {
    const start = housing.housingPeriod.start > base ? housing.housingPeriod.start : undefined;
    if (!start || start >= target) return undefined;
    const end = housing.housingPeriod.end < target ? housing.housingPeriod.end : target;
    return end > start ? { start, end } : undefined;
  }
  return undefined;
}

function producedForWindow(group: LivestockGroup, start: string, end: string, ageReferenceDate: string): { volumeM3: number; blocked?: string } {
  const days = Math.ceil(daysBetween(start, end));
  let volumeM3 = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const rate = resolveSlurryStorageRate(group, day, ageReferenceDate);
    if (rate.status !== "READY") return { volumeM3: 0, blocked: rate.reasonCode };
    volumeM3 += (rate.value.m3PerHeadWeek / 7) * group.count.value;
  }
  return { volumeM3 };
}

function dailyProductionForStore(housing: Housing, groups: readonly LivestockGroup[], onDate: string, ageReferenceDate: string): number {
  let total = 0;
  for (const group of groups) {
    const activeNow = group.system === "housed" && group.housingId === housing.id;
    const plannedThen = housing.linkedGroupIds.includes(group.id) && onDate >= housing.housingPeriod.start && onDate < housing.housingPeriod.end;
    if (!activeNow && !plannedThen) continue;
    const rate = resolveSlurryStorageRate(group, onDate, ageReferenceDate);
    if (rate.status === "READY") total += (rate.value.m3PerHeadWeek / 7) * group.count.value;
  }
  return total;
}

export function buildSlurryStoreForecast(input: {
  housing: Housing;
  livestockGroups: readonly LivestockGroup[];
  allocations: readonly SlurryAllocation[];
  asOfDate: string;
  targetDate: string;
}): SlurryStoreForecast {
  const { housing, livestockGroups, allocations } = input;
  const targetDate = dateOnly(input.targetDate);
  const asOfDate = dateOnly(input.asOfDate);
  if (housing.shedType !== "slatted") {
    return { status: "BLOCKED", housingId: housing.id, shedName: housing.shedName, targetDate, reasonCodes: ["SLURRY_RATE_NOT_APPLICABLE_TO_NON_SLATTED_HOUSING"], version: SLURRY_STORAGE_FORECAST_VERSION };
  }
  if (!Number.isFinite(housing.storageCapacityM3) || housing.storageCapacityM3 <= 0) {
    return { status: "BLOCKED", housingId: housing.id, shedName: housing.shedName, targetDate, reasonCodes: ["MISSING_STORE_CAPACITY"], version: SLURRY_STORAGE_FORECAST_VERSION };
  }

  const recordedAt = housing.storeObservedAt ?? housing.storageFillRecordedAt;
  const baseDate = recordedAt && dateOnly(recordedAt) <= asOfDate ? dateOnly(recordedAt) : asOfDate;
  const currentReconciledM3 = storeReconciledVolumeM3(housing);
  const contributions: SlurryForecastGroupContribution[] = [];
  const blocked: string[] = [];

  for (const group of livestockGroups) {
    if (!Number.isFinite(group.count.value) || group.count.value < 0) {
      blocked.push(`${group.id}:INVALID_HEADCOUNT`);
      continue;
    }
    const window = contributionWindow(housing, group, baseDate, targetDate);
    if (!window) continue;
    const produced = producedForWindow(group, window.start, window.end, asOfDate);
    if (produced.blocked) {
      blocked.push(`${group.id}:${produced.blocked}`);
      continue;
    }
    contributions.push({
      groupId: group.id,
      label: group.label,
      headCount: group.count.value,
      fromDate: window.start,
      throughDate: window.end,
      producedM3: produced.volumeM3,
      source: SLURRY_STORAGE_RATE_SOURCE,
    });
  }

  // A currently housed group without a store assignment cannot safely be
  // attributed to any tank; surface the gap rather than underforecasting.
  for (const group of livestockGroups) {
    if (group.system === "housed" && !group.housingId) blocked.push(`${group.id}:HOUSED_GROUP_MISSING_STORE`);
  }
  if (blocked.length > 0) {
    return { status: "BLOCKED", housingId: housing.id, shedName: housing.shedName, targetDate, reasonCodes: [...new Set(blocked)], version: SLURRY_STORAGE_FORECAST_VERSION };
  }

  const producedM3 = contributions.reduce((sum, c) => sum + c.producedM3, 0);
  const projectedRawM3 = currentReconciledM3 + producedM3;
  const projectedVolumeM3 = Math.min(housing.storageCapacityM3, Math.max(0, projectedRawM3));
  const reservedM3 = allocations.filter((a) => a.housingId === housing.id && a.priority !== "not_suitable").reduce((sum, a) => sum + a.volumeM3, 0);
  const projectedAvailableForNewPlanM3 = Math.max(0, projectedVolumeM3 - reservedM3);
  const overflowM3 = Math.max(0, projectedRawM3 - housing.storageCapacityM3);

  let projectedCapacityDate: string | undefined;
  if (currentReconciledM3 >= housing.storageCapacityM3) projectedCapacityDate = baseDate;
  else {
    // Search a bounded 2-year horizon. The same day-level production routine
    // preserves age-band changes and the recorded housing-period end.
    const maxDays = 730;
    for (let day = 1; day <= maxDays; day++) {
      const candidate = addDays(baseDate, day);
      const partial = buildSlurryStoreForecastNoCapacitySearch({ ...input, targetDate: candidate, baseDate });
      if (partial !== undefined && partial >= housing.storageCapacityM3) {
        projectedCapacityDate = candidate;
        break;
      }
    }
  }

  return {
    status: "READY",
    housingId: housing.id,
    shedName: housing.shedName,
    targetDate,
    baseDate,
    capacityM3: housing.storageCapacityM3,
    currentReconciledM3,
    producedM3,
    projectedRawM3,
    projectedVolumeM3,
    projectedFillPct: (projectedVolumeM3 / housing.storageCapacityM3) * 100,
    reservedM3,
    projectedAvailableForNewPlanM3,
    overflowM3,
    dailyProductionM3AtTarget: dailyProductionForStore(housing, livestockGroups, targetDate, asOfDate),
    ...(projectedCapacityDate ? { projectedCapacityDate } : {}),
    contributions,
    assumptions: [
      "Livestock counts and recorded housing plans remain unchanged unless a movement is recorded.",
      "Only S.I. 588/2025 Table 2 livestock slurry production is included; rainfall, soiled water and other inflows are not invented.",
      "Recorded store capacity is used as the operational capacity; legal freeboard is not re-derived from the current data model.",
    ],
    version: SLURRY_STORAGE_FORECAST_VERSION,
  };
}

/** Internal raw projection used only for the capacity-date search. */
function buildSlurryStoreForecastNoCapacitySearch(input: {
  housing: Housing;
  livestockGroups: readonly LivestockGroup[];
  allocations: readonly SlurryAllocation[];
  asOfDate: string;
  targetDate: string;
  baseDate: string;
}): number | undefined {
  let produced = 0;
  for (const group of input.livestockGroups) {
    const window = contributionWindow(input.housing, group, input.baseDate, dateOnly(input.targetDate));
    if (!window) continue;
    const p = producedForWindow(group, window.start, window.end, dateOnly(input.asOfDate));
    if (p.blocked) return undefined;
    produced += p.volumeM3;
  }
  return storeReconciledVolumeM3(input.housing) + produced;
}

export interface FarmSlurryForecast {
  status: "READY" | "PARTIAL";
  targetDate: string;
  stores: SlurryStoreForecast[];
  projectedPhysicalM3: number;
  projectedAvailableForNewPlanM3: number;
  blockedStoreCount: number;
  version: string;
}

export function buildFarmSlurryForecast(input: {
  housing: readonly Housing[];
  livestockGroups: readonly LivestockGroup[];
  allocations: readonly SlurryAllocation[];
  asOfDate: string;
  targetDate: string;
}): FarmSlurryForecast {
  const stores = input.housing.map((housing) => buildSlurryStoreForecast({ ...input, housing }));
  const ready = stores.filter((s): s is Extract<SlurryStoreForecast, { status: "READY" }> => s.status === "READY");
  return {
    status: ready.length === stores.length ? "READY" : "PARTIAL",
    targetDate: dateOnly(input.targetDate),
    stores,
    projectedPhysicalM3: ready.reduce((sum, s) => sum + s.projectedVolumeM3, 0),
    projectedAvailableForNewPlanM3: ready.reduce((sum, s) => sum + s.projectedAvailableForNewPlanM3, 0),
    blockedStoreCount: stores.length - ready.length,
    version: SLURRY_STORAGE_FORECAST_VERSION,
  };
}
