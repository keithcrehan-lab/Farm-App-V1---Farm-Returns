/**
 * GET /api/weather/observations?fieldId=field-back
 * GET /api/weather/observations?lat=51.9&lng=-8.49
 *
 * The only place in this app allowed to reach Met Éireann — a Next.js
 * Route Handler runs server-side only, never in the browser bundle
 * (`weather-service.ts` and everything it imports is additionally
 * guarded by `import "server-only"`, so a client component importing
 * this pipeline directly is a build error, not just a convention).
 *
 * ✅ VERIFIED against the live Met Éireann API — see weather-service.ts's
 * doc comment and docs/evidence-register.md. Consumed client-side by the
 * Spreading screen's current-conditions panel
 * (src/components/farm/CurrentConditionsCard.tsx).
 */

import { NextResponse } from "next/server";
import { mockFields } from "@/data/mock-farm";
import { getWeatherForField } from "@/server/weather/weather-service";

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

  const result = await getWeatherForField({ centroid });
  return NextResponse.json(result);
}
