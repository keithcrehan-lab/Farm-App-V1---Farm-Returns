import { notFound } from "next/navigation";
import { AnimalProfileScreen, RealAnimalProfileScreen } from "@/components/cattle/AnimalProfileScreen";
import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { EMPTY_CATTLE_DEMO_SESSION } from "@/components/cattle/session/demo-session";
import { demoAnimalView, isCattleDemoMode } from "@/server/cattle-demo/demo-service";
import { REAL_UNAVAILABLE, loadRealCattle, realAnimalView } from "@/server/cattle-real/real-service";
import { animalDetailsEditOf } from "@/server/cattle-real/animal-details";
import { irelandCalendarDate } from "@/server/cattle-real/record-weight";
import { AnimalDetailsEditor } from "@/components/farm/AnimalDetailsEditor";
import { scenarioOf } from "../../scenario";

/** The segment is the demo animal's tag in demonstration mode, and the animal's database id in real mode (D2). */
export default async function CattleAnimalPage({ params, searchParams }: { params: Promise<{ tag: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const segment = decodeURIComponent((await params).tag);
  if (!isCattleDemoMode()) {
    const real = await loadRealCattle();
    if (real.state !== "OK") return <CattleUnavailable {...REAL_UNAVAILABLE[real.state]} />;
    // Looked up only among this farm's animals: another farm's id and an unknown id are the same not-found.
    const view = realAnimalView(real.evaluation, segment);
    if (view === null) notFound();
    const details = animalDetailsEditOf(real.evaluation, segment, irelandCalendarDate(new Date(real.evaluation.outputs.viewpoint.effectiveAt)));
    // Keyed by the saved values so a refresh after saving re-opens the control on the corrected record.
    const editor = details ? <AnimalDetailsEditor key={`${details.dateOfBirth}|${details.sex}|${details.breed}`} record={details} /> : null;
    return <RealAnimalProfileScreen view={view} editor={editor} />;
  }
  const scenario = scenarioOf((await searchParams).scenario);
  const view = demoAnimalView(EMPTY_CATTLE_DEMO_SESSION, segment, scenario);
  if (view === null) notFound();
  return <AnimalProfileScreen initial={view} tag={segment} scenario={scenario} />;
}
