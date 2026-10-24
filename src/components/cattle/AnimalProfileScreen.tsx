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
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { AnimalProfileVM, PerformanceExplanationVM } from "@/domain/cattle/presentation";
import type { DemoAnimalView } from "@/server/cattle-demo/demo-service";
import type { CattleDemoScenario } from "@/server/cattle-demo/demo-replay";
import type { RealAnimalView } from "@/server/cattle-real/real-service";
import { loadCattleAnimal } from "@/app/(app)/cattle/actions";
import { recordRealCattleWeight } from "@/app/(app)/cattle/real-actions";
import { CostSection, HealthSection, TimelineSection } from "./AnimalSections";
import { PerformanceChart } from "./PerformanceChart";
import { PhotoGallery, PrimaryPhoto } from "./photos/AnimalPhotos";
import { RecordWeightSheet } from "./RecordWeightSheet";
import { useCattleDemoSession } from "./session/CattleDemoSessionProvider";
import { useDemoView } from "./session/use-demo-view";
import { BackLink, DemoNotice, Disclosure, RealNotice, Metric, SectionHeading, StateLabel, ViewStatus, busyClass } from "./ui";
import { WorkPanel } from "./WorkPanel";

const SESSION_FULL = "This demonstration session is full, so the weight wasn't recorded. Reset the demo on the Cattle page to continue.";

