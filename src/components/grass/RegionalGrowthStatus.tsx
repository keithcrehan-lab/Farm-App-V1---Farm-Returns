"use client";

import type { RegionalGrassDisplay } from "@/domain/regional-grass-display";
import { formatNumber } from "@/lib/format";

/** One accountable presentation for the county reference, separate from any
 * farmer-entered or farm-measured growth that drives the grass calculations. */
export function RegionalGrowthStatus({
  regional,
  theme = "light",
}: {
  regional?: RegionalGrassDisplay;
  theme?: "light" | "dark";
}) {
  if (!regional) return null;
  const dark = theme === "dark";
  const county = "county" in regional ? `Co. ${regional.county}` : "County not set";
  const published = regional.status === "published";
  const description = published
    ? regional.current
      ? `Teagasc MoSt prediction · ${regional.validFrom} to ${regional.validTo}`
      : `Last published ${regional.validFrom} to ${regional.validTo} · not a current forecast`
    : regional.status === "not_published"
      ? "No approved county figure has been published yet."
      : regional.status === "unavailable"
        ? "County figures could not be loaded. Your own farm rate is unaffected."
        : "Set your farm's county to see the regional forecast.";

  return (
    <section
      aria-label="Regional grass growth"
      className={dark
        ? "border-t border-white/10 px-3.5 py-2 text-white lg:px-0"
        : "mt-3 rounded-[14px] border border-fr-v2-cream-rule bg-fr-v2-cream px-4 py-3"}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className={dark ? "text-[11px] font-semibold text-white/80" : "text-xs font-semibold text-fr-v2-charcoal"}>
          Regional growth · {county}
        </div>
        <div className={dark ? "text-[12px] font-semibold text-white" : "font-mono text-[17px] font-semibold tabular-nums text-fr-v2-graphite"}>
          {published
            ? <>{formatNumber(regional.growthKgDmHaDay, 1)} <span className="text-[10px] font-normal opacity-70">kg DM/ha/day</span></>
            : <span className="text-[11px] font-medium">Awaiting county figures</span>}
        </div>
      </div>
      <p className={dark ? "mt-1 text-[10px] leading-snug text-white/60" : "mt-1 text-[11px] leading-4 text-fr-v2-muted"}>
        {description}
        {published && regional.sourceUrl ? (
          <> · <a href={regional.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-current/30 underline-offset-2">Source</a></>
        ) : null}
      </p>
    </section>
  );
}
