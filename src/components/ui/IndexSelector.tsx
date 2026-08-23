import { cn } from "@/lib/cn";

const OPTIONS = [1, 2, 3, 4] as const;

/**
 * 1–4 P/K Index selector — spec §5 field soil record "Planning fertility".
 * Highlight colour: amber when the farmer has adjusted the value away from
 * the default, green otherwise (estimated or verified) — a simpler signal
 * than the full provenance badge, matching the approved soil reference.
 */
export function IndexSelector({
  value,
  tone = "good",
  label,
}: {
  value: 1 | 2 | 3 | 4;
  tone?: "good" | "attention";
  label: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-fr-ink-600">{label}</p>
      <div className="flex gap-1.5" role="group" aria-label={label}>
        {OPTIONS.map((n) => {
          const active = n === value;
          return (
            <span
              key={n}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg border text-sm font-semibold",
                active
                  ? tone === "attention"
                    ? "border-fr-attention bg-fr-attention text-white"
                    : "border-fr-good bg-fr-good text-white"
                  : "border-fr-border text-fr-ink-600",
              )}
            >
              {n}
            </span>
          );
        })}
      </div>
    </div>
  );
}
