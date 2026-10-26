"use client";

/**
 * Living Animal Record — Record Weight as a measurement tool. The reading is the object: one large technical
 * numeral on a weighbridge-style scale that shows where the new reading sits against the last recorded weight,
 * coarse ±5 / fine ±1 steppers, "Now" by default with an explicit earlier day. It is the same entry as the C10
 * sheet underneath (`RecordWeightSheet`): the exact typed text is read by the shared parser (`parseNumericInput`,
 * F016 — "52,1" is 52.1, "-12" or "1e3" are refused), stepping is `stepNumericInput` (nothing rounded), the
 * previous weight line is `previousWeightLine` (invariant A). No method is asked for or claimed (D12): the copy
 * says how it is saved. The shared `Sheet` keeps the focus trap, Escape and focus restore.
 */

import { useEffect, useId, useRef, useState } from "react";
import { NUMERIC_FIELDS, numericInputValue, parseNumericInput, previousWeightLine, stepNumericInput, weightEntryStart, type LatestWeightVM } from "@/domain/cattle/presentation";
import { Sheet } from "@/components/ui/Sheet";
import type { RecordWeightCopy, RecordWeightValue } from "../RecordWeightSheet";
import styles from "./living-record.module.css";

const SCALE_HALF_KG = 40;

/** The weighbridge scale: ticks every 5 kg around the last weight (or the reading), the needle at the reading. */
function Scale({ reading, last }: { reading: number | null; last: number | null }) {
  const centre = last ?? reading;
  if (centre === null) return <div className="h-[52px]" aria-hidden />;
  const lo = centre - SCALE_HALF_KG;
  const pos = (kg: number) => Math.max(0, Math.min(1, (kg - lo) / (2 * SCALE_HALF_KG)));
  const ticks = Array.from({ length: (2 * SCALE_HALF_KG) / 5 + 1 }, (_, i) => lo + i * 5);
  return (
    <svg viewBox="0 0 400 52" className="h-[52px] w-full" aria-hidden preserveAspectRatio="none">
      <line x1="0" x2="400" y1="30" y2="30" stroke="#d8d0c0" strokeWidth="1" />
      {ticks.map((k, i) => (
        <line key={k} x1={pos(k) * 400} x2={pos(k) * 400} y1={i % 2 === 0 ? 18 : 23} y2="30" stroke="#5f685f" strokeOpacity={i % 2 === 0 ? 0.55 : 0.3} strokeWidth="1" />
      ))}
      {last !== null ? (
        <g>
          <line x1={pos(last) * 400} x2={pos(last) * 400} y1="12" y2="38" stroke="#7d5b42" strokeWidth="2" />
          <text x={pos(last) * 400} y="50" textAnchor="middle" fontSize="10" fontWeight="700" fill="#7d5b42" fontFamily="ui-monospace, Menlo, monospace" letterSpacing="1">
            LAST
          </text>
        </g>
      ) : null}
      {reading !== null ? (
        <g className={styles.needle} style={{ transform: `translateX(${pos(reading) * 400}px)` }}>
          <path d="M-6 2 L6 2 L0 12 Z" fill="#1f4b37" />
          <line x1="0" x2="0" y1="10" y2="34" stroke="#1f4b37" strokeWidth="3" strokeLinecap="round" />
        </g>
      ) : null}
    </svg>
  );
}

