import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { formatPct } from "@/lib/format";

export function MetricCard({
  label,
  value,
  changePct,
  changeIsGoodWhenNegative = false,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  changePct?: number;
  /** For cost-type metrics, a negative change is the good direction. */
  changeIsGoodWhenNegative?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const isGood =
    changePct === undefined
      ? undefined
      : changeIsGoodWhenNegative
        ? changePct <= 0
        : changePct >= 0;

  return (
    <Card className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-label uppercase tracking-wide text-fr-ink-600">{label}</span>
        {Icon ? <Icon className="size-4 text-fr-ink-400" /> : null}
      </div>
      <span className="text-metric font-bold text-fr-ink-900">{value}</span>
      {changePct !== undefined ? (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-medium",
            isGood ? "text-fr-good" : "text-fr-risk",
          )}
        >
          {changePct >= 0 ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownRight className="size-3.5" />
          )}
          {formatPct(changePct)}
        </span>
      ) : null}
    </Card>
  );
}
