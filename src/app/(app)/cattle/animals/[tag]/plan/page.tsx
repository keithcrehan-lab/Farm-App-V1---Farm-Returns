import { notFound } from "next/navigation";
import { AnimalPlanScreen } from "@/components/cattle/AnimalPlanScreen";
import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { EMPTY_CATTLE_DEMO_SESSION } from "@/components/cattle/session/demo-session";
import { demoAnimalView, isCattleDemoMode } from "@/server/cattle-demo/demo-service";
import { scenarioOf } from "../../../scenario";

export default async function CattleAnimalPlanPage({ params, searchParams }: { params: Promise<{ tag: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isCattleDemoMode()) return <CattleUnavailable />;
  const tag = decodeURIComponent((await params).tag);
  const scenario = scenarioOf((await searchParams).scenario);
  const view = demoAnimalView(EMPTY_CATTLE_DEMO_SESSION, tag, scenario);
  if (view === null) notFound();
  return <AnimalPlanScreen initial={view} tag={tag} scenario={scenario} />;
}