export function MeasureSheet({
  open,
  onClose,
  onSave,
  tag,
  previous,
  asOfDate,
  copy,
}: {
  open: boolean;
  onClose: () => void;
  /** Resolves to null when the weight was accepted, or a message when it was refused (the sheet stays open, the reading kept). */
  onSave: (v: RecordWeightValue) => Promise<string | null>;
  tag: string;
  previous: LatestWeightVM;
  asOfDate: string;
  copy: RecordWeightCopy;
}) {
  const start = weightEntryStart(previous);
  const [text, setText] = useState(start.initialText);
  const [when, setWhen] = useState<"TODAY" | "EARLIER">("TODAY");
  const [date, setDate] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  // One save at a time: a second press while the first is in flight does nothing (the server is idempotent too).
  const [saving, setSaving] = useState(false);
  const read = parseNumericInput(text, NUMERIC_FIELDS.WEIGHT_KG);
  const kg = numericInputValue(read);
  const dateValid = when === "TODAY" || (/^\d{4}-\d{2}-\d{2}$/.test(date) && date < asOfDate);
  const step = (d: string) => setText((t) => stepNumericInput(t, d, NUMERIC_FIELDS.WEIGHT_KG, start.stepFrom) ?? t);
  const line = previousWeightLine(previous);
  const titleId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) queueMicrotask(() => input.current?.select());
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={`Record weight · ${tag}`} labelledBy={titleId} placement="side" panelClassName={styles.sheet}>
      <form
        className="flex min-h-full flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (kg === null || !dateValid || saving) return;
          setSaving(true);
          setRefused(null);
          onSave({ kg, observedDate: when === "TODAY" ? null : date }).then(
            (r) => {
              setSaving(false);
              setRefused(r);
            },
            () => {
              setSaving(false);
              setRefused("The weight couldn’t be saved. Try again.");
            },
          );
        }}
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className={styles.kicker}>Measurement · {tag}</div>
            <h2 id={titleId} className="mt-1.5 text-[25px] font-bold tracking-[-0.035em] text-[#17221c]">
              Record weight
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-[24px] leading-none text-[#5f685f] hover:bg-[#f1ece1]">
            ×
          </button>
        </div>

        <div className="mt-8">
          <label htmlFor="living-weight-kg" className={styles.label}>
            {copy.label}
          </label>
          <div className={`${styles.readingWell} mt-2 flex items-baseline justify-center gap-2 pb-2`} data-invalid={read.state === "INVALID"}>
            <input
              id="living-weight-kg"
              ref={input}
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={read.state === "INVALID"}
              aria-describedby={read.state === "INVALID" ? "living-weight-error living-weight-hint" : "living-weight-hint"}
              className={styles.reading}
              size={6}
            />
            <span className="text-[15px] font-semibold text-[#5f685f]">kg</span>
          </div>
          <div className="mt-3">
            <Scale reading={kg} last={previous.state === "KNOWN" ? previous.kg : null} />
          </div>
          {read.state === "INVALID" ? (
            <p id="living-weight-error" className="mt-2 text-sm text-[#a2402b]" role="alert">
              {read.message}
            </p>
          ) : null}
          <p id="living-weight-hint" className="mt-2 text-[13px] leading-relaxed text-[#5f685f]">
            <span data-previous-weight={previous.state} className={line.tone === "conflict" ? "text-[#8f4c37]" : undefined}>
              {line.text}
            </span>
          </p>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2" role="group" aria-label="Adjust the reading">
          {[
            ["-5", "−5", "Minus 5 kilograms"],
            ["-1", "−1", "Minus 1 kilogram"],
            ["1", "+1", "Plus 1 kilogram"],
            ["5", "+5", "Plus 5 kilograms"],
          ].map(([d, label, aria]) => (
            <button key={d} type="button" onClick={() => step(d)} aria-label={aria} className={`${styles.stepBtn} ${styles.mono} min-h-12 rounded-full text-[16px] font-bold text-[#17221c]`}>
              {label}
            </button>
          ))}
        </div>

        <fieldset className="mt-8">
          <legend className={styles.label}>When</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["TODAY", "EARLIER"] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={when === w}
                onClick={() => setWhen(w)}
                className={`min-h-11 rounded-full border text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none ${when === w ? "border-[#1f4b37] bg-[#1f4b37] text-white" : "border-[#d8d0c0] text-[#17221c] hover:bg-[#f1ece1]"}`}
              >
                {w === "TODAY" ? "Now" : "An earlier day"}
              </button>
            ))}
          </div>
          {when === "EARLIER" ? (
            <div className="mt-4">
              <label htmlFor="living-weight-date" className="text-[12px] text-[#5f685f]">
                Date weighed
              </label>
              <input id="living-weight-date" type="date" max={asOfDate} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block h-12 w-full border-0 border-b border-[#d8d0c0] bg-transparent text-base outline-none focus:border-[#1f4b37]" />
              {copy.earlierNote ? <p className="mt-1.5 text-[13px] text-[#7d5b42]">{copy.earlierNote}</p> : null}
            </div>
          ) : null}
        </fieldset>

        <p className="mt-6 border-t border-[#d8d0c0] pt-4 text-[13px] leading-relaxed text-[#5f685f]">{copy.methodLine}</p>

        {refused ? (
          <p className="mt-4 text-sm text-[#a2402b]" role="alert">
            {refused}
          </p>
        ) : null}
        <div className="mt-auto pt-6">
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="min-h-12 rounded-[12px] px-4 text-[15px] font-semibold text-[#17221c] hover:bg-[#f1ece1]">
              Cancel
            </button>
            <button type="submit" disabled={kg === null || !dateValid || saving} aria-busy={saving} className="min-h-12 flex-1 rounded-[12px] bg-[#1f4b37] text-[15px] font-bold text-white transition-opacity disabled:opacity-40 motion-reduce:transition-none">
              {saving ? "Saving…" : "Save weight"}
            </button>
          </div>
          <p className="mt-3 text-[12px] text-[#5f685f]">{copy.footer}</p>
        </div>
      </form>
    </Sheet>
  );
}
