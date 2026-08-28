import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { TimelineEvent } from "@/domain/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DEFAULT_CATEGORY_COLOR: Record<string, string> = {
  Fertiliser: "bg-fr-attention",
  Silage: "bg-fr-good",
  Slurry: "bg-fr-info",
  Sowing: "bg-[#8a5a2b]",
  Housing: "bg-fr-ink-400",
  Feed: "bg-fr-map-silage",
  Lime: "bg-fr-risk",
  "Bale Wrap": "bg-purple-500",
  Other: "bg-fr-ink-400",
};

/**
 * Horizontal Gantt-style strip — design-system.md "Upcoming Timeline".
 * Shared by the Dashboard's Upcoming Timeline and the Input Planner's
 * Annual Purchasing Timeline (same visual pattern, different category set).
 */
export function TimelineChart({
  title,
  events,
  categoryColor = DEFAULT_CATEGORY_COLOR,
}: {
  title: string;
  events: TimelineEvent[];
  categoryColor?: Record<string, string>;
}) {
  const categories = Array.from(new Set(events.map((e) => e.category)));

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">No planned activities recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <div className="min-w-[640px]">
        <div className="mb-2 grid grid-cols-[100px_repeat(12,1fr)] text-[11px] font-medium text-fr-ink-400">
          <span />
          {MONTHS.map((m) => (
            <span key={m} className="text-center">
              {m}
            </span>
          ))}
        </div>
        {categories.map((category) => (
          <div key={category} className="grid grid-cols-[100px_repeat(12,1fr)] items-center py-1.5">
            <span className="text-xs font-medium text-fr-ink-600">{category}</span>
            {MONTHS.map((_, i) => {
              // A window can wrap the year boundary (e.g. Oct -> Mar), where
              // monthEnd < monthStart — that's "from monthStart to Dec, plus
              // Jan to monthEnd", not an empty/impossible range.
              const event = events.find((e) => {
                if (e.category !== category) return false;
                return e.monthEnd >= e.monthStart
                  ? i >= e.monthStart && i <= e.monthEnd
                  : i >= e.monthStart || i <= e.monthEnd;
              });
              const isStart = event?.monthStart === i;
              return (
                <div key={i} className="flex h-4 items-center px-0.5">
                  {event ? (
                    <div
                      className={`h-2 w-full rounded-full ${categoryColor[category] ?? "bg-fr-green-600"}`}
                      title={isStart ? event.label : undefined}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}
