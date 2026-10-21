"use client";

/**
 * Cattle C10 — profile sections that only render view-model fields: health
 * and compliance, direct costs, and the activity timeline.
 */

import { TIMELINE_CLASS_LABEL, formatEuro, type AnimalProfileVM, type CostVM, type TimelineClass, type TimelineEntryVM } from "@/domain/cattle/presentation";
import { Disclosure, StateLabel, cattleStyles } from "./ui";

export function HealthSection({ health }: { health: AnimalProfileVM["health"] }) {
  return (
    <dl className="divide-y divide-fr-v2-rule">
      {health.medicines.state === "UNAVAILABLE" ? (
        <div className={`px-3 py-3 text-sm text-fr-v2-charcoal ${cattleStyles.hatch}`}>Health records couldn&apos;t be read for this animal, so withdrawal and treatment status are unknown.</div>
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
        <dt className="text-sm text-fr-v2-muted">Medicine withdrawal ({health.withdrawal.product.toLowerCase()})</dt>
        <dd className="text-right">
          <StateLabel state={health.withdrawal.state} />
          {health.withdrawal.untilLabel ? <div className="text-sm text-fr-v2-charcoal">{health.withdrawal.untilLabel}</div> : null}
        </dd>
      </div>
      {health.programmes.state === "UNAVAILABLE" || health.obligations.state === "UNAVAILABLE" ? (
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-sm text-fr-v2-muted">Programmes and requirements</dt>
          <dd className="text-right text-sm text-fr-v2-charcoal">Couldn&apos;t be checked — the evaluation didn&apos;t run, so their status is unknown.</dd>
        </div>
      ) : null}
      {(health.programmes.state === "KNOWN" ? health.programmes.value : []).map((p) => (
        <div key={p.label} className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-sm text-fr-v2-muted">{p.label}</dt>
          <dd>
            <StateLabel state={p.state} />
          </dd>
        </div>
      ))}
      {(health.obligations.state === "KNOWN" ? health.obligations.value : []).map((o) => (
        <div key={o.label} className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-sm text-fr-v2-muted">{o.label}</dt>
          <dd>
            <StateLabel state={o.state} />
          </dd>
        </div>
      ))}
      {health.programmes.state === "KNOWN" && health.programmes.value.length === 0 ? (
        <div className="py-3 text-sm text-fr-v2-muted">Not in any declared veterinary programme.</div>
      ) : null}
      {health.medicines.state === "KNOWN" && health.medicines.value.length > 0 ? (
        <div className="py-3">
          <Disclosure label={`${health.medicines.value.length} medicine record${health.medicines.value.length === 1 ? "" : "s"}`}>
            <ul className="space-y-2 text-sm">
              {health.medicines.value.map((m) => (
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
                <span className="text-fr-v2-muted">None recorded</span>
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
        {formatEuro(costs.direct)} charged directly · {formatEuro(costs.allocated)} allocated from shared costs. Recorded entries only{costs.noneRecorded.length > 0 ? ` — nothing recorded for ${costs.noneRecorded.join(", ")}` : ""}. Labour, land, finance and overheads are not included. Demonstration figures.
      </p>
    </div>
  );
}

const CLASS_STYLE: Record<TimelineClass, string> = {
  FACT: "bg-fr-v2-graphite text-white",
  OBSERVATION: "bg-fr-v2-forest/10 text-fr-v2-forest",
  INTENT: "bg-fr-v2-plum-tint text-fr-v2-plum",
  DERIVED: "bg-fr-v2-cobalt-tint text-fr-v2-cobalt",
  RECOMMENDATION: "bg-fr-v2-harvest-tint text-fr-v2-harvest-ink",
  COST: "bg-fr-v2-stone text-fr-v2-charcoal",
};

export function TimelineSection({ entries, freshIds, gaps = [] }: { entries: TimelineEntryVM[]; freshIds: Set<string>; gaps?: string[] }) {
  const gapNote = gaps.length > 0 ? <p className="mb-2 text-sm text-fr-v2-charcoal">Not shown: {gaps.join("; ")}.</p> : null;
  if (entries.length === 0) return gapNote ?? <p className="text-sm text-fr-v2-muted">No dated records for this animal yet.</p>;
  const first = entries.slice(0, 8);
  const rest = entries.slice(8);
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
      {gapNote}
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
