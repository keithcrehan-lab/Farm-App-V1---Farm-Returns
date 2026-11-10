import { NextResponse } from "next/server";
import { createServiceRoleClient, isServiceRoleConfigured } from "@/lib/supabase/service-role";
import { extractLatestMostBatch } from "@/server/teagasc/most-growth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Weekly (Vercel cron): read the new Teagasc MoSt map into a PENDING batch.
 * Nothing is published until an admin approves it at /admin/grass-growth.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  if (!isServiceRoleConfigured() || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ status: "not_configured", reason: "Set SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY" }, { status: 503 });
  }
  const outcome = await extractLatestMostBatch(createServiceRoleClient());
  if (outcome.status === "failed") console.error("[Teagasc growth cron]", outcome.reason);
  return NextResponse.json(outcome, { status: outcome.status === "failed" ? 502 : 200 });
}
