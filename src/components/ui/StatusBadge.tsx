import { CheckCircle2, FlaskConical, Sparkles, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { dataStatusLabel, dataStatusTone, toneClasses, type StatusTone } from "@/lib/status";
import type { DataStatus } from "@/domain/types";

/** Generic pill badge — the base every status/source/confidence chip uses. */
export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: React.ReactNode;
}) {
  const t = toneClasses[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        t.bg,
        t.text,
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusIcon: Record<DataStatus, React.ComponentType<{ className?: string }>> = {
  verified: CheckCircle2,
  farmer_adjusted: Sparkles,
  estimated: FlaskConical,
  mapped: MapIcon,
};

/**
 * Renders the provenance status of a TrackedValue — spec §2/§15: estimated,
 * farmer-adjusted and verified data must remain visibly distinct.
 */
export function StatusBadge({ status, className }: { status: DataStatus; className?: string }) {
  const Icon = statusIcon[status];
  return (
    <Pill tone={dataStatusTone(status)} className={className}>
      <Icon className="h-3.5 w-3.5" />
      {dataStatusLabel(status)}
    </Pill>
  );
}

/** Shows where a value came from, e.g. "Teagasc rule", "Soil test". */
export function SourceBadge({ source, className }: { source: string; className?: string }) {
  return (
    <Pill tone="neutral" className={className}>
      {source}
    </Pill>
  );
}

/** High/medium/low estimate-uncertainty badge. */
export function ConfidenceBadge({
  level,
  className,
}: {
  level: "high" | "medium" | "low";
  className?: string;
}) {
  const tone: StatusTone = level === "high" ? "good" : level === "medium" ? "attention" : "risk";
  return (
    <Pill tone={tone} className={className}>
      {level[0].toUpperCase() + level.slice(1)} confidence
    </Pill>
  );
}
