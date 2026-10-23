"use client";

/**
 * Cattle C10 — record a weight. Big numeric entry, coarse steppers (no tiny
 * precision controls), "today" by default with an explicit back-dated
 * option whose consequence is stated before saving (a weight dated before
 * the job was raised does not close it — the frozen C9 completion rule).
 *
 * The previous weight arrives as the explicit `LatestWeightVM` (invariant A):
 * its line comes from `previousWeightLine`, so a conflict or an unavailable
 * evaluation is never "no earlier weight". The entry keeps the canonical
 * decimal text (invariant B): it starts from the exact previous weight and
 * the steppers add exactly ±5 kg (`stepNumericInput`) — nothing is rounded. The typed text is kept
 * exactly as typed and read by the shared parser (F016): "52,1" is 52.1, "-12" or "1e3" are refused
 * with a message — never stripped into another number.
 */

import { useEffect, useRef, useState } from "react";
import { NUMERIC_FIELDS, numericInputValue, parseNumericInput, previousWeightLine, stepNumericInput, weightEntryStart, type LatestWeightVM } from "@/domain/cattle/presentation";
// The app's shared modal sheet (F018): focus trapped (Tab / Shift+Tab), Escape closes, focus restored — no cattle copy.
import { Sheet } from "@/components/ui/Sheet";

export interface RecordWeightValue {
  kg: number;
  observedDate: string | null;
}

export function RecordWeightSheet({
  open,
  onClose,
  onSave,
  tag,
  previous,
  asOfDate,
}: {
  open: boolean;
  onClose: () => void;
  /** Returns null when the weight was accepted, or a message when it was refused (the sheet stays open). */
  onSave: (v: RecordWeightValue) => string | null;
  tag: string;
  previous: LatestWeightVM;
  asOfDate: string;
}) {
  const start = weightEntryStart(previous);
  const [text, setText] = useState(start.initialText);
  const [when, setWhen] = useState<"TODAY" | "EARLIER">("TODAY");
  const [date, setDate] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const read = parseNumericInput(text, NUMERIC_FIELDS.WEIGHT_KG);
  const kg = numericInputValue(read);
  const dateValid = when === "TODAY" || (/^\d{4}-\d{2}-\d{2}$/.test(date) && date < asOfDate);
  const step = (d: string) => setText((t) => stepNumericInput(t, d, NUMERIC_FIELDS.WEIGHT_KG, start.stepFrom) ?? t);
  const line = previousWeightLine(previous);
  // The shared Sheet moves focus into its panel (a microtask queued in its own effect, which runs first as the
  // child); the scale reading is then focused, so the farmer types straight away — inside the trapped panel.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) queueMicrotask(() => input.current?.focus());
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={`Record weight · ${tag}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (kg !== null && dateValid) setRefused(onSave({ kg, observedDate: when === "TODAY" ? null : date }));
        }}
      >
        <label htmlFor="cattle-weight-kg" className="text-sm text-fr-v2-muted">
          Scale reading
        </label>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={() => step("-5")} className="min-h-14 min-w-14 rounded-[8px] border border-fr-v2-rule text-lg font-medium text-fr-v2-graphite" aria-label="Minus 5 kilograms">
            −5
          </button>
          <div className="relative flex-1">
            <input
              id="cattle-weight-kg"
              ref={input}
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={read.state === "INVALID"}
              className="h-16 w-full rounded-[8px] border-2 border-fr-v2-forest bg-white pr-12 text-center text-[34px] font-semibold tabular-nums text-fr-v2-graphite outline-none"
              aria-describedby={read.state === "INVALID" ? "cattle-weight-error cattle-weight-hint" : "cattle-weight-hint"}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base text-fr-v2-muted">kg</span>
          </div>
          <button type="button" onClick={() => step("5")} className="min-h-14 min-w-14 rounded-[8px] border border-fr-v2-rule text-lg font-medium text-fr-v2-graphite" aria-label="Plus 5 kilograms">
            +5
          </button>
        </div>
        {read.state === "INVALID" ? (
          <p id="cattle-weight-error" className="mt-1.5 text-sm text-[#b23a2b]" role="alert">
            {read.message}
          </p>
        ) : null}
        <p id="cattle-weight-hint" className="mt-1.5 text-sm text-fr-v2-muted">
          <span data-previous-weight={previous.state} className={line.tone === "conflict" ? "text-fr-v2-clay" : undefined}>
            {line.text}
          </span>{" "}
          Recorded as a scale weighing.
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

        {refused ? (
          <p className="mt-4 text-sm text-[#b23a2b]" role="alert">
            {refused}
          </p>
        ) : null}
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="min-h-12 rounded-[8px] px-4 text-base font-medium text-fr-v2-graphite">
            Cancel
          </button>
          <button type="submit" disabled={kg === null || !dateValid} className="min-h-12 flex-1 rounded-[8px] bg-fr-v2-forest text-base font-semibold text-white disabled:opacity-40">
            Save weight
          </button>
        </div>
        <p className="mt-3 text-[12px] text-fr-v2-muted">Demonstration: saved to this browser session only, then recalculated by the cattle engine.</p>
      </form>
    </Sheet>
  );
}
