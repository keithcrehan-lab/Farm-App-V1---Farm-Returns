"use client";

/**
 * Cattle continuity — the signed-in farmer's Cattle home and group pages
 * (docs/design/cattle-home-continuity-reference.html). The group is the
 * object: a dark forest surface with a thin gold edge, entered as a whole;
 * inside it, the group stays the working object and its individually recorded
 * animals open the Living Animal Record by database id.
 *
 * Every value and every absence statement is the server view
 * (`src/server/cattle-real/herd-continuity.ts`): recorded headcounts, the
 * frozen engines' weights and work, D16-gated wording. Caveats sit one
 * interaction away ("About records", "Quick view"), never as a banner.
 */

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import type { RealHerdView } from "@/server/cattle-real/real-service";
import { CattleGroupWorkspace } from "./CattleGroupWorkspace";
import type { CattleContinuityVM, ContinuityAnimalVM, ContinuityGroupVM } from "@/server/cattle-real/herd-continuity";
import {
  cattleGroupLocationLine,
  cattleGroupOperationsFor,
  type Details,
  type DisplayTone,
} from "@/domain/cattle/presentation";
import { StateLabel, TONE_TEXT } from "../ui";
import s from "./continuity.module.css";

/** Real mode: the animal's database id (D2) — a tag is a label, never a lookup key. */
const REAL_LINKS = {
  herd: "/cattle",
  group: (groupRef: string) => `/cattle/groups/${encodeURIComponent(groupRef)}`,
  animal: (animalId: string) => `/cattle/animals/${encodeURIComponent(animalId)}`,
} as const;

/** Pilot Integration P3 (D14) — where new groups and animals are added; existing groups are edited in their workspace. */
const REAL_MANAGE = { herd: "/cattle/manage" } as const;

const workTone = (tone: DisplayTone) => (tone === "neutral" || tone === "good" ? "" : TONE_TEXT[tone]);

