"use client";

import { CheckCircle2, MinusCircle, Pencil } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/lib/status";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import { EVIDENCE_STATE_UI_LABEL, isEvidenceState } from "@/domain/evidence";

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
 * taxonomy), the real calculation version, and (Codex audit round 1,
 * MEDIUM) the real `inputsSnapshot` as a compact `key=value` summary
 * line — the same inputs the farmer already saw at decide time,
 * previously the one field of the three this row still discarded.
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

/**
 * Codex audit round 1 of Phase D (MEDIUM): `inputsSnapshot` is the real
 * inputs a calculation acted upon — already persisted, already reaching
 * this component, and already shown to the farmer at decide time
 * (`ExpandedPromptSheet.tsx`'s own "Evidence checked" box) — but this
 * history row discarded it entirely, same as it discarded
 * `evidenceState`/`calculationVersion` before this phase's own first
 * fix. A single-line, comma-joined `key=value` summary (not
 * `ExpandedPromptSheet`'s own multi-row `<dl>`) keeps this dense history
 * row's own established one-line-per-fact density rather than growing a
 * many-row detail block into every entry of a long, scrolling list.
 */
function formatInputsSnapshot(snapshot: Record<string, unknown> | undefined): string | undefined {
  if (!snapshot) return undefined;
  const entries = Object.entries(snapshot);
  if (entries.length === 0) return undefined;
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
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
  // carries one. `isEvidenceState` (Codex audit round 1, HIGH) fails
  // closed against a persisted-but-malformed dismissed decision — the
  // real database CHECK only validates this shape when `outcome <>
  // 'dismissed'`, so a genuinely stored `{status:"OK",
  // evidenceState:"garbage"}` on a dismissed row must render no tier at
  // all, not an empty/undefined tag.
  const rawEvidenceState = decision.estimateSnapshot.status === "OK" ? decision.estimateSnapshot.evidenceState : undefined;
  const evidenceState = isEvidenceState(rawEvidenceState) ? rawEvidenceState : undefined;
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
        {formatInputsSnapshot(decision.inputsSnapshot) ? (
          <p className="mt-0.5 truncate text-xs text-fr-ink-400">Inputs: {formatInputsSnapshot(decision.inputsSnapshot)}</p>
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
