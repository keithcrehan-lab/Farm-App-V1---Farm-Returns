import { notFound } from "next/navigation";
import { AnimalPlanScreen } from "@/components/cattle/AnimalPlanScreen";
import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { EMPTY_CATTLE_DEMO_SESSION } from "@/components/cattle/session/demo-session";
import { demoAnimalView, isCattleDemoMode } from "@/server/cattle-demo/demo-service";
import { REAL_UNAVAILABLE, loadRealCattle, realAnimalView } from "@/server/cattle-real/real-service";
import { scenarioOf } from "../../../scenario";

export default async function CattleAnimalPlanPage({ params, searchParams }: { params: Promise<{ tag: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const segment = decodeURIComponent((await params).tag);
  if (!isCattleDemoMode()) {
    // Real mode: the plan needs mart prices and animal costs Farm Return doesn't hold — unavailable, never fixture economics.
    const real = await loadRealCattle();
    if (real.state !== "OK") return <CattleUnavailable {...REAL_UNAVAILABLE[real.state]} />;
    if (realAnimalView(real.evaluation, segment) === null) notFound();
    return <CattleUnavailable {...REAL_UNAVAILABLE.PLAN} />;
  }
  const scenario = scenarioOf((await searchParams).scenario);
  const view = demoAnimalView(EMPTY_CATTLE_DEMO_SESSION, segment, scenario);
  if (view === null) notFound();
  return <AnimalPlanScreen initial={view} tag={segment} scenario={scenario} />;
}