function AboutRecords({ about, asOf, align = "right" }: { about: Details<string>; asOf: string; align?: "right" | "left" }) {
  return (
    <details className="group relative">
      <summary className={s.pill}>About records</summary>
      <div className={`${s.aboutPanel} z-20 mt-2 w-full p-4 text-[13px] leading-relaxed sm:absolute sm:w-[min(380px,calc(100vw-48px))] ${align === "right" ? "sm:right-0" : "sm:left-0"}`}>
        <ul className="space-y-2">
          {about.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className={`${s.mono} mt-3 text-[11px] text-[var(--cc-muted)]`}>{asOf}</p>
      </div>
    </details>
  );
}

function PlanningFailed({ planning }: { planning: CattleContinuityVM["planning"] }) {
  if (planning.state !== "FAILED") return null;
  return (
    <div className="mb-4 rounded-[14px] border border-[var(--cc-rule)] bg-[var(--cc-paper)] px-4 py-3" role="status">
      <p className="font-semibold">{planning.label}</p>
      <p className="mt-1 text-sm text-[var(--cc-muted)]">{planning.detail}</p>
      <p className={`${s.mono} mt-2 text-[11px] text-[var(--cc-muted)]`}>{planning.codes.join(" · ")}</p>
    </div>
  );
}

function GroupObject({ g, locationLine }: { g: ContinuityGroupVM; locationLine: string }) {
  const [quick, setQuick] = useState(false);
  const id = useId();
  const lw = g.latestWeight;
  return (
    <div>
      <article className={s.object} aria-labelledby={`${id}-name`} data-group-object={g.groupRef}>
        <div className={s.inner}>
          <div className={s.objectGrid}>
            <div className="min-w-0">
              <div className={s.eyebrow}>Cattle group</div>
              <h2 id={`${id}-name`} className={`font-display ${s.groupTitle} mt-2 break-words`}>
                {g.name}
              </h2>
              <p className={`mt-2 text-sm ${s.onForestMuted}`} data-headcount-group={g.groupRef}>
                {g.composition}
              </p>
              <p className={`mt-2 text-[13px] ${s.onForestMuted}`}>{locationLine}</p>
            </div>
            <div className={`${s.count} ${s.mono}`}>
              <strong>{g.headline.value}</strong>
              <span>{g.headline.unit}</span>
            </div>
          </div>
          <div className={s.divider} />
          <div className={s.metrics}>
            <div>
              <div className={s.mlabel}>Individual records</div>
              <div className={`${s.mvalue} ${s.mono}`}>{g.individuals.value}</div>
              <div className={s.msub}>{g.individuals.unit}</div>
            </div>
            <div>
              <div className={s.mlabel}>{lw.label}</div>
              <div className={`${s.mvalue} ${s.mono}`}>{lw.value}</div>
              {lw.state === "KNOWN" ? <div className={`${s.msub} ${s.mono}`}>{`${lw.unit} · ${lw.date}`}</div> : <div className={s.msub}>{lw.detail}</div>}
            </div>
            <div>
              <div className={s.mlabel}>Supported work</div>
              <div className={s.status}>{g.work.label}</div>
              <div className={s.msub}>{g.work.detail}</div>
            </div>
          </div>
          <div className="mt-[22px] flex flex-wrap gap-2.5">
            <Link href={REAL_LINKS.group(g.groupRef)} className={`${s.primary} ${s.stretch}`}>
              Open {g.name}
            </Link>
            <button type="button" className={`${s.secondary} ${s.above}`} aria-expanded={quick} aria-controls={`${id}-quick`} onClick={() => setQuick((q) => !q)}>
              Quick view
            </button>
          </div>
        </div>
      </article>
      <dl id={`${id}-quick`} hidden={!quick} className={`${s.quick} mt-[18px] py-4`}>
        {g.context.map((f) => (
          <div key={f.label}>
            <dt className={s.quietLabel}>{f.label}</dt>
            <dd className={`${s.quietValue} ${f.technical ? s.mono : ""}`}>{f.value}</dd>
            <dd className="mt-0.5 text-[12px] text-[var(--cc-muted)]">{f.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AnimalRow({ a }: { a: ContinuityAnimalVM }) {
  const r = a.row;
  return (
    <li>
      <Link href={REAL_LINKS.animal(r.animalId)} className={s.animalRow}>
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <b className={`font-display font-normal ${s.animalName}`}>{r.tag ?? <StateLabel state={r.tagState} />}</b>
            <span className={s.animalMeta}>{r.subtitle}</span>
          </span>
          <span className={`${s.workLine} block ${workTone(a.work.tone)}`}>{a.work.label}</span>
        </span>
        <span>
          {r.weightLabel ? (
            <>
              <span className={`${s.weight} ${s.mono} block`}>{r.weightLabel}</span>
              <span className={`${s.date} ${s.mono} block`}>{r.weightDate}</span>
            </>
          ) : (
            <StateLabel state={r.weightState} />
          )}
        </span>
      </Link>
    </li>
  );
}

function HerdMetric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-[var(--cc-paper)] px-4 py-4">
      <p className={s.quietLabel}>{label}</p>
      <p className={`mt-2 font-display text-[27px] leading-none text-[var(--cc-ink)] ${s.mono}`}>{value}</p>
      <p className="mt-1 text-[10.5px] text-[var(--cc-muted)]">{unit}</p>
    </div>
  );
}

/** Pilot Integration P1 — the signed-in farmer's herd (read-only, server-rendered data; no demonstration session). */
export function RealHerdScreen({ view }: { view: RealHerdView }) {
  const c = view.continuity;
  const x = view.extras;
  return (
    <div className={`${s.root} -mx-4 -mt-4 min-h-screen pb-10 lg:mx-0 lg:mt-0`} data-farm-workspace data-cattle-mode="REAL">
      <header className={`${s.top} flex flex-col gap-4 px-5 pb-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-7`}>
        <div className="min-w-0">
          <div className={s.eyebrow}>Farm Return · Cattle</div>
          <h1 className={`font-display ${s.title} mt-2`}>Cattle</h1>
          <p className="mt-3 text-[15px] text-[var(--cc-muted)]" data-herd-headline>
            <b className={`${s.mono} text-[var(--cc-ink)]`}>{c.headline.value}</b> {c.headline.unit} · <b className={`${s.mono} text-[var(--cc-ink)]`}>{c.groupsCount.value}</b> {c.groupsCount.unit}
          </p>
          {c.headlineNote ? <p className="mt-1 max-w-[52ch] text-[12px] text-[var(--cc-muted)]">{c.headlineNote}</p> : null}
        </div>
        <AboutRecords about={c.about} asOf={c.asOfLabel} />
      </header>

      <div className="px-4 pb-8 pt-6 lg:px-8">
        <section className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[var(--cc-rule)] bg-[var(--cc-rule)] lg:grid-cols-5" aria-label="Herd status">
          <HerdMetric label="Cattle" value={c.headline.value} unit={c.headline.unit} />
          <HerdMetric label="Groups" value={c.groupsCount.value} unit={c.groupsCount.unit} />
          <HerdMetric
            label={view.operations.fieldsOccupied.label}
            value={view.operations.fieldsOccupied.value ?? view.operations.fieldsOccupied.state.label}
            unit={view.operations.fieldsOccupied.unit ?? view.operations.fieldsOccupied.caption ?? view.operations.fieldsOccupied.state.detail ?? view.operations.fieldsOccupied.state.label}
          />
          <HerdMetric label="Individually tracked" value={String(view.herd.animalCount)} unit={view.herd.animalCount === 1 ? "animal" : "animals"} />
          <HerdMetric
            label="Open jobs"
            value={view.herd.openWorkCount.state === "KNOWN" ? String(view.herd.openWorkCount.value) : "—"}
            unit={view.herd.openWorkCount.state === "KNOWN" ? "supported" : "not checked"}
          />
        </section>

        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className={s.quietLabel}>Living herd</div>
            <p className="mt-1 text-[14px] text-[var(--cc-muted)]">{c.intro}</p>
          </div>
          <Link href={REAL_MANAGE.herd} className={s.manage} aria-label="Add cattle: a new group or an individual animal">
            Add cattle
          </Link>
        </div>

        <PlanningFailed planning={c.planning} />

        {c.groups.state === "ITEMS" ? (
          <ul className="space-y-3" aria-label="Cattle groups">
            {c.groups.items.map((g) => (
              <li key={g.groupRef}>
                <GroupObject g={g} locationLine={cattleGroupLocationLine(view.operations, g.groupRef)} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-t border-[var(--cc-rule)] pt-5" data-herd-state={c.groups.state}>
            <p className="font-display text-[24px]">{c.groups.display.label}</p>
            {c.groups.display.detail ? <p className="mt-1 text-[14px] text-[var(--cc-muted)]">{c.groups.display.detail}</p> : null}
          </div>
        )}

        {c.ungrouped.length > 0 ? (
          <section aria-labelledby="herd-ungrouped" className="mt-10">
            <h2 id="herd-ungrouped" className={s.quietLabel}>
              Not in a group
            </h2>
            <ul className="mt-3">
              {c.ungrouped.map((a) => (
                <AnimalRow key={a.row.animalId} a={a} />
              ))}
            </ul>
          </section>
        ) : null}

        {x.unreadable.length > 0 ? (
          <section aria-labelledby="herd-unreadable" className="mt-10">
            <h2 id="herd-unreadable" className={s.quietLabel}>
              Records that can&apos;t be read
            </h2>
            <ul className="mt-3 space-y-1 text-sm">
              {x.unreadable.map((u) => (
                <li key={u.animalId}>{u.label}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className={`${s.support} ${s.mono} mt-8`}>{c.asOfLabel}</p>
      </div>
    </div>
  );
}

/**
 * Pilot Integration P1 — one of the signed-in farmer's groups. The route has already checked the group is this
 * farm's. A group with no individually recorded animal shows its headcount (or why it can't) — never "0 animals".
 * `editor` is the route's "Edit group details" control for the group's own record, shown in the group's workspace.
 */
export function RealGroupScreen({ view, groupRef, editor }: { view: RealHerdView; groupRef: string; editor?: ReactNode }) {
  const c = view.continuity;
  const g = c.groups.state === "ITEMS" ? c.groups.items.find((x) => x.groupRef === groupRef) : undefined;
  if (!g) {
    return (
      <div className="mx-auto max-w-4xl">
        <Link href={REAL_LINKS.herd} className={s.back}>
          ← Cattle
        </Link>
        <p className="mt-4">This group isn&apos;t in the herd.</p>
      </div>
    );
  }
  return (
    <div className={`${s.root} -mx-4 -mt-4 min-h-screen pb-10 lg:mx-0 lg:mt-0`} data-farm-workspace data-cattle-mode="REAL">
      <div className="px-4 pb-8 pt-3 lg:px-8 lg:pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Link href={REAL_LINKS.herd} className={s.back}>
            ← Cattle
          </Link>
          {editor}
        </div>

        <section className={s.groupHeader} aria-labelledby="group-title">
          <div className="min-w-0">
            <div className={s.eyebrow}>Cattle group</div>
            <h1 id="group-title" className="font-display mt-2 break-words">
              {g.name}
            </h1>
            <p className={`mt-3 text-[15px] ${s.onForestMuted}`} data-headcount-group={g.groupRef}>
              {g.composition}
            </p>
          </div>
          <div className={`${s.count} ${s.mono}`}>
            <strong>{g.headline.value}</strong>
            <span>{g.headline.unit}</span>
          </div>
        </section>

        <div className="mt-6">
          <PlanningFailed planning={c.planning} />
        </div>

        <CattleGroupWorkspace
          vm={cattleGroupOperationsFor(view.operations, g.groupRef)}
          asOfDate={view.herd.viewpoint.effectiveAt.slice(0, 10)}
          workLabel={g.work.label}
          workDetail={g.work.detail}
        />

        <div className={`${s.detailGrid} mt-8`}>
          <section id="group-animals" aria-labelledby="group-animals-heading" className="min-w-0 scroll-mt-24">
            <h2 id="group-animals-heading" className={s.quietLabel}>
              Individual animals
            </h2>
            <p className="mt-2 text-[14px] text-[var(--cc-muted)]">{g.membersIntro}</p>
            {g.members.state === "ITEMS" ? (
              <details className="mt-3 rounded-xl border border-[var(--cc-rule)] bg-white/70 px-4 py-3">
                <summary className="min-h-10 cursor-pointer text-sm font-semibold text-[var(--cc-ink)]">View individual cattle ({g.members.items.length})</summary>
                <ul className="mt-3">
                {g.members.items.map((a) => (
                  <AnimalRow key={a.row.animalId} a={a} />
                ))}
                </ul>
              </details>
            ) : (
              <div className="mt-3 border-t border-[var(--cc-rule)] pt-4">
                <StateLabel state={g.members.display} />
              </div>
            )}
            {g.unresolved.length > 0 ? (
              <section aria-labelledby="group-unresolved" className="mt-8">
                <h3 id="group-unresolved" className={s.quietLabel}>
                  Group not resolved
                </h3>
                <p className="mt-2 text-sm text-[var(--cc-muted)]">These animals&apos; group records disagree or are missing, so they aren&apos;t counted in this group. Fix the group record to resolve them.</p>
                <ul className="mt-2">
                  {g.unresolved.map((a) => (
                    <li key={a.row.animalId}>
                      <StateLabel state={a.row.membership} className="pt-3" />
                      <ul>
                        <AnimalRow a={a} />
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>

          <aside className={s.aside} aria-labelledby="group-context">
            <details className="rounded-xl border border-[var(--cc-rule)] px-4 py-3">
              <summary className="min-h-10 cursor-pointer text-sm font-semibold text-[var(--cc-ink)]">Records &amp; background</summary>
            <h2 id="group-context" className={s.quietLabel}>
              Group context
            </h2>
            <dl className="mb-5">
              <div>
                <dt>Supported work</dt>
                <dd className={workTone(g.work.tone)}>
                  {g.work.label}
                  <span>{g.work.detail}</span>
                </dd>
              </div>
              {g.context.filter((f) => f.label.toLowerCase() !== "location").map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd className={f.technical ? s.mono : ""}>
                    {f.value}
                    <span>{f.detail}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <AboutRecords about={c.about} asOf={c.asOfLabel} align="left" />
            </details>
          </aside>
        </div>
      </div>
    </div>
  );
}
