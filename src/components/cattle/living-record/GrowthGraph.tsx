"use client";

/**
 * Living Animal Record — the Growth graph. Renders the `WeightChartVM` the frozen engines produced and decides
 * nothing about the weights: which records are plotted, each point's basis ("Weighed" vs "Method not recorded"),
 * a conflict's candidates (never averaged), a goal line or a C5 prediction all come from `weightChartOf`. A target
 * line is drawn ONLY when the chart carries a goal target; a prediction ONLY when C5 projected one — otherwise the
 * caller says "target not recorded" quietly and the plot keeps its place. Geometry only: no value is computed here.
 *
 * Inspection works without hover: tap or click a weighing (or drag across the plot) to select it, arrow keys /
 * Home / End step through weighings when the plot has focus, and the Earlier / Later buttons are the tap
 * alternative. The selected weighing carries an attached annotation, announced politely; a hidden table repeats
 * every point for assistive technology.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartPointVM, WeightChartVM } from "@/domain/cattle/presentation";
import { StateLabel } from "../ui";
import styles from "./living-record.module.css";

const H_DESKTOP = 360;
const H_MOBILE = 290;
const PAD = { left: 56, right: 32, top: 34, bottom: 42 };
const DAY = 86_400_000;

function t(iso: string): number {
  return Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso.replace(/\.(\d{3})\d*Z$/, ".$1Z"));
}

/** Fritsch–Carlson monotone cubic through the plotted points: a smooth line that never overshoots a weighing. */
function monotonePath(pts: readonly { x: number; y: number }[]): string {
  const n = pts.length;
  if (n < 2) return "";
  if (n === 2) return `M${pts[0].x},${pts[0].y}L${pts[1].x},${pts[1].y}`;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (dx[i] === 0 ? 0 : (p.y - pts[i].y) / dx[i]));
  const m = pts.map((_, i) => (i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * slope[i];
      m[i + 1] = k * b * slope[i];
    }
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(pts[i].x + h).toFixed(1)},${(pts[i].y + m[i] * h).toFixed(1)} ${(pts[i + 1].x - h).toFixed(1)},${(pts[i + 1].y - m[i + 1] * h).toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

/** A readable tick step for a kilogram span. */
function tickStep(span: number): number {
  const raw = span / 4;
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200]) if (raw <= s) return s;
  return 500;
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

type ChartData = Extract<WeightChartVM, { state: "CHART" }>;

export interface GrowthGraphProps {
  chart: WeightChartVM;
  /** Record ids written in this session that the latest view now holds (the point animates in and is selected). */
  freshIds: ReadonlySet<string>;
  /** Shown on the annotation of a fresh point ("Recorded just now"). */
  freshLabel: string;
  inspectHint: string;
}

