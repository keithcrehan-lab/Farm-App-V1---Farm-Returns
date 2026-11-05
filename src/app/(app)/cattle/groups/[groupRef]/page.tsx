import { notFound } from "next/navigation";
import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { GroupScreen, RealGroupScreen } from "@/components/cattle/HerdScreens";
import { EMPTY_CATTLE_DEMO_SESSION } from "@/components/cattle/session/demo-session";
import { demoHerdView, isCattleDemoMode } from "@/server/cattle-demo/demo-service";
import { REAL_UNAVAILABLE, loadRealCattle, realGroupRefs, realHerdView } from "@/server/cattle-real/real-service";
import { loadCattleOperationalView } from "@/server/cattle-real/operational-view";
import { groupRecordEditOf } from "@/server/cattle-real/group-record-edit";
import { GroupDetailsEditor } from "@/components/farm/GroupDetailsEditor";
import { scenarioOf } from "../../scenario";

export default async function CattleGroupPage({ params, searchParams }: { params: Promise<{ groupRef: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const groupRef = decodeURIComponent((await params).groupRef);
  if (!isCattleDemoMode()) {
    const real = await loadRealCattle();
    if (real.state !== "OK") return <CattleUnavailable {...REAL_UNAVAILABLE[real.state]} />;
    // Only this farm's groups resolve; any other id (another farm's, or none) is not found — no existence signal.
    if (!realGroupRefs(real.evaluation).has(groupRef)) notFound();
    const asOfDate = real.evaluation.outputs.viewpoint.effectiveAt.slice(0, 10);
    const operational = await loadCattleOperationalView(real.evaluation.farmId, real.evaluation.sourceGroups, asOfDate);
    const record = groupRecordEditOf(real.evaluation, groupRef);
    // Keyed by the saved record so a refresh after saving re-opens the control on the new values.
    const editor = record ? <GroupDetailsEditor key={`${record.name}|${record.breed}|${record.storedHeadcount}`} record={record} /> : null;
    return <RealGroupScreen view={realHerdView(real.evaluation, operational)} groupRef={groupRef} editor={editor} />;
  }
  const scenario = scenarioOf((await searchParams).scenario);
  return <GroupScreen initial={demoHerdView(EMPTY_CATTLE_DEMO_SESSION, scenario)} groupRef={groupRef} scenario={scenario} />;
}
