"use client";

/**
 * Farm Spatial V2 Phase 5 — the whole-farm nutrient plan on
 * `/fertiliser-plan` (`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §15).
 * Renders `whole-farm-nutrient-plan-presentation.ts`'s selection of the
 * canonical farm aggregation and quote basket; computes nothing.
 *
 * - Outstanding composition: one large primary product quantity with
 *   subordinate supporting values, typographic and asymmetrical (no tiles).
 * - Field rows: requirement state beside canonical product contribution.
 * - Purchase/application plan: canonical product totals, then what is still
 *   to buy after recorded applications (kept a separate concept).
 * - Plan handoff: per field to the existing persisted "Plan this
 *   application"; this page saves nothing and says so.
 * - Market handoff: the existing quote request workflow on a copy of the
 *   canonical basket. A requested quantity never changes the requirement.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { FertiliserQuoteRequestFlow } from "@/components/farm/FertiliserQuoteRequestFlow";
import { QuoteBasketReview } from "@/components/farm/FarmFertiliserPurchaseRequirementCard";
import type { FarmFertiliserQuoteBasket } from "@/domain/fertiliser-plan";
import { createFertiliserQuoteRequestDraft, type FertiliserQuoteRequest, type FertiliserQuoteRequestIssue } from "@/domain/fertiliser-quote-request";
import { quoteRequestIssueMessages } from "@/lib/fertiliser-quote-request-presentation";
import {
  PLAN_HANDOFF,
  type MarketHandoffView,
  type OutstandingQuantityView,
  type PlanHandoffView,
  type ProductQuantityView,
  type StillToBuyLine,
  type WholeFarmFieldRow,
} from "@/lib/whole-farm-nutrient-plan-presentation";
import type { StatusTone } from "@/lib/status";
import { cn } from "@/lib/cn";

const TONE_TEXT: Record<StatusTone, string> = {
  good: "text-fr-v2-forest",
  attention: "text-fr-v2-harvest-ink",
  risk: "text-fr-v2-clay",
  info: "text-fr-v2-cobalt",
  neutral: "text-fr-v2-muted",
};

const TONE_RULE: Record<StatusTone, string> = {
  good: "border-fr-v2-forest",
  attention: "border-fr-v2-harvest",
  risk: "border-fr-v2-clay",
  info: "border-fr-v2-cobalt",
  neutral: "border-fr-v2-rule",
};

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted", className)}>{children}</p>;
}

function ProductIdentity({ product }: { product: Pick<ProductQuantityView, "name" | "npkAnalysis" | "provisional" | "catalogueVerified"> }) {
  return (
    <>
      {product.name} <span className="text-fr-v2-muted">({product.npkAnalysis})</span>
      {product.provisional ? <span className="ml-2 text-xs font-semibold text-fr-v2-harvest-ink">Provisional</span> : null}
      {!product.catalogueVerified ? <span className="ml-2 text-xs font-semibold text-fr-v2-clay">Not in verified catalogue</span> : null}
    </>
  );
}

/** Large primary quantity on the left; supporting values ruled off on the right. */
export function OutstandingQuantityComposition({ view, supporting }: { view: OutstandingQuantityView; supporting: ReactNode }) {
  return (
    <section aria-labelledby="outstanding-heading" className="grid grid-cols-1 border-y border-fr-v2-rule bg-fr-v2-paper lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className={cn("border-l-[3px] px-5 py-6 lg:px-8 lg:py-8", TONE_RULE[view.status.tone])}>
        <Kicker>
          <span id="outstanding-heading">Outstanding fertiliser requirement</span>
          <span className={cn("ml-2", TONE_TEXT[view.status.tone])}>· {view.status.label}</span>
        </Kicker>
        {view.primary ? (
          <>
            <p data-testid="primary-quantity" className="mt-3 font-display text-6xl leading-none tabular-nums text-fr-v2-graphite lg:text-7xl">
              {view.primary.tonnesText}
            </p>
            <p className="mt-2 text-base font-semibold text-fr-v2-graphite">
              <ProductIdentity product={view.primary} />
            </p>
            <p className="text-xs text-fr-v2-muted">
              {view.primary.kgText} product · {view.primary.fieldCountText}
            </p>
            {view.supporting.length > 0 ? (
              <ul className="mt-5 flex flex-col border-t border-fr-v2-rule">
                {view.supporting.map((p) => (
                  <li key={p.productKey} className="flex items-baseline justify-between gap-3 border-b border-fr-v2-rule py-2">
                    <span className="min-w-0 text-sm text-fr-v2-graphite">
                      <ProductIdentity product={p} />
                    </span>
                    <span className="shrink-0 font-display text-2xl tabular-nums text-fr-v2-graphite">{p.tonnesText}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="mt-3 max-w-md font-display text-2xl leading-snug text-fr-v2-graphite">{view.emptyMessage}</p>
        )}
        <p className={cn("mt-4 max-w-xl text-sm", view.isWholeFarm ? "text-fr-v2-muted" : "text-fr-v2-harvest-ink")}>{view.status.message}</p>
        <p className="mt-1 text-xs text-fr-v2-muted">Product quantities, rounded up to the nearest 0.01 t — distinct from the nutrient kg beside them.</p>
      </div>
      <div className="flex flex-col gap-4 border-t border-fr-v2-rule px-5 py-6 lg:border-t-0 lg:border-l lg:px-6 lg:py-8">{supporting}</div>
    </section>
  );
}

export function WholeFarmFieldRows({ rows }: { rows: WholeFarmFieldRow[] }) {
  return (
    <ol className="flex flex-col border-t border-fr-v2-rule">
      {rows.map((row) => (
        <li key={row.fieldId} data-field-row={row.fieldId} className="grid grid-cols-1 gap-2 border-b border-fr-v2-rule py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] sm:items-baseline sm:gap-4">
          <div className="min-w-0">
            <Link href={row.plannerHref} className="flex items-center gap-1.5 font-semibold text-fr-v2-graphite hover:underline">
              <span className="truncate">{row.fieldName}</span>
              <ArrowRight className="size-3.5 shrink-0 text-fr-v2-muted" aria-hidden />
            </Link>
            {row.identityText ? <p className="text-xs text-fr-v2-muted">{row.identityText}</p> : null}
            {row.requirement ? <p className={cn("text-xs font-semibold", TONE_TEXT[row.requirement.tone])}>{row.requirement.label}</p> : null}
          </div>
          <div className="min-w-0 text-sm">
            <p className={cn("text-xs font-semibold", TONE_TEXT[row.purchase.tone])}>{row.purchase.label}</p>
            {row.purchase.contributions.length > 0 ? (
              <ul className="mt-0.5 flex flex-col">
                {row.purchase.contributions.map((c) => (
                  <li key={c.productKey} className="flex justify-between gap-3 text-fr-v2-graphite">
                    <span className="min-w-0 truncate">
                      {c.name} <span className="text-fr-v2-muted">({c.npkAnalysis})</span>
                      {c.provisional ? <span className="ml-1 text-xs text-fr-v2-harvest-ink">provisional</span> : null}
                    </span>
                    <span className="shrink-0 tabular-nums">{c.kgText}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {row.purchase.detail ? <p className="mt-0.5 text-xs text-fr-v2-muted">{row.purchase.detail}</p> : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold sm:justify-end">
            <Link href={row.fieldPlanHref} className="text-fr-v2-graphite underline-offset-2 hover:underline">
              Field plan
            </Link>
            {row.canPlanApplication ? (
              <Link href={row.plannerHref} className="text-fr-v2-forest underline-offset-2 hover:underline">
                Plan application
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function FertiliserPurchasePlan({ products, stillToBuy }: { products: ProductQuantityView[]; stillToBuy: StillToBuyLine[] }) {
  if (products.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Canonical fertiliser requirement by product</caption>
        <thead>
          <tr className="border-b border-fr-v2-graphite text-[11px] uppercase tracking-[0.12em] text-fr-v2-muted">
            <th className="py-1.5 font-bold">Product</th>
            <th className="py-1.5 text-right font-bold">Requirement</th>
            <th className="py-1.5 text-right font-bold">Product kg</th>
            <th className="py-1.5 text-right font-bold">Fields</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.productKey} data-product={p.productKey} className="border-b border-fr-v2-rule align-baseline">
              <td className="py-2 text-fr-v2-graphite">
                <ProductIdentity product={p} />
              </td>
              <td className="py-2 text-right font-display text-lg tabular-nums text-fr-v2-graphite">{p.tonnesText}</td>
              <td className="py-2 text-right tabular-nums text-fr-v2-muted">{p.kgText}</td>
              <td className="py-2 text-right text-fr-v2-muted">{p.fieldCountText}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-l-[3px] border-fr-v2-rule pl-4">
        <Kicker>Still to buy after recorded applications</Kicker>
        {stillToBuy.length === 0 ? (
          <p className="mt-2 text-sm text-fr-v2-muted">Nothing left to buy right now — every recommended product is already planned or applied this season.</p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {stillToBuy.map((line) => (
              <li key={`${line.product}|${line.npkAnalysis}`} className="flex justify-between gap-3 py-1 text-sm text-fr-v2-graphite">
                <span>
                  {line.product} <span className="text-fr-v2-muted">({line.npkAnalysis})</span>
                </span>
                <span className="font-semibold tabular-nums">{line.text}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-fr-v2-muted">Bag quantities aren&apos;t available — no verified bag size.</p>
      </div>
    </div>
  );
}

export function PlanHandoffPlane({ view }: { view: PlanHandoffView }) {
  return (
    <section aria-labelledby="plan-handoff-heading" className="border-l-[3px] border-fr-v2-forest bg-fr-v2-forest/[0.06] px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="plan-handoff-heading" className="font-display text-xl text-fr-v2-forest">
          {PLAN_HANDOFF.title}
        </h2>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">{PLAN_HANDOFF.persistence}</span>
      </div>
      <p className="mt-2 text-sm text-fr-v2-graphite">{PLAN_HANDOFF.message}</p>
      <p className="mt-2 text-sm font-semibold text-fr-v2-forest">{view.summary}</p>
      <Link href="/plan" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fr-v2-forest underline-offset-2 hover:underline">
        Open Plan <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}

export function MarketHandoffPlane({ view, basket }: { view: MarketHandoffView; basket: FarmFertiliserQuoteBasket }) {
  const [open, setOpen] = useState(false);
  // Held here so closing and reopening keeps the same request (and id). The
  // request is a copy of the basket: editing it never touches `basket`.
  const [request, setRequest] = useState<FertiliserQuoteRequest | null>(null);
  const [issues, setIssues] = useState<FertiliserQuoteRequestIssue[]>([]);

  return (
    <section aria-labelledby="market-handoff-heading" className="border-l-[3px] border-fr-v2-cobalt bg-fr-v2-cobalt-tint px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="market-handoff-heading" className="font-display text-xl text-fr-v2-cobalt">
          Market
        </h2>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">Supplier quote</span>
      </div>
      <p className="mt-2 text-sm text-fr-v2-graphite">{view.coverage}</p>
      <p className="mt-1 text-xs text-fr-v2-muted">{view.separation}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {view.available ? (
          <button
            type="button"
            onClick={() => {
              if (!request || request.status === "CANCELLED") {
                const draft = createFertiliserQuoteRequestDraft(basket, { requestId: crypto.randomUUID(), createdAt: new Date().toISOString() });
                setRequest(draft.ok ? draft.value : null);
                setIssues(draft.ok ? [] : draft.issues);
              }
              setOpen(true);
            }}
            className="rounded-fr-v2-control bg-fr-v2-cobalt px-4 py-2 text-sm font-semibold text-white"
          >
            Prepare supplier quote
          </button>
        ) : null}
        <Link href="/quotes" className="text-sm font-semibold text-fr-v2-cobalt underline-offset-2 hover:underline">
          All quote requests
        </Link>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Fertiliser quote request">
        {request ? (
          <FertiliserQuoteRequestFlow key={request.requestId} request={request} onRequestChange={setRequest} />
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <QuoteBasketReview basket={basket} />
            <div role="alert" className="rounded-fr-control bg-fr-attention-bg px-3 py-2.5 text-fr-attention">
              {quoteRequestIssueMessages(issues).map((m) => (
                <p key={m}>{m}</p>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </section>
  );
}
