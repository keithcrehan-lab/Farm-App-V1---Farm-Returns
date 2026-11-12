"use client";

/**
 * The Soil view's "where to spread" card over the Farm map: lime first, then
 * fields grouped by what their nutrient plan leaves to spread, each line with
 * its fields, area and (when every figure is stated) the total to buy.
 * Tapping a line picks those fields out on the map. Figures come from
 * `soilSummary` (`src/lib/farm-soil-map.ts`); nothing is calculated here.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatHa, formatNumber } from "@/lib/format";
import type { SoilSummaryLine } from "@/lib/farm-soil-map";
import type { MapTone } from "@/components/farm/FieldMap";

const SWATCH: Record<MapTone, string> = {
  risk: "#C0362C",
  attention: "#D98324",
  caution: "#D9B526",
  good: "#2E7D4F",
  info: "#2563AC",
  neutral: "#98A2B3",
  silage: "#8BA23A",
};

function amounts(line: SoilSummaryLine): string {
  const parts = [formatHa(line.areaHa)];
  if (line.limeT !== undefined) parts.push(`${formatNumber(line.limeT, 1)} t lime`);
  if (line.pKg !== undefined) parts.push(`${formatNumber(line.pKg, 0)} kg P`);
  if (line.kKg !== undefined) parts.push(`${formatNumber(line.kKg, 0)} kg K`);
  return parts.join(" · ");
}

export function FarmSoilSummary({ lines, focusedKey, onFocus }: {
  lines: readonly SoilSummaryLine[];
  focusedKey?: string;
  onFocus: (line: SoilSummaryLine | undefined) => void;
}) {
  return (
    <div className="max-w-md bg-fr-v2-forest-deep/85 px-3.5 py-3 text-white shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-md" data-soil-summary aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold">Where to spread</p>
        <Link href="/fertiliser-plan" className="text-xs font-semibold text-white/80 underline decoration-white/40 underline-offset-[3px] hover:text-white">
          Fertiliser plan →
        </Link>
      </div>
      {lines.length === 0 ? (
        <p className="mt-1.5 text-xs text-white/70">No mapped fields yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {lines.map((line) => {
            const focused = focusedKey === line.key;
            return (
              <li key={line.key}>
                <button
                  type="button"
                  aria-pressed={focused}
                  onClick={() => onFocus(focused ? undefined : line)}
                  className={cn(
                    "flex min-h-10 w-full items-start gap-2.5 px-1.5 py-1 text-left transition-colors hover:bg-white/10",
                    focused && "bg-white/15",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("mt-1 size-3 shrink-0 rounded-full border border-white/70", line.key === "lime" && "bg-white")}
                    style={line.key === "lime" ? undefined : { backgroundColor: SWATCH[line.tone] }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-snug">
                      {line.label} <span className="font-normal text-white/70">· {line.fieldIds.length} {line.fieldIds.length === 1 ? "field" : "fields"}</span>
                    </span>
                    <span className="block text-[11px] leading-snug text-white/70 tabular-nums">{amounts(line)}</span>
                    {focused ? <span className="mt-0.5 block text-[11px] leading-snug text-white/85">{line.fieldNames.join(", ")}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
