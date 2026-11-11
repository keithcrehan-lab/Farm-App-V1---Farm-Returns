/**
 * Fields whose soil pH is below the Teagasc target and that have no
 * laboratory lime requirement yet (fertiliser close-out, 2026-11-11).
 * Presentation only: every figure comes from `aggregateFarmLimeRequirement`
 * (`assessSoilPh`). It never shows a lime rate derived from pH — the rate
 * must come from a laboratory lime requirement test (`TEAGASC_PH_LIME`).
 */
import { formatPhTarget } from "@/domain/soil-ph-advice";
import type { FarmLimeRequirement } from "@/domain/fertiliser-plan";

export function SoilPhAdviceList({ lime, className = "" }: { lime: FarmLimeRequirement; className?: string }) {
  const lines = lime.fields.filter(
    (line) => line.phAdvice?.status === "BELOW_TARGET" && line.phAdvice.limeRate === "LABORATORY_LIME_REQUIREMENT_NEEDED",
  );
  if (lines.length === 0) return null;

  return (
    <section aria-label="Lime likely needed" className={`rounded-fr-control border border-fr-border bg-fr-surface-alt px-4 py-3 ${className}`}>
      <p className="text-sm font-semibold text-fr-ink-900">
        Lime likely needed on {lines.length} field{lines.length === 1 ? "" : "s"}
      </p>
      <ul className="mt-2 flex flex-col">
        {lines.map((line) => (
          <li key={line.fieldId} className="flex items-center justify-between gap-3 border-t border-fr-border py-1.5 text-sm first:border-t-0">
            <span className="min-w-0 flex-1 truncate text-fr-ink-900">{line.fieldName}</span>
            <span className="shrink-0 text-fr-ink-600">
              pH {line.phAdvice!.ph.toFixed(1)} · target {formatPhTarget(line.phAdvice!.target)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-fr-ink-600">
        Soil pH is below the Teagasc target. Ask your lab for a lime requirement on the next soil test — the rate in tonnes per hectare comes from that test, not from pH alone.
      </p>
    </section>
  );
}
