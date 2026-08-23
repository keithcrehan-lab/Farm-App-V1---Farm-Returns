import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockFields, mockSpreadingScores } from "@/data/mock-farm";
import { isHardStop } from "@/domain/types";
import { scoreTone } from "@/lib/status";
import { cn } from "@/lib/cn";

const toneFill: Record<string, string> = {
  good: "fill-fr-good/25 stroke-fr-good",
  attention: "fill-fr-attention/25 stroke-fr-attention",
  risk: "fill-fr-risk/25 stroke-fr-risk",
  info: "fill-fr-info/25 stroke-fr-info",
  neutral: "fill-fr-ink-400/15 stroke-fr-ink-400",
};

const toneBadge: Record<string, string> = {
  good: "bg-fr-good text-white",
  attention: "bg-fr-attention text-white",
  risk: "bg-fr-risk text-white",
  info: "bg-fr-info text-white",
  neutral: "bg-fr-ink-400 text-white",
};

/** Field polygon shapes + label anchor, laid out on a 100x100 viewBox. */
const FIELD_SHAPES: Record<string, { points: string; labelX: number; labelY: number }> = {
  "field-back": { points: "4,4 52,2 48,46 6,44", labelX: 26, labelY: 22 },
  "field-home": { points: "54,2 96,6 94,44 50,46", labelX: 74, labelY: 22 },
  "field-road": { points: "4,48 46,46 44,96 2,92", labelX: 24, labelY: 70 },
  "field-river": { points: "48,48 94,46 96,94 46,96", labelX: 70, labelY: 72 },
};

/**
 * Stylised field map — Phase 1 placeholder for the live satellite/aerial
 * map (spec §12 "Map"). No mapping-provider credentials exist yet (see
 * docs/product-requirements.md § open questions); this renders each mock
 * field as a coloured polygon at its approximate reference-pack position so
 * the score/selection interaction pattern is real even before MapLibre is
 * wired in.
 */
export function FarmMapCard() {
  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="p-5 pb-0">
        <CardTitle>Farm at a Glance</CardTitle>
        <span className="text-sm text-fr-ink-600">All Fields ({mockFields.length})</span>
      </CardHeader>
      <div className="relative mx-5 mb-5 mt-4 aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-[#3c5c3f] to-[#25381f]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {mockFields.map((field) => {
            const shape = FIELD_SHAPES[field.id];
            if (!shape) return null;
            const scoreEntry = mockSpreadingScores.find((s) => s.fieldId === field.id);
            const score = scoreEntry && !isHardStop(scoreEntry.slurryScore) ? scoreEntry.slurryScore.value : 0;
            const tone = scoreTone(score);
            return (
              <polygon
                key={field.id}
                points={shape.points}
                strokeWidth={1.2}
                className={toneFill[tone]}
              />
            );
          })}
        </svg>
        {mockFields.map((field) => {
          const shape = FIELD_SHAPES[field.id];
          if (!shape) return null;
          const scoreEntry = mockSpreadingScores.find((s) => s.fieldId === field.id);
          const score = scoreEntry && !isHardStop(scoreEntry.slurryScore) ? scoreEntry.slurryScore.value : 0;
          const tone = scoreTone(score);
          return (
            <div
              key={field.id}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ left: `${shape.labelX}%`, top: `${shape.labelY}%` }}
            >
              <span className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] font-medium text-white">
                {field.name.replace(" Field", "")}
              </span>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[11px] font-bold shadow",
                  toneBadge[tone],
                )}
              >
                {score}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
