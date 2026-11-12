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

const W = 1000;
const H = 300;
const TOP = 12;
const BOTTOM = 34;
const LEFT = 46;

export function GrassWedgeChart({ bars, line, selectedFieldId, onSelect, occupiedFieldIds }: {
  bars: readonly WedgeBar[];
  line?: DemandLine;
  selectedFieldId?: string;
  onSelect: (fieldId: string) => void;
  occupiedFieldIds: ReadonlySet<string>;
}) {
  const known = bars.filter((b) => b.coverKgDmHa !== undefined).map((b) => b.coverKgDmHa!);
  const top = Math.max(1000, ...known, line?.targetPreGrazingKgDmHa ?? 0);
  const yMax = Math.ceil((top * 1.1) / 500) * 500;
  const plotW = W - LEFT;
  const plotH = H - TOP - BOTTOM;
  const y = (v: number) => TOP + plotH - (v / yMax) * plotH;
  const xOf = (f: number) => LEFT + f * plotW;
  const ticks = Array.from({ length: Math.floor(yMax / 500) + 1 }, (_, i) => i * 500);
  const first = bars[0];
  const last = bars[bars.length - 1];

  if (bars.length === 0) return <p className="py-10 text-center text-sm text-fr-v2-muted">Map a field to begin your grass wedge.</p>;

  return (
    <figure className="relative" aria-label="Grass wedge">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label={`Grass wedge of ${bars.length} fields${line ? ", with the target line" : ""}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={W} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-fr-v2-cream-rule" strokeWidth={1} />
            <text x={LEFT - 6} y={y(t) + 4} textAnchor="end" className="fill-fr-v2-muted font-mono" fontSize={13}>{t === 0 ? "0" : `${t / 1000}k`}</text>
          </g>
        ))}
        {bars.map((b) => {
          const selected = b.fieldId === selectedFieldId;
          const x = xOf(b.x) + 1.5;
          const w = Math.max(2, b.width * plotW - 3);
          const known = b.coverKgDmHa !== undefined;
          const h = known ? Math.max(2, (b.coverKgDmHa! / yMax) * plotH) : 10;
          const above = known && b.targetKgDmHa !== undefined ? b.coverKgDmHa! >= b.targetKgDmHa : undefined;
          return (
            <g key={b.fieldId}>
              <rect
                x={x}
                y={TOP + plotH - h}
                width={w}
                height={h}
                rx={3}
                className={cn(
                  known ? (above === undefined ? "fill-fr-v2-teal" : above ? "fill-fr-v2-forest" : "fill-fr-v2-harvest") : "fill-fr-v2-cream-rule",
                  selected ? "opacity-100" : selectedFieldId ? "opacity-45" : "opacity-90",
                )}
              />
              {selected ? <rect x={x - 1} y={TOP + plotH - h - 1} width={w + 2} height={h + 2} rx={4} fill="none" stroke="#e3c77e" strokeWidth={3} /> : null}
              {occupiedFieldIds.has(b.fieldId) && w > 14 ? <circle cx={x + w / 2} cy={TOP + plotH - h - 9} r={4.5} className="fill-fr-v2-graphite" /> : null}
              {w > 44 ? (
                <text x={x + w / 2} y={H - BOTTOM + 18} textAnchor="middle" className={cn("fill-fr-v2-charcoal", selected && "font-semibold")} fontSize={13}>
                  {b.name.length * 7.5 > w ? `${b.name.slice(0, Math.max(2, Math.floor(w / 7.5) - 1))}…` : b.name}
                </text>
              ) : null}
            </g>
          );
        })}
        {line && first && last ? (
          <line x1={xOf(first.centre)} y1={y(line.targetPreGrazingKgDmHa)} x2={xOf(last.centre)} y2={y(line.residualKgDmHa)} stroke="#C0362C" strokeWidth={3} strokeLinecap="round" />
        ) : null}
      </svg>
      {/* Invisible, full-height tap targets over each bar: every field is selectable, however short its bar. */}
      <div className="absolute inset-0" style={{ left: `${(LEFT / W) * 100}%` }}>
        {bars.map((b) => (
          <button
            key={b.fieldId}
            type="button"
            onClick={() => onSelect(b.fieldId)}
            aria-pressed={b.fieldId === selectedFieldId}
            aria-label={`${b.name}: ${b.coverKgDmHa === undefined ? "not measured" : `${formatNumber(b.coverKgDmHa, 0)} kg DM/ha`}, ${formatNumber(b.areaHa, 2)} ha${b.targetKgDmHa !== undefined ? `, line at ${formatNumber(b.targetKgDmHa, 0)}` : ""}`}
            className="absolute inset-y-0 focus-visible:outline-2 focus-visible:outline-fr-v2-forest"
            style={{ left: `${b.x * 100}%`, width: `${b.width * 100}%` }}
          />
        ))}
      </div>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fr-v2-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full bg-[#C0362C]" aria-hidden />Target line</span>
        {line ? (
          <>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-fr-v2-forest" aria-hidden />Above the line</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-fr-v2-harvest" aria-hidden />Below</span>
          </>
        ) : null}
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-fr-v2-graphite" aria-hidden />Cattle in field</span>
        <span>kg DM/ha</span>
      </figcaption>
    </figure>
  );
}
