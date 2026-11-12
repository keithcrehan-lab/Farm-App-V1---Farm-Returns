"use client";

/**
 * Asked straight after scanned fields are saved: is any of them fenced into
 * paddocks? Scanned parcel outlines don't show the farmer's own fences, so this
 * is where each field can be divided the way it is grazed. Skipping is fine;
 * a field can be divided later from its own page.
 */
import { Check } from "lucide-react";
import { formatHa } from "@/lib/format";

export interface PaddockQuestionField {
  id: string;
  name: string;
  areaHa: number;
}

export function PaddockQuestion({ fields, paddockCounts, onDivide }: {
  fields: readonly PaddockQuestionField[];
  /** Number of paddocks each field was divided into, by field id. */
  paddockCounts: Readonly<Record<string, number>>;
  onDivide: (fieldId: string) => void;
}) {
  const one = fields.length === 1;
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fr-v2-straw">{fields.length} {one ? "field" : "fields"} saved</p>
      <p className="mt-1 font-display text-lg leading-tight">{one ? "Is this field fenced into paddocks?" : "Are any of these fenced into paddocks?"}</p>
      <p className="mt-1.5 text-[13px] leading-snug text-white/70">
        If so, tap Divide and draw the fences. If not, press Finish.
      </p>
      <ul className="mt-3 space-y-2" aria-label="Fields just added">
        {fields.map((field) => {
          const count = paddockCounts[field.id];
          return (
            <li key={field.id} className="flex items-center justify-between gap-3 border border-white/15 bg-black/10 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">{field.name}</span>
                <span className="block font-mono text-[10px] tabular-nums text-white/55">{formatHa(field.areaHa)}</span>
              </span>
              {count ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-fr-v2-straw">
                  <Check className="size-3.5" aria-hidden /> {count} paddocks
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onDivide(field.id)}
                  aria-label={`Divide ${field.name} into paddocks`}
                  className="min-h-10 shrink-0 border border-fr-v2-straw/60 px-3 text-xs font-semibold text-fr-v2-straw hover:bg-white/10"
                >
                  Divide
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
