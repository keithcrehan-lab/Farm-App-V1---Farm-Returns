import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { isCattleDemoMode } from "@/server/cattle-demo/demo-service";
import { REAL_UNAVAILABLE } from "@/server/cattle-real/real-service";
import { listRemovedIndividualAnimalsForFarm } from "@/lib/farm-data/individual-animals";
import { RemovedAnimals } from "@/components/cattle/RemovedAnimals";
import { HerdManagementClient } from "./HerdManagementClient";

export const metadata = { title: "Add cattle · Farm Return" };

/**
 * Pilot Integration P3 — Cattle → Add cattle (`/cattle/manage`, DECISIONS D14). The signed-in farm's admin entry
 * point for adding a new group or an individual animal. Existing groups are opened from Cattle and corrected in their
 * own workspace (`/cattle/groups/<id>`); any older query (`?tab=Groups`) renders this same screen. Demonstration mode
 * has no farm records to add to, so it says so (it never writes the demo herd to Supabase).
 */
export default async function ManageHerdPage() {
  if (isCattleDemoMode()) return <CattleUnavailable {...REAL_UNAVAILABLE.MANAGE_DEMO} />;
  const farm = await getFarmForCurrentUser();
  if (!farm) return <CattleUnavailable {...REAL_UNAVAILABLE.NO_FARM} />;
  const removed = await listRemovedIndividualAnimalsForFarm(farm.id);
  return <><HerdManagementClient farmId={farm.id} /><RemovedAnimals animals={removed} /></>;
}
