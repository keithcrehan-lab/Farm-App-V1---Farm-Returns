"use client";

/**
 * "What do you usually do with the calves?" asked where it matters (the
 * fertiliser plan, adding cattle) instead of during farm setup. The answer
 * picks the Teagasc grassland nitrogen table for the farm's grazing fields.
 */
import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FarmGrazingProductionSystem } from "@/domain/types";
import { setFarmCalfSystemAction } from "@/app/actions/calf-system";

const OPTIONS: ReadonlyArray<{ value: FarmGrazingProductionSystem; label: string; hint: string }> = [
  { value: "SUCKLER_CALF_TO_WEANING", label: "Sell them as weanlings", hint: "Suckler cows, calves sold at weaning" },
  { value: "SUCKLER_CALF_TO_BEEF", label: "Keep them to stores or beef", hint: "Suckler cows, calves kept on" },
  { value: "OTHER_DRYSTOCK", label: "No suckler cows", hint: "Drystock only, such as bought-in stores" },
];

export function CalfSystemQuestion({ value, onSaved, className }: {
  value: FarmGrazingProductionSystem | null;
  onSaved?: (v: FarmGrazingProductionSystem) => void;
  className?: string;
}) {
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState<FarmGrazingProductionSystem | null>(null);
  const [error, setError] = useState("");

  async function choose(v: FarmGrazingProductionSystem) {
    if (saving || v === current) return;
    setSaving(v); setError("");
    const r = await setFarmCalfSystemAction(v);
    setSaving(null);
    if (!r.ok) { setError(r.error); return; }
    setCurrent(v);
    onSaved?.(v);
  }

  return (
    <section aria-labelledby="fr-calf-system" className={cn("rounded-md border border-fr-border bg-fr-surface p-3", className)}>
      <h3 id="fr-calf-system" className="text-sm font-semibold text-fr-ink-900">What do you usually do with the calves?</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-fr-ink-600">
        This sets the Teagasc nitrogen table for your grazing fields. You can change it any time in Settings.
      </p>
      <div className="mt-2 grid gap-1.5" role="radiogroup" aria-labelledby="fr-calf-system">
        {OPTIONS.map((o) => {
          const on = current === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} disabled={saving !== null} onClick={() => void choose(o.value)}
              className={cn("flex min-h-11 items-center gap-3 rounded-fr-control border px-3 py-2 text-left disabled:opacity-60",
                on ? "border-fr-green-700 bg-fr-green-700/5" : "border-fr-border hover:border-fr-green-700")}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fr-ink-900">{o.label}</span>
                <span className="block text-xs text-fr-ink-500">{o.hint}</span>
              </span>
              {on ? <Check className="size-4 shrink-0 text-fr-green-700" aria-hidden /> : saving === o.value ? <span className="text-xs text-fr-ink-500">Saving…</span> : null}
            </button>
          );
        })}
      </div>
      {current === "OTHER_DRYSTOCK" ? (
        <p className="mt-2 text-xs leading-relaxed text-fr-ink-600">Farm Return doesn&apos;t have a grass nitrogen table for drystock-only farms yet, so grazing fields won&apos;t get a nitrogen figure.</p>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-xs text-fr-risk">{error}</p> : null}
    </section>
  );
}
