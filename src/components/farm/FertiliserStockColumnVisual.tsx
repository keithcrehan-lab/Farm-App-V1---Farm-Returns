/**
 * Fertiliser Overview and Stock Visuals campaign — dynamic SVG stock
 * column for the Fertiliser Plan landing page's Fertiliser Stock section.
 * Reproduces `docs/design/farm-return-fertiliser-overview-concept.png`'s
 * own vertical segmented-column visual language (solid = stock, hatched =
 * confirmed incoming, empty/outlined = shortfall) with this app's own
 * design tokens — never the concept image itself. Pure presentation: all
 * figures come from `src/domain/fertiliser-stock.ts`'s
 * `FertiliserStockBand`; this component performs no arithmetic of its own.
 *
 * A fourth, visually DISTINCT state — grey hatch, "Stock not recorded" —
 * exists specifically so "we don't know" is never rendered the same way
 * as "confirmed empty" (brief DATA INTEGRITY: "Unknown is not zero").
 * Every band also carries a text equivalent alongside the graphic (brief:
 * "Include text equivalents; never rely on colour alone").
 */
import { formatNonNegative } from "@/lib/format";
import type { FertiliserStockBand } from "@/domain/fertiliser-stock";

/**
 * Codex audit HIGH (round 1), refined round 2: every real kg/percentage
 * figure on this card previously displayed at a fixed 0dp — a genuine
 * small positive shortfall/surplus/stock figure (e.g. 0.4 kg) would show
 * as a flat "0", materially misrepresenting a real, if small, quantity as
 * none at all. Round 1's own fix (a bare 2dp/1dp `formatNumber`) only
 * moved that threshold rather than removing it (round 2's own real
 * finding: an even smaller real value, e.g. 0.004 kg, still displayed as
 * a false "0.00") — `formatNonNegative` (`src/lib/format.ts`) closes this
 * properly: any genuinely positive value that would still round to zero
 * at this precision shows "< 0.01"/"< 0.1%" instead, the same pattern
 * `FarmFertiliserPurchaseRequirementCard.tsx`'s own `formatRemainingTonnes`
 * already established. 2dp (kg) / 1dp (%) is still the deliberate choice
 * of precision itself — never a fabricated extra digit, and deliberately
 * NOT this repository's "20dp, never truncate" precedent (Checkpoint C
 * round 9), which exists for a farmer's own raw typed submission carried
 * through verbatim; every figure here is an already-computed physical
 * quantity, for which a hundredth of a kilogram is a genuinely reasonable
 * display floor once a real "< threshold" fallback exists underneath it.
 */
function formatKg(value: number): string {
  return formatNonNegative(value, 2);
}
function formatPct(value: number): string {
  return formatNonNegative(value, 1);
}

const COL_X = 18;
const COL_Y = 6;
const COL_WIDTH = 40;
const COL_HEIGHT = 130;

