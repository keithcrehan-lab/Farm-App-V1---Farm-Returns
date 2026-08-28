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
  onSelect,
}: {
  /** Codex remediation Priority 2 — `undefined` means genuinely not
   * recorded yet (no fabricated Index-2 default): every option renders
   * unselected, an honest "pick one" state, never a value that looks
   * chosen but wasn't. */
  value: 1 | 2 | 3 | 4 | undefined;
  tone?: "good" | "attention";
  label: string;
  /** Omit to render read-only (e.g. dashboard summaries); pass to let the
   * farmer tap a different index and adjust the assumption in place. */
  onSelect?: (value: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-fr-ink-600">{label}</p>
      <div className="flex gap-1.5" role="group" aria-label={label}>
        {OPTIONS.map((n) => {
          const active = n === value;
          const activeClass = active
            ? tone === "attention"
              ? "border-fr-attention bg-fr-attention text-white"
              : "border-fr-good bg-fr-good text-white"
            : "border-fr-border text-fr-ink-600";
          return onSelect ? (
            <button
              key={n}
              type="button"
              onClick={() => onSelect(n)}
              aria-pressed={active}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg border text-sm font-semibold transition-colors",
                activeClass,
                !active && "hover:border-fr-green-700 hover:text-fr-green-700",
              )}
            >
              {n}
            </button>
          ) : (
            <span
              key={n}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg border text-sm font-semibold",
                activeClass,
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
