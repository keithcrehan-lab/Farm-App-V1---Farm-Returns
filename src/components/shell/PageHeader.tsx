"use client";

import { Bell } from "lucide-react";
import { WeatherHeroChip } from "@/components/farm/WeatherHeroChip";
import { useFarm } from "@/store/farm-store";

/**
 * Desktop page header: title + subtitle left, weather/notifications/season
 * selector right — see design/screen-specification.md "Page header pattern".
 *
 * `actions` (Farm Return Next v1.1, Codex audit MEDIUM round 3 —
 * `docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round3.md`
 * flagged the desktop-only "Farm" primary screen having no Ask AI
 * affordance at all): an optional slot rendered before the weather chip,
 * so any screen using this header can pass its own real `<AskAIButton
 * .../>` (or another header-level action) for desktop, matching what
 * every v1.1 primary screen already shows on its own mobile header —
 * `undefined` (every pre-existing caller) renders exactly as before.
 *
 * Strict Visual Reproduction phase (2026-09-03): `weather` used to
 * default to a hardcoded `"12°C · Light Rain"` — a fabricated reading
 * shown as if real on every one of this header's ~20 callers, none of
 * which ever passed a real override (`CLAUDE.md` "never let a model...
 * invent a production scientific... number"). Real weather now comes
 * from the same Met Éireann pipeline every other weather consumer in
 * this app uses (`WeatherHeroChip`, at the farm's own real
 * `location.centroid`) and is simply omitted — no chip at all — when
 * that pipeline has no real data yet, exactly like every other consumer.
 */
export function PageHeader({
  title,
  subtitle,
  seasonLabel = "2026 Season",
  actions,
}: {
  title: string;
  subtitle?: string;
  seasonLabel?: string;
  actions?: React.ReactNode;
}) {
  const farm = useFarm();
  return (
    <header className="mb-6 hidden items-start justify-between lg:flex">
      <div>
        <h1 className="font-display text-title text-fr-ink-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-fr-ink-600">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <WeatherHeroChip centroid={farm.location.centroid} light />
        <button
          type="button"
          className="relative flex size-9 items-center justify-center rounded-full border border-fr-border bg-fr-surface text-fr-ink-600"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-fr-risk" />
        </button>
        <span className="rounded-full border border-fr-border bg-fr-surface px-3 py-1.5 text-sm font-medium text-fr-ink-900">
          {seasonLabel}
        </span>
      </div>
    </header>
  );
}
