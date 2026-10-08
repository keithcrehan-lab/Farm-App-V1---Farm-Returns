"use client";

/**
 * Fertiliser Vertical V1, Checkpoint 3 (item D/E) — the farm-wide
 * Purchase Requirement. Fetched via `getFarmFertiliserDemandAction`
 * (`src/app/actions/fertiliser-plan.ts`); this component computes nothing
 * itself and never re-derives a quantity, price or status.
 *
 * Session 3b: the summary is the canonical whole-farm aggregation
 * (`aggregateFarmFertiliserPurchasing`, `src/domain/fertiliser-plan.ts`) —
 * per product: quantity, estimated cost, contributing fields (drill-down)
 * and provisional flag; every field that contributes nothing is listed with
 * its reason. Session 4: "Prepare quote" opens the fertiliser quote request
 * workflow (`FertiliserQuoteRequestFlow`) on a DRAFT created from the
 * canonical basket; it ends at READY_TO_SEND — nothing is saved or sent to
 * any supplier (no delivery integration exists). Presentation selection
 * lives in `src/lib/farm-fertiliser-basket-presentation.ts`. The "still to
 * buy" lines remain `purchaseRequirementTonnes` (recommended minus
 * confirmed applications, `toFarmFertiliserPurchaseRequirementTonnes`).
 *
 * Deliberately farm-wide, not field-scoped — unlike every other card on
 * the Nutrients screen, this one does not change when a different field
 * is selected; it always summarises the whole farm.
 */
import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { Sheet } from "@/components/ui/Sheet";
import {
  aggregationStatusCounts,
  basketCostSummary,
  basketStatusCounts,
  basketStatusPresentation,
  emptyRequirementMessage,
  farmCostSummary,
  farmFieldGroups,
  formatDisplayTonnes,
  formatProductCost,
  formatProductKg,
  formatRemainingTonnes,
  pluralFields,
} from "@/lib/farm-fertiliser-basket-presentation";
import type { FarmFertiliserQuoteBasket } from "@/domain/fertiliser-plan";
import { createFertiliserQuoteRequestDraft, type FertiliserQuoteRequest, type FertiliserQuoteRequestIssue } from "@/domain/fertiliser-quote-request";
import { quoteRequestIssueMessages } from "@/lib/fertiliser-quote-request-presentation";
import { FertiliserQuoteRequestFlow } from "./FertiliserQuoteRequestFlow";
import { getFarmFertiliserDemandAction, type FarmFertiliserDemandActionResult } from "@/app/actions/fertiliser-plan";

// Codex audit HIGH (round 2): a genuinely positive remainder that rounds to
// 0.00 t is shown as "< 0.01 t" — `formatRemainingTonnes`, shared with the
// whole-farm nutrient plan (`farm-fertiliser-basket-presentation.ts`).

