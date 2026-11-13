import { NextResponse } from "next/server";
import { createServiceRoleClient, isServiceRoleConfigured } from "@/lib/supabase/service-role";
import { extractLatestMostBatch } from "@/server/teagasc/most-growth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily map check (Vercel cron). New figures become pending by default;
 * strict two-read auto-publication requires an explicit environment opt-in.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  // Manual mode (no API key): figures can still be published by an admin.
  if (!isServiceRoleConfigured() || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ status: "skipped", reason: "Manual entry mode" });
  }
  const outcome = await extractLatestMostBatch(createServiceRoleClient());
  if (outcome.status === "failed") console.error("[Teagasc growth cron]", outcome.reason);
  return NextResponse.json(outcome, { status: outcome.status === "failed" ? 502 : 200 });
}
