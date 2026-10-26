"use client";

/**
 * Living Animal Record — the signed-in farmer's individual animal (docs/design/cattle-animal-living-record-reference.html).
 * The animal is the persistent object (portrait, identity, current measurement); five chapters — Overview, Growth,
 * Health, Plan, History — change the lens on its record beneath it. A quieter context rail sits beside the lens on
 * desktop and can recede.
 *
 * Every value is the server view: the C10 profile the frozen engines produced from the farm's own rows, and the
 * real service's D16-gated statements (`record`) about what Farm Return does and doesn't hold. Nothing here infers
 * a health, goal, location, value or compliance state from a missing record.
 *
 * Record Weight is the one write: the existing signed-in server action (`recordRealCattleWeight` — farm resolved
 * server-side, same-farm check, Ireland date validation, idempotent submission id). After a save the sheet closes,
 * the route is re-read from Supabase (the engines recompute latest weight, gain, chart, history and work), the
 * Growth lens opens and the new weighing arrives on the graph, selected and marked "Recorded just now".
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { AnimalProfileVM, WeightChartVM } from "@/domain/cattle/presentation";
import type { RealAnimalView } from "@/server/cattle-real/real-service";
import type { HistoryFamily, LivingRecordVM } from "@/server/cattle-real/living-record";
import { recordRealCattleWeight } from "@/app/(app)/cattle/real-actions";
import { HealthSection } from "../AnimalSections";
import { Disclosure, StateLabel } from "../ui";
import { WorkWhy } from "../WorkPanel";
import { GrowthGraph } from "./GrowthGraph";
import { MeasureSheet } from "./MeasureSheet";
import styles from "./living-record.module.css";

type LensId = "overview" | "growth" | "health" | "plan" | "history";

const LENSES: readonly { id: LensId; num: string; accent: string; ambient: string }[] = [
  { id: "overview", num: "01", accent: "var(--lr-moss)", ambient: "120,154,98" },
  { id: "growth", num: "02", accent: "var(--lr-grass)", ambient: "113,157,98" },
  { id: "health", num: "03", accent: "var(--lr-clay)", ambient: "190,150,120" },
  { id: "plan", num: "04", accent: "var(--lr-straw)", ambient: "215,189,121" },
  { id: "history", num: "05", accent: "var(--lr-soil)", ambient: "134,99,73" },
];
const LENS_IDS = new Set<string>(LENSES.map((l) => l.id));

const chartIds = (c: WeightChartVM) => (c.state === "CHART" || c.state === "NOT_CHARTABLE" ? c.points.flatMap((x) => x.recordIds) : []);

export function RealAnimalProfileScreen({ view }: { view: RealAnimalView }) {
  const p = view.profile;
  const r = view.record;
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [lens, setLens] = useState<LensId>("overview");
  const [railOpen, setRailOpen] = useState(true);
  const [sheet, setSheet] = useState(false);
  // One submission id per opening of the sheet: a double press, a network retry or an action retry of the same
  // weight sends the same id, so the server returns the row it already wrote instead of writing a second (D13).
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const stageRef = useRef<HTMLElement>(null);

  // What a refresh brought in for THIS animal: the record ids the previous view didn't have (adjusting state on a
  // prop change, as the demo profile does). Only these animate; nothing is computed from them.
  const [shown, setShown] = useState(view);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  if (shown !== view) {
    setShown(view);
    if (shown.profile.animalId !== p.animalId) setFresh(new Set());
    else {
      const before = new Set(chartIds(shown.profile.chart));
      setFresh(new Set(chartIds(p.chart).filter((id) => !before.has(id))));
    }
  }
  const justSaved = saved !== null && fresh.has(saved);

  // A lens can be linked (#growth); read after hydration so the server render stays the Overview.
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (LENS_IDS.has(h)) queueMicrotask(() => setLens(h as LensId));
  }, []);

  const selectLens = (id: LensId) => {
    setLens(id);
    try {
      window.history.replaceState(null, "", id === "overview" ? window.location.pathname + window.location.search : `#${id}`);
    } catch {
      /* history unavailable: the lens still changes */
    }
    // Keep the chapter in view (one adjustment on an explicit choice; never scroll-jacking).
    const stage = stageRef.current;
    if (stage && stage.getBoundingClientRect().top < 0) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      stage.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };

  const openSheet = () => {
    setRequestId(crypto.randomUUID());
    setSaved(null);
    setSheet(true);
  };

  const tag = p.tag.value ?? p.tag.state.label;
  const active = LENSES.find((l) => l.id === lens) ?? LENSES[0];
  const groupHref = p.identity.group.groupRef ? `/cattle/groups/${encodeURIComponent(p.identity.group.groupRef)}` : null;
  const weightKey = p.weight.state === "KNOWN" ? `${p.weight.observedAt}-${p.weight.kg}` : p.weight.state;

  return (
    <>
      <article
        className={`${styles.root} ${styles.recede} -mx-4 -mt-4 min-h-screen pb-24 lg:mx-0 lg:mt-0 lg:pb-0`}
        data-receded={sheet}
        data-farm-workspace
        data-cattle-mode="REAL"
        aria-labelledby="animal-title"
      >
        {/* Wayfinding: the herd → the group → this animal; the rail control on desktop. */}
        <div className={`flex min-h-12 items-center justify-between gap-3 border-b ${styles.rule} px-4 text-[13px] text-[#5f685f] lg:px-7`}>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
            <Link href="/cattle" className="inline-flex min-h-11 items-center hover:text-[#17221c]">
              Cattle
            </Link>
            <span aria-hidden>›</span>
            {groupHref ? (
              <Link href={groupHref} className="inline-flex min-h-11 items-center truncate hover:text-[#17221c]">
                {p.identity.group.backLabel}
              </Link>
            ) : (
              <span className="truncate">{p.identity.group.value ?? p.identity.group.state.label}</span>
            )}
            <span aria-hidden>›</span>
            <strong className="truncate font-semibold text-[#17221c]">{tag}</strong>
          </nav>
          <button
            type="button"
            onClick={() => setRailOpen((o) => !o)}
            aria-expanded={railOpen}
            aria-controls="record-context"
            className="hidden min-h-11 items-center gap-2 rounded-full px-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#5f685f] hover:bg-black/[0.04] min-[1100px]:inline-flex"
          >
            <span aria-hidden className={`inline-block size-2.5 rounded-full border-[1.5px] border-current ${railOpen ? "bg-current" : ""}`} />
            Record context
          </button>
        </div>

        <Masthead p={p} r={r} tag={tag} weightKey={weightKey} onRecordWeight={openSheet} saved={saved} justSaved={justSaved} refreshing={refreshing} />

        <div role="tablist" aria-label="Animal record chapters" className={`${styles.chapterbar} sticky top-0 z-20 grid grid-flow-col auto-cols-[minmax(124px,1fr)] overflow-x-auto lg:auto-cols-fr`}>
          {LENSES.map((l, i) => (
            <button
              key={l.id}
              id={`lens-tab-${l.id}`}
              type="button"
              role="tab"
              aria-selected={lens === l.id}
              aria-controls={`lens-panel-${l.id}`}
              tabIndex={lens === l.id ? 0 : -1}
              onClick={() => selectLens(l.id)}
              onKeyDown={(e) => {
                const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (d === 0) return;
                e.preventDefault();
                const next = LENSES[(i + d + LENSES.length) % LENSES.length];
                selectLens(next.id);
                document.getElementById(`lens-tab-${next.id}`)?.focus();
              }}
              className={`${styles.chapter} min-h-[66px] px-4 pb-3.5 pt-[15px] text-left`}
              style={{ ["--accent" as string]: l.accent }}
            >
              <span className={`${styles.mono} block text-[10px] font-bold text-[#8d887c]`}>{l.num}</span>
              <span className={`mt-1 block text-[14px] ${lens === l.id ? "font-bold" : "font-semibold"}`}>{r.copy.lenses[l.id].chapter}</span>
            </button>
          ))}
        </div>

        <section ref={stageRef} className={`${styles.stage} scroll-mt-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8`} style={{ ["--lr-ambient-rgb" as string]: active.ambient }}>
          <div className={`${styles.layout} mx-auto max-w-[1280px]`} data-rail={railOpen ? "open" : "collapsed"}>
            <div className="min-w-0">
              {LENSES.map((l) => (
                <section key={l.id} id={`lens-panel-${l.id}`} role="tabpanel" aria-labelledby={`lens-tab-${l.id}`} hidden={lens !== l.id} className={lens === l.id ? styles.lensIn : undefined}>
                  <h2 className="m-0 text-[34px] font-bold tracking-[-0.04em] text-[#17221c]">{r.copy.lenses[l.id].title}</h2>
                  <p className="mt-2.5 max-w-[700px] text-[15px] leading-relaxed text-[#5f685f]">{r.copy.lenses[l.id].lead}</p>
                  {l.id === "overview" ? <OverviewLens p={p} r={r} onRecordWeight={openSheet} onHistory={() => selectLens("history")} /> : null}
                  {l.id === "growth" ? <GrowthLens p={p} r={r} fresh={fresh} method={view.notes.method} /> : null}
                  {l.id === "health" ? <HealthLens p={p} r={r} /> : null}
                  {l.id === "plan" ? <PlanLens p={p} r={r} /> : null}
                  {l.id === "history" ? <HistoryLens r={r} justSavedId={justSaved ? saved : null} justNow={r.copy.saved.justNow} /> : null}
                </section>
              ))}
            </div>
            <ContextRail r={r} open={railOpen} />
          </div>

          <footer className={`mx-auto mt-14 max-w-[1280px] border-t ${styles.rule} pt-4 text-[12px] leading-relaxed text-[#5f685f]`}>
            <p>{view.notes.readOnly}</p>
            <p className="mt-1">
              {p.asOf.label} · records received up to {p.asOf.knowledgeCutoff.slice(0, 16).replace("T", " ")} UTC · your farm&apos;s records
            </p>
          </footer>
        </section>
      </article>

      {requestId ? (
        <MeasureSheet
          key={requestId}
          open={sheet}
          onClose={() => setSheet(false)}
          tag={tag}
          previous={p.weight}
          asOfDate={view.recordWeight.today}
          copy={view.recordWeight.copy}
          onSave={async (v) => {
            // The sheet's exact reading as text; the server re-reads and validates it (it trusts nothing sent here).
            const res = await recordRealCattleWeight({ requestId, animalId: p.animalId, weightText: String(v.kg), observedDate: v.observedDate });
            if (!res.ok) return res.message;
            setSheet(false);
            setSaved(res.observationId);
            selectLens("growth");
            // Re-render from Supabase: the frozen engines recompute the profile from the stored rows.
            startRefresh(() => router.refresh());
            return null;
          }}
        />
      ) : null}
    </>
  );
}

