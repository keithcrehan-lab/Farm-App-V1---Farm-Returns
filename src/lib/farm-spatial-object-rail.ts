import { calculateShedOccupancy } from "@/domain/farm-stats";
import type { DataStatus, Housing, LivestockGroup } from "@/domain/types";
import { formatNumber } from "@/lib/format";
import { livestockCategoryLabel } from "@/lib/status";

/**
 * Farm Spatial V2 Phase 6 — what the object rail shows when the farmer
 * selects Cattle, Sheep or Sheds (object-before-form;
 * `docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §8). Presentation only:
 * every value is read straight off persisted `LivestockGroup` / `Housing`
 * records or the canonical `calculateShedOccupancy`, with each count's
 * provenance status carried through. Nothing is estimated here.
 *
 * What is not modelled stays an honest absence: a group's field location,
 * field moves, sheep, shed head capacity and an individual animal's target
 * weight or location. The individual animal view is information
 * architecture only — no animal record is read or invented here.
 */

export type FarmObjectId = "cattle" | "sheep" | "sheds";

export interface CattleGroupRow {
  id: string;
  label: string;
  category: string;
  /** Head count, or "Unknown" when the persisted count is unavailable. */
  head: string;
  headMissing?: boolean;
  /** Provenance of a head count that is not a verified figure. */
  headBasis?: string;
  /** Housed shed name, or what is (not) recorded about where the group is. */
  location: string;
  locationMissing?: boolean;
  href: string;
}

export interface ShedRow {
  id: string;
  name: string;
  type: string;
  occupancy: string;
  occupancyMissing?: boolean;
  /** Provenance of a head total that is not wholly verified. */
  occupancyBasis?: string;
}

const BASIS_LABEL: Partial<Record<DataStatus, string>> = {
  estimated: "Estimated",
  farmer_adjusted: "Farmer entered",
  mapped: "Mapped",
};

const SHED_TYPE_LABEL: Record<Housing["shedType"], string> = {
  slatted: "Slatted",
  straw_bedded: "Straw bedded",
  other: "Other",
};

function headText(n: number): string {
  return `${formatNumber(n, 0)} head`;
}

/** The shed a housed group is in: the shed whose persisted `linkedGroupIds`
 * holds it (what `/housing` lists), else the group's own `housingId`. */
function groupShed(group: LivestockGroup, housing: readonly Housing[]): Housing | undefined {
  return housing.find((h) => h.linkedGroupIds.includes(group.id)) ?? (group.housingId ? housing.find((h) => h.id === group.housingId) : undefined);
}

export function cattleGroupRows(groups: readonly LivestockGroup[], housing: readonly Housing[]): CattleGroupRow[] {
  return groups.map((group) => {
    const known = group.count.status !== "unavailable";
    const basis = known ? BASIS_LABEL[group.count.status] : undefined;
    let location: string;
    let locationMissing = false;
    if (group.system === "housed") {
      const shed = groupShed(group, housing);
      location = shed ? `Housed · ${shed.shedName}` : "Housed · shed not recorded";
      locationMissing = !shed;
    } else {
      // No field assignment is persisted on a group (§8): never a field name.
      location = "Grazing · field not recorded";
      locationMissing = true;
    }
    return {
      id: group.id,
      label: group.label,
      category: livestockCategoryLabel(group.category),
      head: known ? headText(group.count.value) : "Unknown",
      ...(known ? {} : { headMissing: true }),
      ...(basis ? { headBasis: basis } : {}),
      location,
      ...(locationMissing ? { locationMissing: true } : {}),
      href: `/livestock/${encodeURIComponent(group.id)}`,
    };
  });
}

/** A shed head total's provenance: the single non-verified basis of every
 * linked count, or which non-verified bases a mixed total includes. */
function occupancyBasisText(statuses: readonly DataStatus[]): string | undefined {
  const unverified = statuses.filter((s) => s !== "verified").map((s) => BASIS_LABEL[s] ?? s);
  if (unverified.length === 0) return undefined;
  if (statuses.length === 1) return unverified[0];
  return `Includes ${unverified.map((l) => l.toLowerCase()).join(" and ")}`;
}

export function shedRows(housing: readonly Housing[], groups: readonly LivestockGroup[]): ShedRow[] {
  return housing.map((shed) => {
    const { linkedGroupCount, headCount, headCountStatuses } = calculateShedOccupancy(shed, groups);
    let occupancy: string;
    let occupancyMissing = false;
    let occupancyBasis: string | undefined;
    if (linkedGroupCount === 0) {
      occupancy = "No groups assigned";
      occupancyMissing = true;
    } else {
      const groupsText = `${linkedGroupCount} ${linkedGroupCount === 1 ? "group" : "groups"}`;
      occupancy = headCount === null ? `${groupsText} · head count unknown` : `${headText(headCount)} · ${groupsText}`;
      occupancyMissing = headCount === null;
      if (headCount !== null) occupancyBasis = occupancyBasisText(headCountStatuses);
    }
    return {
      id: shed.id,
      name: shed.shedName,
      type: SHED_TYPE_LABEL[shed.shedType],
      occupancy,
      ...(occupancyMissing ? { occupancyMissing: true } : {}),
      ...(occupancyBasis ? { occupancyBasis } : {}),
    };
  });
}

/** Elements of each object with no production source yet. */
export const FARM_OBJECT_UNAVAILABLE_NOTE: Record<FarmObjectId, string> = {
  cattle: "Field locations and moving groups between fields aren't available yet.",
  sheep: "Sheep groups aren't supported yet. Farm Return records cattle categories only, so no sheep count is shown.",
  sheds: "Head capacity and spaces free aren't recorded yet. Shed storage capacity is slurry storage, not animal spaces.",
};

export interface IndividualAnimalField {
  label: string;
  /** Where the field lives today, or that it is not yet supported. */
  status: string;
  available: boolean;
}

/**
 * The planned individual animal detail (DESIGN_CONTRACT: "Placeholder UI
 * may describe the intended fields but must not invent production
 * records"). Tag, date of birth and weight history are persisted per
 * animal and live on Livestock; target weight and an animal's location
 * have no persisted field. No value is shown here.
 */
export const INDIVIDUAL_ANIMAL_FIELDS: readonly IndividualAnimalField[] = [
  { label: "Tag", status: "Recorded in Livestock", available: true },
  { label: "Age", status: "From date of birth in Livestock", available: true },
  { label: "Weight", status: "Weigh history in Livestock", available: true },
  { label: "Target weight", status: "Not yet supported", available: false },
  { label: "Group · location", status: "Group in Livestock · field location not yet supported", available: false },
];
