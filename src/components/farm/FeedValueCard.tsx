import { Beef, Sprout } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { mockLivestockGroups } from "@/data/mock-farm";
import { formatNumber } from "@/lib/format";
import type { Field, SilagePlan } from "@/domain/types";

export function FeedValueCard({ plan, field }: { plan: SilagePlan; field: Field }) {
  const totalDm = plan.expectedYieldTDMha.value * field.areaHa;
  const supportGroup = plan.feedSupport
    ? mockLivestockGroups.find((g) => g.id === plan.feedSupport?.groupId)
    : undefined;

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Sprout} tone="good" />
          <CardTitle>Feed value</CardTitle>
        </span>
      </CardHeader>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <IconChip icon={Sprout} tone="good" />
          <div>
            <p className="text-xs text-fr-ink-600">Supplies</p>
            <p className="text-base font-bold text-fr-ink-900">{formatNumber(totalDm, 1)} t DM</p>
            <p className="text-xs text-fr-ink-400">from this field</p>
          </div>
        </div>
        {supportGroup && plan.feedSupport ? (
          <div className="flex items-center gap-3">
            <IconChip icon={Beef} tone="good" />
            <div>
              <p className="text-xs text-fr-ink-600">Supports</p>
              <p className="text-base font-bold text-fr-ink-900">
                {formatNumber(supportGroup.count.value, 0)} {supportGroup.label.toLowerCase()}
              </p>
              <p className="text-xs text-fr-ink-400">for ~{plan.feedSupport.days} days</p>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
