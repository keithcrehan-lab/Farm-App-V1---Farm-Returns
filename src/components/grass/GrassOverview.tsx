"use client";

/**
 * Grass V2 overview: the compact summary, the wedge (default) and farm map with
 * one shared field selection, "What should I do?", a scenario preview and the
 * target settings. Every figure comes from `src/domain/grass-wedge-target.ts`
 * or the grass engine; this component arranges and explains them.
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Footprints } from "lucide-react";
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
  type WedgeField,
} from "@/domain/grass-wedge-target";

export interface OverviewField extends WedgeField {
  basis?: string;
  ageDays?: number;
  method?: string;
  occupants: string[];
  historyCount: number;
}

type View = "wedge" | "map";
const kg = (n: number) => formatNumber(n, 0);

function Working({ lines, source }: { lines: readonly CalcLine[]; source?: string }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-semibold text-fr-v2-forest">
        Show calculation {open ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
      </button>
      {open ? (
        <dl className="mt-2 space-y-1 border-l-2 border-fr-v2-cream-rule pl-3 text-[11px] text-fr-v2-muted">
          {lines.map((l, i) => (
            <div key={`${l.label}-${i}`} className="flex flex-wrap gap-x-2"><dt className="font-semibold text-fr-v2-charcoal">{l.label}</dt><dd className="font-mono tabular-nums">{l.value}</dd></div>
          ))}
          {source ? <p className="pt-1">Source: {source}</p> : null}
        </dl>
      ) : null}
    </div>
  );
}

function Metric({ label, help, value, unit, detail }: { label: string; help?: ReactNode; value: string; unit?: string; detail?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fr-v2-muted">{label}{help}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-fr-v2-charcoal">{value}{unit ? <span className="ml-1 text-[10px] font-normal text-fr-v2-muted">{unit}</span> : null}</p>
      {detail ? <div className="mt-0.5 text-[11px] leading-4 text-fr-v2-muted">{detail}</div> : null}
    </div>
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

  const positionText = !okLine
    ? line.status === "BLOCKED" && line.block.code === "TARGETS_NOT_SET" ? "Set targets" : "Not yet"
    : position === undefined ? "Not measured" : position.days >= 0 ? `+${position.days.toFixed(0)} days of demand` : `−${Math.abs(position.days).toFixed(0)} days of demand`;

  return (
    <div>
      <GrassGuide />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link href="/grass/walk" className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-[16px] bg-fr-v2-forest px-5 text-base font-semibold text-white">
          <Footprints className="size-5" aria-hidden />Start grass walk
        </Link>
        <div className="flex justify-center gap-4 text-xs font-semibold text-fr-v2-forest sm:justify-end">
          <Link href="/grass/walks" className="min-h-10 content-center underline decoration-fr-v2-rule underline-offset-2">Past walks</Link>
          <button type="button" onClick={openGrassGuide} className="min-h-10 underline decoration-fr-v2-rule underline-offset-2">Show grass guide</button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-fr-v2-cream-rule py-4 lg:grid-cols-4" aria-label="Grass summary">
        <Metric
          label="Average farm cover"
          help={<HelpTip term="average farm cover">The grass on your fields, averaged by size, in kg of dry matter per hectare above about 4 cm. Unmeasured fields are left out, not counted as bare.</HelpTip>}
          value={averageCoverKgDmHa === undefined ? "Not measured" : kg(averageCoverKgDmHa)}
          unit={averageCoverKgDmHa === undefined ? undefined : "kg DM/ha"}
          detail={averageBasis ? `${averageBasis} basis` : undefined}
        />
        <Metric
          label="Growth in use"
          help={<HelpTip term="grass growth rate">The growth rate used for farm cover estimates. Your recent observations take precedence over county predictions. {growth.reason}</HelpTip>}
          value={growth.chosen ? kg(growth.chosen.rateKgDmHaDay) : "Not recorded"}
          unit={growth.chosen ? "kg DM/ha/day" : undefined}
          detail={growth.chosen ? (
            <>
              {growth.chosen.label}
              {growth.others.map((o) => <span key={o.kind} className="block">{o.label}: {kg(o.rateKgDmHaDay)}</span>)}
            </>
          ) : "Two walks of the same fields will measure it."}
        />
        <Metric
          label="Cattle demand"
          help={<HelpTip term="livestock demand">The grass your cattle on the fields eat each day: about 2% of liveweight per head (Teagasc beef grazing guide), from your Cattle records.</HelpTip>}
          value={groups.length === 0 ? "No cattle out" : resolvedDemand !== undefined ? kg(resolvedDemand) : "Incomplete"}
          unit={resolvedDemand !== undefined ? "kg DM/day" : undefined}
          detail={supply ? `${supply.balanceKgDmDay >= 0 ? "Growing" : "Short"} ${kg(Math.abs(supply.balanceKgDmDay))} kg DM/day ${supply.balanceKgDmDay >= 0 ? "more than eaten" : "of what's eaten"}` : groups.length > 0 && resolvedDemand === undefined ? "Some groups need a liveweight" : undefined}
        />
        <Metric
          label="Against the line"
          help={<HelpTip term="the red target line">Days of grazing your covers are ahead of (or behind) the target line, from your cattle&apos;s demand, grazing area, rotation length and residual.</HelpTip>}
          value={positionText}
          detail={okLine ? `Target pre-grazing ${kg(okLine.targetPreGrazingKgDmHa)} kg DM/ha` : undefined}
        />
        <p className="col-span-2 text-[11px] text-fr-v2-muted lg:col-span-4">
          {latestWalkAt ? `Last reading ${new Date(latestWalkAt).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}` : "No readings yet"} · {measuredRecently} of {fields.length} fields measured in the last 2 weeks
          <HelpTip term="measurement freshness">Covers older than a week are estimated forward from growth and cattle demand; after two weeks a field should be walked again.</HelpTip>
        </p>
      </section>
      <RegionalGrowthStatus regional={regionalGrowth} />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-fr-v2-control border border-fr-v2-cream-rule bg-fr-v2-cream p-1" role="group" aria-label="Grass view">
          {(["wedge", "map"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("min-h-9 rounded-fr-v2-control px-3.5 text-xs font-semibold", view === v ? "bg-fr-v2-shell text-white" : "text-fr-v2-charcoal")}>
              {v === "wedge" ? "Grass wedge" : "Farm map"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-fr-v2-control border border-fr-v2-cream-rule bg-fr-v2-cream p-1" aria-label="Grass forecast horizon">
            {horizons.map((days) => (
              <button key={days} type="button" disabled={!horizonAvailable(days)} aria-pressed={horizon === days} onClick={() => onHorizon(days)} className={cn("min-h-9 rounded-fr-v2-control px-3 text-xs font-semibold disabled:opacity-40", horizon === days ? "bg-fr-v2-shell text-white" : "text-fr-v2-charcoal")}>
                {days === 0 ? "Now" : `+${days} days`}
              </button>
            ))}
          </div>
          {view === "wedge" ? (
            <div className="flex rounded-fr-v2-control border border-fr-v2-cream-rule bg-fr-v2-cream p-1" role="group" aria-label="Bar width">
              {(["area", "equal"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={settings.widthMode === m} onClick={() => setWedgeWidthMode(m)} className={cn("min-h-9 rounded-fr-v2-control px-3 text-xs font-semibold", settings.widthMode === m ? "bg-fr-v2-shell text-white" : "text-fr-v2-charcoal")}>
                  {m === "area" ? "By area" : "Equal"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {horizonNote}

      <section className="mt-3 rounded-[20px] border border-fr-v2-cream-rule bg-fr-v2-cream p-4" aria-label={view === "wedge" ? "Grass wedge" : "Farm map"}>
        <div className={view === "wedge" ? undefined : "hidden"}>
          <p className="mb-2 text-xs text-fr-v2-muted">
            Fields by cover, tallest first{settings.widthMode === "area" ? ", each as wide as its area" : ""}{horizon > 0 ? `, projected +${horizon} days` : ""}.
            <HelpTip term="the grass wedge">Each bar is a field. Bars above the red line have more grass than your cattle need at that point in the rotation; bars below have less.</HelpTip>
          </p>
          <GrassWedgeChart bars={bars} line={okLine} selectedFieldId={selectedFieldId} onSelect={(id) => onSelectField(id === selectedFieldId ? undefined : id)} occupiedFieldIds={occupied} />
          {!okLine && line.status === "BLOCKED" ? <p className="mt-2 text-xs text-fr-v2-muted">No target line yet: {line.block.message}</p> : null}
          {okLine ? <Working lines={okLine.working} source={okLine.source} /> : null}
        </div>
        <div className={view === "map" ? undefined : "hidden"}>{mapMounted ? map : null}</div>

        {selected ? (
          <div className="mt-3 border-t border-fr-v2-cream-rule pt-3" data-grass-selected>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-[22px] leading-none text-fr-v2-graphite">{selected.name}</p>
                <p className="mt-1 text-xs text-fr-v2-muted">
                  {formatNumber(selected.areaHa, 2)} ha · {selected.ageDays === undefined ? "Not measured" : selected.ageDays < 1 ? "Measured today" : `${Math.floor(selected.ageDays)} days since measured`}{selected.method ? ` · ${selected.method}` : ""} · {selected.historyCount} {selected.historyCount === 1 ? "reading" : "readings"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-xl font-semibold tabular-nums text-fr-v2-charcoal">{selected.coverKgDmHa === undefined ? "—" : kg(selected.coverKgDmHa)}</p>
                <p className="text-[10px] uppercase tracking-[0.1em] text-fr-v2-muted">kg DM/ha · {selected.basis ?? "unknown"}</p>
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
              {selectedBar?.targetKgDmHa !== undefined ? <div><dt className="text-fr-v2-muted">Target line here</dt><dd className="font-mono tabular-nums text-fr-v2-charcoal">{kg(selectedBar.targetKgDmHa)} kg DM/ha</dd></div> : null}
              {selectedBar?.aboveResidualKgDm !== undefined ? (
                <div>
                  <dt className="text-fr-v2-muted">Grass above residual<HelpTip term="grass above the residual">What there is to graze: cover above the level you graze down to, times the field&apos;s area. Not all of it is eaten.</HelpTip></dt>
                  <dd className="font-mono tabular-nums text-fr-v2-charcoal">{kg(selectedBar.aboveResidualKgDm)} kg DM</dd>
                </div>
              ) : null}
              <div><dt className="text-fr-v2-muted">Cattle</dt><dd className="text-fr-v2-charcoal">{selected.occupants.length > 0 ? selected.occupants.join(", ") : "None recorded"}</dd></div>
            </dl>
            <p className="mt-1 text-[11px] text-fr-v2-muted">Cover is measured above about 4 cm; total standing dry matter isn&apos;t measured.</p>
            <div className="mt-2 flex flex-wrap gap-x-4 text-xs font-semibold text-fr-v2-forest">
              <button type="button" onClick={() => setView(view === "wedge" ? "map" : "wedge")} className="min-h-9 underline decoration-fr-v2-rule underline-offset-2">{view === "wedge" ? "Show on farm map" : "Show on wedge"}</button>
              <Link href={`/fields?field=${encodeURIComponent(selected.fieldId)}&chapter=history`} className="min-h-9 content-center underline decoration-fr-v2-rule underline-offset-2">Measurement history</Link>
              <button type="button" onClick={() => { setRemoved([selected.fieldId]); setScenarioOpen(true); }} className="min-h-9 underline decoration-fr-v2-rule underline-offset-2">What if it&apos;s taken out?</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-6" aria-label="What should I do?">
        <h2 className="font-display text-[26px] leading-none text-fr-v2-graphite">What should I do?</h2>
        {horizon > 0 ? <p className="mt-1 text-xs text-fr-v2-muted">Based on covers projected +{horizon} days, not today&apos;s measurements.</p> : null}
        {insights.length === 0 ? (
          <p className="mt-2 text-sm text-fr-v2-muted">Nothing needs your attention from the grass you&apos;ve measured.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {insights.map((insight) => {
              const href = actionHref(insight);
              return (
                <li key={insight.id} className={cn("border-l-[3px] bg-fr-v2-cream px-4 py-3", insight.tone === "surplus" ? "border-fr-v2-forest" : insight.tone === "shortage" ? "border-fr-v2-harvest" : insight.tone === "action" ? "border-fr-v2-straw" : "border-fr-v2-teal")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-fr-v2-charcoal">{insight.title}</p>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fr-v2-muted">{insight.confidence === "measured" ? "Recent readings" : insight.confidence === "mixed" ? "Partly estimated" : "Needs information"}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-fr-v2-muted">{insight.why}</p>
                  {insight.figures.length > 0 ? <p className="mt-1 font-mono text-[11px] tabular-nums text-fr-v2-charcoal">{insight.figures.join(" · ")}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {href ? (
                      <Link href={href} className="inline-flex min-h-10 items-center rounded-fr-v2-control bg-fr-v2-forest px-3.5 text-xs font-semibold text-white">{insight.actionLabel}</Link>
                    ) : (
                      <button type="button" onClick={() => runAction(insight)} className="inline-flex min-h-10 items-center rounded-fr-v2-control border border-fr-v2-forest px-3.5 text-xs font-semibold text-fr-v2-forest">{insight.actionLabel}</button>
                    )}
                  </div>
                  <Working lines={insight.working} source={insight.source} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {settingsOpen ? (
        <section className="mt-5 rounded-[18px] border border-fr-v2-cream-rule bg-fr-v2-cream p-4" aria-label="Grazing targets">
          <p className="text-sm font-semibold text-fr-v2-charcoal">Your grazing targets</p>
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
              <button type="button" onClick={() => { setRotationInput("21"); setResidualInput("150"); }} className="min-h-10 rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 text-xs font-semibold text-fr-v2-charcoal">Fill in the Teagasc mid-season guide</button>
            ) : (
              <p className="text-xs text-fr-v2-muted">Outside the main season, enter the longer rotation you&apos;re running now.</p>
            )}
            <button type="button" onClick={saveSettings} className="min-h-10 rounded-fr-v2-control bg-fr-v2-forest px-4 text-xs font-semibold text-white">Save targets</button>
            <button type="button" onClick={() => setSettingsOpen(false)} className="min-h-10 px-2 text-xs font-semibold text-fr-v2-muted">Cancel</button>
          </div>
          <p className="mt-2 text-[11px] text-fr-v2-muted">Saved on this device.</p>
        </section>
      ) : (
        <p className="mt-4 text-xs text-fr-v2-muted">
          {settings.targets.rotationDays !== undefined ? `Targets: ${settings.targets.rotationDays}-day rotation, ${kg(settings.targets.residualKgDmHa ?? 0)} kg DM/ha residual. ` : "No grazing targets set. "}
          <button type="button" onClick={openSettings} className="font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2">{settings.targets.rotationDays !== undefined ? "Change" : "Set rotation length"}</button>
        </p>
      )}

      <section id="grass-scenario" className="mt-5 scroll-mt-4" aria-label="Try a change">
        <button type="button" onClick={() => setScenarioOpen((o) => !o)} aria-expanded={scenarioOpen} className="inline-flex items-center gap-1 text-sm font-semibold text-fr-v2-forest">
          Try a change {scenarioOpen ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
        </button>
        {scenarioOpen && scenario ? (
          <div className="mt-2 rounded-[18px] border border-fr-v2-cream-rule bg-fr-v2-cream p-4">
            <p className="text-xs text-fr-v2-muted">A preview only: nothing is saved or changed on the farm.</p>
            <label className="mt-3 block text-xs font-semibold text-fr-v2-charcoal">Rotation length (days)
              <input type="number" inputMode="numeric" min={5} max={120} value={scenarioRotation} placeholder={settings.targets.rotationDays !== undefined ? String(settings.targets.rotationDays) : "e.g. 21"} onChange={(e) => setScenarioRotation(e.target.value)} className="mt-1 block min-h-11 w-40 rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 text-base font-normal" />
            </label>
            <p className="mt-3 text-xs font-semibold text-fr-v2-charcoal">Take fields out of the grazing (for silage)</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {fields.map((f) => (
                <label key={f.fieldId} className="inline-flex min-h-9 items-center gap-2 text-xs text-fr-v2-charcoal">
                  <input type="checkbox" className="size-4" checked={removed.includes(f.fieldId)} onChange={(e) => setRemoved((r) => (e.target.checked ? [...r, f.fieldId] : r.filter((id) => id !== f.fieldId)))} />
                  {f.name}
                </label>
              ))}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <div><dt className="text-fr-v2-muted">Grazing area left</dt><dd className="font-mono tabular-nums text-fr-v2-charcoal">{formatNumber(scenario.remainingAreaHa, 2)} ha</dd></div>
              {scenario.line.status === "OK" ? (
                <>
                  <div><dt className="text-fr-v2-muted">Target pre-grazing</dt><dd className="font-mono tabular-nums text-fr-v2-charcoal">{kg(scenario.line.line.targetPreGrazingKgDmHa)} kg DM/ha</dd></div>
                  <div><dt className="text-fr-v2-muted">Against the line</dt><dd className="font-mono tabular-nums text-fr-v2-charcoal">{scenario.position ? `${scenario.position.days >= 0 ? "" : "−"}${Math.abs(scenario.position.days).toFixed(0)} days` : "Not measured"}</dd></div>
                </>
              ) : (
                <div className="col-span-2"><dt className="text-fr-v2-muted">Target line</dt><dd className="text-fr-v2-charcoal">{scenario.line.block.message}</dd></div>
              )}
              {scenario.removedAboveResidualKgDm !== undefined ? <div><dt className="text-fr-v2-muted">Grass above residual taken out</dt><dd className="font-mono tabular-nums text-fr-v2-charcoal">{kg(scenario.removedAboveResidualKgDm)} kg DM today</dd></div> : null}
            </dl>
            {scenario.removedUnmeasured > 0 ? <p className="mt-2 text-[11px] text-fr-v2-muted">{scenario.removedUnmeasured} of the fields taken out {scenario.removedUnmeasured === 1 ? "isn't" : "aren't"} measured, so {scenario.removedUnmeasured === 1 ? "its" : "their"} grass isn&apos;t counted.</p> : null}
            <p className="mt-2 text-[11px] text-fr-v2-muted">Grass above the residual today is not a silage yield: that depends on when it&apos;s cut, growth until then and the weather.</p>
            {scenario.line.status === "OK" ? <Working lines={[...scenario.line.line.working, ...(scenario.position?.working ?? [])]} source={scenario.line.line.source} /> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
