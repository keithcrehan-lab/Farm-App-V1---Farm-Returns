"use client";

/**
 * Cattle C10 — profile sections that only render view-model fields: health
 * and compliance, direct costs, and the activity timeline.
 */

import { TIMELINE_CLASS_LABEL, formatEuro, type AnimalProfileVM, type CostVM, type DisplayState, type Listing, type TimelineClass, type TimelineEntryVM, splitItems } from "@/domain/cattle/presentation";
import { Disclosure, StateLabel, cattleStyles } from "./ui";

/** One health row per programme / requirement: its state; or the listing's EMPTY / UNAVAILABLE state as one row. */
function ContextRows({ title, listing }: { title: string; listing: Listing<{ label: string; state: DisplayState }> }) {
  if (listing.state !== "ITEMS") {
    return (
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
        <dt className="text-sm text-fr-v2-muted">{title}</dt>
        <dd className="text-right">
          <StateLabel state={listing.display} detail={listing.state === "UNAVAILABLE"} />
        </dd>
      </div>
    );
  }
  return (
    <>
      {listing.items.map((p) => (
        <div key={p.label} className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-sm text-fr-v2-muted">{p.label}</dt>
          <dd>
            <StateLabel state={p.state} />
          </dd>
        </div>
      ))}
    </>
  );
}

export function HealthSection({ health }: { health: AnimalProfileVM["health"] }) {
  const { medicines } = health;
  return (
    <dl className="divide-y divide-fr-v2-rule">
      {medicines.state === "UNAVAILABLE" ? <div className={`px-3 py-3 text-sm text-fr-v2-charcoal ${cattleStyles.hatch}`}>{medicines.display.detail ?? medicines.display.label}</div> : null}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
        <dt className="text-sm text-fr-v2-muted">Medicine withdrawal ({health.withdrawal.product.toLowerCase()})</dt>
        <dd className="text-right">
          <StateLabel state={health.withdrawal.state} />
          {health.withdrawal.untilLabel ? <div className="text-sm text-fr-v2-charcoal">{health.withdrawal.untilLabel}</div> : null}
        </dd>
      </div>
      <ContextRows title="Veterinary programmes" listing={health.programmes} />
      <ContextRows title="Requirements" listing={health.obligations} />
      {medicines.state === "ITEMS" ? (
        <div className="py-3">
          <Disclosure label={health.medicinesLabel ?? medicines.items[0].label}>
            <ul className="space-y-2 text-sm">
              {medicines.items.map((m) => (
                <li key={`${m.date}${m.product}`} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span>
                    {m.label} · {m.product}
                  </span>
                  <span className="text-fr-v2-muted">{m.withdrawalEndLabel ?? m.withdrawal.label}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      ) : medicines.state === "EMPTY" ? (
        <div className="py-3">
          <StateLabel state={medicines.display} />
        </div>
      ) : null}
    </dl>
  );
}

export function CostSection({ costs }: { costs: CostVM }) {
  if (costs.state === "UNAVAILABLE") return <p className={`px-3 py-3 text-sm text-fr-v2-charcoal ${cattleStyles.hatch}`}>{costs.text}</p>;
  if (costs.state !== "RECORDED") return <p className="text-sm text-fr-v2-charcoal">{costs.text}</p>;
  return (
    <div>
      <dl className="divide-y divide-fr-v2-rule">
        {costs.categories.map((c) => (
          <div key={c.category} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-sm text-fr-v2-graphite">{c.label}</dt>
            <dd className="text-right text-sm tabular-nums">
              {c.amount.state === "NONE_RECORDED" ? (
                <span className="text-fr-v2-muted">{c.amount.label}</span>
              ) : (
                <>
                  <span className="font-medium text-fr-v2-graphite">{formatEuro(c.amount.value)}</span>
                  {c.amount.allocated !== null ? <span className="ml-2 text-[12px] text-fr-v2-muted">{c.amount.allAllocated ? "allocated" : `incl. ${formatEuro(c.amount.allocated)} allocated`}</span> : null}
                </>
              )}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-sm font-semibold text-fr-v2-graphite">Recorded direct costs</dt>
          <dd className="text-lg font-semibold tabular-nums text-fr-v2-graphite">{formatEuro(costs.total)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-[12px] text-fr-v2-muted">
        {formatEuro(costs.direct)} charged directly · {formatEuro(costs.allocated)} allocated from shared costs. {costs.breakdownNote}
      </p>
    </div>
  );
}

const CLASS_STYLE: Record<TimelineClass, string> = {
  FACT: "bg-fr-v2-graphite text-white",
  OBSERVATION: "bg-fr-v2-forest/10 text-fr-v2-forest",
  INTENT: "bg-fr-v2-plum-tint text-fr-v2-plum",
  DERIVED: "bg-fr-v2-cobalt-tint text-fr-v2-cobalt",
  PREDICTION: "bg-fr-v2-cobalt-tint text-fr-v2-cobalt",
  RULE: "bg-fr-v2-stone text-fr-v2-charcoal",
  OBLIGATION: "bg-fr-v2-harvest-tint text-fr-v2-harvest-ink",
  RECOMMENDATION: "bg-fr-v2-harvest-tint text-fr-v2-harvest-ink",
  COST: "bg-fr-v2-stone text-fr-v2-charcoal",
  RECORD: "bg-fr-v2-stone text-fr-v2-charcoal",
};

export function TimelineSection({ timeline, freshIds, gapNote }: { timeline: Listing<TimelineEntryVM>; freshIds: Set<string>; gapNote: string | null }) {
  const note = gapNote ? <p className="mb-2 text-sm text-fr-v2-charcoal">{gapNote}</p> : null;
  if (timeline.state !== "ITEMS") {
    return (
      <div>
        {note}
        <StateLabel state={timeline.display} />
      </div>
    );
  }
  const { head: first, rest } = splitItems(timeline.items, 8);
  const Row = ({ e }: { e: TimelineEntryVM }) => (
    <li className={`grid grid-cols-[84px_1fr] gap-3 py-2.5 ${freshIds.has(e.id) ? cattleStyles.resolve : ""}`}>
      <span className="text-[13px] tabular-nums text-fr-v2-muted">{e.dateLabel.replace(/ \d{4}$/, "")}</span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`text-[15px] text-fr-v2-graphite ${e.marker === "SUPERSEDED" ? "line-through decoration-fr-v2-muted" : ""}`}>{e.title}</span>
          <span className={`rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium ${CLASS_STYLE[e.infoClass]}`}>{e.classLabel}</span>
          {e.marker === "CONFLICT" ? <span className="text-[11px] font-medium text-fr-v2-clay">Disagrees with another record</span> : null}
          {e.marker === "SUPERSEDED" ? <span className="text-[11px] text-fr-v2-muted">Corrected</span> : null}
        </span>
        {e.detail ? <span className="block text-[13px] text-fr-v2-muted">{e.detail}</span> : null}
      </span>
    </li>
  );
  return (
    <div>
      {note}
      <ul className="divide-y divide-fr-v2-rule">
        {first.map((e) => (
          <Row key={e.id} e={e} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <Disclosure label={`${rest.length} earlier`}>
          <ul className="divide-y divide-fr-v2-rule">
            {rest.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </ul>
        </Disclosure>
      ) : null}
      <p className="mt-2 text-[12px] text-fr-v2-muted">
        Assembled from dated records ({Object.values(TIMELINE_CLASS_LABEL).join(", ").toLowerCase()}); not a complete event log.
      </p>
    </div>
  );
}