function BandPatterns({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-incoming`} width={6} height={6} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width={6} height={6} className="fill-fr-green-100" />
        <line x1={0} y1={0} x2={0} y2={6} className="stroke-fr-green-600" strokeWidth={2} />
      </pattern>
      <pattern id={`${id}-unrecorded`} width={6} height={6} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width={6} height={6} className="fill-fr-surface-alt" />
        <line x1={0} y1={0} x2={0} y2={6} className="stroke-fr-ink-400" strokeWidth={2} />
      </pattern>
    </defs>
  );
}

function StockColumnGraphic({ band }: { band: FertiliserStockBand }) {
  const id = `stock-col-${band.product.replace(/[^a-z0-9]/gi, "-")}`;

  if (band.status === "not_recorded") {
    return (
      <svg viewBox="0 0 76 144" className="h-32 w-auto shrink-0" role="img" aria-hidden="true">
        <BandPatterns id={id} />
        <rect x={COL_X} y={COL_Y} width={COL_WIDTH} height={COL_HEIGHT} rx={6} fill={`url(#${id}-unrecorded)`} className="stroke-fr-border" strokeWidth={1.5} />
      </svg>
    );
  }

  const stockHeight = (band.stockPct / 100) * COL_HEIGHT;
  const incomingHeight = (band.incomingPct / 100) * COL_HEIGHT;
  const stockY = COL_Y + COL_HEIGHT - stockHeight;
  const incomingY = stockY - incomingHeight;

  return (
    <svg viewBox="0 0 76 144" className="h-32 w-auto shrink-0" role="img" aria-hidden="true">
      <BandPatterns id={id} />
      {/* Empty/outline base — the shortfall band, drawn full-height underneath so the solid/hatched bands simply cover the portion they occupy. */}
      <rect x={COL_X} y={COL_Y} width={COL_WIDTH} height={COL_HEIGHT} rx={6} className="fill-fr-surface stroke-fr-border" strokeWidth={1.5} strokeDasharray="3 3" />
      {incomingHeight > 0 ? <rect x={COL_X} y={incomingY} width={COL_WIDTH} height={incomingHeight} fill={`url(#${id}-incoming)`} /> : null}
      {stockHeight > 0 ? <rect x={COL_X} y={stockY} width={COL_WIDTH} height={stockHeight} rx={stockY + stockHeight >= COL_Y + COL_HEIGHT - 1 ? 6 : 0} className="fill-fr-green-700" /> : null}
    </svg>
  );
}

export function FertiliserStockColumn({ band, onUpdateStock }: { band: FertiliserStockBand; onUpdateStock: (product: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-fr-control border border-fr-border p-3 text-center">
      <p className="text-sm font-semibold text-fr-ink-900">{band.product}</p>
      {band.npkAnalysis ? <p className="text-xs text-fr-ink-400">{band.npkAnalysis}</p> : null}
      <StockColumnGraphic band={band} />
      {!band.hasRemainingRequirement ? (
        <p className="text-xs font-medium text-fr-good">
          {band.status === "recorded" && band.surplusKg > 0
            ? `No remaining requirement — ${formatKg(band.surplusKg)} kg surplus stock`
            : "No remaining requirement"}
        </p>
      ) : band.status === "not_recorded" ? (
        <>
          <p className="text-xs font-medium text-fr-ink-600">Stock not recorded</p>
          <p className="text-xs text-fr-ink-400">{formatKg(band.remainingRequirementKg)} kg still required this season</p>
        </>
      ) : (
        <div className="flex w-full flex-col gap-0.5 text-xs">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-fr-ink-600">
              <span className="size-2 rounded-full bg-fr-green-700" aria-hidden="true" />
              Stock
            </span>
            <span className="font-semibold text-fr-ink-900">
              {formatKg(band.stockKg)} kg ({formatPct(band.stockPct)}%)
            </span>
          </span>
          {band.incomingPct > 0 ? (
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-fr-ink-600">
                <span className="size-2 rounded-full bg-fr-green-100" aria-hidden="true" />
                Confirmed incoming
              </span>
              <span className="font-semibold text-fr-ink-900">
                {formatKg(band.cappedIncomingKg)} kg ({formatPct(band.incomingPct)}%)
              </span>
            </span>
          ) : null}
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-fr-ink-600">
              <span className="size-2 rounded-full border border-fr-ink-400" aria-hidden="true" />
              Still to source
            </span>
            <span className="font-semibold text-fr-ink-900">
              {formatKg(band.shortfallKg)} kg ({formatPct(band.shortfallPct)}%)
            </span>
          </span>
          {band.surplusKg > 0 ? <span className="text-fr-good">{formatKg(band.surplusKg)} kg surplus above the remaining requirement</span> : null}
          <span className="mt-1 text-fr-ink-400">
            {formatKg(band.remainingRequirementKg)} kg remaining requirement · stock as of{" "}
            {new Date(band.stockAsOf).toLocaleDateString("en-IE", { day: "numeric", month: "short" })} ({band.stockSource})
          </span>
        </div>
      )}
      <button type="button" onClick={() => onUpdateStock(band.product)} className="mt-1 text-xs font-semibold text-fr-green-700">
        Update stock
      </button>
    </div>
  );
}
