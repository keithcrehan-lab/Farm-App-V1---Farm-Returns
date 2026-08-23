import { cn } from "@/lib/cn";
import { scoreTone, toneClasses } from "@/lib/status";

const toneStroke: Record<string, string> = {
  good: "var(--fr-status-good)",
  attention: "var(--fr-status-attention)",
  risk: "var(--fr-status-risk)",
  info: "var(--fr-status-info)",
  neutral: "var(--fr-ink-400)",
};

/**
 * Circular progress ring — spreading score, soil health, planning
 * confidence. Colour driven by status semantics (design-system.md "Charts").
 */
export function ScoreRing({
  score,
  max = 100,
  size = 88,
  strokeWidth = 8,
  label,
  suffix = `/${max}`,
  className,
}: {
  score: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  suffix?: string;
  className?: string;
}) {
  const tone = scoreTone(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, score / max));
  const dashoffset = circumference * (1 - pct);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={toneClasses.neutral.bg ? "var(--fr-border)" : undefined}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={toneStroke[tone]}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-fr-ink-900 leading-none">{score}</span>
          <span className="text-[10px] text-fr-ink-400 leading-none mt-0.5">{suffix}</span>
        </div>
      </div>
      {label ? <span className="text-xs font-medium text-fr-ink-600">{label}</span> : null}
    </div>
  );
}
