import { FlaskConical, Package, Sprout, Wheat } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { mockFinanceLines, mockFinanceSummary } from "@/data/mock-farm";
import { formatEur } from "@/lib/format";

const ROW_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Silage: Wheat,
  Concentrates: Package,
  Grass: Sprout,
  Minerals: FlaskConical,
};

export function FeedCostOverviewCard() {
  const feedLines = mockFinanceLines.filter((l) => l.category === "feed");

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Sprout} tone="good" />
          <CardTitle>Feed cost overview</CardTitle>
        </span>
      </CardHeader>
      <ul className="flex flex-col gap-2 text-sm">
        {feedLines.map((line) => {
          const Icon = ROW_ICON[line.label] ?? Package;
          return (
            <li key={line.label} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-fr-ink-600">
                <Icon className="size-4 text-fr-ink-400" />
                {line.label}
              </span>
              <span className="font-semibold text-fr-ink-900">{formatEur(line.amount.value)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex items-center justify-between rounded-fr-control bg-fr-good-bg px-3 py-2 text-sm font-medium text-fr-good">
        <span>Potential saving</span>
        <span>{formatEur(mockFinanceSummary.feedPotentialSavingEur)}</span>
      </p>
    </Card>
  );
}