/** "Why this result?" (F020): the performance verdict's explanation, beside it — independent of any Plan job. */
function PerformanceExplanation({ e }: { e: PerformanceExplanationVM }) {
  return (
    <Disclosure label={e.heading}>
      <div className="space-y-3 border-l-2 border-fr-v2-rule pl-4 text-sm text-fr-v2-charcoal">
        <p>{e.result}</p>
        {e.targets.map((t) => (
          <div key={t.targetId}>
            <div className="font-medium">{t.title}</div>
            <ul className="mt-1 space-y-0.5 text-fr-v2-muted">
              {t.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ))}
        {e.projection.length > 0 ? (
          <div>
            <div className="font-medium">Projection</div>
            <ul className="mt-1 space-y-0.5 text-fr-v2-muted">
              {e.projection.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {e.assumptions.length > 0 || e.limitations.length > 0 ? (
          <div>
            <div className="font-medium">Assumptions and limits</div>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-fr-v2-muted">
              {e.assumptions.map((a) => (
                <li key={`a:${a}`}>Assumption: {a}</li>
              ))}
              {e.limitations.map((l) => (
                <li key={`l:${l}`}>{l}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Disclosure>
  );
}

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
      // What changed between two renders (animation only): ids that appeared, jobs that closed.
      const chartIds = (c: typeof before.chart) => (c.state === "CHART" || c.state === "NOT_CHARTABLE" ? c.points.flatMap((x) => x.recordIds) : []);
      const oldIds = new Set(chartIds(before.chart));
      const openBefore = new Set(before.work.open.state === "ITEMS" ? [before.work.open.primary, ...before.work.open.others].map((w) => w.jobId) : []);
      const timelineIds = (t: typeof before.timeline) => (t.state === "ITEMS" ? t.items.map((e) => e.id) : []);
      const oldTimeline = new Set(timelineIds(before.timeline));
      setChanges({
        points: chartIds(after.chart).filter((id) => !oldIds.has(id)),
        resolved: after.work.closed.filter((c) => openBefore.has(c.jobId)).map((c) => c.title),
        timeline: new Set(timelineIds(after.timeline).filter((id) => !oldTimeline.has(id))),
      });
    }
  }

  const p = view.profile;
  const sq = scenario === "STANDARD" ? "" : `?scenario=${scenario}`;
  const groupHref = p.identity.group.groupRef ? `/cattle/groups/${encodeURIComponent(p.identity.group.groupRef)}${sq}` : "/cattle";
  const planHref = `/cattle/animals/${encodeURIComponent(tag)}/plan${sq}`;
  const weightKey = useMemo(() => (p.weight.state === "KNOWN" ? `${p.weight.observedAt}-${p.weight.kg}` : p.weight.state), [p.weight]);

  return (
    <ProfileBody
      p={p}
      pending={pending}
      failed={failed}
      groupHref={groupHref}
      changes={changes}
      weightKey={weightKey}
      notice={<DemoNotice />}
      photo={<PrimaryPhoto animalId={p.animalId} tag={tag} />}
      photos={<PhotoGallery animalId={p.animalId} tag={tag} />}
      onRecordWeight={() => setSheet(true)}
      planLinks={{
        aside: (
          <Link href={planHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-fr-v2-forest hover:underline">
            View animal plan →
          </Link>
        ),
        main: (
          <Link href={planHref} className="mt-5 flex min-h-12 items-center justify-between rounded-[8px] bg-fr-v2-stone px-4 text-[15px] font-semibold text-fr-v2-forest">
            <span>Plan this animal to sale</span>
            <span aria-hidden>→</span>
          </Link>
        ),
      }}
      footerSource="demonstration herd (synthetic data, real cattle engine)"
      notes={null}
    >
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
    </ProfileBody>
  );
}

/**
 * Pilot Integration P1 — the signed-in farmer's animal (read-only, server-rendered). No demonstration session, no
 * Record Weight, plan, goal or photo controls (P1 persists nothing); the parts Farm Return keeps no record of say so.
 */
export function RealAnimalProfileScreen({ view }: { view: RealAnimalView }) {
  const p = view.profile;
  const n = view.notes;
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  // One submission id per opening of the sheet: a double press, a network retry or an action retry of the same
  // weight sends the same id, so the server returns the row it already wrote instead of writing a second (D13).
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const openSheet = () => {
    setRequestId(crypto.randomUUID());
    setSaved(null);
    setSheet(true);
  };
  return (
    <ProfileBody
      p={p}
      pending={false}
      failed={false}
      groupHref={p.identity.group.groupRef ? `/cattle/groups/${encodeURIComponent(p.identity.group.groupRef)}` : "/cattle"}
      changes={NO_CHANGES}
      weightKey={p.weight.state}
      notice={<RealNotice lines={[n.readOnly, n.method]} />}
      photo={null}
      photos={null}
      onRecordWeight={openSheet}
      planLinks={{ aside: null, main: <p className="mt-5 text-sm text-fr-v2-muted" data-real-plan="UNAVAILABLE">{n.plan}</p> }}
      footerSource="your farm's records"
      notes={{ goal: n.goal, health: n.health, costs: n.costs, work: n.work }}
    >
      {saved ? (
        <p className="mt-4 text-sm text-fr-v2-forest" role="status">
          {saved}
        </p>
      ) : null}
      {requestId ? (
        <RecordWeightSheet
          key={requestId}
          open={sheet}
          onClose={() => setSheet(false)}
          tag={p.tag.value ?? p.tag.state.label}
          previous={p.weight}
          asOfDate={view.recordWeight.today}
          copy={view.recordWeight.copy}
          onSave={async (v) => {
            // The sheet's exact reading as text; the server re-reads and validates it (it trusts nothing sent here).
            const r = await recordRealCattleWeight({ requestId, animalId: p.animalId, weightText: String(v.kg), observedDate: v.observedDate });
            if (!r.ok) return r.message;
            setSheet(false);
            setSaved(`Weight saved. Showing your records as they are now.`);
            // Re-render from Supabase: the frozen engines recompute the profile from the stored rows.
            router.refresh();
            return null;
          }}
        />
      ) : null}
    </ProfileBody>
  );
}

const NO_CHANGES = { points: [], resolved: [], timeline: new Set<string>() };

function ProfileBody({
  p,
  pending,
  failed,
  groupHref,
  changes,
  weightKey,
  notice,
  photo,
  photos,
  onRecordWeight,
  planLinks,
  footerSource,
  notes,
  children,
}: {
  p: AnimalProfileVM;
  pending: boolean;
  failed: boolean;
  groupHref: string;
  changes: { points: string[]; resolved: string[]; timeline: Set<string> };
  weightKey: string;
  notice: React.ReactNode;
  photo: React.ReactNode;
  photos: React.ReactNode;
  onRecordWeight: (() => void) | null;
  planLinks: { aside: React.ReactNode; main: React.ReactNode };
  footerSource: string;
  notes: { goal: string; health: string; costs: string; work: string } | null;
  children: React.ReactNode;
}) {
  return (
    <article className={`mx-auto max-w-5xl pb-10 ${busyClass(pending, failed)}`} aria-labelledby="animal-title" aria-busy={pending}>
      <div className="flex items-center justify-between gap-3">
        <BackLink href={groupHref} label={p.identity.group.backLabel} />
        <ViewStatus pending={pending} failed={failed} />
      </div>

      {/* Identity */}
      <header className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-end">
        {photo}
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
            {p.identity.location.housingNote ? ` ${p.identity.location.housingNote}` : null}
          </p>
        </div>
      </header>

      <div className="mt-4">{notice}</div>


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
        {p.target.label ? <span className="text-sm text-fr-v2-muted">{p.target.label}</span> : null}
        {p.performanceState.detail && p.target.label === null ? <span className="text-sm text-fr-v2-muted">{p.performanceState.detail}</span> : null}
      </div>
      <PerformanceExplanation e={p.performanceExplanation} />
      {p.target.summary !== null ? (
        <div className="mt-2">
          <p className="text-sm text-fr-v2-charcoal">{p.target.summary}</p>
          <ul className="mt-1 space-y-1" aria-label="Target comparisons">
            {p.target.comparisons.map((c) => (
              <li key={c.targetId} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="text-fr-v2-graphite">{c.label}</span>
                <StateLabel state={c.state} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="attention-h">
            <SectionHeading id="attention-h" title="What needs attention" />
            <div className="mt-4">
              <WorkPanel work={p.work} onRecordWeight={onRecordWeight} resolvedTitles={changes.resolved} />
              {notes ? <p className="mt-3 text-[12px] text-fr-v2-muted">{notes.work}</p> : null}
              {onRecordWeight && (p.work.open.state !== "ITEMS" || p.work.open.primary.actionKind !== "RECORD_WEIGHT") ? (
                <button type="button" onClick={onRecordWeight} className="mt-4 min-h-11 rounded-[8px] border border-fr-v2-rule px-4 text-sm font-medium text-fr-v2-graphite">
                  Record a weight
                </button>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="performance-h">
            <SectionHeading
              id="performance-h"
              title="Performance"
              aside={planLinks.aside}
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
                <dd className="text-fr-v2-graphite">{p.gain.recent.value ?? <StateLabel state={p.gain.recent.state} detail />}</dd>
              </div>
              <div>
                <dt className="text-fr-v2-muted">Goal</dt>
                <dd className="text-fr-v2-graphite">
                  {p.goal.summary.state === "TEXT" ? p.goal.summary.text : <StateLabel state={p.goal.summary.display} detail />}
                  {notes ? <span className="mt-1 block text-[12px] text-fr-v2-muted">{notes.goal}</span> : null}
                </dd>
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
            {planLinks.main}
          </section>

          <section aria-labelledby="activity-h">
            <SectionHeading id="activity-h" title="Recent activity" />
            <div className="mt-2">
              <TimelineSection timeline={p.timeline} freshIds={changes.timeline} gapNote={p.timelineGapNote} />
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-8">
          <section aria-labelledby="health-h">
            <SectionHeading id="health-h" title="Health & compliance" />
            <div className="mt-1">
              <HealthSection health={p.health} />
              {notes ? <p className="mt-2 text-[12px] text-fr-v2-muted">{notes.health}</p> : null}
            </div>
          </section>
          <section aria-labelledby="cost-h">
            <SectionHeading id="cost-h" title="Direct costs" />
            <div className="mt-1">
              <CostSection costs={p.costs} />
              {notes ? <p className="mt-2 text-[12px] text-fr-v2-muted">{notes.costs}</p> : null}
            </div>
          </section>
          {photos ? (
            <section aria-labelledby="photos-h">
              <SectionHeading id="photos-h" title="Photos" />
              <div className="mt-3">{photos}</div>
            </section>
          ) : null}
        </div>
      </div>

      <footer className="mt-10 border-t border-fr-v2-rule pt-4 text-[12px] text-fr-v2-muted">
        {p.asOf.label} · records received up to {p.asOf.knowledgeCutoff.slice(0, 16).replace("T", " ")} UTC · {footerSource}
      </footer>

      {children}
    </article>
  );
}
