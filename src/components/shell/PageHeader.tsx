import { Bell, CloudSun } from "lucide-react";

/**
 * Desktop page header: title + subtitle left, weather/notifications/season
 * selector right — see design/screen-specification.md "Page header pattern".
 */
export function PageHeader({
  title,
  subtitle,
  weather = "12°C · Light Rain",
  seasonLabel = "2026 Season",
}: {
  title: string;
  subtitle?: string;
  weather?: string;
  seasonLabel?: string;
}) {
  return (
    <header className="mb-6 hidden items-start justify-between lg:flex">
      <div>
        <h1 className="text-title text-fr-ink-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-fr-ink-600">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 rounded-full border border-fr-border bg-fr-surface px-3 py-1.5 text-sm text-fr-ink-600">
          <CloudSun className="size-4 text-fr-info" />
          {weather}
        </span>
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
