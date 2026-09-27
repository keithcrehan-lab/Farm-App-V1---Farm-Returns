/**
 * Fertiliser Overview and Stock Visuals campaign — dynamic SVG tank
 * illustration for the Fertiliser Plan landing page's Slurry Storage
 * section. Reproduces `docs/design/farm-return-fertiliser-overview-concept.png`'s
 * own visual language (a cylindrical tank with a real fill line and
 * capacity markings) with this app's own design tokens
 * (`src/app/globals.css`'s `--color-fr-*`) — never the concept image
 * itself, never a stock-icon/illustration library. Pure presentation: all
 * figures — including the bounded 0-1 display proportions the graphic
 * itself draws from (`computeSlurryTankDisplayProportions`) — are
 * pre-computed by `src/domain/slurry-storage.ts` and passed in as props;
 * this component performs no arithmetic of its own beyond multiplying an
 * already-bounded fraction by its own SVG pixel constants.
 *
 * Text equivalents accompany every part of the graphic (brief: "Include
 * text equivalents; never rely on colour alone") and no part of this
 * component animates beyond a plain CSS transition already suppressed for
 * `prefers-reduced-motion` (brief: "respect reduced-motion preferences").
 */
import { Warehouse } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatNonNegative } from "@/lib/format";
import { computeSlurryTankDisplayProportions, type SlurryTankView } from "@/domain/slurry-storage";

function formatRecordedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "long" });
}

/**
 * Codex audit HIGH (round 1), refined round 2: same reasoning and the
 * same real fix as `FertiliserStockColumnVisual.tsx`'s own identical
 * helper — `formatNonNegative` (`src/lib/format.ts`) never lets a
 * genuinely positive m³/percentage figure display as a false "0" at any
 * fixed precision, showing "< 0.01"/"< 0.1%" instead when the real value
 * would otherwise round away to nothing.
 */
function formatM3(value: number): string {
  return formatNonNegative(value, 2);
}
function formatPct(value: number): string {
  return formatNonNegative(value, 1);
}

const TANK_X = 14;
const TANK_Y = 8;
const TANK_WIDTH = 60;
const TANK_HEIGHT = 128;
const TANK_RADIUS = 10;

function TankGraphic({ tank }: { tank: SlurryTankView }) {
  // Codex audit HIGH (round 1): clamping/deriving the fill height and the
  // allocated split used to happen here, in the component — real
  // arithmetic outside `src/domain/`. `computeSlurryTankDisplayProportions`
  // (`src/domain/slurry-storage.ts`) now owns the real, bounded 0-1
  // proportions; this component only maps them to its own SVG pixel
  // constants below — presentation only, no domain arithmetic.
  const { fillFraction, allocatedFractionOfFill } = computeSlurryTankDisplayProportions(tank);
  const fillHeight = fillFraction * TANK_HEIGHT;
  const fillY = TANK_Y + TANK_HEIGHT - fillHeight;
  // Allocated portion drawn at the BOTTOM of the liquid (darker), so the
  // unallocated remainder sits visibly at the top of the fill, nearest
  // the surface — matches how a farmer would picture "what's spoken for"
  // vs "what's left to allocate".
  const allocatedHeight = fillHeight * allocatedFractionOfFill;
  const clipId = `slurry-tank-clip-${tank.housingId}`;

  return (
    <svg viewBox="0 0 88 150" className="h-36 w-auto shrink-0" role="img" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect x={TANK_X} y={TANK_Y} width={TANK_WIDTH} height={TANK_HEIGHT} rx={TANK_RADIUS} />
        </clipPath>
      </defs>
      {/* Tank outline */}
      <rect x={TANK_X} y={TANK_Y} width={TANK_WIDTH} height={TANK_HEIGHT} rx={TANK_RADIUS} className="fill-fr-surface-alt stroke-fr-border" strokeWidth={1.5} />
      {/* Capacity tick marks: 0 / 50 / 100% */}
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={TANK_X - 4} x2={TANK_X} y1={TANK_Y + TANK_HEIGHT * (1 - f)} y2={TANK_Y + TANK_HEIGHT * (1 - f)} className="stroke-fr-ink-400" strokeWidth={1} />
      ))}
      {/* Liquid fill, clipped to the tank's own rounded shape */}
      <g clipPath={`url(#${clipId})`}>
        {fillHeight > 0 ? (
          <>
            <rect x={TANK_X} y={fillY} width={TANK_WIDTH} height={fillHeight} className="fill-fr-info-bg motion-safe:transition-[height,y] motion-safe:duration-500" />
            {allocatedHeight > 0 ? (
              <rect x={TANK_X} y={TANK_Y + TANK_HEIGHT - allocatedHeight} width={TANK_WIDTH} height={allocatedHeight} className="fill-fr-info motion-safe:transition-[height] motion-safe:duration-500" />
            ) : null}
          </>
        ) : null}
        {/* Fill line */}
        {fillHeight > 0 ? <line x1={TANK_X} x2={TANK_X + TANK_WIDTH} y1={fillY} y2={fillY} className="stroke-fr-info" strokeWidth={1.5} /> : null}
      </g>
    </svg>
  );
}

