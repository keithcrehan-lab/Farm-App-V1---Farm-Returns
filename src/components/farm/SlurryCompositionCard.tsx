"use client";

/**
 * Slurry Evidence & Composition V1 — the farmer-facing card this
 * campaign's brief asks for (§3/§4/§10): shows the effective slurry
 * composition Farm Return is actually using for this shed/tank's
 * nutrient calculations, its provenance, and a way to improve it.
 *
 * Deliberately does NOT show a fabricated "typical N/P/K per m³" figure
 * for the ESTIMATED (no real record) state — only dry matter %, the one
 * value `calculateNutrientPlan` actually uses for the national-average
 * fallback (`NATIONAL_AVG_SLURRY_DM_PCT`, `src/domain/nutrients.ts`).
 * Teagasc Table 9-8 (this app's only real cattle-slurry rule) has no
 * published "typical total N/P/K per m³" figure of its own to show — see
 * this campaign's own completion report for the full account of why. A
 * real measured/farmer-provided N/P/K, once recorded, IS shown (exactly
 * as entered) — but flagged as not yet feeding the calculation, never
 * implied otherwise (CLAUDE.md "never invent a production scientific
 * number", "must never masquerade as measured farm data" the other
 * direction too).
 */
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import { NATIONAL_AVG_SLURRY_DM_PCT } from "@/domain/nutrients";
import type { SlurryComposition } from "@/domain/slurry-composition";

export function SlurryCompositionCard({
  current,
  historyCount,
  onAddResult,
}: {
  /** The shed/tank's own current, effective composition record — absent
   * means no real result has ever been recorded (the "Estimated" state). */
  current: SlurryComposition | undefined;
  /** Real count of earlier results on file for this shed/tank, if any —
   * disclosed so a farmer can see there IS a history, without this card
   * building a full history browser (CLAUDE.md "report the limitation
   * rather than building an excessive history system in this increment"). */
  historyCount: number;
  onAddResult: () => void;
}) {
  const [showWhy, setShowWhy] = useState(false);

  const hasNutrients = current && (current.nPerM3 !== undefined || current.pPerM3 !== undefined || current.kPerM3 !== undefined);

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={FlaskConical} tone={current ? "good" : "neutral"} />
          <CardTitle>Slurry composition</CardTitle>
        </span>
        <StatusBadge status={current?.status ?? "estimated"} />
      </CardHeader>

      {!current ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fr-ink-700">
            Currently based on Farm Return&apos;s Teagasc-backed standard assumption for cattle slurry — no analysis
            has been recorded for this shed/tank yet.
          </p>
          <div>
            <p className="text-xs text-fr-ink-600">Dry matter (DM)</p>
            <p className="text-lg font-bold text-fr-ink-900">
              {formatNumber(NATIONAL_AVG_SLURRY_DM_PCT, 1)}
              <span className="text-sm font-normal text-fr-ink-400">%</span>
            </p>
          </div>
          <p className="text-xs text-fr-ink-400">
            Because your slurry hasn&apos;t been analysed, its actual nutrient content may differ from this
            assumption. This dry matter % is what Farm Return uses to work out how much nutrient value your slurry
            offers when spread.
          </p>

          <button type="button" onClick={() => setShowWhy((v) => !v)} className="self-start text-xs font-semibold text-fr-green-700">
            {showWhy ? "Hide" : "Why does this matter?"}
          </button>
          {showWhy ? (
            <p className="rounded-fr-control bg-fr-surface-alt p-2.5 text-xs text-fr-ink-700">
              Slurry nutrient content varies farm to farm — it depends on dilution (rainwater, washings), your
              stock&apos;s diet, and how long and how it was stored. A wetter (lower dry matter) slurry carries less
              nutrient value per m³ than a thicker one. Recording your own estimate, or a laboratory analysis, lets
              Farm Return use your shed/tank&apos;s real figure instead of the national average — you can still get a
              nutrient plan without doing this.
            </p>
          ) : null}

          <button type="button" onClick={onAddResult} className="self-start rounded-full border border-fr-green-700 px-3.5 py-1.5 text-xs font-semibold text-fr-green-700">
            Add slurry result
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-fr-ink-600">Dry matter (DM) — used in your nutrient plan</p>
            <p className="text-lg font-bold text-fr-ink-900">
              {formatNumber(current.dmPct, 1)}
              <span className="text-sm font-normal text-fr-ink-400">%</span>
            </p>
          </div>

          {hasNutrients ? (
            <div>
              <div className="flex gap-5">
                {([
                  ["N", current.nPerM3],
                  ["P", current.pPerM3],
                  ["K", current.kPerM3],
                ] as const).map(([label, value]) =>
                  value !== undefined ? (
                    <div key={label}>
                      <p className="text-xs font-bold text-fr-ink-600">{label}</p>
                      <p className="text-base font-bold text-fr-ink-900">{formatNumber(value, 2)}</p>
                      <p className="text-xs text-fr-ink-400">kg/m³</p>
                    </div>
                  ) : null,
                )}
              </div>
              <p className="mt-1 text-xs text-fr-ink-400">
                Recorded for your records — not yet used in Farm Return&apos;s nutrient calculations (only dry matter
                % is, today).
              </p>
            </div>
          ) : null}

          <div className="text-xs text-fr-ink-600">
            <p>
              {current.status === "verified" ? "Laboratory result" : "Farmer estimate"} · sample/result date{" "}
              {current.sampleDate}
            </p>
            <p>
              Source: {current.source}
              {current.laboratory ? ` · ${current.laboratory}` : ""}
              {current.sampleRef ? ` · Ref ${current.sampleRef}` : ""}
            </p>
            {current.note ? <p>{current.note}</p> : null}
            {historyCount > 0 ? <p className="mt-1 text-fr-ink-400">{historyCount} earlier result{historyCount === 1 ? "" : "s"} on file.</p> : null}
          </div>

          <button type="button" onClick={onAddResult} className="self-start rounded-full border border-fr-green-700 px-3.5 py-1.5 text-xs font-semibold text-fr-green-700">
            Add new result
          </button>
        </div>
      )}
    </Card>
  );
}
