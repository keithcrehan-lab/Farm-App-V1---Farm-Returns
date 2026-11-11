"use client";

/**
 * Fertiliser Overview and Stock Visuals campaign — the farm-wide
 * Fertiliser Plan landing page (`docs/farm-return-next/DOMAIN_CONTRACTS.md`'s
 * own dated entry for this campaign has the full account). Composed
 * entirely from real, already-audited data
 * (`getFertiliserPlanOverviewAction`, `src/app/actions/fertiliser-plan-overview.ts`)
 * and this campaign's own new pure visual components — no calculation of
 * any kind happens in this file (CLAUDE.md's own never-rule).
 *
 * Field-specific setup now lives in the field workspace; this page remains the
 * field-scoped plan with its full scientific-engine detail (soil, NAP
 * compliance, organic offset, "Plan this application", remaining
 * requirement) — this screen only ever links to it
 * canonical whole-farm aggregation/procurement view and deep-links back to each field. The quote
 * workflow (`RequestQuoteSheet`, `/quotes`) is reused exactly as
 * `input-planner/page.tsx` already does it.
 *
 * Farm Spatial V2 Phase 5 (`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md`
 * §15): the whole-farm nutrient plan — outstanding requirement, field rows,
 * purchase/application plan and the Plan/Market handoffs — rendered from the
 * canonical aggregation and basket by `WholeFarmNutrientPlan`.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  FlaskConical,
  MapPinned,
  ShoppingCart,
  X,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { RequestQuoteSheet } from "@/components/farm/RequestQuoteSheet";
import { Sheet } from "@/components/ui/Sheet";
import { SlurryStorageSection } from "@/components/farm/SlurryTankVisual";
import { FertiliserStockColumn } from "@/components/farm/FertiliserStockColumnVisual";
import { AddFertiliserStockRecordSheet } from "@/components/farm/AddFertiliserStockRecordSheet";
import { SlurryFirstPlanningPanel } from "@/components/farm/SlurryFirstPlanningPanel";
import { SoilPhAdviceList } from "@/components/farm/SoilPhAdviceList";
import {
  getFertiliserPlanOverviewAction,
  type FertiliserPlanOverview,
} from "@/app/actions/fertiliser-plan-overview";
import {
  autoAssessFarmLegalSpatialEvidenceAction,
  confirmUnresolvedFarmCommonageStatusAction,
} from "@/app/actions/farm";
import { useIsRealMode } from "@/store/farm-store";
import { formatHa, formatNonNegative } from "@/lib/format";
import { legalSpatialAutoStatusMessage } from "@/lib/legal-spatial-auto-status";
import {
  FertiliserPurchasePlan,
  Kicker,
  MarketHandoffPlane,
  OutstandingQuantityComposition,
  PlanHandoffPlane,
  WholeFarmFieldRows,
} from "@/components/farm-spatial/WholeFarmNutrientPlan";
import {
  marketHandoffView,
  outstandingQuantityView,
  planHandoffView,
  stillToBuyLines,
  wholeFarmFieldRows,
} from "@/lib/whole-farm-nutrient-plan-presentation";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; overview: FertiliserPlanOverview }
  | { status: "error" };

export function FertiliserPlanOverviewClient() {
  const isRealMode = useIsRealMode();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [quoteSheetOpen, setQuoteSheetOpen] = useState(false);
  const [stockSheetProduct, setStockSheetProduct] = useState<
    string | undefined
  >(undefined);
  const [stockSheetOpen, setStockSheetOpen] = useState(false);
  const [calculationAuditOpen, setCalculationAuditOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [spatialAutoStatus, setSpatialAutoStatus] = useState<string | null>(
    null,
  );
  const currentSeason = String(new Date().getUTCFullYear());
  const nextSeason = String(new Date().getUTCFullYear() + 1);
  const [planningSeason, setPlanningSeason] = useState(currentSeason);
  const spatialAutoAttempted = useRef(false);

  // Bumped by `refresh()` to force a genuine refetch (e.g. after saving a
  // stock record) — same pattern `NutrientsPageClient`'s own
  // `planRefreshToken` already establishes, rather than calling `setLoad`
  // directly from inside the effect body.
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a real isRealMode/refresh-token change, not every render.
    setLoad({ status: "loading" });
    if (!isRealMode) return;
    let cancelled = false;
    getFertiliserPlanOverviewAction(planningSeason).then(
      (overview) => {
        if (!cancelled) setLoad({ status: "ready", overview });
      },
      (error: unknown) => {
        console.error(
          "[FertiliserPlanOverviewClient] getFertiliserPlanOverviewAction failed:",
          error,
        );
        if (!cancelled) setLoad({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isRealMode, refreshToken, planningSeason]);

  useEffect(() => {
    if (load.status !== "ready" || spatialAutoAttempted.current) return;
    const needsSpatial = load.overview.quoteReadiness.items.some(
      (item) =>
        !item.complete &&
        (item.label === "Commonage status" ||
          item.label === "Nearest watercourse / buffer distance"),
    );
    if (!needsSpatial) return;
    spatialAutoAttempted.current = true;
    void autoAssessFarmLegalSpatialEvidenceAction()
      .then((result) => {
        setSpatialAutoStatus(legalSpatialAutoStatusMessage(result));
        if (result.updated > 0) refresh();
      })
      .catch(() =>
        setSpatialAutoStatus(
          "Automatic public-data checks could not complete right now.",
        ),
      );
  }, [load, refresh]);

  return (
    <>
      {!isRealMode ? (
        <Card className="flex flex-col items-center gap-2 border-dashed py-10 text-center">
          <FlaskConical className="size-8 text-fr-ink-400" />
          <p className="text-sm font-medium text-fr-ink-900">
            Sign in to see your farm-wide fertiliser plan
          </p>
          <p className="max-w-xs text-sm text-fr-ink-600">
            This overview reads your real, signed-in farm data — nothing is
            fabricated for a sample farm.
          </p>
        </Card>
      ) : load.status === "loading" ? (
        <p className="py-8 text-center text-sm text-fr-ink-600">
          Loading your farm-wide fertiliser plan…
        </p>
      ) : load.status === "error" ? (
        <Card>
          <p className="text-sm text-fr-ink-600">
            Farm Return couldn&apos;t load your farm-wide fertiliser plan right
            now — try again shortly.
          </p>
          <button
            type="button"
            onClick={refresh}
            className="mt-3 rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900"
          >
            Retry
          </button>
        </Card>
      ) : (
        <OverviewContent
          overview={load.overview}
          onOpenQuoteSheet={() => setQuoteSheetOpen(true)}
          onOpenReadiness={() => setReadinessOpen(true)}
          planningSeason={planningSeason}
          currentSeason={currentSeason}
          nextSeason={nextSeason}
          onPlanningSeasonChange={setPlanningSeason}
          onOpenCalculationAudit={() => setCalculationAuditOpen(true)}
          onOpenStockSheet={(product) => {
            setStockSheetProduct(product);
            setStockSheetOpen(true);
          }}
          onSlurryForecastAdoptionChange={refresh}
        />
      )}

      <RequestQuoteSheet
        open={quoteSheetOpen}
        onClose={() => setQuoteSheetOpen(false)}
        onSubmitted={() => setQuoteSheetOpen(false)}
        planningSeason={planningSeason}
      />

      {load.status === "ready" ? (
        <QuoteReadinessSheet
          open={readinessOpen}
          onClose={() => setReadinessOpen(false)}
          readiness={load.overview.quoteReadiness}
          farmerName={load.overview.ownerName}
          spatialAutoStatus={spatialAutoStatus}
          onConfirmedCommonage={() => {
            spatialAutoAttempted.current = true;
            refresh();
          }}
        />
      ) : null}

      {load.status === "ready" ? (
        <CalculationAuditChooser
          open={calculationAuditOpen}
          onClose={() => setCalculationAuditOpen(false)}
          fields={load.overview.fieldBreakdown}
          planningSeason={load.overview.planningSeason}
        />
      ) : null}

      {load.status === "ready" ? (
        <AddFertiliserStockRecordSheet
          open={stockSheetOpen}
          onClose={() => setStockSheetOpen(false)}
          onSaved={() => {
            setStockSheetOpen(false);
            refresh();
          }}
          products={[...load.overview.demand.map((d) => d.product), "Lime"]}
          defaultProduct={stockSheetProduct}
          defaultSource={`${load.overview.ownerName} — Farmer entered`}
        />
      ) : null}
    </>
  );
}

/** Numbered editorial step marker — the page reads in causal order. */
function StepKicker({
  step,
  id,
  children,
}: {
  step: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <Kicker className="flex items-baseline gap-3">
      <span className="font-mono font-medium tracking-normal text-fr-v2-gold">
        {step}
      </span>
      <span id={id}>{children}</span>
    </Kicker>
  );
}

