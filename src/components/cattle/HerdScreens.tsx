"use client";

/**
 * Cattle C10 — herd overview and group detail. A group is a C4 scope: its
 * members are listed, and any animal the scope couldn't place is shown as
 * unresolved rather than dropped. Group figures are counts of per-animal
 * states and per-animal jobs — there is no group-level work. A group whose
 * scope couldn't be resolved says so — it is never shown as "0 animals".
 */

import Link from "next/link";
import type { AnimalRowVM, GroupScopeVM, GroupVM, HerdVM } from "@/domain/cattle/presentation";
import type { CattleDemoScenario } from "@/server/cattle-demo/demo-replay";
import { loadCattleHerd } from "@/app/(app)/cattle/actions";
import { useCattleDemoSession } from "./session/CattleDemoSessionProvider";
import { useDemoView } from "./session/use-demo-view";
import { BackLink, DemoNotice, SectionHeading, ViewStatus, busyClass, StateGlyph, StateLabel, TONE_TEXT, cattleStyles } from "./ui";

const q = (scenario: CattleDemoScenario) => (scenario === "STANDARD" ? "" : `?scenario=${scenario}`);

function useHerd(initial: HerdVM, scenario: CattleDemoScenario): { herd: HerdVM; pending: boolean; failed: boolean } {
  const { view, pending, failed } = useDemoView(initial, `herd:${scenario}`, (session) => loadCattleHerd(session, scenario));
  return { herd: view, pending, failed };
}

function PlanningFailed({ codes }: { codes: readonly string[] }) {
  return (
    <div className={`mt-4 px-4 py-4 ${cattleStyles.hatch}`} role="status">
      <p className="font-semibold text-fr-v2-graphite">Cattle work couldn&apos;t be calculated.</p>
      <p className="mt-1 text-sm text-fr-v2-charcoal">A record couldn&apos;t be read, so the planning run stopped instead of guessing. Animals are still listed; jobs are not — that doesn&apos;t mean nothing needs doing.</p>
      <p className="mt-2 font-mono text-[11px] text-fr-v2-muted">{codes.slice(0, 3).join(" · ")}</p>
    </div>
  );
}

function ScopeUnavailable({ group }: { group: GroupVM }) {
  if (group.scope.state !== "UNAVAILABLE") return null;
  return (
    <div className={`mt-4 px-4 py-4 ${cattleStyles.hatch}`} role="status">
      <p className="font-semibold text-fr-v2-graphite">
        {group.name}: <StateLabel state={group.scope.display} />
      </p>
      <p className="mt-1 text-sm text-fr-v2-charcoal">{group.scope.display.detail}</p>
    </div>
  );
}

/** A group's work: the counts, the known-empty state (EMPTY) or why it's unknown (UNAVAILABLE) — never silence. */
function WorkCounts({ workCounts, className }: { workCounts: GroupVM["workCounts"]; className: string }) {
  if (workCounts.state !== "ITEMS") return <StateLabel state={workCounts.display} className={className} />;
  return <p className={`${className} text-[15px] text-fr-v2-harvest-ink`}>{workCounts.items.map((w) => w.label).join(" · ")}</p>;
}

function PerformanceStrip({ scope }: { scope: GroupScopeVM }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="Performance across the group">
      {scope.performanceCounts.map((c) => (
        <li key={c.state.code} className={`flex items-center gap-1.5 text-sm ${TONE_TEXT[c.state.tone]}`}>
          <StateGlyph tone={c.state.tone} />
          <span className="tabular-nums font-semibold">{c.count}</span> {c.state.label.toLowerCase()}
        </li>
      ))}
    </ul>
  );
}

