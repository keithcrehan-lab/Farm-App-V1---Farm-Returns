import { AlertTriangle, ChevronRight, Info, ShieldCheck, TriangleAlert } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { alertSeverityTone, toneClasses } from "@/lib/status";
import { deriveRealAlerts } from "@/domain/real-alerts";
import { useFarm, useFields, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import type { AlertSeverity } from "@/domain/types";

const severityIcon: Record<AlertSeverity, React.ComponentType<{ className?: string }>> = {
  risk: AlertTriangle,
  attention: TriangleAlert,
  info: Info,
};

/**
 * V3 closure pass (second pass, mock-authority audit) — every alert here
 * is now real, derived from this farm's own live data through this
 * app's own wired V3 gates (`real-alerts.ts`): commonage suppression,
 * water-buffer distance, soil-test disregard, NAP ceiling, and the
 * closed-period spreading calendar. Previously this card showed
 * `mockAlerts` — four fixed entries with no calculation behind any of
 * them, unlabelled, indistinguishable from a real compliance alert.
 */
export function AlertsCard() {
  const farm = useFarm();
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const alerts = deriveRealAlerts({ farm, fields, livestockGroups, slurryAllocations });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts &amp; Recommendations</CardTitle>
        <a href="#" className="text-sm font-medium text-fr-green-700">
          View all
        </a>
      </CardHeader>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 py-4 text-sm text-fr-ink-600">
          <ShieldCheck className="size-4 shrink-0 text-fr-good" />
          No compliance alerts from your current farm data.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {alerts.map((alert) => {
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
      )}
    </Card>
  );
}
