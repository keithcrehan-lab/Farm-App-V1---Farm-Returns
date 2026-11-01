import { NextResponse } from "next/server";
import { createServiceRoleClient, isServiceRoleConfigured } from "@/lib/supabase/service-role";
import { runSpatialReferenceSync } from "@/server/spatial-reference/sync";
import type { SpatialBbox } from "@/server/spatial-reference/source-clients";

function validBbox(value: unknown): value is SpatialBbox {
  return Array.isArray(value) && value.length === 4 && value.every((v) => typeof v === "number" && Number.isFinite(v))
    && value[0] < value[2] && value[1] < value[3] && value[0] >= -180 && value[2] <= 180 && value[1] >= -90 && value[3] <= 90;
}

export async function POST(request: Request) {
  const configuredSecret = process.env.SPATIAL_REFERENCE_SYNC_ADMIN_SECRET;
  if (!configuredSecret) return NextResponse.json({ error: "SPATIAL_REFERENCE_SYNC_ADMIN_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("x-admin-secret") !== configuredSecret) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase service-role client is not configured." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { bbox?: unknown } | null;
  if (!validBbox(body?.bbox)) return NextResponse.json({ error: "Body must contain bbox [minLon,minLat,maxLon,maxLat]." }, { status: 400 });

  const result = await runSpatialReferenceSync(createServiceRoleClient(), body.bbox);
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 207 });
}
