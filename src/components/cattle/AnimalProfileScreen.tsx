"use client";

/**
 * Cattle C10 — the individual animal: the reference screen. Object first
 * (identity and photo), then current state (weight, daily gain, direct cost),
 * then the ONE thing that needs attention, then performance (the doorway to
 * the Animal plan), health, costs, photos and recent activity.
 *
 * Every value comes from the server view-model; a recorded weight goes into
 * the demo session and the frozen engines recalculate the whole profile —
 * the screen then shows what changed (the new number settles, the chart
 * gains its point, the job resolves, the activity entry appears).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DemoAnimalView } from "@/server/cattle-demo/demo-service";
import type { CattleDemoScenario } from "@/server/cattle-demo/demo-replay";
import { loadCattleAnimal } from "@/app/(app)/cattle/actions";
import { CostSection, HealthSection, TimelineSection } from "./AnimalSections";
import { PerformanceChart } from "./PerformanceChart";
import { PhotoGallery, PrimaryPhoto } from "./photos/AnimalPhotos";
import { RecordWeightSheet } from "./RecordWeightSheet";
import { useCattleDemoSession } from "./session/CattleDemoSessionProvider";
import { useDemoView } from "./session/use-demo-view";
import { BackLink, DemoNotice, Metric, SectionHeading, StateLabel, ViewStatus, busyClass } from "./ui";
import { WorkPanel } from "./WorkPanel";

const SESSION_FULL = "This demonstration session is full, so the weight wasn't recorded. Reset the demo on the Cattle page to continue.";

export function AnimalProfileScreen({ initial, tag, scenario }: { initial: DemoAnimalView; tag: string; scenario: CattleDemoScenario }) {
  const { addEvent } = useCattleDemoSession();
  const { view, pending, failed } = useDemoView(initial, `animal:${tag}:${scenario}`, (session) => loadCattleAnimal(session, tag, scenario));
  const [sheet, setSheet] = useState(false);
  const [changes, setChanges] = useState<{ points: string[]; resolved: string[]; timeline: Set<string> }>({ points: [], resolved: [], timeline: new Set() });
  // What a recalculation changed for THIS animal (adjusting state from the previous render; another animal resets it).
  const [shown, setShown] = useState(view);
  if (shown !== view) {
    setShown(view);
    if (shown.profile.animalId !== view.profile.animalId) setChanges({ points: [], resolved: [], timeline: new Set() });
    else {
      const before = shown.profile;
      const after = view.profile;
      const chartIds = (c: typeof before.chart) => (c.state === "KNOWN" ? c.value.points.flatMap((x) => x.recordIds) : []);
      const oldIds = new Set(chartIds(before.chart));
      const openBefore = new Set(before.work.open.state === "KNOWN" ? [before.work.open.value.primary, ...before.work.open.value.others].filter((w) => w !== null).map((w) => w.jobId) : []);
      const oldTimeline = new Set(before.timeline.map((e) => e.id));
      setChanges({
        points: chartIds(after.chart).filter((id) => !oldIds.has(id)),
        resolved: after.work.closed.filter((c) => openBefore.has(c.jobId)).map((c) => c.title),
        timeline: new Set(after.timeline.filter((e) => !oldTimeline.has(e.id)).map((e) => e.id)),
      });
    }
  }

  const p = view.profile;
  const groupHref = p.identity.group.groupRef ? `/cattle/groups/${encodeURIComponent(p.identity.group.groupRef)}${scenario === "STANDARD" ? "" : `?scenario=${scenario}`}` : "/cattle";
  const planHref = `/cattle/animals/${encodeURIComponent(tag)}/plan${scenario === "STANDARD" ? "" : `?scenario=${scenario}`}`;
  const weightKey = useMemo(() => (p.weight.state === "KNOWN" ? `${p.weight.observedAt}-${p.weight.kg}` : p.weight.state), [p.weight]);

  return (
    <article className={`mx-auto max-w-5xl pb-10 ${busyClass(pending, failed)}`} aria-labelledby="animal-title" aria-busy={pending}>
      <div className="flex items-center justify-between gap-3">
        <BackLink href={groupHref} label={p.identity.group.value ?? "Cattle"} />
        <ViewStatus pending={pending} failed={failed} />
      </div>

      {/* Identity */}
      <header className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-end">
        <PrimaryPhoto animalId={p.animalId} tag={tag} />
        <div className="min-w-0">
          <div className="text-[13px] font-medium uppercase tracking-[0.08em] text-fr-v2-plum">Animal</div>
          <h1 id="animal-title" className="font-display text-[56px] font-semibold leading-none tracking-tight text-fr-v2-graphite">
            {p.tag.value ?? <StateLabel state={p.tag.state} />}
          </h1>
          <p className="mt-2 text-[17px] text-fr-v2-charcoal">
            {[p.identity.breed, p.identity.sex, p.identity.age].map((f) => f.value ?? f.state.label).join(" · ")}
          </p>
          <p className="mt-0.5 text-[15px] text-fr-v2-muted">
            {p.identity.group.value ? p.identity.group.value : <StateLabel state={p.identity.group.state} />}
            {" · "}
            {p.identity.location.value ?? p.identity.location.state.label}
            {p.identity.location.housing.state === "KNOWN" && p.identity.location.housing.housed ? " (housed)" : ""}
          </p>
        </div>
      </header>

      <div className="mt-4">
        <DemoNotice />
      </div>


      {/* Current state */}
      <section aria-label="Current state" className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="col-span-2 sm:col-span-1">
          <Metric {...p.metrics.weight} emphasis flashKey={weightKey} />
        </div>
        <Metric {...p.metrics.gain} />
        <Metric {...p.metrics.cost} />
      </section>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <StateLabel state={p.performanceState} />
        {p.target.label ? <span className="text-sm text-fr-v2-muted">{p.target.label}{p.target.bandLabel ? ` (band ${p.target.bandLabel})` : ""}</span> : null}
        {p.performanceState.detail && p.target.label === null ? <span className="text-sm text-fr-v2-muted">{p.performanceState.detail}</span> : null}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="attention-h">
            <SectionHeading id="attention-h" title="What needs attention" />
            <div className="mt-4">
              <WorkPanel work={p.work} onRecordWeight={() => setSheet(true)} resolvedTitles={changes.resolved} />
              {p.work.open.state !== "KNOWN" || p.work.open.value.primary?.actionKind !== "RECORD_WEIGHT" ? (
                <button type="button" onClick={() => setSheet(true)} className="mt-4 min-h-11 rounded-[8px] border border-fr-v2-rule px-4 text-sm font-medium text-fr-v2-graphite">
                  Record a weight
                </button>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="performance-h">
            <SectionHeading
              id="performance-h"
              title="Performance"
              aside={
                <Link href={planHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-fr-v2-forest hover:underline">
                  View animal plan →
                </Link>
              }
            />
            <div className="mt-4">
              <PerformanceChart chart={p.chart} highlightIds={changes.points} />
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-fr-v2-muted">Over the period</dt>
                <dd className="text-fr-v2-graphite">{p.gain.periodLabel ?? <StateLabel state={p.gain.state} detail />}</dd>
              </div>
              <div>
                <dt className="text-fr-v2-muted">Most recent</dt>
                <dd className="text-fr-v2-graphite">{p.gain.recent.state === "UNAVAILABLE" ? <StateLabel state={p.gain.recent.display} detail /> : (p.gain.recent.value ?? "No interval worked out yet")}</dd>
              </div>
              <div>
                <dt className="text-fr-v2-muted">Goal</dt>
                <dd className="text-fr-v2-graphite">{p.goal.typeLabel ? `${p.goal.typeLabel}${p.goal.targetWeightLabel ? `, ${p.goal.targetWeightLabel}` : ""}${p.goal.targetDateLabel ? ` by ${p.goal.targetDateLabel}` : ""}` : <StateLabel state={p.goal.state} detail />}</dd>
              </div>
              <div>
                <dt className="text-fr-v2-muted">Projection</dt>
                <dd className="text-fr-v2-graphite">
                  {p.projection.label ? (
                    <>
                      <span className="text-fr-v2-cobalt">{p.projection.label}</span> <span className="text-fr-v2-muted">— prediction</span>
                    </>
                  ) : (
                    <StateLabel state={p.projection.state} detail />
                  )}
                </dd>
              </div>
            </dl>
            <Link href={planHref} className="mt-5 flex min-h-12 items-center justify-between rounded-[8px] bg-fr-v2-stone px-4 text-[15px] font-semibold text-fr-v2-forest">
              <span>Plan this animal to sale</span>
              <span aria-hidden>→</span>
            </Link>
          </section>

          <section aria-labelledby="activity-h">
            <SectionHeading id="activity-h" title="Recent activity" />
            <div className="mt-2">
              <TimelineSection entries={p.timeline} freshIds={changes.timeline} gaps={p.timelineGaps} />
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-8">
          <section aria-labelledby="health-h">
            <SectionHeading id="health-h" title="Health & compliance" />
            <div className="mt-1">
              <HealthSection health={p.health} />
            </div>
          </section>
          <section aria-labelledby="cost-h">
            <SectionHeading id="cost-h" title="Direct costs" />
            <div className="mt-1">
              <CostSection costs={p.costs} />
            </div>
          </section>
          <section aria-labelledby="photos-h">
            <SectionHeading id="photos-h" title="Photos" />
            <div className="mt-3">
              <PhotoGallery animalId={p.animalId} tag={tag} />
            </div>
          </section>
        </div>
      </div>

      <footer className="mt-10 border-t border-fr-v2-rule pt-4 text-[12px] text-fr-v2-muted">
        {p.asOf.label} · records received up to {p.asOf.knowledgeCutoff.slice(0, 16).replace("T", " ")} UTC · demonstration herd (synthetic data, real cattle engine)
      </footer>

      <RecordWeightSheet
        key={`${sheet}-${weightKey}`}
        open={sheet}
        onClose={() => setSheet(false)}
        tag={tag}
        previous={p.weight}
        asOfDate={p.asOf.effectiveAt.slice(0, 10)}
        onSave={(v) => {
          // A full session refuses the action: the sheet stays open with the reading, and says so.
          if (addEvent({ kind: "RECORD_WEIGHT", tag, kg: v.kg, observedDate: v.observedDate }) === null) return SESSION_FULL;
          setSheet(false);
          return null;
        }}
      />
    </article>
  );
}
