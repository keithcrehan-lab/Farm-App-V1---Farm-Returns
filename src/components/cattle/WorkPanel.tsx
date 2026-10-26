"use client";

/**
 * Cattle C10 — "What needs attention": ONE dominant item (the first open Plan
 * job in Plan-kernel priority order), the rest collapsed. "Why?" opens in
 * layers: why it matters → evidence and assumptions → technical provenance.
 * A recommended window is labelled as such; "Must be done before" appears only
 * for a sourced hard deadline.
 */

import type { AnimalProfileVM, WorkVM } from "@/domain/cattle/presentation";
import { Disclosure, StateLabel, cattleStyles } from "./ui";

/** The layered "Why?" of one job (also used by the Living Animal Record's open-work line). */
export function WorkWhy({ work }: { work: WorkVM }) {
  const w = work.why;
  return (
    <div className="space-y-3 border-l-2 border-fr-v2-rule pl-4 text-sm text-fr-v2-charcoal">
      <p>{w.summary}</p>
      <p className="text-fr-v2-muted">{w.raised.label}</p>
      {w.raised.text !== null ? <p>{w.raised.text}</p> : null}
      {w.origins.length > 0 ? <p className="text-fr-v2-muted">From: {w.origins.join(" + ")}</p> : null}
      {w.evidence.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4">
          {w.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <p>
        <span className="font-medium">How it closes: </span>
        {w.completionRule}
      </p>
      {w.caveats.length > 0 ? (
        <div>
          <div className="font-medium">Assumptions and limits</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-fr-v2-muted">
            {w.caveats.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {w.sources.length > 0 ? (
        <div>
          <div className="font-medium">Sources</div>
          <ul className="mt-1 space-y-0.5 text-fr-v2-muted">
            {w.sources.map((s) => (
              <li key={`${s.label}${s.detail}`}>
                {s.label} — {s.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Disclosure label="Technical detail">
        <dl className="grid grid-cols-1 gap-y-1 break-all font-mono text-[11px] text-fr-v2-muted">
          {w.technical.map((t, i) => (
            <div key={i}>
              <dt className="inline font-semibold">{t.label}: </dt>
              <dd className="inline">{t.value}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>
    </div>
  );
}

function Timing({ work }: { work: WorkVM }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {work.hardDeadline.state === "HARD_DEADLINE" ? <span className="font-semibold text-[#b23a2b]">{work.hardDeadline.label}</span> : null}
      {work.window.state === "RECOMMENDED" ? <span className="text-fr-v2-muted">{work.window.label}</span> : null}
    </div>
  );
}

export function WorkPanel({ work, onRecordWeight, resolvedTitles }: { work: AnimalProfileVM["work"]; onRecordWeight: (() => void) | null; resolvedTitles: string[] }) {
  const open = work.open;
  if (open.state === "UNAVAILABLE") {
    return (
      <div className={`px-4 py-4 ${cattleStyles.hatch}`} role="status">
        <p className="font-semibold text-fr-v2-graphite">We couldn&apos;t work out this animal&apos;s jobs.</p>
        <p className="mt-1 text-sm text-fr-v2-charcoal">One of the cattle records couldn&apos;t be read, so the whole planning run stopped rather than guess. No job is shown — that doesn&apos;t mean there&apos;s nothing to do.</p>
        <p className="mt-2 font-mono text-[11px] text-fr-v2-muted">{open.failureCodes.slice(0, 3).join(" · ")}</p>
      </div>
    );
  }
  return (
    <div>
      {resolvedTitles.length > 0 ? (
        <p className={`mb-3 flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-fr-v2-forest ${cattleStyles.resolve}`} role="status">
          <span aria-hidden>✓</span> {resolvedTitles.join(", ")} — closed by your new record.
        </p>
      ) : null}
      {open.state === "EMPTY" ? (
        <div data-work-state={open.state}>
          <p className="text-lg font-semibold text-fr-v2-graphite">{open.display.label}</p>
          {open.display.detail ? <p className="mt-1 text-sm text-fr-v2-muted">{open.display.detail}</p> : null}
        </div>
      ) : (
        <PrimaryJob p={open.primary} onRecordWeight={onRecordWeight} />
      )}
      {open.state === "ITEMS" && open.othersLabel ? (
        <div className="mt-4 border-t border-fr-v2-rule pt-2">
          <Disclosure label={open.othersLabel}>
            <ul className="divide-y divide-fr-v2-rule">
              {open.others.map((o) => (
                <li key={o.jobId} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-fr-v2-graphite">{o.title}</span>
                    <StateLabel state={o.headlineState} />
                  </div>
                  <Timing work={o} />
                  <Disclosure label="Why?">
                    <WorkWhy work={o} />
                  </Disclosure>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      ) : null}
      {work.closed.length > 0 ? (
        <div className="mt-2">
          <Disclosure label={`${work.closed.length} closed`}>
            <ul className="divide-y divide-fr-v2-rule">
              {work.closed.map((c) => (
                <li key={c.jobId} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="text-fr-v2-graphite">{c.title}</span>
                  <span className="text-fr-v2-muted">{c.completed.label}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      ) : null}
    </div>
  );
}

function PrimaryJob({ p, onRecordWeight }: { p: WorkVM; onRecordWeight: (() => void) | null }) {
  return (
    <div className={cattleStyles.settle} key={p.jobId}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StateLabel state={p.priority} />
        <StateLabel state={p.headlineState} />
      </div>
      <h3 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-fr-v2-graphite">{p.title}</h3>
      <p className="mt-1 text-[15px] text-fr-v2-charcoal">{p.why.summary}</p>
      {p.why.raised.text !== null ? <p className="mt-1 text-sm text-fr-v2-muted">{p.why.raised.text}</p> : null}
      <div className="mt-2">
        <Timing work={p} />
      </div>
      {p.blockers.map((b) => (
        <p key={b.text} className="mt-2 text-sm text-fr-v2-charcoal">
          {b.text}
        </p>
      ))}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {p.actionKind === "RECORD_WEIGHT" && onRecordWeight ? (
          <button type="button" onClick={onRecordWeight} className="min-h-12 rounded-[8px] bg-fr-v2-forest px-6 text-base font-semibold text-white">
            Record weight
          </button>
        ) : null}
        <Disclosure label="Why?">
          <WorkWhy work={p} />
        </Disclosure>
      </div>
    </div>
  );
}