/* ---- Masthead: the animal ------------------------------------------------ */

function Masthead({ p, r, tag, weightKey, onRecordWeight, saved, justSaved, refreshing }: { p: AnimalProfileVM; r: LivingRecordVM; tag: string; weightKey: string; onRecordWeight: () => void; saved: string | null; justSaved: boolean; refreshing: boolean }) {
  const w = p.metrics.weight;
  const g = p.metrics.gain;
  const meta = [p.identity.breed, p.identity.sex, p.identity.age].map((f) => f.value ?? f.state.label).join(" · ");
  return (
    <header className={`${styles.masthead} grid grid-cols-1 md:grid-cols-[minmax(300px,44%)_1fr]`}>
      <Portrait tag={tag} caption={r.portrait.caption} />
      <div className="flex min-w-0 flex-col justify-between gap-7 px-5 pb-6 pt-6 md:px-7 md:pb-7 md:pt-9 lg:pl-7 lg:pr-10">
        <div>
          <div className={styles.kicker}>
            {r.copy.kicker} · {p.identity.group.value ?? p.identity.group.state.label}
          </div>
          <h1 id="animal-title" className="mb-3 mt-2.5 break-words text-[42px] font-bold leading-[0.95] tracking-[-0.055em] text-[#17221c] md:text-[54px]">
            {p.tag.value ?? <StateLabel state={p.tag.state} />}
          </h1>
          <p className="text-[15px] text-[#5f685f]">{meta}</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className={styles.label}>{r.copy.weightLabel}</div>
            {w.value !== null ? (
              <div className={`${styles.weight} mt-1.5 text-[#17221c]`} data-weight-state={p.weight.state}>
                <span key={weightKey} className={saved !== null ? styles.flash : undefined}>
                  {w.value}
                </span>
                <small className="ml-2 font-sans text-[14px] font-semibold tracking-normal text-[#5f685f]">{w.unit}</small>
              </div>
            ) : (
              <div className="mt-2.5" data-weight-state={p.weight.state}>
                <StateLabel state={w.state} detail />
              </div>
            )}
            <div className={`${styles.mono} mt-2 text-[14px] font-bold text-[#34694d]`}>
              {g.value !== null ? (
                <>
                  {g.value} {g.unit} <span className="font-sans font-medium text-[#5f685f]">· {g.caption ?? g.state.label}</span>
                </>
              ) : (
                <span className="font-sans text-[13px] font-medium text-[#5f685f]">
                  {g.label}: {g.state.label}
                </span>
              )}
            </div>
            <p role="status" className="mt-2 min-h-5 text-[13px] font-semibold text-[#34694d]">
              {saved !== null ? (
                <>
                  <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full bg-[#789a62] align-middle" />
                  {refreshing ? r.copy.saved.updating : justSaved ? r.copy.saved.justNow : r.copy.saved.status}
                  <span className="sr-only"> {r.copy.saved.status}</span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onRecordWeight}
            className={`${styles.recordBtn} fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-[14px] font-bold sm:static sm:z-auto`}
          >
            Record weight <span aria-hidden className="text-[18px] leading-none">+</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/** No photo of a real animal is held: a designed plate stands in for one, and says so (never a stock photograph). */
function Portrait({ tag, caption }: { tag: string; caption: string }) {
  return (
    <div className={`${styles.plate} min-h-[220px] md:min-h-[345px]`} role="img" aria-label={`${tag}: ${caption}`}>
      <svg viewBox="0 0 240 140" className="absolute left-1/2 top-[45%] w-[52%] max-w-[300px] -translate-x-1/2 -translate-y-1/2 text-[#e9f0ea]" aria-hidden>
        <path
          d="M30 52C30 40 42 34 60 34L150 32C162 32 170 30 178 26L196 30C204 31 210 36 214 44L220 62C221 67 217 70 212 69L200 66C194 64 190 62 186 64C182 70 178 76 172 80L170 120H162L160 90H154L152 120H144L142 88C120 93 90 93 70 89L66 120H58L56 92H50L48 120H40L38 86C32 80 28 70 30 52Z"
          fill="currentColor"
          fillOpacity="0.1"
          stroke="currentColor"
          strokeOpacity="0.62"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M31 50C24 60 22 80 25 98" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M190 31L184 22L194 27" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M6 121H234" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1" />
      </svg>
      <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4">
        <span className={`${styles.mono} text-[12px] font-bold uppercase tracking-[0.14em] text-[#e9f0ea]/85`}>{tag}</span>
        <span className="text-right text-[12px] text-[#c8d4cd]">{caption}</span>
      </div>
    </div>
  );
}

/* ---- 01 Overview ---------------------------------------------------------- */

function FactRows({ facts }: { facts: LivingRecordVM["facts"] }) {
  return (
    <div className={`mt-7 border-t ${styles.rule}`}>
      {facts.map((f) => (
        <div key={f.key} className={`grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 border-b ${styles.rule} py-4 sm:grid-cols-[180px_1fr_auto]`} data-fact={f.key}>
          <div className="text-[13px] font-bold text-[#17221c]">{f.label}</div>
          <div className="order-last col-span-2 text-[13px] text-[#5f685f] sm:order-none sm:col-span-1">{f.detail}</div>
          <div className={`${styles.mono} text-right text-[14px] font-bold ${f.unresolved ? "text-[#8d887c]" : "text-[#17221c]"}`}>{f.value}</div>
        </div>
      ))}
    </div>
  );
}

function OverviewLens({ p, r, onRecordWeight, onHistory }: { p: AnimalProfileVM; r: LivingRecordVM; onRecordWeight: () => void; onHistory: () => void }) {
  const open = p.work.open;
  const recent = r.history.state === "ITEMS" ? r.history.entries.slice(0, 3) : [];
  return (
    <>
      <FactRows facts={r.facts} />
      {open.state === "ITEMS" ? (
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-[135px_1fr] sm:gap-6">
          <h3 className={styles.label}>Open work</h3>
          <div className={`border-l-2 border-[#d7bd79] pl-4`} data-work-state="ITEMS">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StateLabel state={open.primary.priority} />
              <StateLabel state={open.primary.headlineState} />
            </div>
            <p className="mt-1.5 text-[17px] font-bold text-[#17221c]">{open.primary.title}</p>
            <p className="mt-1 text-[14px] text-[#3a443d]">{open.primary.why.summary}</p>
            {open.primary.window.state === "RECOMMENDED" ? <p className="mt-1 text-[13px] text-[#5f685f]">{open.primary.window.label}</p> : null}
            {open.primary.hardDeadline.state === "HARD_DEADLINE" ? <p className="mt-1 text-[13px] font-semibold text-[#a2402b]">{open.primary.hardDeadline.label}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {open.primary.actionKind === "RECORD_WEIGHT" ? (
                <button type="button" onClick={onRecordWeight} className="min-h-11 rounded-full border border-[#1f4b37] px-4 text-[14px] font-semibold text-[#1f4b37] hover:bg-[#1f4b37]/[0.06]">
                  Weigh now
                </button>
              ) : null}
              <Disclosure label="Why?">
                <WorkWhy work={open.primary} />
              </Disclosure>
            </div>
            {open.othersLabel ? <p className="mt-1 text-[13px] text-[#5f685f]">{open.othersLabel}</p> : null}
          </div>
        </div>
      ) : null}
      <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-[135px_1fr] sm:gap-6">
        <h3 className={styles.label}>Recent activity</h3>
        <div>
          {r.history.state === "ITEMS" ? (
            <>
              {recent.map((h) => (
                <div key={h.entry.id} className="grid grid-cols-[72px_1fr] gap-[18px] pb-5">
                  <div className={`${styles.mono} pt-2.5 text-[11px] font-bold text-[#7d5b42]`}>{h.entry.dateLabel.split(" ").slice(0, 2).join(" ").toUpperCase()}</div>
                  <div className={`border-t ${styles.rule} pt-2.5 text-[14px]`}>
                    <strong className={h.entry.marker === "SUPERSEDED" ? "line-through decoration-[#8d887c]" : undefined}>{h.entry.title}</strong>
                    <small className="mt-1 block text-[13px] text-[#5f685f]">{h.detailLine}</small>
                  </div>
                </div>
              ))}
              <button type="button" onClick={onHistory} className="min-h-11 text-[14px] font-semibold text-[#1f4b37] hover:underline">
                Full history →
              </button>
            </>
          ) : (
            <StateLabel state={r.history.display} detail />
          )}
          {p.timelineGapNote ? <p className="mt-2 text-[12px] text-[#5f685f]">{p.timelineGapNote}</p> : null}
        </div>
      </div>
    </>
  );
}

/* ---- 02 Growth ------------------------------------------------------------ */

function GrowthLens({ p, r, fresh, method }: { p: AnimalProfileVM; r: LivingRecordVM; fresh: ReadonlySet<string>; method: string }) {
  const w = p.metrics.weight;
  const g = p.metrics.gain;
  const stats = [
    { key: "adg", label: "Daily gain", value: g.value !== null ? `${g.value} ${g.unit}` : null, detail: g.value !== null ? g.caption : null, state: g.state },
    { key: "period", label: "Over the period", value: p.gain.periodLabel, detail: null, state: p.gain.state },
    { key: "recent", label: p.gain.recent.label, value: p.gain.recent.value, detail: null, state: p.gain.recent.state },
    { key: "trend", label: "Trend", value: null, detail: null, state: p.gain.trend },
  ];
  return (
    <div className="mt-7">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className={styles.kicker}>Latest measurement</div>
          {w.value !== null ? (
            <div className={`${styles.mono} mt-1 text-[36px] font-semibold tracking-[-0.04em] text-[#17221c]`}>
              {w.value} <span className="font-sans text-[14px] font-semibold tracking-normal text-[#5f685f]">{w.unit}</span>
            </div>
          ) : (
            <div className="mt-2">
              <StateLabel state={w.state} detail />
            </div>
          )}
        </div>
        <p className="max-w-[260px] text-[12px] leading-relaxed text-[#5f685f] sm:text-right">{r.copy.growth.inspectHint}</p>
      </div>
      <GrowthGraph chart={p.chart} freshIds={fresh} freshLabel={r.copy.saved.justNow} inspectHint={r.copy.growth.inspectHint} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[12px] text-[#5f685f]" data-growth-target={r.growth.target.state}>
        {r.growth.target.state === "NOT_RECORDED" ? (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="inline-block w-[22px] border-t-2 border-dashed border-[#c9c0ae]" />
            <span className="font-semibold">{r.growth.target.label}</span> · {r.growth.target.note}
          </span>
        ) : null}
        <Disclosure label="How this graph is drawn">
          <ul className="max-w-[640px] list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-[#5f685f]">
            {p.chart.state === "CHART" && p.chart.projection.state === "NOT_SHOWN" ? <li>{r.growth.forecastNote}</li> : null}
            <li>{method}</li>
          </ul>
        </Disclosure>
      </div>
      <dl className={`mt-8 grid grid-cols-1 border-t ${styles.rule} sm:grid-cols-2 xl:grid-cols-4`}>
        {stats.map((s) => (
          <div key={s.key} className={`border-b ${styles.rule} py-4 pr-4 xl:border-b-0 xl:border-r xl:pl-4 xl:first:pl-0 xl:last:border-r-0`}>
            <dt className="text-[12px] text-[#5f685f]">{s.label}</dt>
            <dd className="mt-1.5">
              {s.value !== null ? (
                <>
                  <span className={s.key === "adg" ? `${styles.mono} text-[15px] font-bold text-[#17221c]` : "text-[14px] font-semibold text-[#17221c]"}>{s.value}</span>
                  {s.detail ? <span className="mt-0.5 block text-[12px] text-[#5f685f]">{s.detail}</span> : null}
                </>
              ) : (
                <StateLabel state={s.state} />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ---- 03 Health ------------------------------------------------------------ */

function HealthLens({ p, r }: { p: AnimalProfileVM; r: LivingRecordVM }) {
  const h = r.health;
  if (h.state === "FROM_RECORDS") {
    return (
      <div className="mt-7">
        <HealthSection health={p.health} />
      </div>
    );
  }
  return (
    <>
      <div className="mt-7 grid grid-cols-1 gap-8 md:grid-cols-[1.2fr_0.8fr]">
        {/* Unknown, not a warning: a dashed rule in the record's unknown language — no alarm colour without evidence. */}
        <div className="border-t-[3px] border-dashed border-[#8d887c] pt-[18px]" data-health-state="NOT_STORED">
          <div className={styles.kicker}>Current status</div>
          <div className="mt-2 text-[26px] font-bold tracking-[-0.025em] text-[#17221c]">{h.title}</div>
          <p className="mt-2 text-[13px] leading-relaxed text-[#5f685f]">{h.detail}</p>
        </div>
        <dl className={`border-t ${styles.rule}`}>
          {h.rows.map((row) => (
            <div key={row.key} className={`grid grid-cols-[1fr_auto] gap-x-5 border-b ${styles.rule} py-4`} data-health-row={row.key}>
              <dt>
                <strong className="text-[14px] text-[#17221c]">{row.label}</strong>
                <small className="mt-1 block text-[12px] text-[#5f685f]">{row.detail}</small>
                {row.evidence.state === "SHOWN" ? (
                  <span className="mt-1.5 block">
                    <StateLabel state={row.evidence.display} className="[&>span]:text-[12px]" />
                  </span>
                ) : null}
              </dt>
              <dd className={`${styles.mono} text-[11px] font-bold uppercase tracking-[0.08em] text-[#5f685f]`}>{row.statement}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-[135px_1fr] sm:gap-6">
        <h3 className={styles.label}>Evidence log</h3>
        <div className="grid grid-cols-[72px_1fr] gap-[18px]">
          <div className={`${styles.mono} pt-2.5 text-[11px] font-bold text-[#7d5b42]`}>CURRENT</div>
          <div className={`border-t ${styles.rule} pt-2.5 text-[14px]`}>
            <strong>{r.copy.health.evidenceEmptyTitle}</strong>
            <small className="mt-1 block text-[13px] text-[#5f685f]">{r.copy.health.evidenceEmptyDetail}</small>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---- 04 Plan -------------------------------------------------------------- */

function PlanLens({ p, r }: { p: AnimalProfileVM; r: LivingRecordVM }) {
  const w = p.metrics.weight;
  const o = r.plan.outcome;
  return (
    <>
      <div className={`relative mt-8 border-y ${styles.rule} pb-6 pt-7`}>
        <div className="relative grid grid-cols-2 gap-10 md:gap-20">
          <span aria-hidden className={styles.track} data-outcome={o.state === "TEXT" ? "recorded" : "unrecorded"} />
          {o.state === "TEXT" ? null : <span aria-hidden className={styles.trackDash} />}
          <div className="relative">
            <div className={styles.label}>
              {r.copy.plan.todayLabel} · {p.asOf.label.replace(/^As of /, "").split(",")[0]}
            </div>
            <div className="mb-3 mt-[17px] size-[13px] rounded-full border-[3px] border-[#1f4b37] bg-[#fbf8f1]" />
            {w.value !== null ? (
              <strong className={`${styles.mono} block text-[25px] font-bold text-[#17221c]`}>
                {w.value} {w.unit}
              </strong>
            ) : (
              <StateLabel state={w.state} />
            )}
            <span className="mt-1 block text-[13px] text-[#5f685f]">{w.value !== null ? (w.caption ?? w.state.label) : w.state.detail}</span>
          </div>
          <div className="relative text-right">
            <div className={styles.label}>{r.copy.plan.outcomeLabel}</div>
            <div className={`mb-3 ml-auto mt-[17px] size-[13px] rounded-full border-[3px] bg-[#fbf8f1] ${o.state === "TEXT" ? "border-[#b8674e]" : "border-2 border-[#b9b1a2]"}`} />
            <strong className={`${styles.mono} block text-[25px] font-bold ${o.state === "TEXT" ? "text-[#17221c]" : "text-[#8d887c]"}`}>{o.value}</strong>
            <span className="mt-1 block text-[13px] text-[#5f685f]">{o.detail}</span>
          </div>
        </div>
        {o.state === "NOT_RECORDED" ? <p className="mt-5 max-w-[640px] text-[13px] leading-relaxed text-[#5f685f]">{o.note}</p> : null}
      </div>
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        {r.plan.economics.map((e) => (
          <div key={e.key} className={`border-b ${styles.rule} py-4 pr-4 odd:border-r lg:border-b-0 lg:border-r lg:pl-4 lg:first:pl-0 lg:last:border-r-0 even:pl-4`} data-economics={e.key}>
            <dt className="text-[11px] text-[#5f685f]">{e.label}</dt>
            <dd>
              <strong className={`${styles.mono} mt-2 block text-[18px] font-bold text-[#8d887c]`}>{e.value}</strong>
              <span className="mt-1 block text-[12px] text-[#5f685f]">{e.note}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 max-w-[700px] text-[14px] leading-relaxed text-[#5f685f]">{r.plan.economicsNote}</p>
    </>
  );
}

/* ---- 05 History ----------------------------------------------------------- */

function HistoryLens({ r, justSavedId, justNow }: { r: LivingRecordVM; justSavedId: string | null; justNow: string }) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<HistoryFamily | "ALL">("ALL");
  if (r.history.state !== "ITEMS") {
    return (
      <div className="mt-7">
        <StateLabel state={r.history.display} detail />
      </div>
    );
  }
  const term = query.trim().toLowerCase();
  const all = r.history.entries;
  const shownRows = all.filter((h) => (family === "ALL" || h.family === family) && (term === "" || h.searchText.includes(term)));
  const filters: { id: HistoryFamily | "ALL"; label: string; count: number }[] = [{ id: "ALL", label: r.copy.history.allLabel, count: all.length }, ...r.history.filters.map((f) => ({ id: f.family, label: f.label, count: f.count }))];
  return (
    <>
      <div className="mt-7 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="sr-only" htmlFor="history-search">
          {r.copy.history.searchLabel}
        </label>
        <input
          id="history-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={r.copy.history.searchPlaceholder}
          className="min-h-12 flex-1 rounded-[10px] border border-[#d8d0c0] bg-[#fffaf2] px-4 text-[15px] outline-none focus:border-[#1f4b37]"
        />
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filter by record type">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={family === f.id}
              onClick={() => setFamily(f.id)}
              className={`min-h-11 shrink-0 rounded-[10px] border px-3.5 text-[14px] font-semibold transition-colors duration-150 motion-reduce:transition-none ${family === f.id ? "border-[#7d5b42] bg-[#7d5b42] text-white" : "border-[#d8d0c0] text-[#17221c] hover:bg-[#f1ece1]"}`}
            >
              {f.label} <span className={`${styles.mono} text-[12px] opacity-70`}>{f.count}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-4 text-[12px] text-[#5f685f]" aria-live="polite">
        Showing {shownRows.length} of {all.length} records
      </p>
      <ol className="mt-2" aria-label="Animal evidence">
        {shownRows.map((h) => (
          <li key={h.entry.id} className={`grid grid-cols-[92px_1fr] items-start gap-5 border-t ${styles.rule} py-[15px] md:grid-cols-[110px_120px_1fr]`} data-family={h.family}>
            <div className={`${styles.mono} pt-0.5 text-[11px] font-bold text-[#7d5b42]`}>{h.entry.dateLabel.toUpperCase()}</div>
            <div className="hidden pt-0.5 text-[12px] font-bold uppercase tracking-[0.04em] text-[#17221c] md:block">{h.familyLabel}</div>
            <div className="text-[14px]">
              <strong className={h.entry.marker === "SUPERSEDED" ? "line-through decoration-[#8d887c]" : undefined}>{h.entry.title}</strong>
              <small className="mt-1 block text-[13px] text-[#5f685f]">
                <span className="md:hidden">{h.familyLabel} · </span>
                {h.detailLine}
                {h.entry.markerLabel ? ` · ${h.entry.markerLabel}` : null}
              </small>
              {justSavedId !== null && h.entry.id === `weight:${justSavedId}` ? <small className="mt-1 block text-[12px] font-semibold text-[#34694d]">{justNow}</small> : null}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

/* ---- Context rail --------------------------------------------------------- */

function ContextRail({ r, open }: { r: LivingRecordVM; open: boolean }) {
  return (
    <aside id="record-context" aria-label="Record context" className={`${styles.rail} border-t ${styles.rule} pt-6 min-[1100px]:border-l min-[1100px]:border-t-0 min-[1100px]:pl-6 min-[1100px]:pt-0`} inert={!open ? true : undefined} data-open={open}>
      <div className={styles.label}>Record context</div>
      <dl className="mt-1 grid grid-cols-2 gap-x-6 min-[1100px]:grid-cols-1">
        {r.context.map((c) => (
          <div key={c.label} className="mt-[15px]">
            <dt className="text-[11px] text-[#5f685f]">{c.label}</dt>
            <dd className="mt-[3px] text-[14px] font-semibold text-[#17221c]">{c.value}</dd>
          </div>
        ))}
      </dl>
      <div className={`mt-7 border-t ${styles.rule} pt-[18px]`}>
        <div className={styles.label}>Coverage</div>
        <dl className="mt-2">
          {r.coverage.map((c) => (
            <div key={c.label} className="flex justify-between gap-4 py-[7px] text-[12px]">
              <dt className="text-[#5f685f]">{c.label}</dt>
              <dd className="text-right font-bold text-[#17221c]">{c.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 py-[7px] text-[12px]">
            <dt className="text-[#5f685f]">Last record</dt>
            <dd className={`${styles.mono} text-right font-bold text-[#17221c]`}>{r.lastRecord}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
