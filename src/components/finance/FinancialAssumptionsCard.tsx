"use client";

/**
 * Real Farm V1 Phase 14 — "A real test farmer should be able to overwrite
 * reference assumptions with their own actual costs" (brief). The
 * `financial_assumptions` table/adapters (Phase 3) and onboarding's
 * Step 7 (Phase 4) already let a farmer set these; this card is the
 * first place they can be *reviewed and edited afterwards* rather than
 * only set once during onboarding — closing the specific gap the Phase 1
 * audit flagged ("no farmer-editable 'your actual price' override UI
 * found").
 *
 * Deliberately real-mode only (Supabase-backed) — `financialAssumptions`
 * isn't part of `farm-store.tsx`'s mock-mode state (Phase 6 only ported
 * Farm/Field/Livestock/Housing/Slurry, the entities every screen's core
 * logic already depended on); adding a parallel mock-mode path for this
 * one card wasn't judged worth the duplication this late in the build —
 * documented here, not silently absent.
 *
 * **Partially wired into calculations** (Real Mode Completion follow-up
 * after Phase 36): `FeedCostOverviewCard` now consumes a farmer-entered
 * `concentrate_feed_price_eur_per_t` as a real optional override into
 * `calculateFarmConcentrateFeedCostBreakdown`, via the same safe
 * wrapper-delegation pattern the function's own `byGroup` breakdown used
 * (Phase 15) — every existing call site/test keeps the old
 * code-constant-price behaviour unchanged when no override is set.
 * `FertiliserSlurryCard` still computes from `nutrients.ts`'s per-product
 * code constants, deliberately left alone: those constants sit inside the
 * Green Book/NAP calculation this app must never weaken, so rewiring them
 * is a distinct, higher-risk follow-up, not attempted here.
 *
 * Real Mode Completion Phase 20/21 — the resolved price *source* is now
 * shown per row via `resolvePrice` (`src/domain/price-resolution.ts`),
 * demonstrated for the one key with a real market-reference tier
 * available (`fertiliser_price_eur_per_t`, CSO's compound-18-6-12 series
 * — the same real default onboarding already offers). Deliberately not
 * extended to auto-match `SupplierQuote`s to the other four assumption
 * keys by fuzzy product-name text: there is no real schema linking a
 * free-text quote's `product` to an assumption key, and a wrong fuzzy
 * match (e.g. a diesel quote silently backing the fertiliser price) would
 * be worse than not showing a resolved source at all — see
 * `SupplierQuotesCard`'s own separate, unmatched list instead.
 */
import { useState } from "react";
import { Pencil, Sliders } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatEur } from "@/lib/format";
import type { FinancialAssumption, FinancialAssumptionKey } from "@/domain/types";
import { updateFinancialAssumptionAction } from "@/app/actions/farm";
import { PRICE_SOURCE_LEVEL_LABEL, resolvePrice } from "@/domain/price-resolution";
import { CSO_COMPOUND_18_6_12, latestPoint } from "@/domain/market";

const LABELS: Record<FinancialAssumptionKey, string> = {
  fertiliser_price_eur_per_t: "Fertiliser price",
  concentrate_feed_price_eur_per_t: "Concentrate feed price",
  contractor_silage_cost_eur_per_ha: "Contractor silage cost",
  cattle_sale_price_eur_per_kg_carcass: "Cattle sale price",
  fuel_price_eur_per_l: "Fuel price",
};

const KEYS = Object.keys(LABELS) as FinancialAssumptionKey[];

/** Real Mode Completion Phase 20/21 — the one real market-reference tier
 * available today (see this file's header comment for why the other four
 * keys don't get one). */
function referenceFor(key: FinancialAssumptionKey) {
  if (key !== "fertiliser_price_eur_per_t") return undefined;
  const latest = latestPoint(CSO_COMPOUND_18_6_12);
  return { value: latest.value, unit: "€/t", source: "CSO reference (18-6-12 compound)", asOf: latest.month };
}

export function FinancialAssumptionsCard({
  farmId,
  farmerName,
  assumptions,
}: {
  farmId: string;
  farmerName: string;
  assumptions: FinancialAssumption[];
}) {
  const [editingKey, setEditingKey] = useState<FinancialAssumptionKey | null>(null);
  const [local, setLocal] = useState<FinancialAssumption[]>(assumptions);
  const [valueInput, setValueInput] = useState("");
  const [saving, setSaving] = useState(false);

  const byKey = new Map(local.map((a) => [a.key, a]));

  async function handleSave(key: FinancialAssumptionKey) {
    const value = Number(valueInput);
    if (!Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    const unit = byKey.get(key)?.unit ?? "";
    const updated = await updateFinancialAssumptionAction(farmId, key, value, unit, farmerName);
    setLocal((prev) => [...prev.filter((a) => a.key !== key), updated]);
    setSaving(false);
    setEditingKey(null);
  }

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Sliders} tone="good" />
          <CardTitle>Financial assumptions</CardTitle>
        </span>
      </CardHeader>
      <p className="mb-3 text-xs text-fr-ink-600">
        Prices this farm&apos;s cost figures assume. Overwrite a reference default with your own real cost at any time.
      </p>
      <ul className="flex flex-col divide-y divide-fr-border">
        {KEYS.map((key) => {
          const assumption = byKey.get(key);
          const editing = editingKey === key;
          const resolved = resolvePrice({
            today: new Date().toISOString().slice(0, 10),
            ...(assumption ? { farmerAssumption: { value: assumption.value.value, status: assumption.value.status as "farmer_adjusted" | "estimated", unit: assumption.unit, source: assumption.value.source } } : {}),
            marketReference: referenceFor(key),
          });
          return (
            <li key={key} className="flex flex-col gap-2 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-fr-ink-900">{LABELS[key]}</span>
                {!editing ? (
                  <div className="flex items-center gap-2">
                    {assumption ? (
                      <>
                        <StatusBadge status={assumption.value.status} />
                        <span className="text-sm font-semibold text-fr-ink-900">
                          {formatEur(assumption.value.value, true)}
                          <span className="ml-1 text-xs font-normal text-fr-ink-400">{assumption.unit}</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-fr-ink-400">Not set</span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingKey(key);
                        setValueInput(assumption ? String(assumption.value.value) : "");
                      }}
                      className="text-fr-ink-400 hover:text-fr-ink-600"
                      aria-label={`Edit ${LABELS[key]}`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
              {!editing && resolved.level !== "unavailable" ? (
                <p className="text-xs text-fr-ink-400">
                  Source: {PRICE_SOURCE_LEVEL_LABEL[resolved.level]} — {resolved.source}
                  {resolved.asOf ? ` (${resolved.asOf})` : ""}
                </p>
              ) : null}
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    autoFocus
                    value={valueInput}
                    onChange={(e) => setValueInput(e.target.value)}
                    className="w-28 rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1 text-sm text-fr-ink-900"
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSave(key)}
                    className="rounded-fr-control bg-fr-green-700 px-3 py-1 text-xs font-semibold text-white disabled:bg-fr-green-700/40"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditingKey(null)} className="text-xs font-medium text-fr-ink-600">
                    Cancel
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
