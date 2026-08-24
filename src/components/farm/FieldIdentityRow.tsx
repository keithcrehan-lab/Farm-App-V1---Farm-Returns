import Link from "next/link";
import { Map } from "lucide-react";
import { isHardStop, type Field } from "@/domain/types";
import { mockSpreadingScores } from "@/data/mock-farm";
import { landUseLabel, scoreTone } from "@/lib/status";
import { formatHa } from "@/lib/format";

const TONE_VAR: Record<string, string> = {
  good: "var(--fr-status-good)",
  attention: "var(--fr-status-attention)",
  risk: "var(--fr-status-risk)",
  info: "var(--fr-status-info)",
  neutral: "var(--fr-ink-400)",
};

/**
 * Field header used at the top of detail screens (Nutrient Planner, Silage
 * Planning) reached from a field: thumbnail + today's score badge, name,
 * area, planned use, and a "View map" link back to /fields.
 */
export function FieldIdentityRow({ field }: { field: Field }) {
  const scoreEntry = mockSpreadingScores.find((s) => s.fieldId === field.id);
  const score = scoreEntry && !isHardStop(scoreEntry.slurryScore) ? scoreEntry.slurryScore.value : undefined;
  const tone = score !== undefined ? scoreTone(score) : "neutral";

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#5a7a4e] via-[#3c5c3f] to-[#25381f]">
        <span className="absolute inset-x-0 top-1 text-center text-[11px] font-semibold text-white">
          {field.name.replace(" Field", "")}
        </span>
        {score !== undefined ? (
          <span
            className="absolute bottom-1.5 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: TONE_VAR[tone] }}
          >
            {score}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-title text-fr-ink-900">{field.name}</h2>
        <p className="text-sm text-fr-ink-600">
          {formatHa(field.areaHa)} · {landUseLabel(field.plannedUse.value)}
        </p>
      </div>
      <Link
        href="/fields"
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-fr-green-700 px-3 py-1.5 text-sm font-medium text-fr-green-700"
      >
        <Map className="size-4" />
        View map
      </Link>
    </div>
  );
}
