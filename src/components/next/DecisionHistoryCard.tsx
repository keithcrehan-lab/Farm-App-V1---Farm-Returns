"use client";

import { CheckCircle2, MinusCircle, Pencil } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/lib/status";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import { EVIDENCE_STATE_UI_LABEL } from "@/domain/evidence";

/**
 * Records extension, Farm Return Next v1.1 — the real Decide-stage
 * history for decisions with no Act-stage job attached
 * (`listDecisionsForFarm`'s own doc comment, `src/lib/farm-data/
 * decisions.ts`, explains exactly why this is a separate card from
 * `JobHistoryCard` rather than a shared component: a job is optional, a
 * decision is not). Presentational only — every value here already comes
 * from a real persisted `decisions` row; nothing is computed here.
 *
 * `calculationKind` is a free-form, ever-growing string (`Prompt.kind`'s
 * own doc comment) — humanised for the four real kinds this app produces
 * today, with an honest generic fallback for any future one, the same
 * pattern `JobHistoryCard`'s `humanizeJobType` already uses for
 * `job_type`.
 *
 * **Phase D (Evidence Ledger/provenance UX, 2026-09-03) — a real "why
 * this number, later" gap closed.** `DecisionRecord` has always carried
 * `estimateSnapshot`/`calculationVersion`/`inputsSnapshot` (the exact
 * same real evidence `ExpandedPromptSheet.tsx`'s own "Evidence checked"
 * box already shows a farmer *at decide time*), but this row never
 * rendered any of it — once a decision was accepted/dismissed, its own
 * evidence tier and calculation version vanished from view entirely.
 * `DecisionRow` now shows the real evidence tier (`estimateSnapshot`'s
 * own `evidenceState` when `status === "OK"`, using the identical
 * `EVIDENCE_STATE_UI_LABEL` vocabulary/Pill styling
 * `ExpandedPromptSheet.tsx` already established — never a new tier
 * taxonomy) and the real calculation version, when either is present.
 * Building nothing new: every value here was already persisted and
 * already reaching this component; the row simply stopped discarding it.
 */
function humanizeCalculationKind(kind: string): string {
  switch (kind) {
    case "spreading_window":
      return "Spreading window";
    case "soil_test_age":
      return "Soil test age";
    case "commonage_status":
      return "Commonage status";
    case "local_buffer_override":
      return "Local buffer override";
    default:
      return kind.replace(/_/g, " ");
  }
}

function outcomeTone(outcome: DecisionRecord["outcome"]): StatusTone {
  switch (outcome) {
    case "accepted":
      return "good";
    case "edited":
      return "info";
    case "dismissed":
      return "neutral";
  }
}

const outcomeIcon: Record<DecisionRecord["outcome"], typeof CheckCircle2> = {
  accepted: CheckCircle2,
  edited: Pencil,
  dismissed: MinusCircle,
};

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

/** Exported so `RecordsPageClient` can render one true
 * chronologically-merged timeline across jobs and decisions — see
 * `JobHistoryRow`'s identical export note (`JobHistoryCard.tsx`). */
export function DecisionRow({ decision }: { decision: DecisionRecord }) {
  const Icon = outcomeIcon[decision.outcome];
  // Phase D (Evidence Ledger/provenance UX, 2026-09-03): the same real
  // evidence tier ExpandedPromptSheet.tsx's own Pill already shows a
  // farmer at decide time — never fabricated here, only ever rendered
  // when `estimateSnapshot` genuinely is the `"OK"` branch that actually
  // carries one.
  const evidenceState = decision.estimateSnapshot.status === "OK" ? decision.estimateSnapshot.evidenceState : undefined;
  return (
    <li className="flex items-start gap-3 border-t border-fr-border py-3 first:border-t-0 first:pt-0">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-fr-surface-alt">
        <Icon className="size-4 text-fr-ink-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-fr-ink-900">{humanizeCalculationKind(decision.calculationKind)}</span>
          <Pill tone={outcomeTone(decision.outcome)}>
            {decision.outcome === "accepted" ? "Accepted" : decision.outcome === "edited" ? "Edited" : "Dismissed"}
          </Pill>
          {evidenceState ? <Pill tone="good">{EVIDENCE_STATE_UI_LABEL[evidenceState]}</Pill> : null}
        </div>
        {/* Raw field id, not a resolved name — this reader has no
            joined field table (see this file's own header comment on
            JobHistoryCard's identical, already-audited precedent for
            weightObservation's animalId). */}
        {decision.fieldId ? <p className="mt-0.5 text-sm text-fr-ink-600">Field {decision.fieldId}</p> : null}
        {decision.calculationVersion ? (
          <p className="mt-0.5 text-xs text-fr-ink-400">Calculation version: {decision.calculationVersion}</p>
        ) : null}
        <p className="mt-0.5 text-xs text-fr-ink-400">{formatDate(decision.decidedAt)}</p>
      </div>
    </li>
  );
}

export function DecisionHistoryCard({
  decisions,
  unavailable = false,
  truncated = false,
}: {
  decisions: DecisionRecord[];
  unavailable?: boolean;
  truncated?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Decisions</CardTitle>
      </CardHeader>
      {unavailable ? (
        <p className="py-6 text-center text-sm text-fr-ink-400">Decision history is temporarily unavailable — try again shortly.</p>
      ) : decisions.length === 0 ? (
        <p className="py-6 text-center text-sm text-fr-ink-400">
          No decisions recorded yet — accepting or dismissing a Prompt will appear here.
        </p>
      ) : (
        <>
          <ul>
            {decisions.map((d) => (
              <DecisionRow key={d.id} decision={d} />
            ))}
          </ul>
          {truncated ? (
            <p className="mt-3 text-center text-xs text-fr-ink-400">
              Showing the most recent {decisions.length} decisions — older history exists but isn&apos;t shown here yet.
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
