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
import {
  createFertiliserQuoteRequestDraft,
  type FertiliserQuoteRequest,
  type FertiliserQuoteRequestIssue,
} from "@/domain/fertiliser-quote-request";
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

export function Kicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}

function ProductIdentity({
  product,
}: {
  product: Pick<
    ProductQuantityView,
    "name" | "npkAnalysis" | "provisional" | "catalogueVerified"
  >;
}) {
  return (
    <>
      {product.name}{" "}
      <span className="text-fr-v2-muted">({product.npkAnalysis})</span>
      {product.provisional ? (
        <span className="ml-2 text-xs font-semibold text-fr-v2-harvest-ink">
          Provisional
        </span>
      ) : null}
      {!product.catalogueVerified ? (
        <span className="ml-2 text-xs font-semibold text-fr-v2-clay">
          Not in verified catalogue
        </span>
      ) : null}
    </>
  );
}

/**
 * Remaining chemical product requirement — after organic allocation, and
 * deliberately subordinate to the farm's N/P/K agronomic requirement. Primary
 * quantity on the left; supporting values ruled off on the right.
 */
export function OutstandingQuantityComposition({
  view,
  supporting,
  step,
}: {
  view: OutstandingQuantityView;
  supporting: ReactNode;
  step?: string;
}) {
  return (
    <section
      aria-labelledby="outstanding-heading"
      className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]"
    >
      <div className={cn("border-l-2 pl-5", TONE_RULE[view.status.tone])}>
        <Kicker className="flex flex-wrap items-baseline gap-x-3">
          {step ? (
            <span className="font-mono font-medium tracking-normal text-fr-v2-gold">
              {step}
            </span>
          ) : null}
          <span id="outstanding-heading">Remaining chemical requirement</span>
          <span className={TONE_TEXT[view.status.tone]}>
            · {view.status.label}
          </span>
        </Kicker>
        <p className="mt-1 font-display text-xl text-fr-v2-graphite">
          Product requirement after organic allocation
        </p>
        {view.primary ? (
          <>
            <p
              data-testid="primary-quantity"
              className="mt-4 font-mono text-4xl leading-none font-medium tracking-[-0.03em] tabular-nums text-fr-v2-graphite lg:text-5xl"
            >
              {view.primary.tonnesText}
            </p>
            <p className="mt-2 text-base font-semibold text-fr-v2-graphite">
              <ProductIdentity product={view.primary} />
            </p>
            <p className="font-mono text-xs text-fr-v2-muted">
              {view.primary.kgText} product · {view.primary.fieldCountText}
            </p>
            {view.supporting.length > 0 ? (
              <ul className="mt-5 flex flex-col border-t border-fr-v2-rule">
                {view.supporting.map((p) => (
                  <li
                    key={p.productKey}
                    className="flex items-baseline justify-between gap-3 border-b border-fr-v2-rule py-2"
                  >
                    <span className="min-w-0 text-sm text-fr-v2-graphite">
                      <ProductIdentity product={p} />
                    </span>
                    <span className="shrink-0 font-mono text-lg tabular-nums text-fr-v2-graphite">
                      {p.tonnesText}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="mt-3 max-w-md font-display text-2xl leading-snug text-fr-v2-graphite">
            {view.emptyMessage}
          </p>
        )}
        <p
          className={cn(
            "mt-4 max-w-xl text-sm",
            view.isWholeFarm ? "text-fr-v2-muted" : "text-fr-v2-harvest-ink",
          )}
        >
          {view.status.message}
        </p>
        <QuantityNotes>
          <p>
            Product quantities, rounded up to the nearest 0.01 t — distinct
            from the nutrient kg beside them.
          </p>
        </QuantityNotes>
      </div>
      <div className="flex flex-col gap-3 border-t border-fr-v2-rule pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
        {supporting}
      </div>
    </section>
  );
}

export function WholeFarmFieldRows({ rows }: { rows: WholeFarmFieldRow[] }) {
  return (
    <ol className="flex flex-col border-t border-fr-v2-rule">
      {rows.map((row) => (
        <li
          key={row.fieldId}
          data-field-row={row.fieldId}
          className="grid grid-cols-1 gap-2 border-b border-fr-v2-rule py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] sm:items-baseline sm:gap-4"
        >
          <div className="min-w-0">
            <Link
              href={row.plannerHref}
              className="flex items-center gap-1.5 font-semibold text-fr-v2-graphite hover:underline"
            >
              <span className="truncate">{row.fieldName}</span>
              <ArrowRight
                className="size-3.5 shrink-0 text-fr-v2-muted"
                aria-hidden
              />
            </Link>
            {row.identityText ? (
              <p className="text-xs text-fr-v2-muted">{row.identityText}</p>
            ) : null}
            {row.requirement ? (
              <p
                className={cn(
                  "text-xs font-semibold",
                  TONE_TEXT[row.requirement.tone],
                )}
              >
                {row.requirement.label}
              </p>
            ) : null}
          </div>
          <div className="min-w-0 text-sm">
            <p
              className={cn(
                "text-xs font-semibold",
                TONE_TEXT[row.purchase.tone],
              )}
            >
              {row.purchase.label}
            </p>
            {row.purchase.contributions.length > 0 ? (
              <ul className="mt-0.5 flex flex-col">
                {row.purchase.contributions.map((c) => (
                  <li
                    key={c.productKey}
                    className="flex justify-between gap-3 text-fr-v2-graphite"
                  >
                    <span className="min-w-0 truncate">
                      {c.name}{" "}
                      <span className="text-fr-v2-muted">
                        ({c.npkAnalysis})
                      </span>
                      {c.provisional ? (
                        <span className="ml-1 text-xs text-fr-v2-harvest-ink">
                          provisional
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums">{c.kgText}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {row.purchase.detail ? (
              <p className="mt-0.5 text-xs text-fr-v2-muted">
                {row.purchase.detail}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold sm:justify-end">
            <Link
              href={row.fieldPlanHref}
              className="text-fr-v2-graphite underline-offset-2 hover:underline"
            >
              Field plan
            </Link>
            {row.canPlanApplication ? (
              <Link
                href={row.plannerHref}
                className="text-fr-v2-forest underline-offset-2 hover:underline"
              >
                Plan application
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function FertiliserPurchasePlan({
  products,
  stillToBuy,
}: {
  products: ProductQuantityView[];
  stillToBuy: StillToBuyLine[];
}) {
  if (products.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Canonical fertiliser requirement by product
        </caption>
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
            <tr
              key={p.productKey}
              data-product={p.productKey}
              className="border-b border-fr-v2-rule align-baseline"
            >
              <td className="py-2 text-fr-v2-graphite">
                <ProductIdentity product={p} />
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-fr-v2-graphite">
                {p.tonnesText}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-fr-v2-muted">
                {p.kgText}
              </td>
              <td className="py-2 text-right text-fr-v2-muted">
                {p.fieldCountText}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-fr-v2-rule pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <Kicker>Still to buy after recorded stock and applications</Kicker>
        {stillToBuy.length === 0 ? (
          <p className="mt-2 text-sm text-fr-v2-muted">
            Nothing left to buy right now — recorded stock, planned and applied
            fertiliser already cover every recommended product this season.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {stillToBuy.map((line) => (
              <li
                key={`${line.product}|${line.npkAnalysis ?? ""}`}
                data-still-to-buy={line.basis}
                className="flex justify-between gap-3 py-1 text-sm text-fr-v2-graphite"
              >
                <span>
                  {line.product}{" "}
                  {line.npkAnalysis ? (
                    <span className="text-fr-v2-muted">
                      ({line.npkAnalysis})
                    </span>
                  ) : null}
                  {line.basis === "stock_not_recorded" ? (
                    <span className="block text-xs text-fr-v2-harvest-ink">
                      Remaining requirement — stock not recorded
                    </span>
                  ) : null}
                </span>
                <span className="font-mono tabular-nums">{line.text}</span>
              </li>
            ))}
          </ul>
        )}
        <QuantityNotes>
          {stillToBuy.some((line) => line.basis === "stock_not_recorded") ? (
            <p>
              Where stock isn&apos;t recorded, the figure is the remaining
              requirement, not a confirmed amount to buy. Record stock to see
              the shortfall.
            </p>
          ) : null}
          <p>Bag quantities aren&apos;t available — no verified bag size.</p>
        </QuantityNotes>
      </div>
    </div>
  );
}

/** Supporting caveats stay one tap away so the default plan stays quiet;
 * the figures and actions they qualify remain visible. */
function QuantityNotes({
  summary = "About these quantities",
  children,
}: {
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="mt-2 text-xs text-fr-v2-muted">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold underline-offset-2 hover:underline">
        {summary}
      </summary>
      <div className="flex flex-col gap-1 pb-1">{children}</div>
    </details>
  );
}

export function PlanHandoffPlane({ view }: { view: PlanHandoffView }) {
  return (
    <section aria-labelledby="plan-handoff-heading" className="py-5 lg:pr-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="plan-handoff-heading"
          className="font-display text-2xl text-fr-v2-graphite"
        >
          {PLAN_HANDOFF.title}
        </h2>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">
          {PLAN_HANDOFF.persistence}
        </span>
      </div>
      <p className="mt-2 text-sm text-fr-v2-graphite">{view.summary}</p>
      <QuantityNotes summary="Why nothing here is saved">
        <p>{PLAN_HANDOFF.message}</p>
      </QuantityNotes>
      <Link
        href="/plan"
        className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-fr-v2-forest underline-offset-2 hover:underline"
      >
        Open Plan <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}

export function MarketHandoffPlane({
  view,
  basket,
  onPrepareQuote,
}: {
  view: MarketHandoffView;
  basket: FarmFertiliserQuoteBasket;
  onPrepareQuote?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Held here so closing and reopening keeps the same request (and id). The
  // request is a copy of the basket: editing it never touches `basket`.
  const [request, setRequest] = useState<FertiliserQuoteRequest | null>(null);
  const [issues, setIssues] = useState<FertiliserQuoteRequestIssue[]>([]);

  return (
    <section
      aria-labelledby="market-handoff-heading"
      className="border-t border-fr-v2-rule py-5 lg:border-t-0 lg:border-l lg:pl-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="market-handoff-heading"
          className="font-display text-2xl text-fr-v2-graphite"
        >
          Market
        </h2>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">
          Supplier quote
        </span>
      </div>
      <p className="mt-2 text-sm text-fr-v2-graphite">{view.coverage}</p>
      <p className="mt-1 text-xs text-fr-v2-muted">{view.separation}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {view.available ? (
          <button
            type="button"
            onClick={() => {
              if (onPrepareQuote) {
                onPrepareQuote();
                return;
              }
              if (!request || request.status === "CANCELLED") {
                const draft = createFertiliserQuoteRequestDraft(basket, {
                  requestId: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                });
                setRequest(draft.ok ? draft.value : null);
                setIssues(draft.ok ? [] : draft.issues);
              }
              setOpen(true);
            }}
            className="min-h-11 rounded-fr-v2-control bg-fr-v2-forest-deep px-4 text-sm font-semibold text-white"
          >
            Prepare supplier quote
          </button>
        ) : null}
        <Link
          href="/quotes"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-fr-v2-forest underline-offset-2 hover:underline"
        >
          All quote requests
        </Link>
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Fertiliser quote request"
      >
        {request ? (
          <FertiliserQuoteRequestFlow
            key={request.requestId}
            request={request}
            onRequestChange={setRequest}
          />
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <QuoteBasketReview basket={basket} />
            <div
              role="alert"
              className="rounded-fr-control bg-fr-attention-bg px-3 py-2.5 text-fr-attention"
            >
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
