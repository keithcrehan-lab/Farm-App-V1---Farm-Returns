"use client";

/**
 * Inputs Market V1 — the farm's calculated feed and fertiliser need beside
 * dated reference prices, with the existing quote workflow as the action.
 *
 * Composition only: every quantity, normalised price and implied cost is
 * produced by `src/domain/inputs-market.ts` (via `getInputsMarketViewAction`
 * for the farm's need) and only formatted here. Request Quote reuses
 * `RequestQuoteSheet` — there is no parallel procurement flow.
 *
 * Reference prices are public, dated figures for like-for-like comparison.
 * They are labelled as such everywhere and never described as a live price
 * or a supplier quote.
 */
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, FlaskConical, Wheat } from "lucide-react";
import { RequestQuoteSheet } from "@/components/farm/RequestQuoteSheet";
import { Kicker } from "@/components/farm-spatial/WholeFarmNutrientPlan";
import { FertiliserBagIcon } from "@/components/shell/FertiliserBagIcon";
import { getInputsMarketViewAction } from "@/app/actions/inputs-market";
import {
  INPUT_MARKET_CATEGORIES,
  INPUT_NEED_BASIS_LABEL,
  catalogueForCategory,
  normaliseUnitPrices,
  type CategoryNeedState,
  type InputCatalogueItem,
  type InputCategoryId,
  type InputNeedLine,
  type InputsMarketView,
} from "@/domain/inputs-market";
import {
  completenessText,
  formatInputTonnes,
  impliedCostText,
  referencePriceProvenance,
  summaryCostText,
} from "@/lib/inputs-market-presentation";
import { formatEur } from "@/lib/format";
import { useIsRealMode } from "@/store/farm-store";
import { cn } from "@/lib/cn";

type LoadState = { status: "loading" } | { status: "ready"; view: InputsMarketView } | { status: "error" };

interface QuoteContext {
  product: string;
  note?: string;
}

const CATEGORY_ICON: Record<InputCategoryId, React.ComponentType<{ className?: string }>> = {
  fertiliser: FertiliserBagIcon,
  feed: Wheat,
};

const CATEGORY_SOURCE_HREF: Record<InputCategoryId, string> = {
  fertiliser: "/fertiliser-plan",
  feed: "/cattle",
};

