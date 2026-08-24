/**
 * GET /api/weather/forecast?fieldId=field-back
 * GET /api/weather/forecast?lat=51.9&lng=-8.4863
 *
 * Forecast-side counterpart to `/api/weather/observations` — the only
 * place in this app allowed to reach Met Éireann's point-forecast API.
 * Deliberately separate from the observations route (per
 * `forecast-provider.ts`'s own doc comment: don't mix forecasts with
 * observations) even though both share the same fieldId/lat+lng
 * resolution logic.
 *
 * ✅ VERIFIED against the live Met Éireann API — see
 * forecast-provider.ts's doc comment and docs/evidence-register.md.
 */

import { NextResponse } from "next/server";
import { mockFields } from "@/data/mock-farm";
import { meteireannLocationForecastProvider } from "@/server/weather/forecast-provider";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fieldId = searchParams.get("fieldId");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  let centroid: [number, number] | null = null;

  if (fieldId) {
    const field = mockFields.find((f) => f.id === fieldId);
    if (!field) {
      return NextResponse.json({ error: `Unknown fieldId: ${fieldId}` }, { status: 404 });
    }
    centroid = field.centroid;
  } else if (lat && lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: "lat/lng must be numbers" }, { status: 400 });
    }
    centroid = [longitude, latitude];
  }

  if (!centroid) {
    return NextResponse.json({ error: "Provide either fieldId or lat+lng" }, { status: 400 });
  }

  const result = await meteireannLocationForecastProvider.getForecastForField({ centroid });
  return NextResponse.json(result);
}
