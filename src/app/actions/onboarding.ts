"use server";

/**
 * Map-led first-farm onboarding — Server Actions (object before form: locate the farm → establish it → map the first
 * field → choose where to go). Each action is reachable by direct POST, so each one resolves the signed-in user and
 * their farm itself and never takes a farm id from the browser. RLS and `farms_user_id_unique` (one farm per user)
 * sit underneath.
 *
 * Nothing here invents farm data: the farm's location is the point the farmer confirmed on the map; its county is the
 * one detected from that point or chosen by the farmer; its enterprise is the farm type the farmer picked ("Other"
 * records none). The required `owner_name` is the account's email name, the same default the previous onboarding
 * offered, changeable in Settings.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isValidBoundaryPolygon } from "@/domain/field-boundary";
import { createClient } from "@/lib/supabase/server";
import { createFarmForCurrentUser, getOnboardingStatusForCurrentUser, markOnboardingComplete } from "@/lib/farm-data/farms";
import { createField } from "@/lib/farm-data/fields";
import { HOME_ROUTE } from "@/lib/home-route";
import { enterprisesForFarmTypes, isCounty, isIrishPoint, ownerNameFromEmail } from "@/lib/onboarding";
import { normaliseEircode } from "@/lib/onboarding-geocoding";
import { tracked, type Farm, type Field, type FarmGrazingProductionSystem } from "@/domain/types";

export type OnboardingResult<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = <T>(error: string): OnboardingResult<T> => ({ ok: false, error });

export interface EstablishFarmInput {
  name: string;
  farmTypes: string[];
  county: string;
  centroid: [number, number];
  grazingProductionSystem?: FarmGrazingProductionSystem;
}

export interface ExactEircodeResult {
  eircode: string;
  label: string;
  center: [number, number];
}

/**
 * Resolves a full seven-character Eircode to exact coordinates using the
 * Google Maps Geocoding API. The API key is server-only and Google currently
 * includes a monthly free usage cap for the Geocoding SKU, which makes this
 * suitable for the non-commercial prototype.
 */
export async function lookupExactEircodeStep(input: string): Promise<OnboardingResult<ExactEircodeResult>> {
  const eircode = normaliseEircode(typeof input === "string" ? input : "");
  if (!eircode) return fail("Enter a valid Eircode, for example V95 TY07.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has ended. Sign in again to carry on.");

  const apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim();
  if (!apiKey) return fail("Exact Eircode lookup isn't available just now. Search by address, use your current location, or move the map to your farm.");

  try {
    const compact = eircode.replace(/\s+/g, "");
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("components", `postal_code:${compact}|country:IE`);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Farm Return onboarding",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error("[onboarding] Google Eircode lookup failed:", response.status);
      return fail("We couldn't look up that Eircode just now. Check it and try again.");
    }

    const body = (await response.json()) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };

    if (body.status !== "OK" || !body.results?.length) {
      return fail("We couldn't find an exact match for that Eircode. Check it and try again.");
    }

    const exact = body.results.find((result) => {
      const postal = result.address_components?.find((part) => part.types?.includes("postal_code"));
      return normaliseEircode(postal?.long_name ?? postal?.short_name ?? "") === eircode;
    });

    const latitude = exact?.geometry?.location?.lat;
    const longitude = exact?.geometry?.location?.lng;
    if (!exact || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !isIrishPoint(longitude, latitude)) {
      return fail("We couldn't find an exact match for that Eircode. Check it and try again.");
    }

    return {
      ok: true,
      value: {
        eircode,
        label: exact.formatted_address || eircode,
        center: [longitude as number, latitude as number],
      },
    };
  } catch (error) {
    console.error("[onboarding] Google Eircode lookup error:", error);
    return fail("We couldn't look up that Eircode just now. Check it and try again.");
  }
}