export function SlurryTankCard({ tank }: { tank: SlurryTankView }) {
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <TankGraphic tank={tank} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-fr-ink-900">{tank.shedName}</p>
          <p className="text-lg font-bold text-fr-ink-900">{formatPct(tank.fillPct)}%</p>
        </div>
        <p className="text-sm text-fr-ink-600">
          {formatM3(tank.volumeM3)} m³ stored <span className="text-fr-ink-400">/ {formatM3(tank.capacityM3)} m³ capacity</span>
        </p>
        <p className="text-xs text-fr-ink-600">
          {formatM3(tank.allocatedM3)} m³ allocated · {formatM3(tank.unallocatedM3)} m³ unallocated
          {tank.allocationExceedsVolume ? <span className="ml-1 text-fr-attention">(allocation exceeds current stored volume — recheck the fill level)</span> : null}
        </p>
        <p className="text-xs text-fr-ink-400">
          {tank.status === "farmer_recorded" && tank.recordedAt
            ? `Farmer updated · ${formatRecordedAt(tank.recordedAt)}`
            : "Estimated — not yet confirmed by a farmer-recorded fill level"}
          {formatPct(tank.observedFillPct) !== formatPct(tank.fillPct) ? ` · last reading ${formatPct(tank.observedFillPct)}%, less slurry spread since` : null}
        </p>
      </div>
    </Card>
  );
}

export function SlurryStorageSection({
  tanks,
  totalCapacityM3,
  totalVolumeM3,
  farmFillPct,
  totalAllocatedM3,
  totalUnallocatedM3,
  onUpdateLevels,
}: {
  tanks: SlurryTankView[];
  totalCapacityM3: number;
  totalVolumeM3: number;
  farmFillPct: number;
  totalAllocatedM3: number;
  totalUnallocatedM3: number;
  onUpdateLevels: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-fr-ink-900">Slurry storage</h2>
        <button type="button" onClick={onUpdateLevels} className="rounded-full border border-fr-border px-3.5 py-1.5 text-xs font-semibold text-fr-ink-900">
          Update stock levels
        </button>
      </div>

      {tanks.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 border-dashed py-8 text-center">
          <Warehouse className="size-8 text-fr-ink-400" />
          <p className="text-sm font-medium text-fr-ink-900">No housing/tank recorded yet</p>
          <p className="max-w-xs text-sm text-fr-ink-600">Add a shed and its slurry storage capacity on the Housing screen to see it here.</p>
        </Card>
      ) : (
        <>
          {tanks.length > 1 ? (
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-fr-ink-900">Whole-farm storage</p>
                <p className="text-xs text-fr-ink-600">
                  {formatM3(totalVolumeM3)} m³ / {formatM3(totalCapacityM3)} m³ capacity — total volume ÷ total capacity across{" "}
                  {tanks.length} tanks, not an average of each tank&apos;s own percentage
                </p>
                <p className="text-xs text-fr-ink-600">
                  {formatM3(totalAllocatedM3)} m³ allocated · {formatM3(totalUnallocatedM3)} m³ unallocated
                </p>
              </div>
              <p className="text-xl font-bold text-fr-ink-900">{formatPct(farmFillPct)}%</p>
            </Card>
          ) : null}
          <div className="flex flex-col gap-3">
            {tanks.map((tank) => (
              <SlurryTankCard key={tank.housingId} tank={tank} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
