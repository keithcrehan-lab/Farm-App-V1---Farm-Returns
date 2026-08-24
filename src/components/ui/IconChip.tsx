import { cn } from "@/lib/cn";
import type { StatusTone } from "@/lib/status";
import { toneClasses } from "@/lib/status";

/**
 * Small circular icon badge used for card section headers throughout the
 * reference screens (Soil coverage, Nutrient requirement, Organic nutrients…).
 */
export function IconChip({
  icon: Icon,
  tone = "good",
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: StatusTone;
  className?: string;
}) {
  const t = toneClasses[tone];
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", t.bg, className)}>
      <Icon className={cn("size-4", t.text)} />
    </span>
  );
}
