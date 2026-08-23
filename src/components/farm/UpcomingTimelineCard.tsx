import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockTimeline } from "@/data/mock-farm";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const categoryColor: Record<string, string> = {
  Fertiliser: "bg-fr-attention",
  Silage: "bg-fr-good",
  Slurry: "bg-fr-info",
  Sowing: "bg-[#8a5a2b]",
  Housing: "bg-fr-ink-400",
};

/** Horizontal Gantt-style strip — design-system.md "Upcoming Timeline". */
export function UpcomingTimelineCard() {
  const categories = Array.from(new Set(mockTimeline.map((e) => e.category)));

  return (
    <Card className="overflow-x-auto">
      <CardHeader>
        <CardTitle>Upcoming Timeline</CardTitle>
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
              const event = mockTimeline.find(
                (e) => e.category === category && i >= e.monthStart && i <= e.monthEnd,
              );
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