function DisclosureToggle() {
  return (
    <>
      <span className="shrink-0 text-sm font-semibold text-fr-v2-forest group-open:hidden">
        Open
      </span>
      <span className="hidden shrink-0 text-sm font-semibold text-fr-v2-forest group-open:inline">
        Close
      </span>
    </>
  );
}

const NUTRIENT_NAMES = { n: "Nitrogen", p: "Phosphorus", k: "Potassium" };

function OverviewContent({
  overview,
  onOpenQuoteSheet,
  onOpenReadiness,
  planningSeason,
  currentSeason,
  nextSeason,
  onPlanningSeasonChange,
  onOpenCalculationAudit,
  onOpenStockSheet,
  onSlurryForecastAdoptionChange,
}: {
  overview: FertiliserPlanOverview;
  onOpenQuoteSheet: () => void;
  onOpenReadiness: () => void;
  planningSeason: string;
  currentSeason: string;
  nextSeason: string;
  onPlanningSeasonChange: (season: string) => void;
  onOpenCalculationAudit: () => void;
  onOpenStockSheet: (product?: string) => void;
  onSlurryForecastAdoptionChange: () => void;
}) {
  const router = useRouter();
  const allStockColumns =
    overview.limeStockBand.hasRemainingRequirement ||
    overview.limeStockBand.status === "recorded"
      ? [...overview.stockColumns, overview.limeStockBand]
      : overview.stockColumns;
  // Farm Spatial V2 Phase 5: presentation selection of the canonical
  // aggregation and basket — no quantity is derived here.
  const outstanding = outstandingQuantityView(overview.aggregation);
  const purchaseProducts = outstanding.primary
    ? [outstanding.primary, ...outstanding.supporting]
    : [];
  const fieldRows = wholeFarmFieldRows(
    overview.fieldBreakdown,
    overview.aggregation,
  );

  const missingItems = overview.quoteReadiness.items.filter(
    (item) => !item.complete,
  );
  const missingFieldCount = new Set(
    missingItems
      .filter((item) => item.fieldId !== "__farm__")
      .map((item) => item.fieldId),
  ).size;
  const unresolvedFieldCount = overview.aggregation.counts.unresolved;
  const effectiveRemainingCount = Math.max(
    overview.quoteReadiness.remainingCount,
    unresolvedFieldCount,
  );
  const readinessComplete =
    overview.quoteReadiness.ready && unresolvedFieldCount === 0;
  const effectiveReadinessPercentage = readinessComplete
    ? 100
    : Math.min(99, overview.quoteReadiness.percentage);
  const readinessLabel = readinessComplete
    ? "Ready to request a quote"
    : effectiveRemainingCount === 1
      ? "1 item to resolve before quoting"
      : `${effectiveRemainingCount} items to resolve before quoting`;
  const resolvedWithoutPurchaseCount =
    overview.aggregation.counts.noPurchase +
    overview.aggregation.counts.prohibited +
    overview.aggregation.counts.notApplicable;
  const requiringPurchaseCount = overview.aggregation.counts.included;

  const seasonOptions = [
    { season: currentSeason, label: `This season · ${currentSeason}` },
    { season: nextSeason, label: `Next season · ${nextSeason}` },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-12 pb-14">
      {/* Identity, season basis and compact readiness — always visible. */}
      <header className="flex flex-col gap-5 border-b border-fr-v2-rule pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Kicker>Fertiliser · {overview.seasonLabel}</Kicker>
          <h1 className="mt-2 max-w-[18ch] font-display text-[42px] leading-[0.98] tracking-[-0.025em] text-fr-v2-graphite lg:text-[58px]">
            Whole-farm fertiliser plan
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-fr-v2-muted">
            What the farm needs agronomically first; what to buy follows from
            it.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 lg:items-end">
          <div
            role="group"
            aria-label="Quote planning season"
            className="flex items-center gap-5 border-b border-fr-v2-rule"
          >
            {seasonOptions.map(({ season, label }) => {
              const active = planningSeason === season;
              return (
                <button
                  key={season}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPlanningSeasonChange(season)}
                  className={`-mb-px min-h-11 border-b-2 text-xs font-semibold transition-colors ${active ? "border-fr-v2-gold text-fr-v2-graphite" : "border-transparent text-fr-v2-muted hover:text-fr-v2-graphite"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onOpenReadiness}
            aria-label={`Quote readiness ${effectiveReadinessPercentage}%`}
            className="inline-flex min-h-11 items-center gap-2 font-mono text-xs text-fr-v2-graphite hover:underline lg:min-h-0"
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${readinessComplete ? "bg-fr-v2-forest" : "bg-fr-v2-harvest"}`}
            />
            {effectiveReadinessPercentage}% ready
          </button>
        </div>
      </header>

      {/* 01 — Farm nutrient requirement: the agronomic answer dominates. */}
      <section
        aria-labelledby="requirement-heading"
        className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]"
      >
        <div>
          <StepKicker step="01" id="requirement-heading">
            Farm nutrient requirement
          </StepKicker>
          <dl
            data-testid="nutrient-requirement"
            className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-5"
          >
            {(["n", "p", "k"] as const).map((nutrient) => (
              <div key={nutrient}>
                <dt className="font-display text-lg text-fr-v2-muted">
                  <abbr
                    title={NUTRIENT_NAMES[nutrient]}
                    className="no-underline"
                  >
                    {nutrient.toUpperCase()}
                  </abbr>
                </dt>
                <dd className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-mono text-[44px] leading-none font-medium tracking-[-0.04em] tabular-nums text-fr-v2-graphite lg:text-[64px]">
                    {formatNonNegative(
                      overview.nutrientRequirementKg[nutrient],
                      2,
                    )}
                  </span>
                  <span className="font-mono text-sm text-fr-v2-muted">kg</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-fr-v2-muted">
            Agronomic N, P and K requirement for the {overview.seasonLabel}{" "}
            season across {overview.nutrientRequirementKg.fieldsIncluded}{" "}
            calculated field
            {overview.nutrientRequirementKg.fieldsIncluded === 1 ? "" : "s"},
            before slurry and fertiliser already applied are credited.
          </p>
          {overview.planningBasis === "NEXT_SEASON" ? (
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-fr-v2-muted">
              <strong className="font-semibold text-fr-v2-graphite">
                {overview.planningSeason} quote basis:
              </strong>{" "}
              current-season chemical fertiliser and slurry applications are not
              deducted. {overview.planningAssumption}
            </p>
          ) : null}

          {!readinessComplete ? (
            <div className="mt-6 flex max-w-xl flex-col gap-1 border-l-2 border-fr-v2-harvest pl-4 text-sm">
              <p className="font-semibold text-fr-v2-harvest-ink">
                {readinessLabel}
              </p>
              <p className="text-xs leading-relaxed text-fr-v2-muted">
                {missingFieldCount > 0
                  ? `${missingFieldCount} field${missingFieldCount === 1 ? "" : "s"} still need information.`
                  : "Farm-level evidence still needs review."}{" "}
                Resolve only the missing evidence; Farm Return keeps the
                existing field data.
              </p>
              <button
                type="button"
                onClick={onOpenReadiness}
                className="mt-1 inline-flex min-h-11 items-center self-start text-sm font-semibold text-fr-v2-forest underline-offset-2 hover:underline"
              >
                Resolve missing inputs →
              </button>
            </div>
          ) : null}

          <nav
            aria-label="Plan evidence"
            className="mt-6 flex flex-wrap items-center gap-x-5 text-xs font-semibold text-fr-v2-muted"
          >
            <button
              type="button"
              onClick={onOpenCalculationAudit}
              className="min-h-11 underline-offset-2 hover:text-fr-v2-graphite hover:underline"
            >
              Show calculations
            </button>
            <Link
              href="/reports"
              className="inline-flex min-h-11 items-center underline-offset-2 hover:text-fr-v2-graphite hover:underline"
            >
              Scientific evidence
            </Link>
            <Link
              href="/quotes"
              className="inline-flex min-h-11 items-center underline-offset-2 hover:text-fr-v2-graphite hover:underline"
            >
              Quote requests
            </Link>
          </nav>
        </div>

        <div className="border-t border-fr-v2-rule pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <Kicker>Field accounting</Kicker>
          <dl className="mt-3 flex flex-col text-sm">
            <div className="flex items-baseline justify-between gap-4 border-b border-fr-v2-rule py-2">
              <dt className="text-fr-v2-muted">Fields calculated</dt>
              <dd className="font-mono tabular-nums text-fr-v2-graphite">
                {overview.fieldsIncluded} of {overview.fieldsTotal}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-fr-v2-rule py-2">
              <dt className="text-fr-v2-muted">Area calculated</dt>
              <dd className="font-mono tabular-nums text-fr-v2-graphite">
                {formatHa(overview.totalAreaHaIncluded)} of{" "}
                {formatHa(overview.totalAreaHaTotal)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-fr-v2-rule py-2">
              <dt className="text-fr-v2-muted">Fields requiring purchase</dt>
              <dd className="font-mono tabular-nums text-fr-v2-graphite">
                {requiringPurchaseCount}
              </dd>
            </div>
          </dl>
          {unresolvedFieldCount > 0 || resolvedWithoutPurchaseCount > 0 ? (
            <div className="mt-3 text-xs leading-relaxed">
              {unresolvedFieldCount > 0 ? (
                <p className="text-fr-v2-harvest-ink">
                  {unresolvedFieldCount} field
                  {unresolvedFieldCount === 1 ? "" : "s"} still{" "}
                  {unresolvedFieldCount === 1 ? "needs" : "need"} information
                  before the whole-farm requirement is complete.
                </p>
              ) : null}
              {resolvedWithoutPurchaseCount > 0 ? (
                <p className="mt-1 text-fr-v2-muted">
                  {resolvedWithoutPurchaseCount} field
                  {resolvedWithoutPurchaseCount === 1 ? "" : "s"}{" "}
                  {resolvedWithoutPurchaseCount === 1 ? "is" : "are"} resolved
                  without contributing a fertiliser purchase requirement.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-col">
        {/* 02 — Field evidence: collapsed when resolved, open when not. */}
        <details
          className="group border-y border-fr-v2-rule"
          open={unresolvedFieldCount > 0}
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4">
            <div>
              <StepKicker step="02">Field evidence</StepKicker>
              <p className="mt-1 font-display text-xl text-fr-v2-graphite">
                {unresolvedFieldCount > 0
                  ? `${unresolvedFieldCount} field${unresolvedFieldCount === 1 ? " needs" : "s need"} attention`
                  : "Field requirement detail"}
              </p>
              <p className="mt-1 text-xs text-fr-v2-muted">
                {unresolvedFieldCount > 0
                  ? "Open fields with unresolved evidence before relying on the whole-farm total."
                  : `${overview.fieldsTotal} mapped fields · each resolved; open for per-field requirement and purchase contribution.`}
              </p>
            </div>
            <DisclosureToggle />
          </summary>
          <div className="pb-6">
            {fieldRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 border-y border-dashed border-fr-v2-rule py-8 text-center">
                <MapPinned className="size-8 text-fr-ink-400" />
                <p className="text-sm font-medium text-fr-ink-900">
                  No fields yet
                </p>
              </div>
            ) : (
              <WholeFarmFieldRows rows={fieldRows} />
            )}
          </div>
        </details>

        {/* 03 — Organic allocation precedes any purchase. */}
        <details className="group border-b border-fr-v2-rule">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4">
            <div>
              <StepKicker step="03">Organic allocation</StepKicker>
              <p className="mt-1 font-display text-xl text-fr-v2-graphite">
                Slurry allocation &amp; storage
              </p>
              <p
                data-testid="slurry-summary"
                className="mt-1 font-mono text-xs text-fr-v2-muted"
              >
                {overview.slurry.tanks.length > 0
                  ? `${overview.slurry.tanks.length} store${overview.slurry.tanks.length === 1 ? "" : "s"} · ${overview.slurry.farmFillPct.toFixed(0)}% farm fill · ${overview.slurry.totalUnallocatedM3.toFixed(0)} m³ unallocated`
                  : "No housing/tank recorded yet"}
              </p>
            </div>
            <DisclosureToggle />
          </summary>
          <div className="space-y-6 pb-7">
            <SlurryFirstPlanningPanel
              // Remount per season so no proposal dated in one season is
              // carried into another.
              key={overview.planningSeason}
              planningSeason={overview.planningSeason}
              onAdoptionChange={onSlurryForecastAdoptionChange}
              fields={overview.fieldBreakdown.map((field) => ({
                fieldId: field.fieldId,
                fieldName: field.fieldName,
              }))}
              stores={overview.slurry.tanks.map((tank) => ({
                housingId: tank.housingId,
                shedName: tank.shedName,
                capacityM3: tank.capacityM3,
              }))}
              currentUnallocatedM3={overview.slurry.totalUnallocatedM3}
            />
            <SlurryStorageSection
              tanks={overview.slurry.tanks}
              totalCapacityM3={overview.slurry.totalCapacityM3}
              totalVolumeM3={overview.slurry.totalVolumeM3}
              farmFillPct={overview.slurry.farmFillPct}
              totalAllocatedM3={overview.slurry.totalAllocatedM3}
              totalUnallocatedM3={overview.slurry.totalUnallocatedM3}
              onUpdateLevels={() => router.push("/housing")}
            />
          </div>
        </details>
      </div>

      {/* 04 — Remaining chemical requirement, after organic allocation. */}
      <OutstandingQuantityComposition
        step="04"
        view={outstanding}
        supporting={
          <>
            <Kicker>Basis</Kicker>
            {/* The purchase field count is already in Field accounting (01). */}
            <p className="text-sm leading-relaxed text-fr-v2-graphite">
              Chemical product still needed once each field&apos;s planned
              organic nutrients are credited.
            </p>
          </>
        }
      />

      {purchaseProducts.length > 0 ? (
        <>
          {/* 05 — Purchase requirement. */}
          <section
            aria-labelledby="purchase-heading"
            className="flex flex-col gap-4"
          >
            <div>
              <StepKicker step="05" id="purchase-heading">
                Purchase requirement
              </StepKicker>
              <p className="mt-1 font-display text-2xl text-fr-v2-graphite">
                What the farm needs to source
              </p>
            </div>
            <FertiliserPurchasePlan
              products={purchaseProducts}
              stillToBuy={stillToBuyLines(overview.stockColumns)}
            />
          </section>

          {/* 06 — Supplier action: Plan, then Market. */}
          <section aria-label="Supplier action" className="flex flex-col gap-4">
            <StepKicker step="06">Supplier action</StepKicker>
            <div className="grid grid-cols-1 border-t border-fr-v2-graphite lg:grid-cols-2">
              <PlanHandoffPlane view={planHandoffView(overview.aggregation)} />
              <MarketHandoffPlane
                view={marketHandoffView(overview.basket)}
                basket={overview.basket}
                onPrepareQuote={onOpenQuoteSheet}
              />
            </div>
          </section>
        </>
      ) : null}

      {/* Deep detail — stock only adjusts what to buy, never the requirement. */}
      <details className="group border-y border-fr-v2-rule">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4">
          <div>
            <Kicker>On-farm stock</Kicker>
            <p className="mt-1 font-display text-xl text-fr-v2-graphite">
              Fertiliser &amp; lime stock
            </p>
            <p className="mt-1 text-xs text-fr-v2-muted">
              {allStockColumns.length === 0
                ? "Nothing currently needs a stock check"
                : `${allStockColumns.length} product${allStockColumns.length === 1 ? "" : "s"} tracked against the remaining requirement`}
            </p>
          </div>
          <DisclosureToggle />
        </summary>
        <div className="pb-7">
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => onOpenStockSheet()}
              className="min-h-11 text-xs font-semibold text-fr-v2-forest underline-offset-2 hover:underline"
            >
              Update stock / levels
            </button>
          </div>
          {allStockColumns.length === 0 ? (
            <div className="flex flex-col items-center gap-2 border-y border-dashed border-fr-v2-rule py-8 text-center">
              <ShoppingCart className="size-8 text-fr-ink-400" />
              <p className="text-sm font-medium text-fr-ink-900">
                Nothing left to buy right now
              </p>
              <p className="max-w-xs text-sm text-fr-ink-600">
                Every currently recommended product is already fully planned or
                applied this season.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {allStockColumns.map((band) => (
                <FertiliserStockColumn
                  key={band.product}
                  band={band}
                  onUpdateStock={(product) => onOpenStockSheet(product)}
                />
              ))}
            </div>
          )}
          {overview.lime.fieldsWithoutLimeEvidence > 0 ? (
            <p className="mt-3 text-xs text-fr-attention">
              {overview.lime.fieldsWithoutLimeEvidence} field
              {overview.lime.fieldsWithoutLimeEvidence === 1 ? "" : "s"}{" "}
              {overview.lime.fieldsWithoutLimeEvidence === 1 ? "has" : "have"}{" "}
              no real laboratory lime figure on file — lime figures above are
              real but partial.
            </p>
          ) : null}
          <SoilPhAdviceList lime={overview.lime} className="mt-3" />
        </div>
      </details>
    </div>
  );
}

function CalculationAuditChooser({
  open,
  onClose,
  fields,
  planningSeason,
}: {
  open: boolean;
  onClose: () => void;
  fields: FertiliserPlanOverview["fieldBreakdown"];
  planningSeason: string;
}) {
  if (!open) return null;
  const seasonParam = `season=${encodeURIComponent(planningSeason)}`;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Fertiliser calculation audit"
    >
      <div className="max-h-[82vh] w-full max-w-xl overflow-hidden rounded-t-2xl bg-fr-v2-cream shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-fr-v2-rule px-5 py-4">
          <div>
            <p className="font-display text-xl text-fr-v2-graphite">
              Fertiliser calculations
            </p>
            <p className="mt-1 text-sm text-fr-v2-muted">
              Reverse-engineer the current recommendation from the same
              canonical nutrient-plan outputs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-fr-v2-muted"
            aria-label="Close calculation audit"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[66vh] overflow-y-auto px-5 py-4">
          <Link
            href={`/fertiliser-plan/calculations?${seasonParam}`}
            onClick={onClose}
            className="flex items-center justify-between border-b border-fr-v2-rule py-3 text-sm font-semibold text-fr-v2-graphite"
          >
            <span>All fields calculation audit</span>
            <span className="text-fr-v2-forest">Open →</span>
          </Link>
          <div className="mt-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-muted">
              Individual fields
            </p>
            {fields.map((field) => (
              <Link
                key={field.fieldId}
                href={`/fertiliser-plan/calculations?field=${encodeURIComponent(field.fieldId)}&${seasonParam}`}
                onClick={onClose}
                className="flex items-center justify-between border-b border-fr-v2-rule py-3 text-sm text-fr-v2-graphite"
              >
                <span>
                  <span className="font-semibold">{field.fieldName}</span>
                  <span className="ml-2 text-xs text-fr-v2-muted">
                    {field.areaHa.toFixed(2)} ha
                  </span>
                </span>
                <span className="text-xs font-semibold text-fr-v2-forest">
                  View calculation →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuoteReadinessSheet({
  open,
  onClose,
  readiness,
  farmerName,
  spatialAutoStatus,
  onConfirmedCommonage,
}: {
  open: boolean;
  onClose: () => void;
  readiness: FertiliserPlanOverview["quoteReadiness"];
  farmerName: string;
  spatialAutoStatus: string | null;
  onConfirmedCommonage: () => void;
}) {
  const groups = readiness.items.reduce<Record<string, typeof readiness.items>>(
    (acc, item) => {
      (acc[item.fieldId] ??= []).push(item);
      return acc;
    },
    {},
  );
  const missingCommonage = readiness.items.filter(
    (item) => !item.complete && item.label === "Commonage status",
  );
  const [confirmingFarmCommonage, setConfirmingFarmCommonage] = useState(false);
  const confirmNoCommonage = async () => {
    setConfirmingFarmCommonage(true);
    try {
      await confirmUnresolvedFarmCommonageStatusAction(
        "not_commonage",
        farmerName,
      );
      onConfirmedCommonage();
      onClose();
    } finally {
      setConfirmingFarmCommonage(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Quote readiness">
      <div className="space-y-5">
        {spatialAutoStatus ? (
          <p className="rounded-md bg-fr-surface-alt px-3 py-2 text-xs leading-relaxed text-fr-ink-600">
            {spatialAutoStatus}
          </p>
        ) : null}
        {missingCommonage.length > 0 ? (
          <div className="rounded-md border border-fr-border p-3">
            <p className="text-sm font-semibold text-fr-ink-900">
              Commonage public-data fallback
            </p>
            <p className="mt-1 text-xs leading-relaxed text-fr-ink-600">
              DAFM commonage is normally checked automatically from LPIS. If the
              live DAFM service is unavailable and you know none of the
              remaining mapped fields are commonage, confirm that once here
              instead of editing every field.
            </p>
            <button
              type="button"
              disabled={confirmingFarmCommonage}
              onClick={confirmNoCommonage}
              className="mt-2 rounded-full border border-fr-border px-3 py-1.5 text-xs font-semibold text-fr-ink-900 disabled:opacity-50"
            >
              {confirmingFarmCommonage
                ? "Saving…"
                : `Confirm ${missingCommonage.length} remaining field${missingCommonage.length === 1 ? "" : "s"} are not commonage`}
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-4 border-b border-fr-border pb-4">
          <div
            className="relative grid size-16 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-fr-green-700) ${readiness.percentage * 3.6}deg, var(--color-fr-border) 0deg)`,
            }}
          >
            <div className="grid size-12 place-items-center rounded-full bg-fr-surface text-sm font-bold tabular-nums">
              {readiness.percentage}%
            </div>
          </div>
          <div>
            <p className="font-semibold text-fr-ink-900">
              {readiness.completeCount} of {readiness.totalCount} required
              inputs complete
            </p>
            <p className="mt-1 text-sm text-fr-ink-600">
              Complete the missing items below to unlock a fertiliser quote
              request.
            </p>
          </div>
        </div>
        {Object.values(groups).map((items) => (
          <section key={items[0].fieldId} className="space-y-1">
            <h3 className="mb-2 text-sm font-semibold text-fr-ink-900">
              {items[0].fieldName}
            </h3>
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                className="flex min-h-11 items-center gap-3 border-b border-fr-border py-2 text-sm hover:text-fr-green-700"
              >
                {item.complete ? (
                  <Check className="size-4 shrink-0 text-fr-green-700" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-fr-v2-harvest-ink" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.label}</span>
                  {item.detail ? (
                    <span className="block text-xs text-fr-ink-500">
                      {item.detail}
                    </span>
                  ) : null}
                </span>
              </Link>
            ))}
          </section>
        ))}
      </div>
    </Sheet>
  );
}
