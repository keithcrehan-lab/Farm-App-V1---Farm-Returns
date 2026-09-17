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
 * Preserves, never replaces: `/nutrients` remains the real, individually
 * field-scoped plan with its full scientific-engine detail (soil, NAP
 * compliance, organic offset, "Plan this application", remaining
 * requirement) — this screen only ever links to it
 * (`/nutrients?field=<id>`), never duplicates its logic. The quote
 * workflow (`RequestQuoteSheet`, `/quotes`) is reused exactly as
 * `input-planner/page.tsx` already does it.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ClipboardList, FlaskConical, MapPinned, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { RequestQuoteSheet } from "@/components/farm/RequestQuoteSheet";
import { SlurryStorageSection } from "@/components/farm/SlurryTankVisual";
import { FertiliserStockColumn } from "@/components/farm/FertiliserStockColumnVisual";
import { AddFertiliserStockRecordSheet } from "@/components/farm/AddFertiliserStockRecordSheet";
import { getFertiliserPlanOverviewAction, type FertiliserPlanOverview } from "@/app/actions/fertiliser-plan-overview";
import { useIsRealMode } from "@/store/farm-store";
import { formatHa, formatNonNegative } from "@/lib/format";

const FIELD_USE_LABEL: Record<string, string> = {
  grazing: "Grazing",
  silage_1st_cut: "Silage (1st cut)",
  silage_2nd_cut: "Silage (2nd cut)",
  silage_3rd_cut: "Silage (3rd cut)",
  mixed: "Mixed",
  tillage: "Tillage",
  other: "Other",
};

const STATUS_LABEL: Record<FertiliserPlanOverview["fieldBreakdown"][number]["status"], string> = {
  OK: "Included in plan",
  NOT_APPLICABLE: "Not applicable (tillage)",
  BLOCKED_INSUFFICIENT_EVIDENCE: "Missing evidence",
  AMBIGUOUS: "Needs review",
  LEGAL_PROHIBITION: "Legally restricted",
  UNKNOWN: "Not yet checked",
};

function StatusPill({ status }: { status: FertiliserPlanOverview["fieldBreakdown"][number]["status"] }) {
  const tone = status === "OK" ? "text-fr-good bg-fr-good-bg" : status === "NOT_APPLICABLE" ? "text-fr-ink-600 bg-fr-surface-alt" : "text-fr-attention bg-fr-attention-bg";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{STATUS_LABEL[status]}</span>;
}

type LoadState = { status: "loading" } | { status: "ready"; overview: FertiliserPlanOverview } | { status: "error" };

