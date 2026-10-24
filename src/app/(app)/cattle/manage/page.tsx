import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { isCattleDemoMode } from "@/server/cattle-demo/demo-service";
import { REAL_UNAVAILABLE } from "@/server/cattle-real/real-service";
import { HerdManagementClient } from "./HerdManagementClient";

export const metadata = { title: "Manage herd · Farm Return" };

/**
 * Pilot Integration P3 — Cattle → Manage herd (DECISIONS D14). The signed-in farm's group and animal management,
 * resolved server-side. Demonstration mode has no farm records to manage, so it says so (it never writes the demo herd
 * to Supabase, and never shows another herd here).
 */
export default async function ManageHerdPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (isCattleDemoMode()) return <CattleUnavailable {...REAL_UNAVAILABLE.MANAGE_DEMO} />;
  const farm = await getFarmForCurrentUser();
  if (!farm) return <CattleUnavailable {...REAL_UNAVAILABLE.NO_FARM} />;
  const tab = (await searchParams).tab;
  return <HerdManagementClient farmId={farm.id} initialTab={tab === "Groups" ? "Groups" : "Overview"} />;
}
