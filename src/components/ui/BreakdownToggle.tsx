"use client";

/**
 * Real Mode Completion Phase 15 — reusable "How was this calculated?"
 * drill-down. Generic and data-driven: every caller passes real rows
 * already produced by a domain calculation (e.g.
 * `calculateFarmConcentrateFeedCostBreakdown`'s `byGroup`,
 * `calculateFarmFertiliserRequirement`'s `byProduct`) — this component
 * has no knowledge of what it's breaking down and invents nothing itself,
 * per the brief's explicit "must not become a hard-coded explanation...
 * must be driven by the same data used to create the number."
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { formatEur } from "@/lib/format";

export interface BreakdownRow {
  label: string;
  valueEur: number;
  detail?: string;
}

export function BreakdownToggle({
  rows,
  totalEur,
  className,
}: {
  rows: BreakdownRow[];
  totalEur: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-fr-green-700"
      >
        <HelpCircle className="size-3.5" />
        How was this calculated?
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
      {open ? (
        <ul className="mt-2 flex flex-col divide-y divide-fr-border rounded-fr-control border border-fr-border text-xs">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between px-2.5 py-1.5">
              <span className="text-fr-ink-600">
                {row.label}
                {row.detail ? <span className="text-fr-ink-400"> · {row.detail}</span> : null}
              </span>
              <span className="font-medium text-fr-ink-900">{formatEur(row.valueEur)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between px-2.5 py-1.5 font-semibold text-fr-ink-900">
            <span>Total</span>
            <span>{formatEur(totalEur)}</span>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
