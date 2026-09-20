/**
 * POST /api/admin/market/sync-cso-fertiliser-prices
 *
 * The bounded, explicit admin sync pathway for Phase 2's CSO fertiliser
 * market-evidence pipeline (brief §14). Not linked from any UI, not
 * called by any client component, and ordinary app rendering (Today,
 * fertiliser plan, ...) does not depend on this route ever having run —
 * it only ever reads whatever `market_price_observations` already
 * contains, never triggers a live fetch itself.
 *
 * Gated by a server-only shared secret (`CSO_SYNC_ADMIN_SECRET`) checked
 * against an `x-admin-secret` header — the smallest guard that stops an
 * ordinary farmer (or an unauthenticated caller) from triggering
 * ingestion, without introducing a new auth/role system for a V1
 * single-operator pathway. No cron/scheduler wires into this route in
 * this phase (brief: "no new cron automation unless one already exists
 * and is the canonical pattern" — none does).
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient, isServiceRoleConfigured } from "@/lib/supabase/service-role";
import { runCsoFertiliserSync } from "@/server/market/cso-fertiliser-sync";

export async function POST(request: Request) {
  const configuredSecret = process.env.CSO_SYNC_ADMIN_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "CSO_SYNC_ADMIN_SECRET is not configured — sync is disabled." }, { status: 503 });
  }
  const providedSecret = request.headers.get("x-admin-secret");
  if (providedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json({ error: "Supabase service-role client is not configured." }, { status: 503 });
  }

  const client = createServiceRoleClient();
  const result = await runCsoFertiliserSync(client);

  if (result.status === "source_unavailable") {
    return NextResponse.json(result, { status: 502 });
  }
  if (result.status === "source_schema_unrecognised") {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result, { status: 200 });
}
