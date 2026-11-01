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
import { useCallback, useEffect, useState } from "react";
import { Calculator, Check, ClipboardList, FlaskConical, MapPinned, ShoppingCart, X, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { RequestQuoteSheet } from "@/components/farm/RequestQuoteSheet";
import { Sheet } from "@/components/ui/Sheet";
import { SlurryStorageSection } from "@/components/farm/SlurryTankVisual";
import { FertiliserStockColumn } from "@/components/farm/FertiliserStockColumnVisual";
import { AddFertiliserStockRecordSheet } from "@/components/farm/AddFertiliserStockRecordSheet";
import { SlurryFirstPlanningPanel } from "@/components/farm/SlurryFirstPlanningPanel";
import { getFertiliserPlanOverviewAction, type FertiliserPlanOverview } from "@/app/actions/fertiliser-plan-overview";
import { useIsRealMode } from "@/store/farm-store";
import { formatHa, formatNonNegative } from "@/lib/format";
import {
  FertiliserPurchasePlan,
  Kicker,
  MarketHandoffPlane,
  OutstandingQuantityComposition,
  PlanHandoffPlane,
  WholeFarmFieldRows,
} from "@/components/farm-spatial/WholeFarmNutrientPlan";
import { marketHandoffView, outstandingQuantityView, planHandoffView, stillToBuyLines, wholeFarmFieldRows } from "@/lib/whole-farm-nutrient-plan-presentation";

type LoadState = { status: "loading" } | { status: "ready"; overview: FertiliserPlanOverview } | { status: "error" };

export function FertiliserPlanOverviewClient() {
  const isRealMode = useIsRealMode();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [quoteSheetOpen, setQuoteSheetOpen] = useState(false);
  const [stockSheetProduct, setStockSheetProduct] = useState<string | undefined>(undefined);
  const [stockSheetOpen, setStockSheetOpen] = useState(false);
  const [calculationAuditOpen, setCalculationAuditOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);

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
    getFertiliserPlanOverviewAction().then(
      (overview) => {
        if (!cancelled) setLoad({ status: "ready", overview });
      },
      (error: unknown) => {
        console.error("[FertiliserPlanOverviewClient] getFertiliserPlanOverviewAction failed:", error);
        if (!cancelled) setLoad({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isRealMode, refreshToken]);

  return (
    <>
      <div className="mb-4 lg:hidden">
        <h1 className="text-title text-fr-ink-900">Fertiliser Plan</h1>
        <p className="text-sm text-fr-ink-600">Whole-farm requirement, stock and slurry storage</p>
      </div>
      <PageHeader title="Fertiliser Plan" subtitle="Whole-farm requirement, stock and slurry storage" />

      {!isRealMode ? (
        <Card className="flex flex-col items-center gap-2 border-dashed py-10 text-center">
          <FlaskConical className="size-8 text-fr-ink-400" />
          <p className="text-sm font-medium text-fr-ink-900">Sign in to see your farm-wide fertiliser plan</p>
          <p className="max-w-xs text-sm text-fr-ink-600">This overview reads your real, signed-in farm data — nothing is fabricated for a sample farm.</p>
        </Card>
      ) : load.status === "loading" ? (
        <p className="py-8 text-center text-sm text-fr-ink-600">Loading your farm-wide fertiliser plan…</p>
      ) : load.status === "error" ? (
        <Card>
          <p className="text-sm text-fr-ink-600">Farm Return couldn&apos;t load your farm-wide fertiliser plan right now — try again shortly.</p>
          <button type="button" onClick={refresh} className="mt-3 rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900">
            Retry
          </button>
        </Card>
      ) : (
        <OverviewContent
          overview={load.overview}
          onOpenQuoteSheet={() => setQuoteSheetOpen(true)}
          onOpenReadiness={() => setReadinessOpen(true)}
          onOpenCalculationAudit={() => setCalculationAuditOpen(true)}
          onOpenStockSheet={(product) => {
            setStockSheetProduct(product);
            setStockSheetOpen(true);
          }}
        />
      )}

      <RequestQuoteSheet open={quoteSheetOpen} onClose={() => setQuoteSheetOpen(false)} onSubmitted={() => setQuoteSheetOpen(false)} />

      {load.status === "ready" ? <QuoteReadinessSheet open={readinessOpen} onClose={() => setReadinessOpen(false)} readiness={load.overview.quoteReadiness} /> : null}

      {load.status === "ready" ? (
        <CalculationAuditChooser
          open={calculationAuditOpen}
          onClose={() => setCalculationAuditOpen(false)}
          fields={load.overview.fieldBreakdown}
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

function OverviewContent({
  overview,
  onOpenQuoteSheet,
  onOpenReadiness,
  onOpenCalculationAudit,
  onOpenStockSheet,
}: {
  overview: FertiliserPlanOverview;
  onOpenQuoteSheet: () => void;
  onOpenReadiness: () => void;
  onOpenCalculationAudit: () => void;
  onOpenStockSheet: (product?: string) => void;
}) {
  const router = useRouter();
  const allStockColumns = overview.limeStockBand.hasRemainingRequirement || overview.limeStockBand.status === "recorded" ? [...overview.stockColumns, overview.limeStockBand] : overview.stockColumns;
  // Farm Spatial V2 Phase 5: presentation selection of the canonical
  // aggregation and basket — no quantity is derived here.
  const outstanding = outstandingQuantityView(overview.aggregation);
  const purchaseProducts = outstanding.primary ? [outstanding.primary, ...outstanding.supporting] : [];
  const fieldRows = wholeFarmFieldRows(overview.fieldBreakdown, overview.aggregation);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. WHOLE-FARM OUTSTANDING REQUIREMENT + FARM SUMMARY */}
      <OutstandingQuantityComposition
        view={outstanding}
        supporting={
          <>
            <Kicker>Farm summary — {overview.seasonLabel} season</Kicker>
            <div className="border-b border-fr-v2-rule pb-3">
              <p className="text-xs text-fr-v2-muted">Fields included</p>
              <p className="font-display text-3xl tabular-nums text-fr-v2-graphite">
                {overview.fieldsIncluded} of {overview.fieldsTotal}
              </p>
              <p className="text-xs text-fr-v2-muted">
                {formatHa(overview.totalAreaHaIncluded)} of {formatHa(overview.totalAreaHaTotal)} total farmed area
              </p>
              {overview.fieldsExcluded > 0 ? (
                <p className="mt-1 text-xs text-fr-v2-harvest-ink">{overview.fieldsExcluded} field{overview.fieldsExcluded === 1 ? "" : "s"} not applicable or missing evidence — see the field rows below.</p>
              ) : null}
            </div>
            <div className="border-b border-fr-v2-rule pb-3">
              <p className="text-xs text-fr-v2-muted">Total N/P/K requirement (nutrient kg)</p>
              <p className="text-base font-semibold tabular-nums text-fr-v2-graphite">
                {/* Codex audit HIGH (rounds 1–2): `formatNonNegative` shows
                    "< 0.01" rather than a flat "0" for a real small positive
                    total (`src/lib/format.ts`). */}
                N {formatNonNegative(overview.nutrientRequirementKg.n, 2)} · P {formatNonNegative(overview.nutrientRequirementKg.p, 2)} · K {formatNonNegative(overview.nutrientRequirementKg.k, 2)} kg
              </p>
              <p className="text-xs text-fr-v2-muted">
                Across {overview.nutrientRequirementKg.fieldsIncluded} field{overview.nutrientRequirementKg.fieldsIncluded === 1 ? "" : "s"} with a real recommendation — nutrient kg, distinct from the fertiliser PRODUCT tonnes
              </p>
            </div>
            {overview.fieldsWithBlockedEvidence > 0 || overview.applicationsWithUnknownComposition > 0 || overview.truncated ? (
              <p className="text-xs text-fr-v2-harvest-ink">
                {overview.fieldsWithBlockedEvidence > 0 ? `${overview.fieldsWithBlockedEvidence} field${overview.fieldsWithBlockedEvidence === 1 ? "" : "s"} excluded from product totals. ` : ""}
                {overview.applicationsWithUnknownComposition > 0 ? `${overview.applicationsWithUnknownComposition} confirmed application${overview.applicationsWithUnknownComposition === 1 ? "" : "s"} could not be resolved to an exact quantity. ` : ""}
                {overview.truncated ? "Some records could not be checked — figures may be incomplete." : ""}
              </p>
            ) : null}
          </>
        }
      />

      {/* ACTIONS (placed high, per brief's "consistent season, scope and quantities") */}
      <section className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onOpenStockSheet()} className="rounded-full bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white">
          Update stock/levels
        </button>
        <Link href="/fields" className="rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900">
          Resolve missing inputs
        </Link>
        <button
          type="button"
          onClick={onOpenCalculationAudit}
          className="flex items-center gap-1.5 rounded-full border border-fr-border px-4 py-2 text-sm font-semibold text-fr-ink-900"
        >
          <Calculator className="size-4" />
          View calculations
        </button>
        <Link href="/reports" className="rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900">
          View scientific evidence
        </Link>
        <button type="button" onClick={onOpenReadiness} aria-label={`Quote readiness ${overview.quoteReadiness.percentage}%`} className="flex items-center gap-2 rounded-full border border-fr-border px-3 py-1.5 text-sm font-medium text-fr-ink-900">
          <span className="relative grid size-10 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-fr-green-700) ${overview.quoteReadiness.percentage * 3.6}deg, var(--color-fr-border) 0deg)` }}>
            <span className="grid size-8 place-items-center rounded-full bg-fr-surface text-[11px] font-bold tabular-nums">{overview.quoteReadiness.percentage}%</span>
          </span>
          <span className="text-left leading-tight"><span className="block">Quote readiness</span><span className="block text-xs font-normal text-fr-ink-500">{overview.quoteReadiness.remainingCount === 0 ? "Complete" : `${overview.quoteReadiness.remainingCount} item${overview.quoteReadiness.remainingCount === 1 ? "" : "s"} left`}</span></span>
        </button>
        <button type="button" disabled={!overview.quoteReadiness.ready} onClick={onOpenQuoteSheet} className="rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900 disabled:cursor-not-allowed disabled:opacity-40" title={overview.quoteReadiness.ready ? undefined : "Complete the required fertiliser inputs before requesting a quote"}>
          Request a quote
        </button>
        <Link href="/quotes" className="rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900">
          Review quote requests
        </Link>
      </section>

      <SlurryFirstPlanningPanel
        fields={overview.fieldBreakdown.map((field) => ({ fieldId: field.fieldId, fieldName: field.fieldName }))}
        stores={overview.slurry.tanks.map((tank) => ({ housingId: tank.housingId, shedName: tank.shedName, capacityM3: tank.capacityM3 }))}
        currentUnallocatedM3={overview.slurry.totalUnallocatedM3}
      />

      {/* 2. FIELD ROWS — requirement state beside canonical contribution */}
      <section className="flex flex-col gap-2">
        <Kicker>Fields</Kicker>
        {fieldRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border-y border-dashed border-fr-v2-rule py-8 text-center">
            <MapPinned className="size-8 text-fr-ink-400" />
            <p className="text-sm font-medium text-fr-ink-900">No fields yet</p>
          </div>
        ) : (
          <WholeFarmFieldRows rows={fieldRows} />
        )}
      </section>

      {/* 3. FERTILISER PURCHASE / APPLICATION PLAN */}
      {purchaseProducts.length > 0 ? (
        <section className="flex flex-col gap-2">
          <Kicker>Fertiliser purchase and application plan</Kicker>
          <FertiliserPurchasePlan products={purchaseProducts} stillToBuy={stillToBuyLines(overview.stockColumns)} />
        </section>
      ) : null}

      {/* 4. HANDOFFS — operational Plan, commercial Market */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlanHandoffPlane view={planHandoffView(overview.aggregation)} />
        <MarketHandoffPlane view={marketHandoffView(overview.basket)} basket={overview.basket} />
      </div>

      {/* 5. SLURRY STORAGE */}
      <SlurryStorageSection
        tanks={overview.slurry.tanks}
        totalCapacityM3={overview.slurry.totalCapacityM3}
        totalVolumeM3={overview.slurry.totalVolumeM3}
        farmFillPct={overview.slurry.farmFillPct}
        totalAllocatedM3={overview.slurry.totalAllocatedM3}
        totalUnallocatedM3={overview.slurry.totalUnallocatedM3}
        onUpdateLevels={() => router.push("/housing")}
      />

      {/* 6. FERTILISER STOCK */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fr-ink-900">Fertiliser stock</h2>
        {allStockColumns.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 border-dashed py-8 text-center">
            <ShoppingCart className="size-8 text-fr-ink-400" />
            <p className="text-sm font-medium text-fr-ink-900">Nothing left to buy right now</p>
            <p className="max-w-xs text-sm text-fr-ink-600">Every currently recommended product is already fully planned or applied this season.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {allStockColumns.map((band) => (
              <FertiliserStockColumn key={band.product} band={band} onUpdateStock={(product) => onOpenStockSheet(product)} />
            ))}
          </div>
        )}
        {overview.lime.fieldsWithoutLimeEvidence > 0 ? (
          <p className="text-xs text-fr-attention">
            {overview.lime.fieldsWithoutLimeEvidence} field{overview.lime.fieldsWithoutLimeEvidence === 1 ? "" : "s"} {overview.lime.fieldsWithoutLimeEvidence === 1 ? "has" : "have"} no real laboratory lime figure on file — lime figures above are real but partial.
          </p>
        ) : null}
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href="/fields" className="flex items-center gap-1.5 text-sm font-semibold text-fr-green-700">
          <ClipboardList className="size-4" />
          Open fields and recommendations
        </Link>
      </section>
    </div>
  );
}

function CalculationAuditChooser({
  open,
  onClose,
  fields,
}: {
  open: boolean;
  onClose: () => void;
  fields: FertiliserPlanOverview["fieldBreakdown"];
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Fertiliser calculation audit">
      <div className="max-h-[82vh] w-full max-w-xl overflow-hidden rounded-t-2xl bg-fr-v2-cream shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-fr-v2-rule px-5 py-4">
          <div>
            <p className="font-display text-xl text-fr-v2-graphite">Fertiliser calculations</p>
            <p className="mt-1 text-sm text-fr-v2-muted">Reverse-engineer the current recommendation from the same canonical nutrient-plan outputs.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-fr-v2-muted" aria-label="Close calculation audit">
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[66vh] overflow-y-auto px-5 py-4">
          <Link
            href="/fertiliser-plan/calculations"
            onClick={onClose}
            className="flex items-center justify-between border-b border-fr-v2-rule py-3 text-sm font-semibold text-fr-v2-graphite"
          >
            <span>All fields calculation audit</span>
            <span className="text-fr-v2-forest">Open →</span>
          </Link>
          <div className="mt-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-muted">Individual fields</p>
            {fields.map((field) => (
              <Link
                key={field.fieldId}
                href={`/fertiliser-plan/calculations?field=${encodeURIComponent(field.fieldId)}`}
                onClick={onClose}
                className="flex items-center justify-between border-b border-fr-v2-rule py-3 text-sm text-fr-v2-graphite"
              >
                <span>
                  <span className="font-semibold">{field.fieldName}</span>
                  <span className="ml-2 text-xs text-fr-v2-muted">{field.areaHa.toFixed(2)} ha</span>
                </span>
                <span className="text-xs font-semibold text-fr-v2-forest">View calculation →</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuoteReadinessSheet({ open, onClose, readiness }: { open: boolean; onClose: () => void; readiness: FertiliserPlanOverview["quoteReadiness"] }) {
  const groups = readiness.items.reduce<Record<string, typeof readiness.items>>((acc, item) => {
    (acc[item.fieldId] ??= []).push(item);
    return acc;
  }, {});
  return (
    <Sheet open={open} onClose={onClose} title="Quote readiness">
      <div className="space-y-5">
        <div className="flex items-center gap-4 border-b border-fr-border pb-4">
          <div className="relative grid size-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-fr-green-700) ${readiness.percentage * 3.6}deg, var(--color-fr-border) 0deg)` }}>
            <div className="grid size-12 place-items-center rounded-full bg-fr-surface text-sm font-bold tabular-nums">{readiness.percentage}%</div>
          </div>
          <div><p className="font-semibold text-fr-ink-900">{readiness.completeCount} of {readiness.totalCount} required inputs complete</p><p className="mt-1 text-sm text-fr-ink-600">Complete the missing items below to unlock a fertiliser quote request.</p></div>
        </div>
        {Object.values(groups).map((items) => (
          <section key={items[0].fieldId} className="space-y-1">
            <h3 className="mb-2 text-sm font-semibold text-fr-ink-900">{items[0].fieldName}</h3>
            {items.map((item) => (
              <Link key={item.id} href={item.href} onClick={onClose} className="flex min-h-11 items-center gap-3 border-b border-fr-border py-2 text-sm hover:text-fr-green-700">
                {item.complete ? <Check className="size-4 shrink-0 text-fr-green-700" /> : <XCircle className="size-4 shrink-0 text-fr-v2-harvest-ink" />}
                <span className="min-w-0 flex-1"><span className="block font-medium">{item.label}</span>{item.detail ? <span className="block text-xs text-fr-ink-500">{item.detail}</span> : null}</span>
              </Link>
            ))}
          </section>
        ))}
      </div>
    </Sheet>
  );
}
