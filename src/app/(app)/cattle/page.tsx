import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { HerdScreen } from "@/components/cattle/HerdScreens";
import { EMPTY_CATTLE_DEMO_SESSION } from "@/components/cattle/session/demo-session";
import { demoHerdView, isCattleDemoMode } from "@/server/cattle-demo/demo-service";
import { scenarioOf } from "./scenario";

export const metadata = { title: "Cattle · Farm Return" };

export default async function CattlePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isCattleDemoMode()) return <CattleUnavailable />;
  const scenario = scenarioOf((await searchParams).scenario);
  return <HerdScreen initial={demoHerdView(EMPTY_CATTLE_DEMO_SESSION, scenario)} scenario={scenario} />;
}
