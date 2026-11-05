import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { isCattleDemoMode } from "@/server/cattle-demo/demo-service";
import { REAL_UNAVAILABLE } from "@/server/cattle-real/real-service";
import { loadManageHerdContext } from "@/server/cattle-real/manage-herd-view";
import { HerdManagementClient } from "./HerdManagementClient";

export const metadata = { title: "Manage herd · Farm Return" };

/**
 * Pilot Integration P3 — Cattle → Manage herd (DECISIONS D14). The signed-in farm's group and animal management,
 * resolved server-side. Demonstration mode has no farm records to manage, so it says so (it never writes the demo herd
 * to Supabase, and never shows another herd here). Each group's read-only context (individual animals, current field,
 * weighing, production plan) is loaded server-side from its owning records (`manage-herd-view.ts`); the client edits
 * only the group record itself.
 */
export default async function ManageHerdPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (isCattleDemoMode()) return <CattleUnavailable {...REAL_UNAVAILABLE.MANAGE_DEMO} />;
  const farm = await getFarmForCurrentUser();
  if (!farm) return <CattleUnavailable {...REAL_UNAVAILABLE.NO_FARM} />;
  const [params, context] = await Promise.all([searchParams, loadManageHerdContext()]);
  return <HerdManagementClient farmId={farm.id} initialTab={params.tab === "Groups" ? "Groups" : "Overview"} context={context} />;
}