function DemoControls({ scenario }: { scenario: CattleDemoScenario }) {
  const { session, reset } = useCattleDemoSession();
  return (
    <details className="mt-10 border-t border-fr-v2-rule pt-4 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-medium text-fr-v2-forest">Demonstration controls</summary>
      <div className="space-y-3 pb-2">
        <p className="text-fr-v2-muted">
          {session.events.length} action{session.events.length === 1 ? "" : "s"} in this session.{" "}
          <button type="button" onClick={reset} className="min-h-11 font-medium text-fr-v2-forest underline">
            Start again
          </button>
        </p>
        <p className="text-fr-v2-muted">Edge-state scenarios (synthetic):</p>
        <ul className="flex flex-wrap gap-2">
          {(
            [
              ["STANDARD", "Standard herd"],
              ["PLANNING_RUN_FAILURE", "A malformed record (whole run fails closed)"],
              ["EMPTY_HERD", "No animals"],
            ] as const
          ).map(([s, label]) => (
            <li key={s}>
              <Link href={`/cattle${q(s)}`} aria-current={s === scenario ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-[8px] border px-3 ${s === scenario ? "border-fr-v2-forest text-fr-v2-forest" : "border-fr-v2-rule text-fr-v2-graphite"}`}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export function HerdScreen({ initial, scenario }: { initial: HerdVM; scenario: CattleDemoScenario }) {
  const { herd, pending, failed } = useHerd(initial, scenario);
  return (
    <div className={`mx-auto max-w-4xl pb-10 ${busyClass(pending, failed)}`} aria-busy={pending}>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-[40px] font-semibold leading-none tracking-tight text-fr-v2-graphite">Cattle</h1>
        <ViewStatus pending={pending} failed={failed} idle={<span className="text-[13px] text-fr-v2-muted">{herd.asOfLabel}</span>} />
      </div>
      <p className="mt-2 text-[15px] text-fr-v2-charcoal">
        {herd.summary}
      </p>
      <div className="mt-4">
        <DemoNotice />
      </div>
      {herd.planning.state === "PLANNING_FAILED" ? <PlanningFailed codes={herd.planning.failureCodes} /> : null}
      {herd.overview.state !== "ITEMS" ? (
        <p className="mt-8 text-[15px] text-fr-v2-charcoal" data-herd-state={herd.overview.state}>
          {herd.overview.display.detail ?? herd.overview.display.label}
        </p>
      ) : (
        <ul className="mt-6">
          {herd.overview.items.map((g) => (
            <li key={g.groupRef} className="border-t border-fr-v2-rule">
              <Link href={`/cattle/groups/${encodeURIComponent(g.groupRef)}${q(scenario)}`} className="group block py-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[24px] font-semibold tracking-tight text-fr-v2-graphite group-hover:text-fr-v2-forest">{g.name}</span>
                  {g.scope.state === "KNOWN" ? (
                    <span className="text-sm text-fr-v2-muted">{g.scope.value.summary}</span>
                  ) : (
                    <StateLabel state={g.scope.display} />
                  )}
                </div>
                {g.scope.state === "KNOWN" ? <WorkCounts workCounts={g.workCounts} className="mt-1.5 block" /> : null}
                {g.scope.state === "KNOWN" ? (
                  <>
                    <PerformanceStrip scope={g.scope.value} />
                    {g.scope.value.unresolvedNote ? <p className="mt-2 text-sm text-fr-v2-clay">{g.scope.value.unresolvedNote}</p> : null}
                  </>
                ) : (
                  <p className="mt-1.5 text-sm text-fr-v2-charcoal">{g.scope.display.detail}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <DemoControls scenario={scenario} />
    </div>
  );
}

function AnimalRow({ a, scenario }: { a: AnimalRowVM; scenario: CattleDemoScenario }) {
  return (
    <li className="border-t border-fr-v2-rule">
      <Link href={`/cattle/animals/${encodeURIComponent(a.tag ?? a.animalId)}${q(scenario)}`} className="grid min-h-[72px] grid-cols-[minmax(64px,auto)_1fr_auto] items-center gap-x-4 py-3 hover:bg-fr-v2-stone/50">
        <span className="font-display text-[28px] font-semibold leading-none tabular-nums text-fr-v2-graphite">{a.tag ?? <StateLabel state={a.tagState} />}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm text-fr-v2-muted">{a.subtitle}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <StateLabel state={a.performance} />
            {a.nextWork.state === "UNAVAILABLE" ? (
              <StateLabel state={a.nextWork.display} />
            ) : a.nextWork.state === "JOB" ? (
              <span className={`text-sm ${TONE_TEXT[a.nextWork.tone]}`}>{a.nextWork.title}</span>
            ) : null}
          </span>
        </span>
        <span className="text-right">
          {a.weightLabel ? (
            <>
              <span className="block text-[17px] font-semibold tabular-nums text-fr-v2-graphite">{a.weightLabel}</span>
              <span className="block text-[12px] text-fr-v2-muted">{a.weightDate}</span>
            </>
          ) : (
            <StateLabel state={a.weightState} />
          )}
        </span>
      </Link>
    </li>
  );
}

export function GroupScreen({ initial, groupRef, scenario }: { initial: HerdVM; groupRef: string; scenario: CattleDemoScenario }) {
  const { herd, pending, failed } = useHerd(initial, scenario);
  const g = herd.groups.state === "ITEMS" ? herd.groups.items.find((x) => x.groupRef === groupRef) : undefined;
  if (!g) {
    return (
      <div className="mx-auto max-w-4xl">
        <BackLink href={`/cattle${q(scenario)}`} label="Cattle" />
        <p className="mt-4 text-fr-v2-charcoal">This group isn&apos;t in the herd.</p>
      </div>
    );
  }
  return (
    <div className={`mx-auto max-w-4xl pb-10 ${busyClass(pending, failed)}`} aria-busy={pending}>
      <div className="flex items-center justify-between">
        <BackLink href={`/cattle${q(scenario)}`} label="Cattle" />
        <ViewStatus pending={pending} failed={failed} />
      </div>
      <div className="mt-1 text-[13px] font-medium uppercase tracking-[0.08em] text-fr-v2-plum">Group</div>
      <h1 className="font-display text-[44px] font-semibold leading-none tracking-tight text-fr-v2-graphite">{g.name}</h1>
      <p className="mt-2 text-[15px] text-fr-v2-charcoal">
        {g.scope.state === "KNOWN" ? g.scope.value.summary : <StateLabel state={g.scope.display} />}
      </p>
      <div className="mt-4">
        <DemoNotice />
      </div>
      {herd.planning.state === "PLANNING_FAILED" ? <PlanningFailed codes={herd.planning.failureCodes} /> : null}
      <ScopeUnavailable group={g} />
      {g.scope.state === "KNOWN" ? <GroupMembers scope={g.scope.value} workCounts={g.workCounts} scenario={scenario} /> : null}
    </div>
  );
}

function GroupMembers({ scope, workCounts, scenario }: { scope: GroupScopeVM; workCounts: GroupVM["workCounts"]; scenario: CattleDemoScenario }) {
  return (
    <>
      <section aria-labelledby="group-work" className="mt-6">
        <SectionHeading id="group-work" title="Across the group" />
        {workCounts.state === "ITEMS" ? (
          <>
            <ul className="mt-3 space-y-1">
              {workCounts.items.map((w) => (
                <li key={w.label} className="text-[17px] text-fr-v2-graphite">
                  {w.label}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-fr-v2-muted">Counted from each animal&apos;s own jobs — the work stays per animal.</p>
          </>
        ) : (
          <WorkCounts workCounts={workCounts} className="mt-3 block" />
        )}
        <PerformanceStrip scope={scope} />
      </section>
      <section aria-labelledby="group-animals" className="mt-8">
        <SectionHeading id="group-animals" title="Animals" />
        {scope.members.state === "ITEMS" ? (
          <ul className="mt-1">
            {scope.members.items.map((a) => (
              <AnimalRow key={a.animalId} a={a} scenario={scenario} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[15px] text-fr-v2-charcoal">{scope.members.display.label}.</p>
        )}
      </section>
      {scope.unresolved.length > 0 ? (
        <section aria-labelledby="group-unresolved" className="mt-8">
          <SectionHeading id="group-unresolved" title="Group not resolved" />
          <p className="mt-2 text-sm text-fr-v2-charcoal">These animals&apos; group records disagree or are missing, so they aren&apos;t counted in this group. Fix the group record to resolve them.</p>
          <ul className="mt-1">
            {scope.unresolved.map((a) => (
              <li key={a.animalId}>
                <div className="flex items-center justify-between gap-3 border-t border-fr-v2-rule py-2">
                  <StateLabel state={a.membership} />
                </div>
                <ul>
                  <AnimalRow a={a} scenario={scenario} />
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