export function FarmFertiliserPurchaseRequirementCard({ canRecord }: { canRecord: boolean }) {
  const [result, setResult] = useState<FarmFertiliserDemandActionResult | undefined>(undefined);
  // Mirrors RemainingFertiliserRequirementCard's own tri-state discipline
  // (Codex audit LOW round 19 there): a genuine fetch failure must render
  // its own honest disclosure, never be indistinguishable from "nothing
  // to show" or "not yet fetched".
  const [checkFailed, setCheckFailed] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  // Held here, not in the sheet, so closing and reopening the sheet keeps the
  // same request (and its stable id) for the life of this basket.
  const [quoteRequest, setQuoteRequest] = useState<FertiliserQuoteRequest | null>(null);
  const [quoteIssues, setQuoteIssues] = useState<FertiliserQuoteRequestIssue[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a real canRecord change, not every render.
    setResult(undefined);
    setCheckFailed(false);
    setQuoteRequest(null);
    setQuoteIssues([]);
    if (!canRecord) return;
    let cancelled = false;
    getFarmFertiliserDemandAction().then(
      (value) => {
        if (!cancelled) setResult(value);
      },
      (error: unknown) => {
        console.error("[FarmFertiliserPurchaseRequirementCard] getFarmFertiliserDemandAction failed:", error);
        if (!cancelled) setCheckFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [canRecord]);

  if (!canRecord) return null;

  if (checkFailed) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-3">
            <IconChip icon={ShoppingCart} tone="good" />
            <CardTitle>Farm fertiliser requirement</CardTitle>
          </span>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">
          Farm Return couldn&apos;t check your farm-wide purchase requirement right now — try again shortly.
        </p>
      </Card>
    );
  }

  if (!result) return null;

  const { aggregation, basket } = result;
  const status = basketStatusPresentation(aggregation.status, aggregationStatusCounts(aggregation));
  const cost = farmCostSummary(aggregation);
  const groups = farmFieldGroups(aggregation);

  // Codex audit HIGH (round 1): gated on the exact `remainingTotalKg`,
  // never the rounded tonnes — rounding only ever affects what's
  // displayed, never whether a line is included.
  const lines = result.purchaseRequirementTonnes.filter((line) => line.remainingTotalKg > 0);

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={ShoppingCart} tone="good" />
          <CardTitle>Farm fertiliser requirement</CardTitle>
        </span>
        <Pill tone={status.tone}>{status.label}</Pill>
      </CardHeader>

      <p className="text-sm text-fr-ink-600">{status.message}</p>

      {aggregation.products.length === 0 ? (
        <p className="mt-2 text-sm text-fr-ink-600">{emptyRequirementMessage(aggregation)}</p>
      ) : (
        <div className="mt-2 flex flex-col">
          {aggregation.products.map((product) => (
            <details key={product.productKey} className="border-t border-fr-border py-2 text-sm first:border-t-0">
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <span className="font-medium text-fr-ink-900">
                  {product.name}
                  <span className="ml-1.5 font-normal text-fr-ink-400">({product.npkAnalysis})</span>
                  {product.provisional ? (
                    <Pill tone="attention" className="ml-1.5 px-1.5 py-0.5 text-[10px]">
                      Provisional
                    </Pill>
                  ) : null}
                </span>
                <span className="text-right text-fr-ink-600">
                  <span className="font-semibold text-fr-ink-900">{formatDisplayTonnes(product.displayTonnes)}</span>
                  {` · ${formatProductCost(product.estimatedCostEur)} · ${pluralFields(product.contributions.length)}`}
                </span>
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5 pl-3 text-xs text-fr-ink-600">
                {product.contributions.map((c) => (
                  <li key={c.fieldId} className="flex justify-between">
                    <span>
                      {c.fieldName}
                      {c.provisional ? <span className="ml-1 text-fr-attention">(provisional)</span> : null}
                    </span>
                    <span>{formatProductKg(c.quantityKg)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <div className="flex items-center justify-between border-t border-fr-border pt-2 text-sm">
            <span className="text-fr-ink-600">{cost.label}</span>
            <span className="font-semibold text-fr-ink-900">{cost.value}</span>
          </div>
          {cost.unknownNote ? <p className="mt-1 text-xs text-fr-attention">{cost.unknownNote}</p> : null}
          <p className="mt-1 text-xs text-fr-ink-400">
            Quantities are rounded up to the nearest 0.01 t. Bag quantities aren&apos;t available — no verified bag size.
          </p>
        </div>
      )}

      {groups.length > 0 ? (
        <div className="mt-3 flex flex-col gap-1">
          {groups.map((group) => (
            <details key={group.key} className="text-xs">
              <summary className={group.key === "awaiting" ? "cursor-pointer font-medium text-fr-attention" : "cursor-pointer text-fr-ink-600"}>
                {group.heading}
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5 pl-3 text-fr-ink-600">
                {group.fields.map((f) => (
                  <li key={f.fieldId}>
                    <span className="font-medium text-fr-ink-900">{f.fieldName}</span> — {f.detail}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      ) : null}

      {aggregation.products.length > 0 ? (
        <div className="mt-3 border-t border-fr-border pt-2">
          <p className="text-xs font-medium text-fr-ink-600">Still to buy after recorded applications</p>
          {lines.length === 0 ? (
            <p className="text-sm text-fr-ink-600">
              Nothing left to buy right now — every currently recommended product is already fully planned or applied this season.
            </p>
          ) : (
            lines.map((line) => (
              <div key={line.product} className="flex items-center justify-between py-1 text-sm">
                <span className="text-fr-ink-900">
                  {line.product}
                  <span className="ml-1.5 text-fr-ink-400">({line.npkAnalysis})</span>
                </span>
                <span className="font-semibold text-fr-ink-900">{formatRemainingTonnes(line.remainingTotalTonnes, line.remainingTotalKg)} still to buy</span>
              </div>
            ))
          )}
        </div>
      ) : null}

      {result.applicationsWithUnknownComposition > 0 ? (
        <p className="mt-2 text-xs text-fr-attention">
          {result.applicationsWithUnknownComposition} confirmed application{result.applicationsWithUnknownComposition === 1 ? "" : "s"} farm-wide could
          not be included above — product, quantity or unit missing, unverified, or not in Farm Return&apos;s verified catalogue — so the figures above
          are real lower bounds on what&apos;s already applied, not exact.
        </p>
      ) : null}
      {result.truncated ? (
        <p className="mt-2 text-xs text-fr-ink-400">This farm has more records than could be checked — figures above may be incomplete.</p>
      ) : null}

      {basket.lines.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            if (!quoteRequest || quoteRequest.status === "CANCELLED") {
              const draft = createFertiliserQuoteRequestDraft(basket, { requestId: crypto.randomUUID(), createdAt: new Date().toISOString() });
              setQuoteRequest(draft.ok ? draft.value : null);
              setQuoteIssues(draft.ok ? [] : draft.issues);
            }
            setQuoteOpen(true);
          }}
          className="mt-3 w-full rounded-lg border border-fr-border px-3 py-2 text-sm font-medium text-fr-ink-900 hover:bg-fr-surface-alt"
        >
          Prepare quote
        </button>
      ) : null}
      <Sheet open={quoteOpen} onClose={() => setQuoteOpen(false)} title="Fertiliser quote request">
        {quoteRequest ? (
          <FertiliserQuoteRequestFlow key={quoteRequest.requestId} request={quoteRequest} onRequestChange={setQuoteRequest} />
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <QuoteBasketReview basket={basket} />
            <div role="alert" className="rounded-fr-control bg-fr-attention-bg px-3 py-2.5 text-fr-attention">
              {quoteRequestIssueMessages(quoteIssues).map((m) => (
                <p key={m}>{m}</p>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </Card>
  );
}

/** Read-only review of the canonical quote basket — no submission, no supplier. */
export function QuoteBasketReview({ basket }: { basket: FarmFertiliserQuoteBasket }) {
  const status = basketStatusPresentation(basket.status, basketStatusCounts(basket));
  const cost = basketCostSummary(basket);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>
      <p className="text-fr-ink-600">{status.message}</p>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-fr-ink-400">
          <tr>
            <th className="py-1 font-normal">Product</th>
            <th className="py-1 font-normal">Quantity</th>
            <th className="py-1 font-normal">Est. cost</th>
            <th className="py-1 font-normal">Fields</th>
          </tr>
        </thead>
        <tbody>
          {basket.lines.map((line) => (
            <tr key={line.productKey} className="border-t border-fr-border align-top">
              <td className="py-1 text-fr-ink-900">
                {line.name} <span className="text-fr-ink-400">({line.npkAnalysis})</span>
                {line.provisional ? <span className="block text-xs text-fr-attention">Provisional</span> : null}
              </td>
              <td className="py-1">
                {formatDisplayTonnes(line.displayTonnes)}
                <span className="block text-xs text-fr-ink-400">{formatProductKg(line.quantityKg)}</span>
              </td>
              <td className="py-1">{formatProductCost(line.estimatedCostEur)}</td>
              <td className="py-1">{line.contributingFieldCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between border-t border-fr-border pt-2">
        <span className="text-fr-ink-600">{cost.label}</span>
        <span className="font-semibold text-fr-ink-900">{cost.value}</span>
      </div>
      {cost.unknownNote ? <p className="text-xs text-fr-attention">{cost.unknownNote}</p> : null}
      {basket.unresolvedFields.length > 0 ? (
        <p className="text-xs text-fr-attention">
          Not included: {basket.unresolvedFields.map((f) => f.fieldName).join(", ")} — more information needed before fertiliser can be included.
        </p>
      ) : null}
      <p className="text-xs text-fr-ink-400">
        Bag quantities aren&apos;t available — no verified bag size. Estimated prices in {basket.currency}. Prepared {basket.createdAt.slice(0, 10)} ·{" "}
        {[...basket.engineVersions, basket.basketVersion].join(" · ")}
      </p>
      <p className="text-xs text-fr-ink-600">Review only — Farm Return hasn&apos;t sent this to any supplier.</p>
    </div>
  );
}
