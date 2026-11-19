"use client";

/**
 * Grass V2 overview: the compact summary, the wedge (default) and farm map with
 * one shared field selection, "What to do next", a scenario preview and the
 * target settings. Every figure comes from `src/domain/grass-wedge-target.ts`
 * or the grass engine; this component arranges and explains them.
 *
 * 21st.dev design trial (2026-11-19, design-only, branch
 * design/grass-21st-trial-20261119) — an editorial "fieldbook" composition:
 *   - Cover: a dark-forest cover hero for today's average farm cover, with a
 *     per-field freshness tally and a white ledger beneath.
 *   - Plate I: the wedge / farm map in a framed plate. Its view, horizon and
 *     width controls use a sliding segmented control ADAPTED from the 21st.dev
 *     "Segmented Tabs" component by micka_design (component 26923,
 *     https://21st.dev/@micka_design/components/tabs-base): measured sliding
 *     selected indicator, fluid hover ghost, invisible bold sizer so labels
 *     never shift. Re-implemented without @base-ui/react or framer-motion; the
 *     existing aria-pressed toggle-button semantics are kept.
 *   - II: "What to do next" as a numbered editorial accordion ADAPTED from the
 *     21st.dev "Editorial service list" by ibrandify (component 37530,
 *     https://21st.dev/@ibrandify/components/editorial-service-list): kicker +
 *     display title header, hairline-ruled rows with 01/02 numerals, a title
 *     that steps right when open, a rotating chevron and a grid-rows reveal.
 *     Here each row is a real engine insight; its action stays visible and the
 *     deeper Teagasc wording and working sit behind the row's disclosure.
 * Three levels of disclosure are unchanged: (1) one action per decision,
 * (2) "why, and which fields", (3) the engine's own working lines and source.
 * No quantity here is re-derived; values are the engine's, formatted.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, ChevronRight, ChevronUp, Footprints, History } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { GrassWedgeChart } from "@/components/grass/GrassWedgeChart";
import { GrassGuide, HelpTip } from "@/components/grass/GrassGuide";
import { RegionalGrowthStatus } from "@/components/grass/RegionalGrowthStatus";
import type { RegionalGrassDisplay } from "@/domain/regional-grass-display";
import { openGrassGuide, setGrazingTargets, setWedgeWidthMode, useGrassSettings } from "@/lib/grass-settings";
import {
  buildDemandLine,
  grazingPlatform,
  inMainGrazingSeason,
  grassInsights,
  layoutWedge,
  previewScenario,
  supplyDemand,
  wedgePosition,
  type CalcLine,
  type DemandGroup,
  type GrassInsight,
  type GrowthSelection,
  type SupplyDemand,
  type WedgeField,
} from "@/domain/grass-wedge-target";

export interface OverviewField extends WedgeField {
  /** Cover in the same field as of today, before the selected forecast horizon. */
  currentCoverKgDmHa?: number;
  /** Raw recorded reading or scientifically labelled estimate brought forward to today. */
  currentBasis?: "measured" | "estimated";
  basis?: string;
  ageDays?: number;
  method?: string;
  occupants: string[];
  historyCount: number;
}

type View = "wedge" | "map";
const kg = (n: number) => formatNumber(n, 0);
const two = (n: number) => String(n).padStart(2, "0");

/** Small uppercase label used across the screen (existing Farm Return kicker style). */
const KICKER = "font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-fr-v2-muted";

/** Fieldbook chapter heading: roman numeral, display title, a quiet aside on the right. */
function Chapter({ numeral, kicker, title, aside, id }: { numeral: string; kicker: string; title: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <header className="flex flex-col gap-3 border-b border-fr-v2-graphite/80 pb-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-end gap-3">
        <span aria-hidden className="font-display text-[34px] leading-[0.85] text-fr-v2-forest/35 sm:text-[42px]">{numeral}</span>
        <div>
          <p className={KICKER}>{kicker}</p>
          <h2 id={id} className="mt-1 font-display text-[28px] leading-none tracking-[-0.01em] text-fr-v2-graphite sm:text-[34px]">{title}</h2>
        </div>
      </div>
      {aside ? <div className="max-w-xs text-[12px] leading-5 text-fr-v2-muted sm:text-right">{aside}</div> : null}
    </header>
  );
}

/** A "Today" or "Projected" stamp, so today's cover and a forecast position are never confused. */
function WhenStamp({ horizon, className }: { horizon: number; className?: string }) {
  return horizon > 0 ? (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-dashed border-fr-v2-harvest-ink/60 bg-fr-v2-harvest-tint px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fr-v2-harvest-ink", className)}>
      Projected +{horizon} days
    </span>
  ) : (
    <span className={cn("inline-flex items-center rounded-full border border-fr-v2-forest/30 px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fr-v2-forest", className)}>
      Today
    </span>
  );
}

function Working({ lines, source }: { lines: readonly CalcLine[]; source?: string }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-fr-v2-forest">
        Show calculation {open ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
      </button>
      {open ? (
        <dl className="mt-1 divide-y divide-fr-v2-cream-rule rounded-[12px] border border-fr-v2-cream-rule bg-fr-v2-paper text-[11px]">
          {lines.map((l, i) => (
            <div key={`${l.label}-${i}`} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3">
              <dt className="font-semibold text-fr-v2-charcoal">{l.label}</dt>
              <dd className="tabular-nums text-fr-v2-muted">{l.value}</dd>
            </div>
          ))}
          {source ? <p className="px-3 py-2 text-fr-v2-muted">Source: {source}</p> : null}
        </dl>
      ) : null}
    </div>
  );
}

/** One column of the white ledger under the cover: numeral, label, figure + unit, short detail. */
function LedgerRow({ index, label, help, value, unit, children }: { index: number; label: string; help?: ReactNode; value: string; unit?: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4 sm:px-6 lg:py-6">
      <dt className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-fr-v2-muted">
        <span aria-hidden className="font-mono text-[10px] text-fr-v2-forest/60">{two(index)}</span>
        <span>{label}{help}</span>
      </dt>
      <dd className="mt-1.5">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-[30px] leading-none tabular-nums tracking-[-0.01em] text-fr-v2-graphite">{value}</span>
          {unit ? <span className="text-[11px] text-fr-v2-muted">{unit}</span> : null}
        </p>
        {children ? <div className="mt-2 space-y-0.5 text-[12px] leading-[1.35rem] text-fr-v2-muted">{children}</div> : null}
      </dd>
    </div>
  );
}

/** Keyboard focus only (the pointer already shows the ghost); tolerant of engines without `:focus-visible`. */
function isFocusVisible(el: Element): boolean {
  try { return el.matches(":focus-visible"); } catch { return false; }
}

