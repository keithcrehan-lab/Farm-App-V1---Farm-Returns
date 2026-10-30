import type { ReactNode } from "react";

export function ProgressiveDisclosure({
  label,
  summary,
  children,
  defaultOpen = false,
  status,
}: {
  label: string;
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
  status?: "good" | "attention" | "neutral";
}) {
  const dot = status === "good" ? "bg-fr-good" : status === "attention" ? "bg-fr-attention" : "bg-fr-ink-400";
  return (
    <details className="group border-t border-fr-border" open={defaultOpen}>
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-3 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-green-700">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fr-ink-900">{label}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-fr-ink-600">{summary}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {status ? <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" /> : null}
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-green-700 group-open:hidden">Open</span>
          <span className="hidden font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-green-700 group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="pb-6 pt-2">{children}</div>
    </details>
  );
}
