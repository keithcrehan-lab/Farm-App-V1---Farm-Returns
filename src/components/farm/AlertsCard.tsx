import { AlertTriangle, ChevronRight, Info, TriangleAlert } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockAlerts } from "@/data/mock-farm";
import { alertSeverityTone, toneClasses } from "@/lib/status";
import type { AlertSeverity } from "@/domain/types";

const severityIcon: Record<AlertSeverity, React.ComponentType<{ className?: string }>> = {
  risk: AlertTriangle,
  attention: TriangleAlert,
  info: Info,
};

export function AlertsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts &amp; Recommendations</CardTitle>
        <a href="#" className="text-sm font-medium text-fr-green-700">
          View all
        </a>
      </CardHeader>
      <ul className="flex flex-col gap-1">
        {mockAlerts.map((alert) => {
          const tone = alertSeverityTone(alert.severity);
          const Icon = severityIcon[alert.severity];
          return (
            <li key={alert.id}>
              <a
                href={alert.href ?? "#"}
                className="flex items-center gap-3 rounded-fr-control px-1 py-2 hover:bg-fr-surface-alt"
              >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${toneClasses[tone].bg}`}>
                  <Icon className={`size-4 ${toneClasses[tone].text}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fr-ink-900">
                    {alert.title}
                  </span>
                  <span className="block truncate text-xs text-fr-ink-600">{alert.subtitle}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-fr-ink-400" />
              </a>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
