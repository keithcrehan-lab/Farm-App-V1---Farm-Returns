import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { GroupScreen } from "@/components/cattle/HerdScreens";
import { EMPTY_CATTLE_DEMO_SESSION } from "@/components/cattle/session/demo-session";
import { demoHerdView, isCattleDemoMode } from "@/server/cattle-demo/demo-service";
import { scenarioOf } from "../../scenario";

export default async function CattleGroupPage({ params, searchParams }: { params: Promise<{ groupRef: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isCattleDemoMode()) return <CattleUnavailable />;
  const { groupRef } = await params;
  const scenario = scenarioOf((await searchParams).scenario);
  return <GroupScreen initial={demoHerdView(EMPTY_CATTLE_DEMO_SESSION, scenario)} groupRef={decodeURIComponent(groupRef)} scenario={scenario} />;
}