export function GrowthGraph({ chart, freshIds, freshLabel, inspectHint }: GrowthGraphProps) {
  if (chart.state === "CHART") return <Plot chart={chart} freshIds={freshIds} freshLabel={freshLabel} inspectHint={inspectHint} />;
  // No plot to draw: the frame keeps its place and says why (the engines' own state), never an empty axis.
  return (
    <div>
      <div className={`${styles.graph} ${styles.hatch} flex h-[290px] flex-col items-center justify-center gap-1 px-6 text-center md:h-[360px]`} data-chart-state={chart.state}>
        <StateLabel state={chart.display} detail />
      </div>
      {chart.state === "NOT_CHARTABLE" ? (
        <ul className={`mt-2 divide-y ${styles.rule} text-sm`} aria-label="Weight records">
          {chart.points.map((p) => (
            <li key={p.at} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
              <span>
                {p.dateLabel} · {p.methodLabel}
              </span>
              <span className={styles.mono}>
                {p.kgLabel} · {p.stateLabel}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Plot({ chart, freshIds, freshLabel, inspectHint }: { chart: ChartData; freshIds: ReadonlySet<string>; freshLabel: string; inspectHint: string }) {
  const points = chart.points;
  const { ref, width } = useWidth<HTMLDivElement>(820);
  const height = width < 560 ? H_MOBILE : H_DESKTOP;
  const isFresh = (p: ChartPointVM) => p.recordIds.some((id) => freshIds.has(id));
  const freshIndex = points.findIndex(isFresh);
  // Selection follows the series: a new weighing (or a just-recorded one) is selected when it arrives.
  const defaultIndex = freshIndex >= 0 ? freshIndex : points.length - 1;
  const [selection, setSel] = useState({ key: `${points.length}:${defaultIndex}`, i: defaultIndex });
  const selected = selection.key === `${points.length}:${defaultIndex}` ? selection.i : defaultIndex;
  const setSelected = (f: number | ((i: number) => number)) => setSel({ key: `${points.length}:${defaultIndex}`, i: Math.max(0, Math.min(points.length - 1, typeof f === "function" ? f(selected) : f)) });

  const g = useMemo(() => {
    const times = [...points.map((p) => t(p.at)), ...(chart.projection.state === "SHOWN" ? [t(chart.projection.at)] : [])];
    const kgs = [
      ...points.flatMap((p) => (p.plot.kind === "VALUE" ? [p.plot.kg] : p.plot.kind === "CANDIDATES" ? [...p.plot.candidatesKg] : [])),
      ...(chart.projection.state === "SHOWN" ? [chart.projection.kg] : []),
      ...(chart.goalTarget.state === "SHOWN" ? [chart.goalTarget.kg] : []),
    ];
    let t0 = Math.min(...times);
    let t1 = Math.max(...times);
    // One weighing (or one day): centre it in a week, so a single point never sits on the axis.
    if (t1 - t0 < DAY) {
      t0 -= 3 * DAY;
      t1 += 3 * DAY;
    } else {
      const pad = (t1 - t0) * 0.06;
      t0 -= pad;
      t1 += pad;
    }
    // Vertical scale: at least a 40 kg window, so ordinary scale noise never looks like a growth spurt.
    const kMin = Math.min(...kgs);
    const kMax = Math.max(...kgs);
    const span = Math.max(40, (kMax - kMin) * 1.35);
    const step = tickStep(span);
    const mid = (kMin + kMax) / 2;
    const lo = Math.floor((mid - span / 2) / step) * step;
    const hi = Math.ceil((mid + span / 2) / step) * step;
    const iw = width - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const x = (iso: string) => PAD.left + ((t(iso) - t0) / (t1 - t0)) * iw;
    const y = (kg: number) => PAD.top + (1 - (kg - lo) / (hi - lo)) * ih;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
    return { x, y, ticks };
  }, [points, chart.projection, chart.goalTarget, width, height]);

  const linePts = chart.line.map((p) => ({ x: g.x(p.at), y: g.y(p.kg) }));
  const line = monotonePath(linePts);
  const base = height - PAD.bottom;
  const area = linePts.length > 1 ? `${line}L${linePts[linePts.length - 1].x.toFixed(1)},${base}L${linePts[0].x.toFixed(1)},${base}Z` : "";
  const labelDates = points.length <= 8;
  const sel: ChartPointVM | undefined = points[selected];
  const selY = sel ? (sel.plot.kind === "VALUE" ? g.y(sel.plot.kg) : sel.plot.kind === "CANDIDATES" ? g.y(Math.max(...sel.plot.candidatesKg)) : base) : base;
  const selX = sel ? g.x(sel.at) : 0;
  // The annotation is attached above its weighing (below when there's no room), never over the line.
  const annH = sel && isFresh(sel) ? 104 : 86;
  const freshLine = freshIndex >= 0;

  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vx = clientX - r.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(g.x(p.at) - vx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setSelected(best);
  };

  return (
    <div>
      <div
        ref={ref}
        className={`${styles.graph} outline-none`}
        style={{ height }}
        role="group"
        tabIndex={0}
        aria-label={`Weight history. ${inspectHint}`}
        aria-describedby="growth-annotation"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.buttons > 0) pick(e.clientX);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setSelected((s) => s - 1);
          else if (e.key === "ArrowRight") setSelected((s) => s + 1);
          else if (e.key === "Home") setSelected(0);
          else if (e.key === "End") setSelected(points.length - 1);
          else return;
          e.preventDefault();
        }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="growth-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#789a62" stopOpacity="0.16" />
              <stop offset="1" stopColor="#789a62" stopOpacity="0" />
            </linearGradient>
          </defs>
          {g.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={g.y(v)} y2={g.y(v)} stroke="#17221c" strokeOpacity={0.07} />
              <text x={PAD.left - 12} y={g.y(v) + 4} textAnchor="end" fontSize={11} fill="#5f685f" className={styles.mono}>
                {v}
              </text>
            </g>
          ))}
          {labelDates
            ? points.map((p) => (
                <text key={`d-${p.at}`} x={g.x(p.at)} y={height - 14} textAnchor="middle" fontSize={11} fontWeight={700} fill="#7d5b42" className={styles.mono}>
                  {p.dateLabel.split(" ").slice(0, 2).join(" ").toUpperCase()}
                </text>
              ))
            : null}
          {chart.goalTarget.state === "SHOWN" ? (
            <g>
              <line x1={PAD.left} x2={width - PAD.right} y1={g.y(chart.goalTarget.kg)} y2={g.y(chart.goalTarget.kg)} stroke="#b8674e" strokeWidth={2} strokeDasharray="7 7" opacity={0.75} />
              <text x={width - PAD.right} y={g.y(chart.goalTarget.kg) - 8} textAnchor="end" fontSize={11} fill="#8f4c37" stroke="#fbf8f1" strokeWidth={4} paintOrder="stroke">
                Goal {chart.goalTarget.label}
              </text>
            </g>
          ) : null}
          {area ? <path d={area} fill="url(#growth-area)" /> : null}
          {sel ? <line className={styles.guide} x1={selX} x2={selX} y1={selY + 12} y2={base} stroke="#17221c" strokeOpacity={0.28} strokeDasharray="3 4" /> : null}
          {line ? <path key={freshLine ? "line-fresh" : "line"} d={line} pathLength={1} className={freshLine ? styles.lineIn : undefined} fill="none" stroke="#1f4b37" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
          {chart.projection.state === "SHOWN" ? (
            <g>
              <path d={`M${g.x(chart.projection.from.at)},${g.y(chart.projection.from.kg)}L${g.x(chart.projection.at)},${g.y(chart.projection.kg)}`} fill="none" stroke="#356c9f" strokeWidth={2} strokeDasharray="5 6" />
              <circle cx={g.x(chart.projection.at)} cy={g.y(chart.projection.kg)} r={6} fill="#fbf8f1" stroke="#356c9f" strokeWidth={2} />
              <text x={g.x(chart.projection.at)} y={g.y(chart.projection.kg) - 12} textAnchor="end" fontSize={11} fill="#2d5d8a" stroke="#fbf8f1" strokeWidth={4} paintOrder="stroke">
                Projected {chart.projection.label}
              </text>
            </g>
          ) : null}
          {points.map((p, i) => {
            const isSel = i === selected;
            const fresh = isFresh(p);
            if (p.plot.kind === "NOT_PLOTTED") return null;
            if (p.plot.kind === "CANDIDATES") {
              const ys = p.plot.candidatesKg.map(g.y);
              return (
                <g key={p.at} className={fresh ? styles.pointIn : undefined}>
                  <line x1={g.x(p.at)} x2={g.x(p.at)} y1={Math.min(...ys)} y2={Math.max(...ys)} stroke="#b8674e" strokeWidth={2} />
                  {ys.map((cy, j) => (
                    <circle key={j} className={styles.point} cx={g.x(p.at)} cy={cy} r={isSel ? 8 : 6} fill="#fbf8f1" stroke="#b8674e" strokeWidth={3} />
                  ))}
                </g>
              );
            }
            const measured = p.style === "MEASURED";
            return (
              <g key={p.at} className={fresh ? styles.pointIn : undefined}>
                {isSel ? <circle cx={g.x(p.at)} cy={g.y(p.plot.kg)} r={15} fill="#1f4b37" opacity={0.1} /> : null}
                <circle className={styles.point} cx={g.x(p.at)} cy={g.y(p.plot.kg)} r={isSel ? 9 : 7} fill={measured ? "#1f4b37" : "#fbf8f1"} stroke={fresh ? "#34694d" : "#1f4b37"} strokeWidth={isSel ? 3.5 : 3} />
              </g>
            );
          })}
        </svg>
        {sel ? (
          <div
            id="growth-annotation"
            className={`${styles.annotation} min-w-[150px] px-3 py-2.5`}
            style={{ left: Math.max(8, Math.min(selX - 24, width - 178)), top: selY - annH - 22 >= 6 ? selY - annH - 22 : Math.min(selY + 22, height - annH - 6) }}
            aria-live="polite"
          >
            <span className={styles.kicker}>{sel.dateLabel.toUpperCase()}</span>
            <strong className={`${styles.mono} mt-1 block text-[18px] font-bold leading-tight`}>{sel.kgLabel}</strong>
            <small className="mt-0.5 block text-[12px] text-[#5f685f]">
              {sel.stateLabel === sel.methodLabel ? sel.stateLabel : `${sel.stateLabel} · ${sel.methodLabel}`}
            </small>
            {isFresh(sel) ? <small className="mt-1 block text-[12px] font-semibold text-[#34694d]">{freshLabel}</small> : null}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-[#5f685f]" aria-label="Chart key">
          {chart.legend.map((k) => (
            <li key={k.style} className="flex items-center gap-2">
              <span aria-hidden className={`inline-block h-[3px] w-[22px] ${k.style === "CONFLICT" ? "bg-[#b8674e]" : k.style === "PROJECTED" ? "border-t-2 border-dashed border-[#356c9f]" : "bg-[#1f4b37]"}`} />
              {k.label}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <button type="button" className="min-h-11 min-w-11 rounded-full px-3 text-sm font-semibold text-[#1f4b37] disabled:text-[#5f685f]/50" disabled={selected <= 0} onClick={() => setSelected((s) => s - 1)} aria-label="Previous weighing">
            ‹ Earlier
          </button>
          <button type="button" className="min-h-11 min-w-11 rounded-full px-3 text-sm font-semibold text-[#1f4b37] disabled:text-[#5f685f]/50" disabled={selected >= points.length - 1} onClick={() => setSelected((s) => s + 1)} aria-label="Next weighing">
            Later ›
          </button>
        </div>
      </div>
      {chart.notCharted ? <p className="mt-1 text-[12px] text-[#5f685f]">{chart.notCharted}</p> : null}
      {chart.goalTarget.state === "UNRESOLVED" ? <p className="mt-1 text-[12px] text-[#5f685f]">{chart.goalTarget.note}</p> : null}
      {chart.projection.state === "NOT_USABLE" ? <p className="mt-1 text-[12px] text-[#5f685f]">{chart.projection.note}</p> : null}
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