/** Creates the signed-in farmer's farm — or, if it already exists (a double submit, a retry), returns that one. */
export async function establishFarmStep(input: EstablishFarmInput): Promise<OnboardingResult<Farm>> {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (name.length === 0) return fail("Give your farm a name.");
  if (name.length > 80) return fail("Keep the farm name under 80 characters.");
  const enterprises = enterprisesForFarmTypes(input?.farmTypes);
  if (enterprises === null) return fail("Choose one or more farm types.");
  const needsGrazingBaseline = input.farmTypes.includes("suckler");
  const grazingProductionSystem = input.grazingProductionSystem;
  if (needsGrazingBaseline && !["SUCKLER_CALF_TO_BEEF", "SUCKLER_CALF_TO_WEANING", "OTHER_DRYSTOCK"].includes(grazingProductionSystem ?? "")) {
    return fail("Choose your normal grazing production system.");
  }
  if (!isCounty(input?.county)) return fail("Choose your county.");
  const [lng, lat] = Array.isArray(input?.centroid) ? input.centroid : [];
  if (!isIrishPoint(lng, lat)) return fail("Find your farm on the map first.");

  try {
    const existing = await getOnboardingStatusForCurrentUser();
    if (existing) return { ok: true, value: existing.farm };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Your session has ended. Sign in again to carry on.");
    const ownerName = ownerNameFromEmail(user.email);
    const farm = await createFarmForCurrentUser({
      name,
      ownerName,
      county: input.county,
      centroid: [lng as number, lat as number],
      primaryEnterprises: enterprises,
      ...(grazingProductionSystem ? { grazingProductionSystem: tracked(grazingProductionSystem, "farmer_adjusted", ownerName) } : {}),
    });
    revalidatePath("/onboarding");
    return { ok: true, value: farm };
  } catch (error) {
    // A second submit that raced the first hits the one-farm-per-user constraint: return the farm it made.
    const again = await getOnboardingStatusForCurrentUser().catch(() => null);
    if (again) return { ok: true, value: again.farm };
    console.error("[onboarding] establish farm failed:", error);
    return fail("We couldn't save your farm just now. Please try again.");
  }
}

/** Saves a real, farmer-drawn field boundary to the signed-in farmer's farm (area is derived from the polygon). */
export async function addOnboardingFieldStep(input: { name: string; polygon: GeoJSON.Polygon }): Promise<OnboardingResult<Field>> {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (name.length === 0) return fail("Give the field a name.");
  if (name.length > 80) return fail("Keep the field name under 80 characters.");
  const polygon = input?.polygon;
  if (!polygon || polygon.type !== "Polygon" || !Array.isArray(polygon.coordinates) || !isValidBoundaryPolygon(polygon)) {
    return fail("That boundary isn't a closed field shape. Draw it again.");
  }
  try {
    const status = await getOnboardingStatusForCurrentUser();
    if (!status) return fail("Set up your farm first.");
    const field = await createField(status.farm.id, { name, polygon, fertility: {} });
    revalidatePath("/onboarding");
    return { ok: true, value: field };
  } catch (error) {
    console.error("[onboarding] add field failed:", error);
    return fail("We couldn't save that field just now. Please try again.");
  }
}

/** Where a farmer can go once their farm has its first field. Livestock is never compulsory. */
const DESTINATIONS = { explore: HOME_ROUTE, cattle: "/cattle/manage" } as const;

export async function finishOnboardingStep(destination: string): Promise<OnboardingResult<never>> {
  const target = DESTINATIONS[destination as keyof typeof DESTINATIONS];
  if (target === undefined) return fail("Choose where to go next.");
  const status = await getOnboardingStatusForCurrentUser();
  if (!status) return fail("Set up your farm first.");
  if (!status.completed) {
    try {
      await markOnboardingComplete(status.farm.id);
    } catch (error) {
      console.error("[onboarding] finish failed:", error);
      return fail("We couldn't finish setting up just now. Please try again.");
    }
  }
  revalidatePath("/", "layout");
  redirect(target);
}
