import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { HerdScreen, RealHerdScreen } from "@/components/cattle/HerdScreens";
import { EMPTY_CATTLE_DEMO_SESSION } from "@/components/cattle/session/demo-session";
import { demoHerdView, isCattleDemoMode } from "@/server/cattle-demo/demo-service";
import { REAL_UNAVAILABLE, loadRealCattle, realHerdView } from "@/server/cattle-real/real-service";
import { scenarioOf } from "./scenario";

export const metadata = { title: "Cattle · Farm Return" };

export default async function CattlePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isCattleDemoMode()) {
    // Signed-in farm (Pilot Integration P1): the farm is resolved server-side; any failure is unavailable, never the demo herd.
    const real = await loadRealCattle();
    if (real.state !== "OK") return <CattleUnavailable {...REAL_UNAVAILABLE[real.state]} />;
    return <RealHerdScreen view={realHerdView(real.evaluation)} />;
  }
  const scenario = scenarioOf((await searchParams).scenario);
  return <HerdScreen initial={demoHerdView(EMPTY_CATTLE_DEMO_SESSION, scenario)} scenario={scenario} />;
}
