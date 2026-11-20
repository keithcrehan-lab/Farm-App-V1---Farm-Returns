"use client";

/**
 * Grass V2 overview: the compact summary, the wedge (default) and farm map with
 * one shared field selection, "What to do next", a scenario preview and the
 * target settings. Every figure comes from `src/domain/grass-wedge-target.ts`
 * or the grass engine; this component arranges and explains them.
 *
 * Grass UI redesign (2026-11-19, design-only): three levels of disclosure —
 * (1) snapshot + one action per decision, (2) "Why, and which fields",
 * (3) "Show calculation" with the engine's own working lines and source.
 * No quantity here is re-derived; values are the engine's, formatted.
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Footprints, History, X } from "lucide-react";
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

type View = "wedge" | "map" | "insights";
const kg = (n: number) => formatNumber(n, 0);

/** Small uppercase label used across the screen (existing Farm Return kicker style). */
const KICKER = "font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-fr-v2-muted";

function Working({ lines, source }: { lines: readonly CalcLine[]; source?: string }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-fr-v2-forest">
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

/** One row of the snapshot ledger: label, number + unit, and a short plain-language detail. */
function LedgerRow({ label, help, value, unit, children }: { label: string; help?: ReactNode; value: string; unit?: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-3.5 lg:py-5">
      <dt className="text-[11px] font-semibold text-fr-v2-muted">{label}{help}</dt>
      <dd className="mt-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-[26px] leading-none tabular-nums text-fr-v2-graphite">{value}</span>
          {unit ? <span className="text-[11px] text-fr-v2-muted">{unit}</span> : null}
        </p>
        {children ? <div className="mt-1.5 space-y-0.5 text-[12px] leading-[1.35rem] text-fr-v2-muted">{children}</div> : null}
      </dd>
    </div>
  );
}

/** A compact segmented control (existing control radius and shell colour). */
function Segmented<T extends string | number>({ options, value, onChange, label, role, disabled, className, size = "md" }: {
  options: ReadonlyArray<{ value: T; label: ReactNode; ariaLabel?: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  role?: "group";
  disabled?: (value: T) => boolean;
  className?: string;
  size?: "md" | "sm";
}) {
  return (
    <div role={role} aria-label={label} className={cn("flex rounded-[12px] bg-fr-v2-stone p-1", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          aria-label={o.ariaLabel}
          disabled={disabled?.(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-[9px] font-semibold transition-colors duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-35",
            size === "md" ? "min-h-10 px-3.5 text-[13px]" : "min-h-9 px-3 text-xs",
            value === o.value ? "bg-white text-fr-v2-forest shadow-[0_1px_2px_rgba(19,26,22,0.14)]" : "text-fr-v2-muted hover:text-fr-v2-charcoal",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TONE_STYLE: Record<GrassInsight["tone"], { rail: string; kicker: string; label: string }> = {
  action: { rail: "bg-fr-v2-straw", kicker: "text-fr-v2-harvest-ink", label: "Needs input" },
  surplus: { rail: "bg-fr-v2-forest", kicker: "text-fr-v2-forest", label: "Surplus" },
  shortage: { rail: "bg-fr-v2-harvest", kicker: "text-fr-v2-harvest-ink", label: "Shortfall" },
  info: { rail: "bg-fr-v2-teal", kicker: "text-fr-v2-teal", label: "Trend" },
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

function InsightCard({ insight, href, onAction, supply, growthLabel, horizon }: {
  insight: GrassInsight;
  href?: string;
  onAction: () => void;
  asOf: string;
  supply?: SupplyDemand;
  growthLabel?: string;
  horizon: number;
}) {
  const tone = TONE_STYLE[insight.tone];
  const isPosition = insight.id === "surplus" || insight.id === "shortage";
  const isGrowth = insight.id === "growth";
  const tentative = isPosition && insight.confidence !== "measured";
  // The detailed source-backed Teagasc wording is in insight.why below. Do not
  // duplicate seasonal advice in the UI where it could drift from the engine.
  const hasDetail = isPosition || isGrowth || insight.figures.length > 0 || insight.working.length > 0;

  return (
    <li className="relative overflow-hidden rounded-[18px] border border-fr-v2-rule bg-white">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", tone.rail)} />
      <div className="px-5 pb-4 pt-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("font-mono text-[10px] font-semibold uppercase tracking-[0.16em]", tone.kicker)}>{tone.label}</span>
          <span aria-hidden className="text-fr-v2-cream-rule">·</span>
          <span className="text-[11px] font-medium text-fr-v2-muted">{confidenceLabel(insight)}</span>
        </div>
        <h3 className="mt-1.5 font-display text-[21px] leading-[1.15] text-fr-v2-graphite">{insight.title}</h3>

        {isPosition && insight.figures[0] ? (
          <p className="mt-2 text-sm text-fr-v2-charcoal">
            <span className="font-semibold tabular-nums">{insight.figures[0]}</span>
            {horizon > 0 ? <span className="text-fr-v2-muted"> · covers projected +{horizon} days</span> : null}
          </p>
        ) : null}
        {tentative ? (
          <p className="mt-2 rounded-[10px] bg-fr-v2-harvest-tint/70 px-3 py-2 text-[12px] leading-5 text-fr-v2-charcoal">
            {insight.confidence === "mixed"
              ? "Some readings are more than 7 days old, or part of the grazing area is unmeasured."
              : "None of these readings is from the last 7 days."} Confirm on your next walk before acting.
          </p>
        ) : null}

        {isGrowth && supply ? (
          <dl className="mt-3 grid grid-cols-2 gap-3">
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

        {/* Information-gathering prompts keep their full reason on the surface. */}
        {!isPosition && !isGrowth ? <p className="mt-1.5 text-[13px] leading-5 text-fr-v2-muted">{insight.why}</p> : null}
        {!isPosition && !isGrowth && insight.figures.length > 0 ? <p className="mt-1.5 text-[12px] text-fr-v2-charcoal">{insight.figures.join(" · ")}</p> : null}

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {href ? (
            <Link href={href} className="inline-flex min-h-11 items-center rounded-[12px] bg-fr-v2-forest px-4 text-[13px] font-semibold text-white hover:bg-fr-v2-forest-deep-2">{insight.actionLabel}</Link>
          ) : (
            <button type="button" onClick={onAction} className="inline-flex min-h-11 items-center rounded-[12px] border border-fr-v2-forest px-4 text-[13px] font-semibold text-fr-v2-forest hover:bg-fr-v2-teal-tint/40">{insight.actionLabel}</button>
          )}
          {tentative ? (
            <Link href="/grass/walk" className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] px-3 text-[13px] font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-4">
              <Footprints className="size-4" aria-hidden />Walk to confirm
            </Link>
          ) : null}
        </div>

        {hasDetail && (isPosition || isGrowth) ? (
          <details className="group mt-3 border-t border-fr-v2-cream-rule pt-1">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-fr-v2-forest marker:hidden [&::-webkit-details-marker]:hidden">
              {isPosition ? "Why, and which fields" : "Why, and its limits"}
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
            </summary>
            <p className="mt-1 text-[13px] leading-5 text-fr-v2-charcoal">{insight.why}</p>
            {isPosition ? (
              <p className="mt-2 text-[12px] leading-5 text-fr-v2-muted">
                &ldquo;Days of demand&rdquo; divides the grass above the line by today&apos;s recorded cattle demand. It compares stock with demand; it is not a forecast of how long grazing will last, and ignores growth, weather and season.
              </p>
            ) : (
              <p className="mt-2 text-[12px] leading-5 text-fr-v2-muted">
                Growth uses the growth rate in use across the grazing area. Demand is estimated from recorded cattle liveweight; Farm Return does not measure what is eaten.
              </p>
            )}
            {insight.figures.length > 0 ? (
              <ul className="mt-2 divide-y divide-fr-v2-cream-rule rounded-[12px] border border-fr-v2-cream-rule text-[12px]">
                {insight.figures.map((f, i) => <FigureRow key={`${i}-${f}`} text={f} />)}
              </ul>
            ) : null}
            <Working lines={insight.working} source={insight.source} />
          </details>
        ) : (
          <Working lines={insight.working} source={insight.source} />
        )}
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
  const measuredRecently = fields.filter((f) => f.coverKgDmHa !== undefined && (f.ageDays ?? Infinity) <= 14).length;

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
  const freshShare = fields.length > 0 ? measuredRecently / fields.length : 0;

  return (
    <div>
      <div className="flex items-end justify-between gap-3 border-b border-fr-v2-cream-rule pb-3 pt-1" aria-label="Grass position today"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-fr-v2-muted">Average farm cover · Today</p><p className="mt-1 font-display text-[40px] leading-none tabular-nums text-fr-v2-graphite">{averageCoverKgDmHa === undefined ? "—" : kg(averageCoverKgDmHa)} <span className="font-sans text-[12px] font-normal text-fr-v2-muted">kg DM/ha</span></p></div><div className="text-right text-[11px] text-fr-v2-muted"><p>{averageBasis ? `${averageBasis} basis` : "Not measured"}</p><p>{measuredRecently}/{fields.length} fields recent</p></div></div>\n      {/* C — wedge & map. */}
      <section className="mt-1 overflow-hidden border-b border-fr-v2-cream-rule bg-transparent pb-5" aria-label={view === "wedge" ? "Grass wedge" : view === "map" ? "Farm map" : "Grass insights"}>
        <div className="pt-2 sm:px-1">
          <Segmented
            role="group"
            label="Grass view"
            value={view}
            onChange={setView}
            options={[{ value: "wedge", label: "Wedge" }, { value: "map", label: "Map" }, { value: "insights", label: "Insights" }]}
          />
          {view !== "insights" ? <div className="mt-3 flex items-center justify-between gap-3">
            <Segmented
              label="Grass forecast horizon"
              size="sm"
              value={horizon}
              onChange={onHorizon}
              disabled={(d) => !horizonAvailable(d)}
              options={horizons.map((days) => ({ value: days, label: days === 0 ? "Now" : `+${days} days` }))}
            />

          </div> : null}
        </div>

        {view !== "insights" ? <div className="pb-2 pt-3 sm:px-1">
          {view === "wedge" ? <GrassGuide /> : null}
          <div className={view === "wedge" ? undefined : "hidden"}>
            <div className="mb-2 flex items-end justify-between gap-2"><div><h2 className="font-display text-[24px] leading-none text-fr-v2-graphite">Grass by field</h2><p className="mt-1 text-[11px] text-fr-v2-muted">Highest cover first · select a field to explore</p></div><button type="button" onClick={openGrassGuide} aria-label="Show grass guide" className="min-h-10 text-xs font-semibold text-fr-v2-forest">How to read this ↗</button></div>
            <GrassWedgeChart
              bars={bars}
              line={okLine}
              horizonDays={horizon}
              selectedFieldId={selectedFieldId}
              onSelect={(id) => onSelectField(id === selectedFieldId ? undefined : id)}
              occupiedFieldIds={occupied}
            />
            <details className="mt-2 border-t border-fr-v2-cream-rule pt-2"><summary className="cursor-pointer py-2 text-xs font-semibold text-fr-v2-forest">Chart display settings</summary>            {view === "wedge" ? (
              <div role="group" aria-label="Bar width" className="flex items-center gap-1 text-xs">
                <span className="mr-1 text-fr-v2-muted">Width</span>
                {(["area", "equal"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={settings.widthMode === m} onClick={() => setWedgeWidthMode(m)} className={cn("min-h-9 rounded-[8px] px-2.5 font-semibold", settings.widthMode === m ? "bg-fr-v2-teal-tint text-fr-v2-forest" : "text-fr-v2-muted hover:text-fr-v2-charcoal")}>
                    {m === "area" ? "By area" : "Equal"}
                  </button>
                ))}
              </div>
            ) : null}</details>
            {!okLine && line.status === "BLOCKED" ? <p className="mt-3 rounded-[12px] bg-fr-v2-harvest-tint/60 px-3 py-2 text-xs text-fr-v2-charcoal">No target line yet: {line.block.message}</p> : null}
          </div>
          <div className={view === "map" ? undefined : "hidden"}>{mapMounted ? map : null}</div>

          {horizonNote ? <div className="mt-3 border-t border-fr-v2-cream-rule pt-1 [&_p]:mt-1">{horizonNote}</div> : null}
          {view === "wedge" && okLine ? <Working lines={okLine.working} source={okLine.source} /> : null}

          {selected ? (
            <div className="mt-4 border-l-[3px] border-fr-v2-forest bg-fr-v2-paper/60 px-4 py-4 sm:px-5" data-grass-selected role="region" aria-label="Selected field details">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={KICKER}>FIELD / {fields.findIndex((f) => f.fieldId === selected.fieldId) + 1} OF {fields.length}</p>
                  <p className="mt-1 font-display text-[22px] leading-tight text-fr-v2-graphite">{selected.name}</p>
                  <p className="mt-1 text-xs text-fr-v2-muted">
                    {formatNumber(selected.areaHa, 2)} ha · {selected.ageDays === undefined ? "Not measured" : selected.ageDays < 1 ? "Measured today" : `${Math.floor(selected.ageDays)} days since measured`}{selected.method ? ` · ${selected.method}` : ""} · {selected.historyCount} {selected.historyCount === 1 ? "reading" : "readings"}
                  </p>
                </div>
                <div className="flex items-start gap-3"><div className="text-right">
                  <p className="font-display text-[28px] leading-none tabular-nums text-fr-v2-graphite">{selected.coverKgDmHa === undefined ? "—" : kg(selected.coverKgDmHa)}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-fr-v2-muted">kg DM/ha · {selected.basis ?? "unknown"}</p>
                </div><button type="button" aria-label="Close field details" onClick={() => onSelectField(undefined)} className="flex size-10 shrink-0 items-center justify-center rounded-full text-fr-v2-muted hover:bg-white focus-visible:outline-2 focus-visible:outline-fr-v2-forest"><X className="size-4" aria-hidden /></button></div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-fr-v2-cream-rule pt-3 text-xs sm:grid-cols-3">
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
              <div className="mt-3 flex flex-wrap gap-x-4 border-t border-fr-v2-cream-rule pt-2 text-xs font-semibold text-fr-v2-forest">
                <button type="button" onClick={() => setView(view === "wedge" ? "map" : "wedge")} className="min-h-10 underline decoration-fr-v2-rule underline-offset-4">{view === "wedge" ? "Show on farm map" : "Show on wedge"}</button>
                <Link href={`/fields?field=${encodeURIComponent(selected.fieldId)}&chapter=history`} className="min-h-10 content-center underline decoration-fr-v2-rule underline-offset-4">Measurement history</Link>
                <button type="button" onClick={() => { setRemoved([selected.fieldId]); setScenarioOpen(true); setView("insights"); }} className="min-h-10 underline decoration-fr-v2-rule underline-offset-4">What if it&apos;s taken out?</button>
              </div>
            </div>
          ) : null}
        </div> : null}
      </section>

      {/* A — primary walk action and quiet history link. */}
      <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Grass actions">
        <Link href="/grass/walk" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-fr-v2-forest px-5 text-[15px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_6px_16px_-8px_rgba(23,63,45,0.6)] hover:bg-fr-v2-forest-deep-2">
          <Footprints className="size-[18px]" aria-hidden />Start grass walk
        </Link>
        <Link href="/grass/walks" className="inline-flex min-h-10 items-center gap-1.5 px-2 text-[12px] font-semibold text-fr-v2-forest underline underline-offset-4">
          <History className="size-4" aria-hidden />Past walks
        </Link>
      </div>

      {/* B — farm snapshot: hero cover, then a ledger of supporting figures. */}
      <section className="mt-2 border-t border-fr-v2-cream-rule bg-transparent lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)]" aria-label="Grass summary">
        <div className="px-1 pb-3 pt-3 lg:border-r lg:border-fr-v2-cream-rule lg:py-6">
          <p className={KICKER}>
            Average farm cover · Today
            <HelpTip term="average farm cover">The grass on your fields, averaged by size, as recorded in kg of dry matter per hectare. The measurement basis is not stored for older readings; compare readings taken using the same method. Unmeasured fields are excluded, not treated as bare.</HelpTip>
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-[40px] leading-[0.95] sm:text-[54px] tracking-[-0.01em] tabular-nums text-fr-v2-graphite">{averageCoverKgDmHa === undefined ? "—" : kg(averageCoverKgDmHa)}</span>
            <span className="text-sm text-fr-v2-muted">{averageCoverKgDmHa === undefined ? "Not measured" : "kg DM/ha"}</span>
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fr-v2-muted">
            {averageBasis ? (
              <span className={cn("rounded-full px-2 py-0.5 font-semibold first-letter:uppercase", averageBasis === "estimated" ? "bg-fr-v2-harvest-tint text-fr-v2-harvest-ink" : "bg-fr-v2-teal-tint text-fr-v2-teal")}>{averageBasis} basis</span>
            ) : null}
            <span>{lastReading ? `Last reading ${lastReading}` : "No readings yet"}</span>
          </p>
          <div className="mt-2">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-fr-v2-charcoal"><span className="font-semibold tabular-nums">{measuredRecently} of {fields.length}</span> fields measured in the last 2 weeks</span>
              <HelpTip term="measurement freshness">With reliable growth and grazing evidence, an earlier reading can be estimated forward to today. Without that evidence, the recorded reading remains unchanged; after two weeks, walk the field again.</HelpTip>
            </div>
            <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fr-v2-stone">
              <div className={cn("h-full rounded-full", freshShare === 1 ? "bg-fr-v2-forest" : "bg-fr-v2-harvest")} style={{ width: `${Math.round(freshShare * 100)}%` }} />
            </div>
          </div>
        </div>

        <details className="group border-t border-fr-v2-cream-rule lg:border-t-0">
          <summary className="flex min-h-10 cursor-pointer items-center justify-between px-4 text-xs font-semibold text-fr-v2-forest lg:hidden">Growth, demand and targets <span aria-hidden>⌄</span></summary>
        <dl className="divide-y divide-fr-v2-cream-rule border-t border-fr-v2-cream-rule lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0 lg:border-t-0">
          <LedgerRow
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
        </details>
      </section>
      <details className="mt-2 text-xs text-fr-v2-muted"><summary className="cursor-pointer py-2 font-semibold text-fr-v2-forest">Regional growth information</summary><RegionalGrowthStatus regional={regionalGrowth} /></details>


      {/* D — decisions. */}
      {view === "insights" ? <section className="mt-3" aria-label="What to do next">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-[28px] leading-none text-fr-v2-graphite">What to do next</h2>
          {horizon > 0 ? <p className="text-xs text-fr-v2-muted">Based on covers projected +{horizon} days, not today&apos;s measurements.</p> : null}
        </div>
        {insights.length === 0 ? (
          <p className="mt-3 rounded-[18px] border border-fr-v2-rule bg-white px-5 py-4 text-sm text-fr-v2-muted">Nothing needs your attention from the grass you&apos;ve measured.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                href={actionHref(insight)}
                onAction={() => runAction(insight)}
                asOf={asOf}
                supply={supply}
                growthLabel={growth.chosen?.label}
                horizon={horizon}
              />
            ))}
          </ul>
        )}
      </section> : null}

      {/* E — targets, scenarios. */}
      {view === "insights" && settingsOpen ? (
        <section className="mt-5 rounded-[18px] border border-fr-v2-rule bg-white p-5" aria-label="Grazing targets">
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
      ) : view === "insights" ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-fr-v2-cream-rule pt-4">
          <div className="min-w-0 text-xs text-fr-v2-muted">
            <p className={KICKER}>Your targets</p>
            <p className="mt-1 text-[13px] text-fr-v2-charcoal">
              {settings.targets.rotationDays !== undefined ? `${settings.targets.rotationDays}-day rotation · ${kg(settings.targets.residualKgDmHa ?? 0)} kg DM/ha residual` : "No grazing targets set"}
            </p>
            <p className="mt-0.5 text-[11px]">Teagasc beef guide: 18–21 days mid-season; residual ≈150 kg DM/ha (about 4 cm). Saved on this device.</p>
          </div>
          <button type="button" onClick={openSettings} className="min-h-11 rounded-[12px] border border-fr-v2-rule bg-white px-3.5 text-xs font-semibold text-fr-v2-forest">{settings.targets.rotationDays !== undefined ? "Change" : "Set rotation length"}</button>
        </div>
      ) : null}

      {view === "insights" || scenarioOpen ? <section id="grass-scenario" className="mt-3 scroll-mt-4 border-t border-fr-v2-cream-rule" aria-label="Try a change">
        <button type="button" onClick={() => setScenarioOpen((o) => !o)} aria-expanded={scenarioOpen} className="flex min-h-14 w-full items-center justify-between gap-3 text-left">
          <span>
            <span className="block text-sm font-semibold text-fr-v2-charcoal">Try a change</span>
            <span className="block text-xs text-fr-v2-muted">Preview a longer rotation or taking fields out — nothing is saved</span>
          </span>
          {scenarioOpen ? <ChevronUp className="size-4 shrink-0 text-fr-v2-forest" aria-hidden /> : <ChevronDown className="size-4 shrink-0 text-fr-v2-forest" aria-hidden />}
        </button>
        {scenarioOpen && scenario ? (
          <div className="mb-2 rounded-[18px] border border-fr-v2-rule bg-white p-5">
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
      </section> : null}
    </div>
  );
}