export function InputsMarketClient({ initialCategory }: { initialCategory?: InputCategoryId } = {}) {
  const isRealMode = useIsRealMode();
  const currentSeason = String(new Date().getUTCFullYear());
  const nextSeason = String(new Date().getUTCFullYear() + 1);
  const [planningSeason, setPlanningSeason] = useState(currentSeason);
  const [category, setCategory] = useState<InputCategoryId>(initialCategory ?? INPUT_MARKET_CATEGORIES[0].id);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [quote, setQuote] = useState<QuoteContext | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a real season/refresh change, not every render.
    setLoad({ status: "loading" });
    if (!isRealMode) return;
    let cancelled = false;
    getInputsMarketViewAction(planningSeason).then(
      (view) => {
        if (!cancelled) setLoad({ status: "ready", view });
      },
      (error: unknown) => {
        console.error("[InputsMarketClient] getInputsMarketViewAction failed:", error);
        if (!cancelled) setLoad({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isRealMode, planningSeason, refreshToken]);

  const view = load.status === "ready" ? load.view : null;
  const activeDefinition = INPUT_MARKET_CATEGORIES.find((c) => c.id === category) ?? INPUT_MARKET_CATEGORIES[0];

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-10 pb-14">
      <header className="flex flex-col gap-5 border-b border-fr-v2-rule pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Kicker>Inputs market{view ? ` · ${view.seasonLabel}` : ""}</Kicker>
          <h1 className="mt-2 max-w-[18ch] font-display text-[42px] leading-[0.98] tracking-[-0.025em] text-fr-v2-graphite lg:text-[58px]">
            Inputs market
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-fr-v2-muted">
            What the farm needs to buy, what it would cost at a dated reference price, and the route to a supplier quote.
          </p>
        </div>
        {isRealMode ? (
          <div className="flex shrink-0 flex-col gap-3 lg:items-end">
            <div role="group" aria-label="Planning season" className="flex items-center gap-5 border-b border-fr-v2-rule">
              {[
                { season: currentSeason, label: `This season · ${currentSeason}` },
                { season: nextSeason, label: `Next season · ${nextSeason}` },
              ].map(({ season, label }) => {
                const active = planningSeason === season;
                return (
                  <button
                    key={season}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPlanningSeason(season)}
                    className={`-mb-px min-h-11 border-b-2 text-xs font-semibold transition-colors ${active ? "border-fr-v2-gold text-fr-v2-graphite" : "border-transparent text-fr-v2-muted hover:text-fr-v2-graphite"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <Link href="/quotes" className="group inline-flex items-center gap-1.5 text-xs font-semibold text-fr-v2-forest hover:underline">
              Your quote requests
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        ) : null}
      </header>

      <div role="tablist" aria-label="Input category" className="grid grid-cols-1 border-t border-fr-v2-graphite sm:grid-cols-2">
        {INPUT_MARKET_CATEGORIES.map((definition) => {
          const Icon = CATEGORY_ICON[definition.id];
          const selected = definition.id === category;
          const need = view?.needs[definition.id];
          return (
            <button
              key={definition.id}
              type="button"
              role="tab"
              id={`inputs-tab-${definition.id}`}
              aria-selected={selected}
              aria-controls={`inputs-panel-${definition.id}`}
              onClick={() => setCategory(definition.id)}
              className={cn(
                "group flex items-center justify-between gap-4 border-b-2 px-1 py-4 text-left transition-colors sm:px-4",
                selected ? "border-fr-v2-gold" : "border-fr-v2-rule hover:bg-fr-v2-paper",
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className={cn("size-5", selected ? "text-fr-v2-forest" : "text-fr-v2-muted group-hover:text-fr-v2-graphite")} />
                <span className="font-display text-xl text-fr-v2-graphite">{definition.label}</span>
              </span>
              <span className="font-mono text-xs text-fr-v2-muted">{need ? tabSummary(need) : null}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`inputs-panel-${category}`} aria-labelledby={`inputs-tab-${category}`} className="flex flex-col gap-12">
        <section aria-labelledby="need-heading" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <StepKicker step="01" id="need-heading">
                Your farm&apos;s need
              </StepKicker>
              <p className="mt-1 font-display text-2xl text-fr-v2-graphite">{activeDefinition.label} to buy</p>
            </div>
            <Link
              href={CATEGORY_SOURCE_HREF[category]}
              className="group inline-flex items-center gap-1.5 text-xs font-semibold text-fr-v2-forest hover:underline"
            >
              From {activeDefinition.needSource.toLowerCase()}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {!isRealMode ? (
            <div className="flex flex-col items-center gap-2 border-y border-dashed border-fr-v2-rule py-10 text-center">
              <FlaskConical className="size-8 text-fr-ink-400" />
              <p className="text-sm font-medium text-fr-ink-900">Sign in to see your farm&apos;s calculated need</p>
              <p className="max-w-sm text-sm text-fr-ink-600">
                The need is calculated from your own fertiliser plan and cattle plans — nothing is shown for a sample farm.
              </p>
            </div>
          ) : load.status === "loading" ? (
            <p className="py-8 text-center text-sm text-fr-ink-600">Loading your farm&apos;s need…</p>
          ) : load.status === "error" ? (
            <div className="border-y border-fr-v2-rule py-6">
              <p className="text-sm text-fr-ink-600">Farm Return couldn&apos;t load your inputs right now — try again shortly.</p>
              <button type="button" onClick={refresh} className="mt-3 rounded-full border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-900">
                Retry
              </button>
            </div>
          ) : (
            <CategoryNeed
              category={category}
              need={load.view.needs[category]}
              onRequestQuote={(line) => setQuote(quoteContextForLine(line))}
            />
          )}
        </section>

        <section aria-labelledby="prices-heading" className="flex flex-col gap-5">
          <div>
            <StepKicker step="02" id="prices-heading">
              Reference prices
            </StepKicker>
            <p className="mt-1 font-display text-2xl text-fr-v2-graphite">Compare like for like</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fr-v2-muted">
              Dated public figures, normalised per tonne, per kilogram and per kilogram of nutrient. They are not live prices or supplier quotes —
              request a quote for a current price.
            </p>
          </div>
          <ReferencePriceTable
            items={catalogueForCategory(category)}
            onRequestQuote={isRealMode ? (item) => setQuote({ product: item.quoteProductName }) : undefined}
          />
        </section>
      </div>

      <RequestQuoteSheet
        open={quote !== null}
        onClose={() => setQuote(null)}
        onSubmitted={() => setQuote(null)}
        planningSeason={planningSeason}
        initialProduct={quote?.product}
        contextNote={quote?.note}
      />
    </div>
  );
}

function StepKicker({ step, id, children }: { step: string; id?: string; children: ReactNode }) {
  return (
    <Kicker className="flex items-baseline gap-3">
      <span className="font-mono font-medium tracking-normal text-fr-v2-gold">{step}</span>
      <span id={id}>{children}</span>
    </Kicker>
  );
}

function tabSummary(need: CategoryNeedState): string {
  if (need.status !== "ready") return "Unavailable";
  if (need.summary.lines.length === 0) return need.summary.gaps.length > 0 ? "Needs input" : "Nothing to buy";
  return `${formatInputTonnes(need.summary.totalToBuyKg)} · ${summaryCostText(need.summary)}`;
}

/** Fertiliser preselects the RFQ estimate option; feed only names the
 * product and shows the calculated figure for the farmer to confirm. */
function quoteContextForLine(line: InputNeedLine): QuoteContext {
  if (line.category === "fertiliser") return { product: line.quoteProductName };
  return {
    product: line.quoteProductName,
    note: `${line.label}: about ${formatInputTonnes(line.toBuyKg)} of concentrate${line.horizon ? ` (${line.horizon.toLowerCase()})` : ""}, from ${INPUT_NEED_BASIS_LABEL[line.basis].toLowerCase()}. Enter the quantity you want quoted.`,
  };
}

function CategoryNeed({
  category,
  need,
  onRequestQuote,
}: {
  category: InputCategoryId;
  need: CategoryNeedState;
  onRequestQuote: (line: InputNeedLine) => void;
}) {
  if (need.status === "unavailable") {
    return <p className="border-y border-fr-v2-rule py-6 text-sm text-fr-ink-600">{need.message}</p>;
  }
  const { summary, disclosure } = need;
  const partial = completenessText(summary);

  if (summary.lines.length === 0 && summary.gaps.length === 0) {
    return (
      <p data-testid="need-empty" className="border-y border-dashed border-fr-v2-rule py-8 text-center text-sm text-fr-ink-600">
        {category === "fertiliser"
          ? "Nothing left to buy — your fertiliser plan has no remaining product requirement."
          : "No cattle groups to size a feed need for yet."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {summary.lines.length > 0 ? (
        <dl data-testid="need-summary" className="flex flex-wrap items-end gap-x-12 gap-y-4">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">To buy</dt>
            <dd className="mt-1 font-display text-4xl text-fr-v2-graphite">{formatInputTonnes(summary.totalToBuyKg)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">At reference prices</dt>
            <dd className="mt-1 font-display text-4xl text-fr-v2-graphite">{summaryCostText(summary)}</dd>
          </div>
        </dl>
      ) : null}
      {partial || disclosure ? (
        <p role="note" className="max-w-2xl border-l-2 border-fr-v2-harvest pl-3 text-xs leading-relaxed text-fr-v2-graphite">
          {[partial, disclosure].filter(Boolean).join(" ")}
        </p>
      ) : null}

      {summary.lines.length > 0 ? (
        <ul className="flex flex-col border-t border-fr-v2-graphite">
          {summary.lines.map((line) => (
            <NeedRow key={line.id} line={line} onRequestQuote={() => onRequestQuote(line)} />
          ))}
        </ul>
      ) : null}

      {summary.gaps.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">Not yet sized</p>
          <ul className="flex flex-col border-t border-fr-v2-rule">
            {summary.gaps.map((gap) => (
              <li key={gap.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-fr-v2-rule py-3">
                <span className="text-sm text-fr-v2-graphite">
                  <span className="font-semibold">{gap.label}</span>
                  <span className="text-fr-v2-muted"> — {gap.reason}</span>
                </span>
                <Link href={gap.action.href} className="group inline-flex items-center gap-1.5 text-xs font-semibold text-fr-v2-forest hover:underline">
                  {gap.action.label}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NeedRow({ line, onRequestQuote }: { line: InputNeedLine; onRequestQuote: () => void }) {
  const [open, setOpen] = useState(false);
  const hasDetail = line.details.length > 0 || line.notes.length > 0;
  return (
    <li data-testid="need-row" className="border-b border-fr-v2-rule transition-colors hover:bg-fr-v2-paper">
      <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fr-v2-graphite">{line.label}</p>
          <p className="mt-0.5 truncate text-xs text-fr-v2-muted">
            {[line.specification, INPUT_NEED_BASIS_LABEL[line.basis], line.horizon].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">
            {line.stock === "recorded" ? "To buy after stock" : "Required"}
          </p>
          <p className="font-mono text-sm text-fr-v2-graphite">{formatInputTonnes(line.toBuyKg)}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">At reference</p>
          <p className="font-mono text-sm text-fr-v2-graphite">{impliedCostText(line.impliedCost)}</p>
          {line.planPriceCost ? (
            <p className="text-xs text-fr-v2-muted">
              {formatEur(line.planPriceCost.eur)} at your plan&apos;s €{line.planPriceCost.eurPerTonne}/t
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          {hasDetail ? (
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} detail for ${line.label}`}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex size-9 items-center justify-center rounded-full text-fr-v2-muted transition-colors hover:bg-fr-v2-stone hover:text-fr-v2-graphite"
            >
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRequestQuote}
            className="group inline-flex min-h-9 items-center gap-1.5 rounded-full bg-fr-v2-forest px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Request quote
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
      {open ? (
        <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2 sm:px-2">
          {line.details.length > 0 ? (
            <dl className="flex flex-col gap-1 text-xs">
              {line.details.map((detail, i) => (
                <div key={`${detail.label}-${i}`} className="flex justify-between gap-4 border-b border-dashed border-fr-v2-rule pb-1">
                  <dt className="text-fr-v2-muted">{detail.label}</dt>
                  <dd className="font-mono text-fr-v2-graphite">{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <div className="flex flex-col gap-1 text-xs text-fr-v2-muted">
            {line.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            {line.impliedCost.status === "known" ? (
              <p>Costed at €{line.impliedCost.eurPerTonne}/t reference — an indication, not a quote.</p>
            ) : (
              <p>{line.impliedCost.reason}</p>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ReferencePriceTable({ items, onRequestQuote }: { items: InputCatalogueItem[]; onRequestQuote?: (item: InputCatalogueItem) => void }) {
  return (
    <ul data-testid="reference-prices" className="flex flex-col border-t border-fr-v2-graphite">
      {items.map((item) => {
        const prices = normaliseUnitPrices(item);
        const price = item.referencePrice;
        return (
          <li
            key={item.id}
            data-testid="reference-price-row"
            className="grid grid-cols-1 gap-3 border-b border-fr-v2-rule py-4 transition-colors hover:bg-fr-v2-paper sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_auto] sm:items-center sm:gap-6 sm:px-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fr-v2-graphite">{item.name}</p>
              <p className="mt-0.5 text-xs text-fr-v2-muted">{item.specification}</p>
            </div>
            <div className="min-w-0">
              {prices ? (
                <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm text-fr-v2-graphite">
                  <span>€{prices.eurPerTonne}/t</span>
                  <span className="text-fr-v2-muted">€{prices.eurPerKg.toFixed(2)}/kg</span>
                  {prices.eurPerKgNutrient ? (
                    <span className="text-fr-v2-muted">
                      €{prices.eurPerKgNutrient.value.toFixed(2)}/kg {prices.eurPerKgNutrient.label}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-sm text-fr-v2-muted">Price not sourced</p>
              )}
              <p className="mt-0.5 text-[11px] text-fr-v2-muted">
                {price.status === "available" ? (
                  <a href={price.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    {referencePriceProvenance(price)}
                  </a>
                ) : (
                  price.reason
                )}
                {price.status === "available" && price.caveat ? <span> — {price.caveat}</span> : null}
              </p>
            </div>
            {onRequestQuote ? (
              <button
                type="button"
                aria-label={`Request quote for ${item.name}`}
                onClick={() => onRequestQuote(item)}
                className="group inline-flex min-h-9 items-center gap-1.5 justify-self-start rounded-full border border-fr-v2-rule px-4 text-xs font-semibold text-fr-v2-graphite transition-colors hover:border-fr-v2-forest hover:text-fr-v2-forest sm:justify-self-end"
              >
                Request quote
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
