import type { EnterpriseType } from "@/domain/types";
import { IRISH_COUNTIES } from "@/lib/irish-counties";

/**
 * Map-led first-farm onboarding (object before form). Pure helpers shared by the onboarding page, its server actions
 * and tests. No new persisted state: the stage is read from what already exists — whether the farm row exists, its
 * `onboarding_completed_at`, and how many real fields it has.
 */

export type OnboardingStage =
  /** No farm yet: find the farm on the map, then establish it. */
  | "LOCATE"
  /** A farm, onboarding not finished, no field yet: map the first field. */
  | "FIRST_FIELD"
  /** A farm with at least one field, onboarding not finished: choose where to go next. */
  | "NEXT_STEPS"
  /** Onboarding finished: the normal Farm Return workspace. */
  | "DONE";

export function onboardingStage(input: { hasFarm: boolean; completed: boolean; fieldCount: number }): OnboardingStage {
  if (!input.hasFarm) return "LOCATE";
  // A completed farm is never sent back through onboarding — with or without fields.
  if (input.completed) return "DONE";
  return input.fieldCount > 0 ? "NEXT_STEPS" : "FIRST_FIELD";
}

/** Farm types offered at sign-up, mapped onto the existing enterprise model exactly (no value is invented). */
export const FARM_TYPES = [
  { id: "dairy", label: "Dairy", enterprises: ["dairy"] },
  { id: "suckler", label: "Suckler", enterprises: ["suckler_beef"] },
  { id: "dairy_beef", label: "Dairy calf-to-beef", enterprises: ["dairy_beef"] },
  { id: "sheep", label: "Sheep", enterprises: ["sheep"] },
  { id: "tillage", label: "Tillage", enterprises: ["tillage"] },
  { id: "mixed", label: "Mixed", enterprises: ["mixed"] },
  /** None of the above: no primary enterprise is recorded rather than a guessed one. */
  { id: "other", label: "Other", enterprises: [] },
] as const satisfies readonly { id: string; label: string; enterprises: readonly EnterpriseType[] }[];

export type FarmTypeId = (typeof FARM_TYPES)[number]["id"];

/**
 * Maps one or more onboarding farm-type choices onto the existing enterprise array.
 * Concrete enterprises can be combined. "Mixed" and "Other" are intentionally
 * standalone fallback choices so they never obscure the more precise selections.
 */
export function enterprisesForFarmTypes(ids: readonly string[]): EnterpriseType[] | null {
  if (!Array.isArray(ids) || ids.length === 0) return null;

  const uniqueIds = [...new Set(ids)];
  const choices = uniqueIds.map((id) => FARM_TYPES.find((x) => x.id === id));
  if (choices.some((choice) => choice === undefined)) return null;

  const hasStandaloneChoice = uniqueIds.includes("mixed") || uniqueIds.includes("other");
  if (hasStandaloneChoice && uniqueIds.length > 1) return null;

  return [...new Set(choices.flatMap((choice) => (choice ? [...choice.enterprises] : [])))];
}

export const COUNTY_NAMES: readonly string[] = IRISH_COUNTIES.map((c) => c.name);

export function isCounty(name: unknown): name is string {
  return typeof name === "string" && COUNTY_NAMES.includes(name);
}

/**
 * The county named by a Mapbox reverse-geocoding response for a point, or `null` when the response doesn't name one of
 * the 26 counties (outside the State, at sea, or an unexpected answer) — the farmer then chooses it. Never a nearest
 * guess.
 */
export function countyFromGeocode(response: unknown): string | null {
  const features = (response as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return null;
  for (const f of features) {
    const candidates = [(f as { text?: unknown }).text, (f as { place_name?: unknown }).place_name];
    for (const c of candidates) {
      if (typeof c !== "string") continue;
      const name = c.replace(/^County\s+/i, "").replace(/^Co\.?\s+/i, "").split(",")[0].trim();
      const match = COUNTY_NAMES.find((n) => n.toLowerCase() === name.toLowerCase());
      if (match) return match;
    }
  }
  return null;
}

/** A sensible point in or near Ireland (the map is limited to Ireland). */
export function isIrishPoint(lng: unknown, lat: unknown): boolean {
  return typeof lng === "number" && typeof lat === "number" && Number.isFinite(lng) && Number.isFinite(lat) && lng >= -11 && lng <= -5 && lat >= 51 && lat <= 56;
}

/**
 * The account holder's display name for the farm's required `owner_name`, derived from the account email (the same
 * default the previous onboarding pre-filled). Not a farm fact; changeable in Settings.
 */
export function ownerNameFromEmail(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0]?.trim();
  return local && local.length > 0 ? local : "Farm owner";
}
