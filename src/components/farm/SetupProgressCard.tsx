import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, ListChecks } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { calculateFarmSetupProgress } from "@/domain/farm-stats";
import type { Field, Housing, LivestockGroup } from "@/domain/types";

/**
 * Real Mode Completion Phase 6 — "For a new farm, show setup progress and
 * next actions... do not invent KPIs simply to fill visual space." Every
 * line here is a real count (`calculateFarmSetupProgress`); the whole
 * card renders nothing once `nextAction` is `null` — the Dashboard is
 * meant to become richer as the farm gains real information, not carry a
 * permanent empty checklist once setup is done (the KPI/alerts/timeline
 * cards below already cover an established farm).
 */
export function SetupProgressCard({
  fields,
  livestockGroups,
  housing,
}: {
  fields: Field[];
  livestockGroups: LivestockGroup[];
  housing: Housing[];
}) {
  const progress = calculateFarmSetupProgress(fields, livestockGroups, housing);
  if (!progress.nextAction) return null;

  const items = [
    { label: `${progress.fieldsMapped} of ${progress.totalFields} fields mapped`, done: progress.fieldsMapped > 0 && progress.totalFields > 0, href: "/fields" },
    { label: progress.soilTestsVerified > 0 ? `${progress.soilTestsVerified} soil test${progress.soilTestsVerified === 1 ? "" : "s"} verified` : "Soil information: Not started", done: progress.soilTestsVerified > 0, href: "/soil" },
    { label: progress.livestockGroupCount > 0 ? `Livestock: ${progress.livestockHeadCount} head` : "Livestock: Not started", done: progress.livestockGroupCount > 0, href: "/livestock" },
    { label: progress.housingCount > 0 ? `Housing: ${progress.housingCount} shed${progress.housingCount === 1 ? "" : "s"}` : "Housing: Not started", done: progress.housingCount > 0, href: "/housing" },
  ];

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={ListChecks} tone="attention" />
          <CardTitle>Set up your farm</CardTitle>
        </span>
      </CardHeader>
      <ul className="flex flex-col gap-2 text-sm">
        {items.map((item) => (
          <li key={item.label}>
            <Link href={item.href} className="flex items-center gap-2 text-fr-ink-900 hover:text-fr-green-700">
              {item.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-fr-good" />
              ) : (
                <Circle className="size-4 shrink-0 text-fr-ink-400" />
              )}
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={progress.nextAction.href}
        className="mt-4 flex items-center justify-between rounded-fr-control bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white"
      >
        Next: {progress.nextAction.label}
        <ArrowRight className="size-4" />
      </Link>
    </Card>
  );
}
