import { CalendarDays, Droplets, FlaskConical } from "lucide-react";
import { Pill } from "@/components/ui/StatusBadge";
import type { PlannedApplication } from "@/domain/types";

const KIND_ICON: Record<PlannedApplication["kind"], React.ComponentType<{ className?: string }>> = {
  slurry: Droplets,
  fertiliser: FlaskConical,
};

export function PlannedApplicationsCard({ applications }: { applications: PlannedApplication[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-fr-ink-900">Planned applications</h3>
        <button type="button" disabled title="Full plan view arrives with a later phase" className="flex items-center gap-0.5 text-sm font-medium text-fr-info/70">
          See full plan
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {applications.map((app) => {
          const Icon = KIND_ICON[app.kind];
          return (
            <li key={app.id} className="flex items-center gap-3 rounded-fr-card border border-fr-border bg-fr-surface p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fr-green-100">
                <Icon className="size-5 text-fr-green-700" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-fr-ink-900">{app.label}</p>
                <p className="text-xs text-fr-ink-600">{app.fieldNames}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="flex items-center justify-end gap-1 text-xs text-fr-ink-600">
                  <CalendarDays className="size-3.5" />
                  {app.when.timeLabel}
                </p>
                <p className="text-sm font-semibold text-fr-ink-900">{app.quantityLabel}</p>
                <Pill tone="good" className="mt-0.5">
                  {app.status === "planned" ? "Planned" : "Complete"}
                </Pill>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