export function FertiliserPlanOverviewClient() {
  const isRealMode = useIsRealMode();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [quoteSheetOpen, setQuoteSheetOpen] = useState(false);
  const [stockSheetProduct, setStockSheetProduct] = useState<string | undefined>(undefined);
  const [stockSheetOpen, setStockSheetOpen] = useState(false);

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
          onOpenStockSheet={(product) => {
            setStockSheetProduct(product);
            setStockSheetOpen(true);
          }}
        />
      )}

      <RequestQuoteSheet open={quoteSheetOpen} onClose={() => setQuoteSheetOpen(false)} onSubmitted={() => setQuoteSheetOpen(false)} />

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
  onOpenStockSheet,
}: {
  overview: FertiliserPlanOverview;
  onOpenQuoteSheet: () => void;
  onOpenStockSheet: (product?: string) => void;
}) {
  const router = useRouter();
  const allStockColumns = overview.limeStockBand.hasRemainingRequirement || overview.limeStockBand.status === "recorded" ? [...overview.stockColumns, overview.limeStockBand] : overview.stockColumns;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. FARM SUMMARY */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-fr-ink-900">Farm summary — {overview.seasonLabel} season</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <p className="text-xs text-fr-ink-600">Fields included</p>
            <p className="text-lg font-bold text-fr-ink-900">
              {overview.fieldsIncluded} of {overview.fieldsTotal}
            </p>
            <p className="text-xs text-fr-ink-400">
              {formatHa(overview.totalAreaHaIncluded)} of {formatHa(overview.totalAreaHaTotal)} total farmed area
            </p>
            {overview.fieldsExcluded > 0 ? (
              <p className="mt-1 text-xs text-fr-attention">{overview.fieldsExcluded} field{overview.fieldsExcluded === 1 ? "" : "s"} not applicable or missing evidence — see the field breakdown below.</p>
            ) : null}
          </Card>
          <Card>
            <p className="text-xs text-fr-ink-600">Total N/P/K requirement (nutrient kg)</p>
            <p className="text-lg font-bold text-fr-ink-900">
              {/* Codex audit HIGH (round 1, refined round 2): 0dp here
                  could show a real small positive requirement as a flat
                  "0"; round 1's own bare 2dp fix only moved that
                  threshold rather than removing it. `formatNonNegative`
                  (`src/lib/format.ts`) shows "< 0.01" instead whenever a
                  genuinely positive total would still round to zero at
                  2dp — the same real, meaningful physical precision for a
                  computed kg total, never a fabricated digit. */}
              N {formatNonNegative(overview.nutrientRequirementKg.n, 2)} · P {formatNonNegative(overview.nutrientRequirementKg.p, 2)} · K {formatNonNegative(overview.nutrientRequirementKg.k, 2)} kg
            </p>
            <p className="text-xs text-fr-ink-400">Across {overview.nutrientRequirementKg.fieldsIncluded} field{overview.nutrientRequirementKg.fieldsIncluded === 1 ? "" : "s"} with a real recommendation — nutrient kg, distinct from the fertiliser PRODUCT kg/tonnes below</p>
          </Card>
        </div>
        {overview.fieldsWithBlockedEvidence > 0 || overview.applicationsWithUnknownComposition > 0 || overview.truncated ? (
          <p className="text-xs text-fr-attention">
            {overview.fieldsWithBlockedEvidence > 0 ? `${overview.fieldsWithBlockedEvidence} field${overview.fieldsWithBlockedEvidence === 1 ? "" : "s"} excluded from product totals below. ` : ""}
            {overview.applicationsWithUnknownComposition > 0 ? `${overview.applicationsWithUnknownComposition} confirmed application${overview.applicationsWithUnknownComposition === 1 ? "" : "s"} could not be resolved to an exact quantity. ` : ""}
            {overview.truncated ? "Some records could not be checked — figures may be incomplete." : ""}
          </p>
        ) : null}
      </section>

      {/* 5. ACTIONS (placed high, per brief's "consistent season, scope and quantities") */}
      <section className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onOpenStockSheet()} className="rounded-full bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white">
          Update stock/levels
        </button>
        <Link href="/fields" className="rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900">
          Resolve missing inputs
        </Link>
        <Link href="/reports" className="rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900">
          View scientific evidence
        </Link>
        <button type="button" onClick={onOpenQuoteSheet} className="rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900">
          Request a quote
        </button>
        <Link href="/quotes" className="rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900">
          Review quote requests
        </Link>
      </section>

      {/* 2. SLURRY STORAGE */}
      <SlurryStorageSection
        tanks={overview.slurry.tanks}
        totalCapacityM3={overview.slurry.totalCapacityM3}
        totalVolumeM3={overview.slurry.totalVolumeM3}
        farmFillPct={overview.slurry.farmFillPct}
        totalAllocatedM3={overview.slurry.totalAllocatedM3}
        totalUnallocatedM3={overview.slurry.totalUnallocatedM3}
        onUpdateLevels={() => router.push("/housing")}
      />

      {/* 3. FERTILISER STOCK */}
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

      {/* 4. FIELD BREAKDOWN */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fr-ink-900">Field breakdown</h2>
        {overview.fieldBreakdown.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 border-dashed py-8 text-center">
            <MapPinned className="size-8 text-fr-ink-400" />
            <p className="text-sm font-medium text-fr-ink-900">No fields yet</p>
          </Card>
        ) : (
          <div className="flex flex-col divide-y divide-fr-border rounded-fr-card border border-fr-border bg-fr-surface">
            {overview.fieldBreakdown.map((field) => (
              <Link
                key={field.fieldId}
                href={`/nutrients?field=${field.fieldId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-fr-surface-alt"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-fr-ink-900">{field.fieldName}</p>
                  <p className="text-xs text-fr-ink-600">
                    {formatHa(field.areaHa)}
                    {field.seasonalUse ? ` · ${FIELD_USE_LABEL[field.seasonalUse] ?? field.seasonalUse}` : ""}
                  </p>
                </div>
                <StatusPill status={field.status} />
                <ArrowRight className="size-4 shrink-0 text-fr-ink-400" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href="/nutrients" className="flex items-center gap-1.5 text-sm font-semibold text-fr-green-700">
          <ClipboardList className="size-4" />
          Open the detailed field-by-field plan
        </Link>
      </section>
    </div>
  );
}
