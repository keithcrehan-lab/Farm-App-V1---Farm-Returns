"use client";

/**
 * The interactive grass wedge: one bar per field, tallest on the left, as wide
 * as the field (or equally wide), with the red target line drawn across it.
 * Layout and the line's values come from `layoutWedge` (`src/domain/grass-wedge-target.ts`);
 * this component only draws them.
 */
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { DemandLine, WedgeBar } from "@/domain/grass-wedge-target";
import { wedgeForecastParts } from "./grass-wedge-projection";

const W = 1000;
const H = 300;
const TOP = 12;
const BOTTOM = 4;
/** Left gutter (fraction of the width) for the HTML axis labels, so text stays readable at phone widths. */
const LEFT = 60;

/** `currentBasis`: scientific-validation F20 — today's cover is drawn differently when it is
 * an estimate brought forward rather than a reading taken today. */
type ForecastWedgeBar = WedgeBar & { currentCoverKgDmHa?: number; currentBasis?: "measured" | "estimated" };

export function GrassWedgeChart({ bars, line, horizonDays = 0, selectedFieldId, onSelect, occupiedFieldIds }: {
  bars: readonly ForecastWedgeBar[];
  line?: DemandLine;
  horizonDays?: number;
  selectedFieldId?: string;
  onSelect: (fieldId: string) => void;
  occupiedFieldIds: ReadonlySet<string>;
}) {
  const known = bars.filter((b) => b.coverKgDmHa !== undefined).map((b) => b.coverKgDmHa!);
  // Include today's height so a declining projection doesn't get clipped.
  const currentKnown = horizonDays > 0
    ? bars.filter((b) => b.coverKgDmHa !== undefined && b.currentCoverKgDmHa !== undefined).map((b) => b.currentCoverKgDmHa!)
    : [];
  const top = Math.max(1000, ...known, ...currentKnown, line?.targetPreGrazingKgDmHa ?? 0);
  const yMax = Math.ceil((top * 1.1) / 500) * 500;
  const plotW = W - LEFT;
  const plotH = H - TOP - BOTTOM;
  const y = (v: number) => TOP + plotH - (v / yMax) * plotH;
  const xOf = (f: number) => LEFT + f * plotW;
  const ticks = Array.from({ length: Math.floor(yMax / 500) + 1 }, (_, i) => i * 500);
  // The target line runs across the measured fields only (see `layoutWedge`).
  const measured = bars.filter((b) => b.coverKgDmHa !== undefined && b.targetKgDmHa !== undefined);
  const first = measured[0];
  const last = measured[measured.length - 1];
  const showForecast = horizonDays > 0;
  const splitExists = showForecast && bars.some((b) => wedgeForecastParts(b.currentCoverKgDmHa, b.coverKgDmHa, horizonDays));
  const anyEstimated = bars.some((b) => b.coverKgDmHa !== undefined && b.currentBasis === "estimated");
  const anyRecorded = bars.some((b) => b.coverKgDmHa !== undefined && b.currentBasis === "measured");

  if (bars.length === 0) return <p className="py-10 text-center text-sm text-fr-v2-muted">Map a field to begin your grass wedge.</p>;

  // Many fields on a phone: let the plot scroll sideways rather than crush the bars and names.
  const scrollMinWidth = bars.length > 6 ? `${bars.length * 64}px` : undefined;

  return (
    <figure aria-label="Grass wedge">
      <div className={cn("-mx-1 px-1", scrollMinWidth && "overflow-x-auto overscroll-x-contain [scrollbar-width:thin]")}>
      <div style={scrollMinWidth ? { minWidth: scrollMinWidth } : undefined}>
      <p aria-hidden className="mb-1 font-mono text-[10px] text-fr-v2-muted">kg DM/ha</p>
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-60 w-full select-none sm:h-72" role="img" aria-label={`Grass wedge of ${bars.length} fields${showForecast ? `, projected ${horizonDays} days with today's cover and forecast change distinguished` : ""}${line ? ", with the target line" : ""}`}>
        <defs>
          <pattern id="grass-wedge-gain-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="1" y1="0" x2="1" y2="7" stroke="#ffffff" strokeOpacity="0.53" strokeWidth="2" />
          </pattern>
          <pattern id="grass-wedge-loss-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="1" y1="0" x2="1" y2="7" stroke="#ffffff" strokeOpacity="0.58" strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <line key={t} x1={LEFT} x2={W} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-fr-v2-cream-rule" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {bars.map((b) => {
          const selected = b.fieldId === selectedFieldId;
          const x = xOf(b.x) + 1.5;
          const w = Math.max(2, b.width * plotW - 3);
          const known = b.coverKgDmHa !== undefined;
          const h = known ? Math.max(2, (b.coverKgDmHa! / yMax) * plotH) : 0;
          const above = known && b.targetKgDmHa !== undefined ? b.coverKgDmHa! >= b.targetKgDmHa : undefined;
          const forecast = wedgeForecastParts(b.currentCoverKgDmHa, b.coverKgDmHa, horizonDays);
          const retainedH = forecast ? (forecast.retainedKgDmHa / yMax) * plotH : h;
          const gainH = forecast ? (forecast.addedKgDmHa / yMax) * plotH : 0;
          const lossH = forecast ? (forecast.lostKgDmHa / yMax) * plotH : 0;
          return (
            <g key={b.fieldId} opacity={selected || !selectedFieldId ? 1 : 0.45}>
              {known ? (
                <>
                  <rect
                    data-wedge-current={forecast ? b.fieldId : undefined}
                    data-wedge-basis={b.currentBasis}
                    x={x}
                    y={TOP + plotH - retainedH}
                    width={w}
                    height={retainedH}
                    fillOpacity={b.currentBasis === "estimated" ? 0.62 : 1}
                    className={cn(above === undefined ? "fill-fr-v2-teal" : above ? "fill-fr-v2-forest" : "fill-fr-v2-harvest")}
                  />
                  {b.currentBasis === "estimated" ? (
                    // Estimated today: a dotted top edge so it never reads as a fresh measurement.
                    <line x1={x} x2={x + w} y1={forecast?.lostKgDmHa ? y(b.currentCoverKgDmHa!) : TOP + plotH - retainedH} y2={forecast?.lostKgDmHa ? y(b.currentCoverKgDmHa!) : TOP + plotH - retainedH} stroke="currentColor" strokeDasharray="2 3" strokeWidth={2} className="text-fr-v2-charcoal" vectorEffect="non-scaling-stroke" />
                  ) : null}
                  {gainH > 0 ? (
                    <g data-wedge-forecast-gain={b.fieldId}>
                      <rect x={x} y={y(b.coverKgDmHa!)} width={w} height={gainH} fill="#8ebeb2" />
                      <rect x={x} y={y(b.coverKgDmHa!)} width={w} height={gainH} fill="url(#grass-wedge-gain-hatch)" />
                    </g>
                  ) : null}
                  {lossH > 0 ? (
                    <g data-wedge-forecast-loss={b.fieldId}>
                      {/* The lost section is an OUTLINE above the final height;
                          it is not included in the forecast cover bar. */}
                      <rect x={x} y={y(b.currentCoverKgDmHa!)} width={w} height={lossH}
                        fill="#d8b06f" fillOpacity={0.40} stroke="#ae844b" strokeDasharray="5 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                      <rect x={x} y={y(b.currentCoverKgDmHa!)} width={w} height={lossH} fill="url(#grass-wedge-loss-hatch)" />
                    </g>
                  ) : null}
                </>
              ) : (
                // Unmeasured: an empty dashed slot at the baseline, never a bar that reads as a cover.
                <rect x={x} y={TOP + plotH - 18} width={w} height={18} fill="none" stroke="currentColor" strokeDasharray="5 4" className="text-fr-v2-muted" vectorEffect="non-scaling-stroke" />
              )}
              {selected && known ? <rect x={x - 1} y={TOP + plotH - h - 1} width={w + 2} height={h + 2} fill="none" stroke="#e3c77e" strokeWidth={3} vectorEffect="non-scaling-stroke" /> : null}
            </g>
          );
        })}
        {line && first && last ? (
          <line x1={xOf(first.centre)} y1={y(line.targetPreGrazingKgDmHa)} x2={xOf(last.centre)} y2={y(line.residualKgDmHa)} stroke="#C0362C" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      {/* Axis labels and cattle markers in HTML so they stay a readable size at any width. */}
      {ticks.map((t) => (
        <span key={t} aria-hidden className="pointer-events-none absolute -translate-y-1/2 pr-1 text-right font-mono text-[10px] text-fr-v2-muted" style={{ top: `${(y(t) / H) * 100}%`, left: 0, width: `${(LEFT / W) * 100}%` }}>
          {t === 0 ? "0" : `${t / 1000}k`}
        </span>
      ))}
      {/* The line's own end values, so its scale against the bars is never hidden. */}
      {line && first && last ? (
        <>
          <span
            data-wedge-line-label="start"
            aria-hidden
            className="pointer-events-none absolute -translate-y-full whitespace-nowrap rounded-[4px] bg-white/90 px-1 font-mono text-[10px] font-semibold text-[#C0362C]"
            style={{ left: `${(xOf(first.centre) / W) * 100}%`, top: `calc(${(y(line.targetPreGrazingKgDmHa) / H) * 100}% - 3px)` }}
          >
            {formatNumber(line.targetPreGrazingKgDmHa, 0)}
          </span>
          {last !== first ? (
            <span
              data-wedge-line-label="end"
              aria-hidden
              className="pointer-events-none absolute -translate-x-full -translate-y-full whitespace-nowrap rounded-[4px] bg-white/90 px-1 font-mono text-[10px] font-semibold text-[#C0362C]"
              style={{ left: `${(xOf(last.centre) / W) * 100}%`, top: `calc(${(y(line.residualKgDmHa) / H) * 100}% - 3px)` }}
            >
              {formatNumber(line.residualKgDmHa, 0)}
            </span>
          ) : null}
        </>
      ) : null}
      {bars.map((b) => occupiedFieldIds.has(b.fieldId) ? (
        <span
          key={b.fieldId}
          aria-hidden
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-full rounded-full bg-fr-v2-graphite"
          style={{
            left: `${(xOf(b.centre) / W) * 100}%`,
            top: `calc(${((TOP + plotH - (b.coverKgDmHa !== undefined ? (b.coverKgDmHa / yMax) * plotH : 18)) / H) * 100}% - 3px)`,
          }}
        />
      ) : null)}
      {/* Invisible, full-height tap targets over each bar: every field is selectable, however short its bar. */}
      <div className="absolute inset-y-0 right-0" style={{ left: `${(LEFT / W) * 100}%` }}>
        {bars.map((b) => (
          <button
            key={b.fieldId}
            type="button"
            onClick={() => onSelect(b.fieldId)}
            aria-pressed={b.fieldId === selectedFieldId}
            aria-label={`${b.name}: ${b.coverKgDmHa === undefined ? "not measured" : horizonDays > 0 && b.currentCoverKgDmHa !== undefined
              ? `current ${b.currentBasis === "estimated" ? "(estimated) " : b.currentBasis === "measured" ? "(last recorded) " : ""}${formatNumber(b.currentCoverKgDmHa, 0)} kg DM/ha, projected ${formatNumber(b.coverKgDmHa, 0)} kg DM/ha after ${horizonDays} days, net change ${b.coverKgDmHa >= b.currentCoverKgDmHa ? "+" : "−"}${formatNumber(Math.abs(b.coverKgDmHa - b.currentCoverKgDmHa), 0)} kg DM/ha`
              : `${b.currentBasis === "estimated" ? "estimated for today " : b.currentBasis === "measured" ? "last recorded " : ""}${formatNumber(b.coverKgDmHa, 0)} kg DM/ha`}, ${formatNumber(b.areaHa, 2)} ha${b.targetKgDmHa !== undefined ? `, line at ${formatNumber(b.targetKgDmHa, 0)}` : ""}`}
            className="absolute inset-y-0 focus-visible:outline-2 focus-visible:outline-fr-v2-forest"
            style={{ left: `${b.x * 100}%`, width: `${b.width * 100}%` }}
          />
        ))}
      </div>
      </div>
      {/* Field names under the bars, in HTML at a readable size; bars too narrow for a name stay unlabelled (tap to see). */}
      <div aria-hidden className="relative h-6" style={{ marginLeft: `${(LEFT / W) * 100}%` }}>
        {bars.map((b) => (
          <span
            key={b.fieldId}
            title={b.name}
            className={cn("absolute top-1 truncate px-0.5 text-center text-[11px] leading-4 text-fr-v2-charcoal", b.fieldId === selectedFieldId && "font-semibold text-fr-v2-forest", b.coverKgDmHa === undefined && "text-fr-v2-muted")}
            style={{ left: `${b.x * 100}%`, width: `${b.width * 100}%` }}
          >
            {b.width >= (scrollMinWidth ? Math.min(0.07, 44 / (bars.length * 64)) : 0.07) ? b.name : ""}
          </span>
        ))}
      </div>
      </div>
      </div>
      {scrollMinWidth ? <p className="mt-1 text-[11px] text-fr-v2-muted sm:hidden">Swipe the chart to see every field · tap a bar for its details</p> : null}
      {/* Grouped key: what the bars mean, then the line and markers. Only what's on the chart is listed. */}
      <figcaption className="mt-3 space-y-1.5 rounded-[12px] bg-fr-v2-paper px-3 py-2.5 text-[11px] text-fr-v2-muted">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">Bars</span>
          {splitExists ? (
            <>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-fr-v2-forest" aria-hidden />Solid cover (base or remainder)</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-[#639d8d]" style={{ background: "repeating-linear-gradient(135deg, #8ebeb2, #8ebeb2 3px, #d9eae5 3px, #d9eae5 5px)" }} aria-hidden />Projected gain</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-dashed border-[#ae844b]" style={{ background: "repeating-linear-gradient(135deg, #d8b06f, #d8b06f 3px, #f5e6ca 3px, #f5e6ca 5px)" }} aria-hidden />Projected loss</span>
            </>
          ) : null}
          {anyRecorded ? <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-fr-v2-forest" aria-hidden />Recorded reading</span> : null}
          {anyEstimated ? <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border-t-2 border-dotted border-fr-v2-charcoal bg-fr-v2-forest/60" aria-hidden />Estimated for today (not a new reading)</span> : null}
          {bars.some((b) => b.coverKgDmHa === undefined) ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-3 border border-dashed border-fr-v2-muted" aria-hidden />Not measured</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">Marks</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full bg-[#C0362C]" aria-hidden />
            Target line{line ? <> ({formatNumber(line.targetPreGrazingKgDmHa, 0)} → {formatNumber(line.residualKgDmHa, 0)}) · bars <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-fr-v2-forest" aria-hidden />above</span> / <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-fr-v2-harvest" aria-hidden />below</span></> : null}
          </span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-fr-v2-graphite" aria-hidden />Cattle in field</span>
        </div>
      </figcaption>
    </figure>
  );
}
