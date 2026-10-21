"use client";

/**
 * Cattle C10 — the weight history chart. Renders the `WeightChartVM` it is
 * given and decides nothing about the weights: whether there is a chart, no
 * weights (EMPTY), records that can't be plotted (NOT_CHARTABLE) or an
 * evaluation that didn't run (UNAVAILABLE) — and every label, including
 * "Weighed" vs "Estimate" — comes from `weightChartOf`. The C5 PREDICTION is
 * a dashed segment with a hollow end: a projection is never drawn like a
 * weighing. Geometry only — no value is computed here.
 *
 * Interaction without hover: touch / pointer scrubbing selects the nearest
 * observation, the chart is keyboard focusable (← → Home End), and explicit
 * previous / next buttons step between weighings. The readout is announced.
 */

import { useMemo, useRef, useState } from "react";
import type { ChartPointVM, WeightChartVM } from "@/domain/cattle/presentation";
import { StateLabel, cattleStyles } from "./ui";

const W = 640;
const H = 220;
const PAD = { left: 52, right: 20, top: 26, bottom: 34 };

function t(iso: string): number {
  return Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso.replace(/\.(\d{3})\d*Z$/, ".$1Z"));
}

const STYLE_TEXT: Record<ChartPointVM["style"], string> = { MEASURED: "text-fr-v2-muted", NOT_MEASURED: "text-fr-v2-cobalt", CONFLICT: "text-fr-v2-clay", NOT_PLOTTED: "text-fr-v2-muted" };
const KEY_SWATCH: Record<ChartPointVM["style"] | "PROJECTED", string> = {
  MEASURED: "bg-fr-v2-forest",
  NOT_MEASURED: "border-2 border-fr-v2-cobalt",
  PROJECTED: "border-2 border-dashed border-fr-v2-cobalt",
  CONFLICT: "border-2 border-fr-v2-clay",
  NOT_PLOTTED: "border-2 border-fr-v2-rule",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function PerformanceChart({ chart, highlightIds = [] }: { chart: WeightChartVM; highlightIds?: string[] }) {
  switch (chart.state) {
    case "CHART":
      return <WeightChart chart={chart} highlightIds={highlightIds} />;
    case "NOT_CHARTABLE":
      return (
        <div>
          <div className={`flex h-32 flex-col items-center justify-center gap-1 px-6 text-center ${cattleStyles.hatch}`} data-chart-state={chart.state}>
            <StateLabel state={chart.display} detail />
          </div>
          <PointList points={chart.points} />
        </div>
      );
    case "EMPTY":
    case "UNAVAILABLE":
      return (
        <div className={`flex h-40 flex-col items-center justify-center gap-1 px-6 text-center ${cattleStyles.hatch}`} data-chart-state={chart.state}>
          <StateLabel state={chart.display} detail />
        </div>
      );
  }
}

/** The records behind a chart that can't be drawn: listed, so their existence is never hidden. */
function PointList({ points }: { points: readonly ChartPointVM[] }) {
  return (
    <ul className="mt-2 divide-y divide-fr-v2-rule text-sm" aria-label="Weight records">
      {points.map((p) => (
        <li key={p.at} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
          <span className="text-fr-v2-graphite">
            {p.dateLabel} · {p.methodLabel}
          </span>
          <span className="text-fr-v2-muted">
            {p.kgLabel} · {p.stateLabel}
          </span>
        </li>
      ))}
    </ul>
  );
}

type ChartData = Extract<WeightChartVM, { state: "CHART" }>;

function WeightChart({ chart, highlightIds }: { chart: ChartData; highlightIds: string[] }) {
  const points = chart.points;
  // Selection is tied to the series length: when a new weighing arrives, the latest point is selected.
  const [selection, setSel] = useState({ n: points.length, i: points.length - 1 });
  const selected = selection.n === points.length ? selection.i : points.length - 1;
  const setSelected = (f: number | ((i: number) => number)) => setSel({ n: points.length, i: typeof f === "function" ? f(selected) : f });
  const svgRef = useRef<SVGSVGElement>(null);

  const geometry = useMemo(() => {
    // CHART guarantees at least one plotted value; the scale spans every plotted value and overlay.
    const times = [...points.map((p) => t(p.at)), ...(chart.projection.state === "SHOWN" ? [t(chart.projection.at)] : [])];
    const kgs = [
      ...points.flatMap((p) => (p.plot.kind === "VALUE" ? [p.plot.kg] : p.plot.kind === "CANDIDATES" ? [...p.plot.candidatesKg] : [])),
      ...(chart.projection.state === "SHOWN" ? [chart.projection.kg] : []),
      ...(chart.goalTarget.state === "SHOWN" ? [chart.goalTarget.kg] : []),
    ];
    const t0 = Math.min(...times);
    const t1 = Math.max(...times, t0 + 86_400_000);
    const lo = Math.floor((Math.min(...kgs) - 20) / 50) * 50;
    const hi = Math.ceil((Math.max(...kgs) + 20) / 50) * 50;
    const x = (iso: string) => PAD.left + ((t(iso) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    const y = (kg: number) => PAD.top + (1 - (kg - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    const ticks: number[] = [];
    for (let v = lo; v <= hi; v += hi - lo > 300 ? 100 : 50) ticks.push(v);
    const monthTicks: { x: number; label: string }[] = [];
    const start = new Date(t0);
    for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); d.getTime() <= t1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      monthTicks.push({ x: PAD.left + ((d.getTime() - t0) / (t1 - t0)) * (W - PAD.left - PAD.right), label: MONTHS[d.getUTCMonth()] });
    }
    return { x, y, ticks, monthTicks };
  }, [points, chart.projection, chart.goalTarget]);
  const { x, y, ticks, monthTicks } = geometry;

  const pick = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.at) - vx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setSelected(best);
  };

  const line = chart.line.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.at).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const sel: ChartPointVM | undefined = points[selected];

  return (
    <div>
      <div className="mb-2 min-h-[52px]" aria-live="polite">
        {sel ? (
          <div className={cattleStyles.settle} key={sel.at}>
            <div className="text-sm text-fr-v2-muted">
              {sel.dateLabel} · {sel.methodLabel}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-fr-v2-graphite">{sel.kgLabel}</span>
              <span className={`text-sm ${STYLE_TEXT[sel.style]}`}>{sel.stateLabel}</span>
            </div>
          </div>
        ) : null}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-fr-v2-forest"
        role="group"
        aria-label="Weight history. Use the left and right arrow keys to move between weighings."
        tabIndex={0}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === "mouse") pick(e.clientX);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setSelected((s) => Math.max(0, s - 1));
          else if (e.key === "ArrowRight") setSelected((s) => Math.min(points.length - 1, s + 1));
          else if (e.key === "Home") setSelected(0);
          else if (e.key === "End") setSelected(points.length - 1);
          else return;
          e.preventDefault();
        }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--fr-v2-rule)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="fill-fr-v2-muted text-[20px] md:text-[12px] tabular-nums">
              {v}
            </text>
          </g>
        ))}
        {monthTicks.map((m) => (
          <text key={`${m.label}-${m.x}`} x={m.x} y={H - 8} textAnchor="middle" className="fill-fr-v2-muted text-[20px] md:text-[12px]">
            {m.label}
          </text>
        ))}
        {chart.goalTarget.state === "SHOWN" ? (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(chart.goalTarget.kg)} y2={y(chart.goalTarget.kg)} stroke="var(--fr-v2-plum)" strokeWidth={1} strokeDasharray="2 4" />
            <text x={W - PAD.right} y={y(chart.goalTarget.kg) - 6} textAnchor="end" className="fill-fr-v2-plum text-[20px] md:text-[12px]" stroke="var(--fr-v2-paper)" strokeWidth={5} paintOrder="stroke" strokeLinejoin="round">
              Goal {chart.goalTarget.label}
            </text>
          </g>
        ) : null}
        {sel ? <line x1={x(sel.at)} x2={x(sel.at)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--fr-v2-graphite)" strokeOpacity={0.25} strokeWidth={1} /> : null}
        <path d={line} fill="none" stroke="var(--fr-v2-forest)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        {chart.projection.state === "SHOWN" ? (
          <g aria-label={`Projected ${chart.projection.label} by ${chart.projection.dateLabel} — a prediction, not a weighing`}>
            <path d={`M${x(chart.projection.from.at)},${y(chart.projection.from.kg)} L${x(chart.projection.at)},${y(chart.projection.kg)}`} fill="none" stroke="var(--fr-v2-cobalt)" strokeWidth={2} strokeDasharray="5 5" />
            <circle cx={x(chart.projection.at)} cy={y(chart.projection.kg)} r={5} fill="var(--fr-v2-paper)" stroke="var(--fr-v2-cobalt)" strokeWidth={2} />
            <text x={x(chart.projection.at)} y={y(chart.projection.kg) + (chart.goalTarget.state === "SHOWN" && Math.abs(y(chart.goalTarget.kg) - y(chart.projection.kg)) < 24 ? 28 : -12)} textAnchor="end" className="fill-fr-v2-cobalt text-[20px] md:text-[12px]" stroke="var(--fr-v2-paper)" strokeWidth={5} paintOrder="stroke" strokeLinejoin="round">
              Projected {chart.projection.label}
            </text>
          </g>
        ) : null}
        {points.map((p, i) => {
          const isSel = i === selected;
          const fresh = p.recordIds.some((id) => highlightIds.includes(id));
          if (p.plot.kind === "NOT_PLOTTED") return null;
          if (p.plot.kind === "CANDIDATES") {
            // Conflict: every candidate shown, joined, never averaged.
            const ys = p.plot.candidatesKg.map(y);
            return (
              <g key={p.at} className={fresh ? cattleStyles.pointIn : undefined}>
                {ys.length > 1 ? <line x1={x(p.at)} x2={x(p.at)} y1={Math.min(...ys)} y2={Math.max(...ys)} stroke="var(--fr-v2-clay)" strokeWidth={2} /> : null}
                {ys.map((cy, j) => (
                  <circle key={j} cx={x(p.at)} cy={cy} r={isSel ? 6 : 4.5} fill="var(--fr-v2-paper)" stroke="var(--fr-v2-clay)" strokeWidth={2} />
                ))}
              </g>
            );
          }
          const measured = p.style === "MEASURED";
          return (
            <circle
              key={p.at}
              className={fresh ? cattleStyles.pointIn : undefined}
              cx={x(p.at)}
              cy={y(p.plot.kg)}
              r={isSel ? 6.5 : 4}
              fill={measured ? "var(--fr-v2-forest)" : "var(--fr-v2-paper)"}
              stroke={measured ? "var(--fr-v2-paper)" : "var(--fr-v2-cobalt)"}
              strokeWidth={2}
            />
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="min-h-11 min-w-11 rounded-[8px] px-3 text-sm font-medium text-fr-v2-forest disabled:text-fr-v2-muted/50" disabled={selected <= 0} onClick={() => setSelected((s) => Math.max(0, s - 1))} aria-label="Previous weighing">
          ‹ Earlier
        </button>
        <ul className="order-last flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-fr-v2-muted sm:order-none sm:w-auto" aria-label="Chart key">
          {chart.legend.map((k) => (
            <li key={k.style} className="flex items-center gap-1.5">
              <span aria-hidden className={`h-2 w-2 rounded-full ${KEY_SWATCH[k.style]}`} /> {k.label}
            </li>
          ))}
        </ul>
        <button type="button" className="min-h-11 min-w-11 rounded-[8px] px-3 text-sm font-medium text-fr-v2-forest disabled:text-fr-v2-muted/50" disabled={selected >= points.length - 1} onClick={() => setSelected((s) => Math.min(points.length - 1, s + 1))} aria-label="Next weighing">
          Later ›
        </button>
      </div>
      {chart.notCharted ? <p className="mt-1 text-[12px] text-fr-v2-muted">{chart.notCharted}</p> : null}
      {chart.goalTarget.state === "UNRESOLVED" ? <p className="mt-1 text-[12px] text-fr-v2-muted">{chart.goalTarget.note}</p> : null}
      <table className="sr-only">
        <caption>Weight history</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Weight</th>
            <th>Basis</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.at}>
              <td>{p.dateLabel}</td>
              <td>{p.kgLabel}</td>
              <td>{p.stateLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
