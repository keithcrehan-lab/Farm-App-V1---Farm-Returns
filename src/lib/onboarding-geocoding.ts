import { IRELAND_BBOX, MAPBOX_TOKEN } from "@/lib/mapbox";
import { countyFromGeocode } from "@/lib/onboarding";

/**
 * Mapbox geocoding for map-led onboarding: find a place, and read the county of the point the farmer confirmed. Uses
 * the same public Mapbox token as the map. Failures resolve to "nothing found" / "county unknown" — the farmer can
 * always move the map or choose the county themselves.
 */
const BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places";

export interface PlaceResult {
  id: string;
  label: string;
  center: [number, number];
}

/**
 * Eircodes are commonly typed either as `D02 X285` or `D02X285`.
 * Normalise the shape before any lookup so the UI recognises both forms.
 * This validates only the Eircode syntax, not whether that code is assigned.
 */
export function normaliseEircode(value: string): string | null {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  if (!/^(?:[AC-FHKNPRTV-Y]\d{2}|D6W)[0-9AC-FHKNPRTV-Y]{4}$/.test(compact)) return null;
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[] | null> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, country: "ie", bbox: IRELAND_BBOX.join(","), limit: "5", types: "postcode,place,locality,neighborhood,address,poi,district,region" });
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(q)}.json?${params}`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { features?: { id?: string; place_name?: string; center?: [number, number] }[] };
    return (body.features ?? [])
      .filter((f) => typeof f.id === "string" && typeof f.place_name === "string" && Array.isArray(f.center))
      .map((f) => ({ id: f.id as string, label: f.place_name as string, center: f.center as [number, number] }));
  } catch {
    return null;
  }
}

export async function countyAt(center: [number, number], signal?: AbortSignal): Promise<string | null> {
  // Irish counties are Mapbox "region" features (reverse geocoding accepts one type when limiting results).
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, types: "region", country: "ie" });
  try {
    const res = await fetch(`${BASE}/${center[0]},${center[1]}.json?${params}`, { signal });
    if (!res.ok) return null;
    return countyFromGeocode(await res.json());
  } catch {
    return null;
  }
}
