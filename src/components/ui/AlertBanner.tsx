import { ChevronRight, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import type { StatusTone } from "@/lib/status";
import { toneClasses } from "@/lib/status";

/**
 * Inline warning/opportunity banner — "Silage deficit risk", Finance's
 * "Best opportunities" cards. An advisory, not a regulatory hard stop (see
 * HardStopAlert for that — spreading screen, not yet built).
 */
export function AlertBanner({
  tone = "attention",
  icon: Icon = TriangleAlert,
  title,
  description,
  actionLabel,
  className,
}: {
  tone?: StatusTone;
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  className?: string;
}) {
  const t = toneClasses[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-fr-card border p-4", t.bg, className)} style={{ borderColor: "transparent" }}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", t.text)} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", t.text)}>{title}</p>
        <p className="text-sm text-fr-ink-600">{description}</p>
      </div>
      {actionLabel ? (
        <button
          type="button"
          disabled
          title="Detailed options arrive with a later domain-engine phase"
          className={cn("flex shrink-0 items-center gap-1 self-center rounded-full border px-3 py-1.5 text-xs font-medium", t.text)}
          style={{ borderColor: "currentColor" }}
        >
          {actionLabel}
          <ChevronRight className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
