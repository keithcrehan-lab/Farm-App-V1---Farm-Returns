"use client";

/**
 * Cattle C10 — record a weight. Big numeric entry, coarse steppers (no tiny
 * precision controls), "today" by default with an explicit back-dated
 * option whose consequence is stated before saving (a weight dated before
 * the job was raised does not close it — the frozen C9 completion rule).
 */

import { useState } from "react";
import { Sheet } from "./ui";

export interface RecordWeightValue {
  kg: number;
  observedDate: string | null;
}

export function RecordWeightSheet({
  open,
  onClose,
  onSave,
  tag,
  lastKg,
  asOfDate,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (v: RecordWeightValue) => void;
  tag: string;
  lastKg: number | null;
  asOfDate: string;
}) {
  const [text, setText] = useState(lastKg !== null ? String(Math.round(lastKg)) : "");
  const [when, setWhen] = useState<"TODAY" | "EARLIER">("TODAY");
  const [date, setDate] = useState("");
  const kg = Number(text);
  const kgValid = text.trim() !== "" && Number.isFinite(kg) && kg > 0 && kg <= 2000;
  const dateValid = when === "TODAY" || (/^\d{4}-\d{2}-\d{2}$/.test(date) && date < asOfDate);
  const step = (d: number) => setText((t) => String(Math.max(1, Math.round((Number(t) || lastKg || 0) + d))));

  return (
    <Sheet open={open} onClose={onClose} title={`Record weight · ${tag}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (kgValid && dateValid) onSave({ kg: Math.round(kg * 10) / 10, observedDate: when === "TODAY" ? null : date });
        }}
      >
        <label htmlFor="cattle-weight-kg" className="text-sm text-fr-v2-muted">
          Scale reading
        </label>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={() => step(-5)} className="min-h-14 min-w-14 rounded-[8px] border border-fr-v2-rule text-lg font-medium text-fr-v2-graphite" aria-label="Minus 5 kilograms">
            −5
          </button>
          <div className="relative flex-1">
            <input
              id="cattle-weight-kg"
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
              className="h-16 w-full rounded-[8px] border-2 border-fr-v2-forest bg-white pr-12 text-center text-[34px] font-semibold tabular-nums text-fr-v2-graphite outline-none"
              aria-describedby="cattle-weight-hint"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base text-fr-v2-muted">kg</span>
          </div>
          <button type="button" onClick={() => step(5)} className="min-h-14 min-w-14 rounded-[8px] border border-fr-v2-rule text-lg font-medium text-fr-v2-graphite" aria-label="Plus 5 kilograms">
            +5
          </button>
        </div>
        <p id="cattle-weight-hint" className="mt-1.5 text-sm text-fr-v2-muted">
          {lastKg !== null ? `Last recorded ${Math.round(lastKg)} kg.` : "No earlier weight recorded."} Recorded as a scale weighing.
        </p>

        <fieldset className="mt-5">
          <legend className="text-sm text-fr-v2-muted">When</legend>
          <div className="mt-1 flex gap-2">
            {(["TODAY", "EARLIER"] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={when === w}
                onClick={() => setWhen(w)}
                className={`min-h-11 flex-1 rounded-[8px] border text-sm font-medium ${when === w ? "border-fr-v2-forest bg-fr-v2-forest text-white" : "border-fr-v2-rule text-fr-v2-graphite"}`}
              >
                {w === "TODAY" ? "Now" : "An earlier day"}
              </button>
            ))}
          </div>
          {when === "EARLIER" ? (
            <div className="mt-3">
              <label htmlFor="cattle-weight-date" className="text-sm text-fr-v2-muted">
                Date weighed
              </label>
              <input id="cattle-weight-date" type="date" max={asOfDate} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-12 w-full rounded-[8px] border border-fr-v2-rule bg-white px-3 text-base" />
              <p className="mt-1.5 text-sm text-fr-v2-harvest-ink">A back-dated weight is added to the history but doesn&apos;t close today&apos;s &ldquo;Record weight&rdquo; job — only a weight taken now does.</p>
            </div>
          ) : null}
        </fieldset>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="min-h-12 rounded-[8px] px-4 text-base font-medium text-fr-v2-graphite">
            Cancel
          </button>
          <button type="submit" disabled={!kgValid || !dateValid} className="min-h-12 flex-1 rounded-[8px] bg-fr-v2-forest text-base font-semibold text-white disabled:opacity-40">
            Save weight
          </button>
        </div>
        <p className="mt-3 text-[12px] text-fr-v2-muted">Demonstration: saved to this browser session only, then recalculated by the cattle engine.</p>
      </form>
    </Sheet>
  );
}