/**
 * Sliding segmented control, adapted from the 21st.dev "Segmented Tabs"
 * (micka_design, #26923): one measured indicator glides to the selected
 * option, a softer ghost follows the pointer, and an invisible semibold sizer
 * keeps each label's box fixed as its weight changes. The indicator is moved
 * by writing styles in a layout effect / handlers (no extra renders, no
 * animation library). Before measurement — first paint, no JS — the selected
 * button paints its own background, so the state is never invisible.
 * Semantics are the existing toggle buttons (`aria-pressed`) in a labelled group.
 */
function Segmented<T extends string | number>({ options, value, onChange, label, role, disabled, className, size = "md" }: {
  options: ReadonlyArray<{ value: T; label: string; ariaLabel?: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  role?: "group";
  disabled?: (value: T) => boolean;
  className?: string;
  size?: "md" | "sm";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const optionKey = options.map((o) => String(o.value)).join("|");

  useLayoutEffect(() => {
    const track = trackRef.current;
    const indicator = indicatorRef.current;
    if (!track || !indicator) return;
    const place = () => {
      const button = track.querySelectorAll<HTMLButtonElement>("button[data-seg]")[selectedIndex];
      if (!button || button.offsetWidth === 0) {
        delete track.dataset.measured;
        indicator.style.opacity = "0";
        return;
      }
      // First placement jumps into position; later changes glide.
      const first = track.dataset.measured !== "true";
      if (first) indicator.style.transition = "none";
      indicator.style.width = `${button.offsetWidth}px`;
      indicator.style.height = `${button.offsetHeight}px`;
      indicator.style.transform = `translate(${button.offsetLeft}px, ${button.offsetTop}px)`;
      indicator.style.opacity = "1";
      track.dataset.measured = "true";
      if (first) { void indicator.offsetWidth; indicator.style.transition = ""; }
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(place);
    observer.observe(track);
    return () => observer.disconnect();
  }, [selectedIndex, optionKey]);

  function showGhost(button: HTMLButtonElement, index: number) {
    const ghost = ghostRef.current;
    if (!ghost || index === selectedIndex || button.disabled) { if (ghost) ghost.style.opacity = "0"; return; }
    ghost.style.width = `${button.offsetWidth}px`;
    ghost.style.height = `${button.offsetHeight}px`;
    ghost.style.transform = `translate(${button.offsetLeft}px, ${button.offsetTop}px)`;
    ghost.style.opacity = "1";
  }
  function hideGhost() { if (ghostRef.current) ghostRef.current.style.opacity = "0"; }

  return (
    <div
      ref={trackRef}
      role={role}
      aria-label={label}
      onMouseLeave={hideGhost}
      className={cn("group/seg relative isolate flex rounded-[14px] bg-fr-v2-stone p-1 ring-1 ring-inset ring-fr-v2-graphite/[0.06]", className)}
    >
      <span
        ref={ghostRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 -z-10 rounded-[10px] bg-white/55 opacity-0 transition-[transform,width,opacity] duration-150 ease-[var(--fr-v2-ease-out)] motion-reduce:transition-none"
      />
      <span
        ref={indicatorRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 -z-10 rounded-[10px] bg-white opacity-0 shadow-[0_1px_2px_rgba(19,26,22,0.14),0_4px_12px_-6px_rgba(23,63,45,0.35)] transition-[transform,width,opacity] duration-[260ms] ease-[var(--fr-v2-ease-out)] motion-reduce:transition-none"
      />
      {options.map((o, i) => {
        const isSelected = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            data-seg
            aria-pressed={isSelected}
            aria-label={o.ariaLabel}
            disabled={disabled?.(o.value)}
            onClick={() => onChange(o.value)}
            onMouseEnter={(e) => showGhost(e.currentTarget, i)}
            onFocus={(e) => { if (isFocusVisible(e.currentTarget)) showGhost(e.currentTarget, i); }}
            onBlur={hideGhost}
            className={cn(
              "relative flex-1 whitespace-nowrap rounded-[10px] transition-colors duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-35",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-forest",
              size === "md" ? "min-h-11 px-4 text-[13.5px]" : "min-h-10 px-3 text-xs",
              isSelected
                ? "bg-white text-fr-v2-forest shadow-[0_1px_2px_rgba(19,26,22,0.14)] group-data-[measured=true]/seg:bg-transparent group-data-[measured=true]/seg:shadow-none"
                : "text-fr-v2-muted hover:text-fr-v2-charcoal",
            )}
          >
            {/* Stacked label: the invisible semibold copy reserves the width, so nothing shifts. */}
            <span className="inline-grid">
              <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold">{o.label}</span>
              <span className={cn("col-start-1 row-start-1", isSelected ? "font-semibold" : "font-medium")}>{o.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const TONE_STYLE: Record<GrassInsight["tone"], { dot: string; kicker: string; label: string }> = {
  action: { dot: "bg-fr-v2-straw", kicker: "text-fr-v2-harvest-ink", label: "Needs input" },
  surplus: { dot: "bg-fr-v2-forest", kicker: "text-fr-v2-forest", label: "Surplus" },
  shortage: { dot: "bg-fr-v2-harvest", kicker: "text-fr-v2-harvest-ink", label: "Shortfall" },
  info: { dot: "bg-fr-v2-teal", kicker: "text-fr-v2-teal", label: "Trend" },
};

/** Plain wording for the engine's confidence flag. `low` on a position insight means
 * no field was read in the last 7 days (the engine's own rule), not missing inputs. */
function confidenceLabel(insight: GrassInsight): string {
  if (insight.confidence === "measured") return "Recent readings";
  if (insight.confidence === "mixed") return "Partly estimated";
  return insight.id === "surplus" || insight.id === "shortage" ? "No reading this week" : "Needs information";
}

/** A figure string from the engine shown as a label/value row ("Field: 2,682 vs 47 on the line").
 * Presentation only — the string itself is never changed. */
function FigureRow({ text }: { text: string }) {
  const at = text.lastIndexOf(": ");
  if (at <= 0) return <li className="px-3 py-2 text-fr-v2-charcoal">{text}</li>;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
      <span className="min-w-0 text-fr-v2-charcoal">{text.slice(0, at)}</span>
      <span className="tabular-nums text-fr-v2-muted">{text.slice(at + 2)}</span>
    </li>
  );
}

/**
 * One numbered row of the editorial decision list (adapted from 21st.dev
 * "Editorial service list"). The row's title is the disclosure button for its
 * reasoning; the caveat and the action stay on the surface so nothing a farmer
 * needs to act safely is hidden.
 */
function DecisionRow({ index, insight, href, onAction, supply, growthLabel, horizon, open, onToggle, baseId }: {
  index: number;
  insight: GrassInsight;
  href?: string;
  onAction: () => void;
  supply?: SupplyDemand;
  growthLabel?: string;
  horizon: number;
  open: boolean;
  onToggle: () => void;
  baseId: string;
}) {
  const tone = TONE_STYLE[insight.tone];
  const isPosition = insight.id === "surplus" || insight.id === "shortage";
  const isGrowth = insight.id === "growth";
  const tentative = isPosition && insight.confidence !== "measured";
  // The detailed source-backed Teagasc wording is in insight.why below. Do not
  // duplicate seasonal advice in the UI where it could drift from the engine.
  const deep = isPosition || isGrowth;
  const hasPanel = deep || insight.working.length > 0;
  const buttonId = `${baseId}-btn-${index}`;
  const panelId = `${baseId}-panel-${index}`;
  const titleClass = cn(
    "font-display text-[22px] leading-[1.12] tracking-[-0.01em] text-fr-v2-graphite transition-[transform,color] duration-200 motion-reduce:transition-none sm:text-[27px]",
    open && "translate-x-1.5 text-fr-v2-forest",
  );

  return (
    <li className="border-t border-fr-v2-rule first:border-t-0">
      <div className="flex gap-3 py-5 sm:gap-5 sm:py-6">
        <span aria-hidden className="w-8 shrink-0 pt-1 font-mono text-[11px] font-semibold tabular-nums text-fr-v2-muted sm:w-12 sm:text-xs">{two(index + 1)}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
            <span className={cn("font-mono text-[10px] font-semibold uppercase tracking-[0.16em]", tone.kicker)}>{tone.label}</span>
            <span aria-hidden className="text-fr-v2-cream-rule">·</span>
            <span className="text-[11px] font-medium text-fr-v2-muted">{confidenceLabel(insight)}</span>
          </p>

          <h3 className="mt-1.5">
            {hasPanel ? (
              <button
                type="button"
                id={buttonId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={onToggle}
                className="group flex min-h-11 w-full items-start justify-between gap-4 rounded-[6px] text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fr-v2-forest"
              >
                <span className={cn(titleClass, !open && "group-hover:translate-x-1.5")}>{insight.title}</span>
                <span aria-hidden className={cn("mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-fr-v2-rule text-fr-v2-muted transition-transform duration-200 group-hover:border-fr-v2-forest/40 group-hover:text-fr-v2-forest motion-reduce:transition-none", open && "rotate-90 border-fr-v2-forest/40 text-fr-v2-forest")}>
                  <ChevronRight className="size-4" />
                </span>
              </button>
            ) : (
              <span className={cn(titleClass, "block")}>{insight.title}</span>
            )}
          </h3>

          {/* Surface: one figure, any caveat, the action. */}
          {isPosition && insight.figures[0] ? (
            <p className="mt-2 text-sm text-fr-v2-charcoal">
              <span className="font-semibold tabular-nums">{insight.figures[0]}</span>
              {horizon > 0 ? <span className="text-fr-v2-muted"> · covers projected +{horizon} days</span> : null}
            </p>
          ) : null}
          {isGrowth && supply ? (
            <p className="mt-2 text-sm text-fr-v2-charcoal">
              <span className="font-semibold tabular-nums">{kg(supply.growthKgDmDay)}</span> growing vs <span className="font-semibold tabular-nums">{kg(supply.demandKgDmDay)}</span> kg DM/day estimated demand
            </p>
          ) : null}
          {tentative ? (
            <p className="mt-2 border-l-2 border-fr-v2-harvest bg-fr-v2-harvest-tint/60 px-3 py-2 text-[12px] leading-5 text-fr-v2-charcoal">
              {insight.confidence === "mixed"
                ? "Some readings are more than 7 days old, or part of the grazing area is unmeasured."
                : "None of these readings is from the last 7 days."} Confirm on your next walk before acting.
            </p>
          ) : null}
          {/* Information-gathering prompts keep their full reason on the surface. */}
          {!deep ? <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-fr-v2-muted">{insight.why}</p> : null}
          {!deep && insight.figures.length > 0 ? <p className="mt-1.5 text-[12px] text-fr-v2-charcoal">{insight.figures.join(" · ")}</p> : null}

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {href ? (
              <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-fr-v2-forest pl-4 pr-3.5 text-[13px] font-semibold text-white hover:bg-fr-v2-forest-deep-2">
                {insight.actionLabel}<ChevronRight className="size-4 opacity-70" aria-hidden />
              </Link>
            ) : (
              <button type="button" onClick={onAction} className="inline-flex min-h-11 items-center rounded-full border border-fr-v2-forest px-4 text-[13px] font-semibold text-fr-v2-forest hover:bg-fr-v2-teal-tint/40">{insight.actionLabel}</button>
            )}
            {tentative ? (
              <Link href="/grass/walk" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-4">
                <Footprints className="size-4" aria-hidden />Walk to confirm
              </Link>
            ) : null}
          </div>

          {/* Depth: the engine's reasoning, limits, figures and working (21st grid-rows reveal). */}
          {hasPanel ? (
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              inert={!open}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
                open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="mt-4 border-t border-dashed border-fr-v2-cream-rule pt-3">
                  {deep ? (
                    <>
                      <p className={KICKER}>{isPosition ? "Why, and which fields" : "Why, and its limits"}</p>
                      <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-fr-v2-charcoal">{insight.why}</p>
                    </>
                  ) : null}
                  {isGrowth && supply ? (
                    <dl className="mt-3 grid max-w-md grid-cols-2 gap-3">
                      <div className="rounded-[12px] bg-fr-v2-teal-tint/60 px-3 py-2.5">
                        <dt className="text-[11px] text-fr-v2-muted">Growing on grazing area</dt>
                        <dd className="mt-0.5 font-display text-[22px] leading-none tabular-nums text-fr-v2-graphite">{kg(supply.growthKgDmDay)} <span className="font-sans text-[11px] text-fr-v2-muted">kg DM/day</span></dd>
                        {growthLabel ? <dd className="mt-1 text-[11px] text-fr-v2-muted">Growth rate: {growthLabel}</dd> : null}
                      </div>
                      <div className="rounded-[12px] bg-fr-v2-stone px-3 py-2.5">
                        <dt className="text-[11px] text-fr-v2-muted">Cattle demand</dt>
                        <dd className="mt-0.5 font-display text-[22px] leading-none tabular-nums text-fr-v2-graphite">{kg(supply.demandKgDmDay)} <span className="font-sans text-[11px] text-fr-v2-muted">kg DM/day</span></dd>
                        <dd className="mt-1 text-[11px] text-fr-v2-muted">Estimated from liveweight, not measured intake</dd>
                      </div>
                    </dl>
                  ) : null}
                  {isPosition ? (
                    <p className="mt-2 max-w-2xl text-[12px] leading-5 text-fr-v2-muted">
                      &ldquo;Days of demand&rdquo; divides the grass above the line by today&apos;s recorded cattle demand. It compares stock with demand; it is not a forecast of how long grazing will last, and ignores growth, weather and season.
                    </p>
                  ) : isGrowth ? (
                    <p className="mt-2 max-w-2xl text-[12px] leading-5 text-fr-v2-muted">
                      Growth uses the growth rate in use across the grazing area. Demand is estimated from recorded cattle liveweight; Farm Return does not measure what is eaten.
                    </p>
                  ) : null}
                  {deep && insight.figures.length > 0 ? (
                    <ul className="mt-2 max-w-2xl divide-y divide-fr-v2-cream-rule rounded-[12px] border border-fr-v2-cream-rule bg-white text-[12px]">
                      {insight.figures.map((f, i) => <FigureRow key={`${i}-${f}`} text={f} />)}
                    </ul>
                  ) : null}
                  <Working lines={insight.working} source={insight.source} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function GrassOverview({
  fields,
  groups,
  growth,
  regionalGrowth,
  averageCoverKgDmHa,
  averageBasis,
  latestWalkAt,
  horizon,
  horizons,
  horizonAvailable,
  onHorizon,
  horizonNote,
  selectedFieldId,
  onSelectField,
  map,
  asOf,
}: {
  /** Today's date (ISO), for seasonal advice. */
  asOf: string;
  fields: readonly OverviewField[];
  groups: readonly DemandGroup[];
  growth: GrowthSelection;
  regionalGrowth?: RegionalGrassDisplay;
  averageCoverKgDmHa?: number;
  averageBasis?: string;
  latestWalkAt?: string;
  horizon: number;
  horizons: readonly number[];
  horizonAvailable: (days: number) => boolean;
  onHorizon: (days: number) => void;
  /** Where projections come from (or why they're unavailable). */
  horizonNote?: ReactNode;
  selectedFieldId?: string;
  onSelectField: (fieldId: string | undefined) => void;
  map: ReactNode;
}) {
  const settings = useGrassSettings();
  const decisionsId = useId();
  const [view, setViewState] = useState<View>("wedge");
  // The map mounts the first time it's shown, so it fits the fields to a visible (not 0×0) canvas.
  const [mapMounted, setMapMounted] = useState(false);
  function setView(next: View) {
    setViewState(next);
    if (next === "map") setMapMounted(true);
  }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rotationInput, setRotationInput] = useState("");
  const [residualInput, setResidualInput] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [scenarioRotation, setScenarioRotation] = useState<string>("");
  /** Which decision row is open (one at a time, as in the editorial list). Keyed by insight id. */
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);

  // Only grazing (and mixed) fields form the grazing area; silage, tillage and other fields are left out.
  const platform = useMemo(() => grazingPlatform(fields), [fields]);
  const grazingAreaHa = platform.areaHa;
  const line = useMemo(
    () => buildDemandLine({ groups, grazingAreaHa, targets: settings.targets, unknownUse: platform.unknownUse, areaFields: platform.fields, excludedFields: platform.excluded }),
    [groups, grazingAreaHa, settings.targets, platform],
  );
  const okLine = line.status === "OK" ? line.line : undefined;
  const wedgeFields = platform.unknownUse.length > 0 ? fields : platform.fields;
  const bars = useMemo(() => layoutWedge(wedgeFields, settings.widthMode, okLine), [wedgeFields, settings.widthMode, okLine]);
  const position = okLine ? wedgePosition(platform.fields, okLine) : undefined;
  const resolvedDemand = groups.every((g) => g.dailyDemandKgDm !== undefined) && groups.length > 0 ? groups.reduce((s, g) => s + (g.dailyDemandKgDm ?? 0), 0) : undefined;
  const supply = supplyDemand({ growthKgDmHaDay: growth.chosen?.rateKgDmHaDay, grazingAreaHa, demandKgDmDay: resolvedDemand });
  const insights = grassInsights({ fields: platform.fields.map((f) => ({ ...f, occupied: f.occupants.length > 0 })), line, asOf, ...(supply ? { supply } : {}) });
  const occupied = useMemo(() => new Set(fields.filter((f) => f.occupants.length > 0).map((f) => f.fieldId)), [fields]);
  const selectedBar = bars.find((b) => b.fieldId === selectedFieldId);
  const selected = fields.find((f) => f.fieldId === selectedFieldId);
  const isFresh = (f: OverviewField) => f.coverKgDmHa !== undefined && (f.ageDays ?? Infinity) <= 14;
  const measuredRecently = fields.filter(isFresh).length;

  const scenario = useMemo(() => {
    if (!scenarioOpen) return undefined;
    const r = Number(scenarioRotation);
    return previewScenario({ fields, groups, targets: settings.targets, removedFieldIds: removed, ...(scenarioRotation && Number.isFinite(r) ? { rotationDays: r } : {}) });
  }, [scenarioOpen, fields, groups, settings.targets, removed, scenarioRotation]);

  function openSettings() {
    setRotationInput(settings.targets.rotationDays !== undefined ? String(settings.targets.rotationDays) : "");
    setResidualInput(settings.targets.residualKgDmHa !== undefined ? String(settings.targets.residualKgDmHa) : "");
    setSettingsError(null);
    setSettingsOpen(true);
  }
  function saveSettings() {
    const rotationDays = Number(rotationInput);
    const residualKgDmHa = Number(residualInput);
    if (!rotationInput || !Number.isFinite(rotationDays) || rotationDays < 5 || rotationDays > 120) { setSettingsError("Enter a rotation between 5 and 120 days."); return; }
    if (!residualInput || !Number.isFinite(residualKgDmHa) || residualKgDmHa < 0 || residualKgDmHa > 1500) { setSettingsError("Enter a residual between 0 and 1,500 kg DM/ha."); return; }
    setGrazingTargets({ rotationDays, residualKgDmHa });
    setSettingsOpen(false);
  }
  function runAction(insight: GrassInsight) {
    const a = insight.action;
    if (a.kind === "set_targets") openSettings();
    else if (a.kind === "explore_silage") { setRemoved(a.fieldIds); setScenarioOpen(true); document.getElementById("grass-scenario")?.scrollIntoView?.({ block: "start", behavior: "smooth" }); }
  }
  const actionHref = (insight: GrassInsight): string | undefined => {
    const a = insight.action;
    if (a.kind === "add_liveweight") return `/cattle/groups/${encodeURIComponent(a.groupId)}`;
    if (a.kind === "start_walk") return "/grass/walk";
    if (a.kind === "set_field_use") return `/fields?field=${encodeURIComponent(a.fieldId)}&focus=field-use`;
    return undefined;
  };

  // "Against the line": a stock comparison. Shown as a direction plus the engine's kg DM and
  // days-of-demand figures, qualified — never headlined as days of future grazing.
  const lineValue = !okLine
    ? line.status === "BLOCKED" && line.block.code === "TARGETS_NOT_SET" ? "Set targets" : "Not yet"
    : position === undefined ? "Not measured" : position.differenceKgDm >= 0 ? "Above" : "Below";
  const lastReading = latestWalkAt ? new Date(latestWalkAt).toLocaleDateString("en-IE", { day: "numeric", month: "short" }) : undefined;
  const asOfDate = new Date(asOf);
  const coverDate = Number.isFinite(asOfDate.getTime()) ? asOfDate.toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" }) : undefined;

  return (
    <div>
      <GrassGuide />

      {/* COVER — today's farm cover on a dark-forest fieldbook cover, then a white ledger. */}
      <section className="overflow-hidden rounded-[26px] bg-white shadow-[0_1px_0_rgba(19,26,22,0.04),0_18px_40px_-28px_rgba(23,63,45,0.55)] ring-1 ring-fr-v2-rule" aria-label="Grass summary">
        <div
          className={cn(
            "relative overflow-hidden bg-fr-v2-forest-deep px-5 pb-5 pt-5 text-white sm:px-7 sm:pt-6",
            // HelpTip is styled for light surfaces; lift its contrast on the cover.
            "[&_[role=note]]:text-white/75 [&_button[aria-label^='What_is']]:text-white/60 [&_button[aria-label^='What_is']:hover]:text-white",
          )}
        >
          {/* Quiet field-furrow texture: decorative only. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(115deg,#fff_0,#fff_1px,transparent_1px,transparent_14px)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-white/15 pb-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">Grass fieldbook{coverDate ? ` · ${coverDate}` : ""}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">{lastReading ? `Last reading ${lastReading}` : "No readings yet"}</p>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-end">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-white/80">
                  <span>Average farm cover</span>
                  <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fr-v2-forest">Today</span>
                  <HelpTip term="average farm cover">The grass on your fields, averaged by size, as recorded in kg of dry matter per hectare. The measurement basis is not stored for older readings; compare readings taken using the same method. Unmeasured fields are excluded, not treated as bare.</HelpTip>
                </p>
                <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-[76px] leading-[0.82] tracking-[-0.03em] tabular-nums text-white sm:text-[96px]">{averageCoverKgDmHa === undefined ? "—" : kg(averageCoverKgDmHa)}</span>
                  <span className="text-sm text-white/70">{averageCoverKgDmHa === undefined ? "Not measured" : "kg DM/ha"}</span>
                </p>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-white/70">
                  {averageBasis ? (
                    <span className={cn("rounded-full px-2 py-0.5 font-semibold first-letter:uppercase", averageBasis === "estimated" ? "bg-fr-v2-harvest-tint text-fr-v2-harvest-ink" : "bg-fr-v2-teal-tint text-fr-v2-forest")}>{averageBasis} basis</span>
                  ) : null}
                  {horizon > 0 ? <span>The wedge below is projected +{horizon} days; this figure stays today&apos;s.</span> : null}
                </p>
              </div>

              <div className="lg:border-l lg:border-white/15 lg:pl-6">
                {/* Freshness tally: one mark per field, like a fieldbook margin. */}
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="text-white/85"><span className="font-semibold tabular-nums text-white">{measuredRecently} of {fields.length}</span> fields measured in the last 2 weeks</span>
                  <HelpTip term="measurement freshness">With reliable growth and grazing evidence, an earlier reading can be estimated forward to today. Without that evidence, the recorded reading remains unchanged; after two weeks, walk the field again.</HelpTip>
                </div>
                {fields.length > 0 ? (
                  <div aria-hidden className="mt-2 flex flex-wrap gap-[3px]">
                    {fields.map((f) => (
                      <span key={f.fieldId} title={f.name} className={cn("h-5 w-[5px] rounded-[1px]", isFresh(f) ? "bg-fr-v2-straw" : "bg-white/15")} />
                    ))}
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Link href="/grass/walk" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-fr-v2-forest shadow-[0_6px_18px_-10px_rgba(0,0,0,0.6)] hover:bg-fr-v2-teal-tint">
                    <Footprints className="size-[18px]" aria-hidden />Start grass walk
                  </Link>
                  <Link href="/grass/walks" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-[13px] font-semibold text-white hover:border-white/60">
                    <History className="size-4 text-white/70" aria-hidden />Past walks
                  </Link>
                  <button type="button" onClick={openGrassGuide} aria-label="Show grass guide" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-[13px] font-semibold text-white hover:border-white/60">
                    <BookOpen className="size-4 text-white/70" aria-hidden />Grass guide
                  </button>
                </div>
              </div>
            </div>

            {regionalGrowth ? (
              <div className="mt-5 [&>section]:px-0 [&>section]:pt-3">
                <RegionalGrowthStatus regional={regionalGrowth} theme="dark" />
              </div>
            ) : null}
          </div>
        </div>

        <dl className="divide-y divide-fr-v2-cream-rule lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <LedgerRow
            index={1}
            label="Growth in use"
            help={<HelpTip term="grass growth rate">The growth rate used for farm cover estimates. Your recent observations take precedence over county predictions. {growth.reason}</HelpTip>}
            value={growth.chosen ? kg(growth.chosen.rateKgDmHaDay) : "Not recorded"}
            unit={growth.chosen ? "kg DM/ha/day" : undefined}
          >
            {growth.chosen ? (
              <>
                <p><span className="font-semibold text-fr-v2-charcoal">{growth.chosen.label}</span></p>
                {growth.others.map((o) => <p key={o.kind}>Also on record — <span>{o.label}: {kg(o.rateKgDmHaDay)}</span></p>)}
              </>
            ) : <p>Two walks of the same fields will measure it.</p>}
          </LedgerRow>
          <LedgerRow
            index={2}
            label="Cattle demand"
            help={<HelpTip term="livestock demand">The grass your cattle on the fields eat each day: about 2% of liveweight per head (Teagasc beef grazing guide), from your Cattle records. An estimate, not measured intake.</HelpTip>}
            value={groups.length === 0 ? "No cattle out" : resolvedDemand !== undefined ? kg(resolvedDemand) : "Incomplete"}
            unit={resolvedDemand !== undefined ? "kg DM/day" : undefined}
          >
            {resolvedDemand !== undefined ? <p>Estimated from recorded liveweight</p> : null}
            {supply ? (
              <p className="text-fr-v2-charcoal">{supply.balanceKgDmDay >= 0 ? "Growth exceeds this by" : "Growth is short of this by"} <span className="font-semibold tabular-nums">{kg(Math.abs(supply.balanceKgDmDay))} kg DM/day</span></p>
            ) : groups.length > 0 && resolvedDemand === undefined ? <p className="font-semibold text-fr-v2-harvest-ink">Some groups need a liveweight</p> : null}
          </LedgerRow>
          <LedgerRow
            index={3}
            label={horizon > 0 ? `Projected position · +${horizon} days` : "Against the target line · Today"}
            help={<HelpTip term="the red target line">How far the measured covers sit above or below the red line, from your cattle&apos;s demand, grazing area, rotation length and residual. Expressed in days of today&apos;s recorded demand: a comparison, not a forecast of future grazing.</HelpTip>}
            value={lineValue}
            unit={position ? "the line" : undefined}
          >
            {okLine && position ? (
              <p className="text-fr-v2-charcoal">
                <span className="font-semibold tabular-nums">{kg(Math.abs(position.differenceKgDm))} kg DM</span> {position.differenceKgDm >= 0 ? "above" : "below"} · ≈{Math.abs(position.days).toFixed(0)} days of recorded demand
              </p>
            ) : null}
            {okLine ? <p>Target pre-grazing {kg(okLine.targetPreGrazingKgDmHa)} kg DM/ha</p> : null}
            {okLine && position ? <p className="text-[11px]">A comparison with today&apos;s demand, not a grazing forecast.</p> : null}
          </LedgerRow>
        </dl>
      </section>

      {/* PLATE I — the wedge & map in a framed plate. */}
      <section className="mt-10" aria-label={view === "wedge" ? "Grass wedge" : "Farm map"}>
        <Chapter
          numeral="I"
          kicker="Plate"
          title={view === "wedge" ? "The grass wedge" : "The farm map"}
          aside={<>{bars.length} {bars.length === 1 ? "field" : "fields"}{view === "wedge" ? " · tap a bar for its field" : " · tap a field for its cover"}</>}
        />
        <div className="mt-4 rounded-[26px] bg-fr-v2-teal-tint/45 p-1.5 ring-1 ring-fr-v2-rule sm:p-2">
          <div className="relative rounded-[20px] bg-white px-4 pb-4 pt-4 ring-1 ring-fr-v2-graphite/[0.06] sm:px-6 sm:pb-6 sm:pt-5">
            {/* Registration marks: decorative plate corners. */}
            <span aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 size-2.5 border-l border-t border-fr-v2-forest/30" />
            <span aria-hidden className="pointer-events-none absolute right-2.5 top-2.5 size-2.5 border-r border-t border-fr-v2-forest/30" />
            <span aria-hidden className="pointer-events-none absolute bottom-2.5 left-2.5 size-2.5 border-b border-l border-fr-v2-forest/30" />
            <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-2.5 size-2.5 border-b border-r border-fr-v2-forest/30" />

            <Segmented
              role="group"
              label="Grass view"
              value={view}
              onChange={setView}
              options={[{ value: "wedge", label: "Grass wedge" }, { value: "map", label: "Farm map" }]}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <Segmented
                label="Grass forecast horizon"
                size="sm"
                value={horizon}
                onChange={onHorizon}
                disabled={(d) => !horizonAvailable(d)}
                options={horizons.map((days) => ({ value: days, label: days === 0 ? "Now" : `+${days} days` }))}
              />
              {view === "wedge" ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-fr-v2-muted" aria-hidden>Width</span>
                  <Segmented
                    role="group"
                    label="Bar width"
                    size="sm"
                    value={settings.widthMode}
                    onChange={setWedgeWidthMode}
                    options={[{ value: "area", label: "By area" }, { value: "equal", label: "Equal" }]}
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-fr-v2-cream-rule pt-3">
              <p className="flex flex-wrap items-center gap-2">
                <WhenStamp horizon={horizon} />
                <span className="font-display text-[19px] leading-tight text-fr-v2-graphite">{horizon > 0 ? `Covers as projected in ${horizon} days` : "Covers as of today"}</span>
              </p>
              {horizon > 0 ? <p className="text-[11px] text-fr-v2-muted">A projection, not a measurement.</p> : null}
            </div>

            <div className="pt-3">
              <div className={view === "wedge" ? undefined : "hidden"}>
                <p className="mb-2 text-[12px] text-fr-v2-muted">
                  Fields by cover, tallest first{settings.widthMode === "area" ? ", each as wide as its area" : ""}{horizon > 0 ? `, projected +${horizon} days` : ""}.
                  <HelpTip term="the grass wedge">Each bar is a field. At Now, solid bars show recorded readings (not necessarily taken today); paler bars with a dotted edge are estimates updated to today. In a forecast, the solid portion is retained cover, while teal hatching shows projected gain and amber hatching shows projected loss. The red line is your grazing target. Estimates are not new measurements.</HelpTip>
                </p>
                <GrassWedgeChart
                  bars={bars}
                  line={okLine}
                  horizonDays={horizon}
                  selectedFieldId={selectedFieldId}
                  onSelect={(id) => onSelectField(id === selectedFieldId ? undefined : id)}
                  occupiedFieldIds={occupied}
                />
                {!okLine && line.status === "BLOCKED" ? <p className="mt-3 border-l-2 border-fr-v2-harvest bg-fr-v2-harvest-tint/60 px-3 py-2 text-xs text-fr-v2-charcoal">No target line yet: {line.block.message}</p> : null}
                {okLine ? (
                  // Line provenance: the inputs behind the red line, beside the guide figure already quoted on this screen.
                  // No judgement is computed here; the farmer can see when their saved residual differs from the guide.
                  <div className="mt-3 rounded-[14px] border border-dashed border-fr-v2-cream-rule px-3.5 py-3 text-[11.5px] leading-5 text-fr-v2-muted" data-grass-line-provenance>
                    <p className="font-semibold text-fr-v2-charcoal">How the red line is drawn</p>
                    <p className="mt-0.5 tabular-nums">
                      {kg(okLine.demandKgDmDay)} kg DM/day demand · {formatNumber(okLine.grazingAreaHa, 1)} ha grazing · {okLine.rotationDays}-day rotation · {kg(okLine.residualKgDmHa)} kg DM/ha residual (saved on this device)
                    </p>
                    <p className="mt-0.5">Teagasc beef guide for comparison: residual ≈150 kg DM/ha (about 4 cm). The line is only as sound as these inputs; it has not been reviewed for your farm.</p>
                  </div>
                ) : null}
              </div>
              <div className={view === "map" ? undefined : "hidden"}>{mapMounted ? map : null}</div>

              {horizonNote ? <div className="mt-3 border-t border-fr-v2-cream-rule pt-1 [&_p]:mt-1">{horizonNote}</div> : null}
              {view === "wedge" && okLine ? <Working lines={okLine.working} source={okLine.source} /> : null}

              {selected ? (
                <div className="mt-4 overflow-hidden rounded-[18px] ring-1 ring-fr-v2-cream-rule" data-grass-selected>
                  <div className="flex flex-wrap items-start justify-between gap-3 bg-fr-v2-paper px-4 py-3.5">
                    <div className="min-w-0">
                      <p className={KICKER}>Selected field</p>
                      <p className="mt-1 font-display text-[24px] leading-tight text-fr-v2-graphite">{selected.name}</p>
                      <p className="mt-1 text-xs text-fr-v2-muted">
                        {formatNumber(selected.areaHa, 2)} ha · {selected.ageDays === undefined ? "Not measured" : selected.ageDays < 1 ? "Measured today" : `${Math.floor(selected.ageDays)} days since measured`}{selected.method ? ` · ${selected.method}` : ""} · {selected.historyCount} {selected.historyCount === 1 ? "reading" : "readings"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-[32px] leading-none tabular-nums text-fr-v2-graphite">{selected.coverKgDmHa === undefined ? "—" : kg(selected.coverKgDmHa)}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-fr-v2-muted">kg DM/ha · {selected.basis ?? "unknown"}</p>
                    </div>
                  </div>
                  <div className="bg-white px-4 py-3">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                      {selectedBar?.targetKgDmHa !== undefined ? <div><dt className="text-fr-v2-muted">Target line here</dt><dd className="font-semibold tabular-nums text-fr-v2-charcoal">{kg(selectedBar.targetKgDmHa)} kg DM/ha</dd></div> : null}
                      {selectedBar?.aboveResidualKgDm !== undefined ? (
                        <div>
                          <dt className="text-fr-v2-muted">Grass above residual<HelpTip term="grass above the residual">What there is to graze: cover above the level you graze down to, times the field&apos;s area. Not all of it is eaten.</HelpTip></dt>
                          <dd className="font-semibold tabular-nums text-fr-v2-charcoal">{kg(selectedBar.aboveResidualKgDm)} kg DM</dd>
                        </div>
                      ) : null}
                      <div><dt className="text-fr-v2-muted">Cattle</dt><dd className="text-fr-v2-charcoal">{selected.occupants.length > 0 ? selected.occupants.join(", ") : "None recorded"}</dd></div>
                    </dl>
                    <p className="mt-2 text-[11px] text-fr-v2-muted">Cover is shown as recorded; the measurement basis for older readings is not stored and total standing dry matter is not measured.</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 text-xs font-semibold text-fr-v2-forest">
                      <button type="button" onClick={() => setView(view === "wedge" ? "map" : "wedge")} className="min-h-10 underline decoration-fr-v2-rule underline-offset-4">{view === "wedge" ? "Show on farm map" : "Show on wedge"}</button>
                      <Link href={`/fields?field=${encodeURIComponent(selected.fieldId)}&chapter=history`} className="min-h-10 content-center underline decoration-fr-v2-rule underline-offset-4">Measurement history</Link>
                      <button type="button" onClick={() => { setRemoved([selected.fieldId]); setScenarioOpen(true); }} className="min-h-10 underline decoration-fr-v2-rule underline-offset-4">What if it&apos;s taken out?</button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* II — decisions, as a numbered editorial list. */}
      <section className="mt-12" aria-label="What to do next">
        <Chapter
          numeral="II"
          kicker="Decisions"
          title="What to do next"
          aside={horizon > 0
            ? <>Based on covers projected +{horizon} days, not today&apos;s measurements.</>
            : <>From your own covers and records. Open a row for the reasoning, limits and source.</>}
        />
        {insights.length === 0 ? (
          <p className="mt-4 text-sm text-fr-v2-muted">Nothing needs your attention from the grass you&apos;ve measured.</p>
        ) : (
          <ol className="mt-1">
            {insights.map((insight, i) => (
              <DecisionRow
                key={insight.id}
                index={i}
                baseId={decisionsId}
                insight={insight}
                href={actionHref(insight)}
                onAction={() => runAction(insight)}
                supply={supply}
                growthLabel={growth.chosen?.label}
                horizon={horizon}
                open={expandedInsight === insight.id}
                onToggle={() => setExpandedInsight((cur) => (cur === insight.id ? null : insight.id))}
              />
            ))}
          </ol>
        )}
        <p className="mt-1 border-t border-fr-v2-graphite/80 pt-3 text-[11px] leading-5 text-fr-v2-muted">
          Each figure comes from your readings, cattle records and saved targets. These compare grass with recorded demand; check the ground before acting.
        </p>
      </section>

      {/* III — targets and scenarios. */}
      <section className="mt-12" aria-label="Targets and trials">
        <Chapter numeral="III" kicker="Settings" title={"Targets & trials"} />
        {settingsOpen ? (
          <section className="mt-4 rounded-[20px] bg-white p-5 ring-1 ring-fr-v2-rule" aria-label="Grazing targets">
            <p className="font-display text-[20px] leading-tight text-fr-v2-graphite">Your grazing targets</p>
            <p className="mt-1 text-xs text-fr-v2-muted">Teagasc beef guide: rotation 18–21 days in mid-season, longer in autumn; graze out to about 4 cm (≈150 kg DM/ha on the wedge).</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-fr-v2-charcoal">Rotation length (days)
                <input type="number" inputMode="numeric" min={5} max={120} value={rotationInput} onChange={(e) => setRotationInput(e.target.value)} className="mt-1 block min-h-11 w-full rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 text-base font-normal" />
              </label>
              <label className="text-xs font-semibold text-fr-v2-charcoal">Grazing residual (kg DM/ha)
                <input type="number" inputMode="numeric" min={0} max={1500} value={residualInput} onChange={(e) => setResidualInput(e.target.value)} className="mt-1 block min-h-11 w-full rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 text-base font-normal" />
              </label>
            </div>
            {settingsError ? <p role="alert" className="mt-2 text-xs font-semibold text-fr-red-700">{settingsError}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {inMainGrazingSeason(asOf) ? (
                <button type="button" onClick={() => { setRotationInput("21"); setResidualInput("150"); }} className="min-h-11 rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 text-xs font-semibold text-fr-v2-charcoal">Fill in the Teagasc mid-season guide</button>
              ) : (
                <p className="text-xs text-fr-v2-muted">Outside the main season, enter the longer rotation you&apos;re running now.</p>
              )}
              <button type="button" onClick={saveSettings} className="min-h-11 rounded-fr-v2-control bg-fr-v2-forest px-4 text-xs font-semibold text-white">Save targets</button>
              <button type="button" onClick={() => setSettingsOpen(false)} className="min-h-11 px-2 text-xs font-semibold text-fr-v2-muted">Cancel</button>
            </div>
            <p className="mt-2 text-[11px] text-fr-v2-muted">Saved on this device.</p>
          </section>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
            <div className="min-w-0 text-xs text-fr-v2-muted">
              <p className={KICKER}>Your targets</p>
              <p className="mt-1 font-display text-[20px] leading-tight text-fr-v2-charcoal">
                {settings.targets.rotationDays !== undefined ? `${settings.targets.rotationDays}-day rotation · ${kg(settings.targets.residualKgDmHa ?? 0)} kg DM/ha residual` : "No grazing targets set"}
              </p>
              <p className="mt-0.5 text-[11px]">Teagasc beef guide: 18–21 days mid-season; residual ≈150 kg DM/ha (about 4 cm). Saved on this device.</p>
            </div>
            <button type="button" onClick={openSettings} className="min-h-11 rounded-full border border-fr-v2-forest/50 bg-white px-4 text-xs font-semibold text-fr-v2-forest hover:bg-fr-v2-teal-tint/40">{settings.targets.rotationDays !== undefined ? "Change" : "Set rotation length"}</button>
          </div>
        )}

        <section id="grass-scenario" className="mt-2 scroll-mt-4 border-t border-fr-v2-cream-rule" aria-label="Try a change">
          <button type="button" onClick={() => setScenarioOpen((o) => !o)} aria-expanded={scenarioOpen} className="flex min-h-14 w-full items-center justify-between gap-3 text-left">
            <span>
              <span className="block text-sm font-semibold text-fr-v2-charcoal">Try a change</span>
              <span className="block text-xs text-fr-v2-muted">Preview a longer rotation or taking fields out — nothing is saved</span>
            </span>
            {scenarioOpen ? <ChevronUp className="size-4 shrink-0 text-fr-v2-forest" aria-hidden /> : <ChevronDown className="size-4 shrink-0 text-fr-v2-forest" aria-hidden />}
          </button>
          {scenarioOpen && scenario ? (
            <div className="mb-2 rounded-[20px] bg-white p-5 ring-1 ring-fr-v2-rule">
              <p className="text-xs text-fr-v2-muted">A preview only: nothing is saved or changed on the farm.</p>
              <label className="mt-3 block text-xs font-semibold text-fr-v2-charcoal">Rotation length (days)
                <input type="number" inputMode="numeric" min={5} max={120} value={scenarioRotation} placeholder={settings.targets.rotationDays !== undefined ? String(settings.targets.rotationDays) : "e.g. 21"} onChange={(e) => setScenarioRotation(e.target.value)} className="mt-1 block min-h-11 w-40 rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 text-base font-normal" />
              </label>
              <p className="mt-4 text-xs font-semibold text-fr-v2-charcoal">Take fields out of the grazing (for silage)</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {fields.map((f) => (
                  <label key={f.fieldId} className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs", removed.includes(f.fieldId) ? "border-fr-v2-forest bg-fr-v2-teal-tint/50 text-fr-v2-forest" : "border-fr-v2-cream-rule text-fr-v2-charcoal")}>
                    <input type="checkbox" className="size-4 accent-[var(--fr-v2-forest)]" checked={removed.includes(f.fieldId)} onChange={(e) => setRemoved((r) => (e.target.checked ? [...r, f.fieldId] : r.filter((id) => id !== f.fieldId)))} />
                    {f.name}
                  </label>
                ))}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-fr-v2-cream-rule pt-3 text-xs sm:grid-cols-4">
                <div><dt className="text-fr-v2-muted">Grazing area left</dt><dd className="font-semibold tabular-nums text-fr-v2-charcoal">{formatNumber(scenario.remainingAreaHa, 2)} ha</dd></div>
                {scenario.line.status === "OK" ? (
                  <>
                    <div><dt className="text-fr-v2-muted">Target pre-grazing</dt><dd className="font-semibold tabular-nums text-fr-v2-charcoal">{kg(scenario.line.line.targetPreGrazingKgDmHa)} kg DM/ha</dd></div>
                    <div><dt className="text-fr-v2-muted">Against the line</dt><dd className="font-semibold tabular-nums text-fr-v2-charcoal">{scenario.position ? `${scenario.position.days >= 0 ? "" : "−"}${Math.abs(scenario.position.days).toFixed(0)} days of demand` : "Not measured"}</dd></div>
                  </>
                ) : (
                  <div className="col-span-2"><dt className="text-fr-v2-muted">Target line</dt><dd className="text-fr-v2-charcoal">{scenario.line.block.message}</dd></div>
                )}
                {scenario.removedAboveResidualKgDm !== undefined ? <div><dt className="text-fr-v2-muted">Grass above residual taken out</dt><dd className="font-semibold tabular-nums text-fr-v2-charcoal">{kg(scenario.removedAboveResidualKgDm)} kg DM today</dd></div> : null}
              </dl>
              {scenario.removedUnmeasured > 0 ? <p className="mt-2 text-[11px] text-fr-v2-muted">{scenario.removedUnmeasured} of the fields taken out {scenario.removedUnmeasured === 1 ? "isn't" : "aren't"} measured, so {scenario.removedUnmeasured === 1 ? "its" : "their"} grass isn&apos;t counted.</p> : null}
              <p className="mt-2 text-[11px] text-fr-v2-muted">Grass above the residual today is not a silage yield: that depends on when it&apos;s cut, growth until then and the weather.</p>
              {scenario.line.status === "OK" ? <Working lines={[...scenario.line.line.working, ...(scenario.position?.working ?? [])]} source={scenario.line.line.source} /> : null}
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}
