"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ChevronDown, Settings, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFarmWeatherReading, weatherToneDot, type FarmWeatherReading } from "@/components/farm/WeatherHeroChip";
import type { FarmConditionsSummary } from "@/lib/farm-conditions-summary";

/**
 * Farm Home visual refresh v1 — the compact conditions control at the
 * map's top-right, replacing the former full-width ambient strip. The
 * collapsed control shows the farm's real station temperature and name
 * with its freshness word, and the real count of spreading-calendar
 * restrictions (`farmConditionsSummary`). Activating it discloses the
 * detail: the regulatory spreading calendar per material, kept separate
 * from the weather station reading and its freshness.
 *
 * Nothing here derives a value: `summary` is formatted upstream from the
 * screen's real spreading-window Prompts, and the reading comes from the
 * same `/api/weather/observations` pipeline `WeatherHeroChip` uses. No
 * suitability verdict is offered. Status is always carried by words, so
 * colour is never the only signal.
 */
export function FarmConditionsControl({
  centroid,
  summary,
  ready,
}: {
  centroid: [number, number];
  summary: FarmConditionsSummary;
  /** False until the screen has computed its Prompts post-mount. */
  ready: boolean;
}) {
  const reading = useFarmWeatherReading(centroid);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on a pointer press outside the control (a lightweight,
  // non-modal disclosure — the map stays usable underneath).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      // Keep Escape local: it must not also deselect the map's field.
      event.stopPropagation();
      close();
    }
  }

  const restrictionText = ready ? summary.restrictionLabel : "Checking calendar";
  const weatherLabel = reading ? `${reading.tempText}${reading.stationName ? `, ${reading.stationName} station` : ""}, ${reading.freshness.toLowerCase()}. ` : "";

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} className="relative flex items-stretch gap-1" data-conditions-control>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Conditions: ${weatherLabel}${restrictionText}. ${open ? "Hide" : "Show"} details`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-fr-v2-control bg-fr-v2-shell/72 px-3 py-1.5 text-white shadow-[0_2px_10px_rgba(0,0,0,0.18)] backdrop-blur-md transition-colors duration-[160ms] hover:bg-fr-v2-shell/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none",
          open && "bg-fr-v2-shell/90",
        )}
      >
        {reading ? (
          <span className="flex min-w-0 items-baseline gap-1.5 tabular-nums" data-conditions-weather>
            <span className="text-[13px] font-semibold">{reading.tempText.replace("°C", "°")}</span>
            {reading.stationName ? <span className="truncate text-xs text-white/80">{reading.stationName}</span> : null}
            {reading.status !== "LIVE" ? <span className="shrink-0 text-[11px] text-white/70">· {reading.freshness}</span> : null}
          </span>
        ) : null}
        {reading ? <span aria-hidden className="h-3.5 w-px shrink-0 bg-white/20" /> : null}
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium" data-conditions-restrictions>
          {ready && summary.restrictedCount > 0 ? <span aria-hidden className="size-1.5 rounded-full bg-fr-v2-harvest-strong" /> : null}
          {restrictionText}
        </span>
        <ChevronDown aria-hidden className={cn("size-3.5 shrink-0 text-white/70 transition-transform duration-[160ms] motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <Link
        href="/settings"
        aria-label="Settings"
        className="flex w-8 shrink-0 items-center justify-center rounded-fr-v2-control bg-fr-v2-shell/72 text-white/85 shadow-[0_2px_10px_rgba(0,0,0,0.18)] backdrop-blur-md transition-colors duration-[160ms] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
      >
        <Settings className="size-4" />
      </Link>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label="Farm conditions"
          data-conditions-panel
          className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-fr-v2-control bg-fr-v2-stone p-4 text-fr-v2-charcoal shadow-[var(--fr-v2-shadow-overlay)] transition-[opacity,translate] duration-[160ms] ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">Spreading calendar · regulatory</p>
            <button
              type="button"
              onClick={close}
              aria-label="Close conditions"
              className="-mr-1.5 -mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-[2px] text-fr-v2-muted transition-colors duration-[160ms] hover:text-fr-v2-graphite focus-visible:outline-2 focus-visible:outline-fr-v2-forest motion-reduce:transition-none"
            >
              <X className="size-4" />
            </button>
          </div>
          {!ready ? (
            <p className="mt-1.5 text-xs text-fr-v2-muted">Checking the spreading calendar…</p>
          ) : summary.entries.length === 0 ? (
            <p className="mt-1.5 text-xs leading-snug text-fr-v2-muted">No mapped field has a spreading-calendar status yet.</p>
          ) : (
            <dl className="mt-1.5" data-conditions-calendar>
              {summary.entries.map((entry) => (
                <div key={entry.id} className="flex items-baseline justify-between gap-3 py-1">
                  <dt className="text-[13px] font-medium text-fr-v2-graphite">{entry.label}</dt>
                  <dd className={cn("shrink-0 text-xs font-semibold tabular-nums", entry.restricted ? "text-fr-v2-harvest-ink" : "text-fr-v2-forest")}>{entry.statusText}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">Weather station</p>
          <WeatherDetail reading={reading} />
        </div>
      ) : null}
    </div>
  );
}

function WeatherDetail({ reading }: { reading: FarmWeatherReading | null | undefined }) {
  if (reading === undefined) return <p className="mt-1.5 text-xs text-fr-v2-muted">Loading station reading…</p>;
  if (reading === null) return <p className="mt-1.5 text-xs leading-snug text-fr-v2-muted">No station reading is available right now.</p>;
  return (
    <div className="mt-1.5" data-conditions-station>
      <div className="flex items-baseline justify-between gap-3 py-1">
        <span className="text-[13px] font-medium tabular-nums text-fr-v2-graphite">{reading.tempText}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
          <span aria-hidden className={cn("size-1.5 rounded-full", reading.tone === "neutral" ? "bg-fr-v2-muted" : weatherToneDot[reading.tone])} />
          {reading.freshness}
        </span>
      </div>
      <p className="text-xs leading-snug text-fr-v2-muted">
        {reading.stationName ? `${reading.stationName} station · ${reading.stationDistanceText} away. ` : ""}A station reading, not an in-field sensor.
      </p>
    </div>
  );
}
