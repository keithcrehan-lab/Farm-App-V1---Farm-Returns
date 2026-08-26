"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileSearch } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/lib/status";
import { calculateNutrientPlanWithTrace } from "@/domain/nutrient-plan-trace";
import { createLocalStorageAuditTraceStore } from "@/domain/audit-trace-local-storage";
import { createLocalStoragePeerReviewStore } from "@/domain/peer-review-local-storage";
import type { CalculationRun, DecisionRecord, DecisionType, PeerReview } from "@/domain/audit-trace";
import { mockSilagePlans } from "@/data/mock-farm";
import { useFields, useLivestockGroups } from "@/store/farm-store";

/** Module-level (not inside a component body) so the impure `Date.now()`
 * call here is never mistaken for a render-time call — same convention
 * `farm-store.tsx`'s own `newId()` helper already uses. Only ever invoked
 * from an event handler (`DecisionRow`'s `setReview`), never during
 * render. */
function nextPeerReviewId(recommendationId: string): string {
  return `PR_${recommendationId}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Scientific engine V3 — Phase J: the first real screen surface reading
 * persisted `CalculationRun`s (Phase I) and supporting peer review
 * (`RECOMMENDATION_AUDIT_REPORT_SPEC.md`). Every recommendation this app
 * currently traces (Phase I: the NAP N/P compliance decision) is listed
 * here with a "Why?" drilldown showing its real inputs, calculation
 * steps, compliance checks and sources — never a short AI-style summary
 * standing alone (spec's own "A report that only states an action and a
 * short AI explanation is not acceptable").
 *
 * "Generate audit trace" is a deliberate button, not automatic
 * per-render tracing — `calculateNutrientPlanWithTrace` is a real,
 * non-trivial calculation and each call needs a genuinely new run id;
 * calling it on every React render (this screen re-renders on every farm
 * -data change) would flood `localStorage` with near-duplicate runs for
 * no farmer benefit. A future phase may add a more targeted "save this
 * plan" trigger per screen; this button is the honest, working
 * placeholder for that until then.
 */
export function RecommendationAuditTrailCard() {
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const [runs, setRuns] = useState<CalculationRun[]>([]);
  const [expandedRecommendationId, setExpandedRecommendationId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reviewVersion, setReviewVersion] = useState(0);

  useEffect(() => {
    // One-time post-mount read from localStorage — the same sanctioned
    // "synchronize with an external system" exception farm-store.tsx's
    // own rehydration effect already documents and uses.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-mount read from localStorage, see comment above.
    setRuns(createLocalStorageAuditTraceStore().list());
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const traceStore = createLocalStorageAuditTraceStore();
      const farmGrasslandAreaHa = fields.reduce((sum, f) => sum + f.areaHa, 0);
      const stamp = Date.now().toString(36);

      for (const field of fields) {
        const silagePlan = mockSilagePlans.find((p) => p.fieldId === field.id);
        const runId = `RUN_${field.id}_${stamp}`;
        // Already-persisted runs are never overwritten (audit-trace-local
        // -storage.ts's own add() enforces this) — skip regenerating one
        // that already exists under this exact stamp rather than throwing.
        if (traceStore.get(runId)) continue;

        const { run } = await calculateNutrientPlanWithTrace(runId, `REC_${field.id}_${stamp}`, {
          field,
          farmGrasslandAreaHa,
          livestockGroups,
          silage: silagePlan
            ? {
                cutNumber: silagePlan.cutNumber,
                expectedYieldTDMha: silagePlan.expectedYieldTDMha.value,
                intendedUse: silagePlan.intendedUse,
                saleEvidence: silagePlan.saleEvidence ? { hasWrittenEvidence: silagePlan.saleEvidence.value.hasWrittenEvidence } : undefined,
              }
            : undefined,
        });
        traceStore.add(run);
      }
      setRuns(traceStore.list());
    } finally {
      setGenerating(false);
    }
  }

  const decisions: { run: CalculationRun; decision: DecisionRecord }[] = runs.flatMap((run) =>
    run.decisionRecords.map((decision) => ({ run, decision })),
  );

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <FileSearch className="size-5 text-fr-ink-600" />
          <CardTitle>Recommendation Audit Trail</CardTitle>
        </span>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || fields.length === 0}
          className="rounded-full border border-fr-border px-3 py-1.5 text-xs font-medium text-fr-ink-600 disabled:text-fr-ink-400"
        >
          {generating ? "Generating…" : "Generate audit trace"}
        </button>
      </CardHeader>

      {decisions.length === 0 ? (
        <p className="py-4 text-center text-sm text-fr-ink-400">
          No recommendations have a persisted trace yet — generate one from this farm&apos;s current field/livestock
          data.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {decisions.map(({ run, decision }) => (
            <DecisionRow
              key={decision.recommendationId}
              run={run}
              decision={decision}
              expanded={expandedRecommendationId === decision.recommendationId}
              onToggle={() =>
                setExpandedRecommendationId((current) => (current === decision.recommendationId ? null : decision.recommendationId))
              }
              reviewVersion={reviewVersion}
              onReviewed={() => setReviewVersion((v) => v + 1)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

const DECISION_TYPE_TONE: Record<DecisionType, StatusTone> = {
  ACTION_RECOMMENDATION: "good",
  NO_ACTION_RECOMMENDED: "neutral",
  LEGAL_PROHIBITION: "risk",
  DATA_REQUEST: "info",
  ESTIMATE: "info",
  WARNING: "attention",
  BLOCKED_INSUFFICIENT_EVIDENCE: "neutral",
  ALTERNATIVE_SCENARIO: "info",
};

const REVIEW_STATUSES: PeerReview["reviewStatus"][] = ["UNREVIEWED", "VERIFIED", "QUESTIONED", "REJECTED", "SUPERSEDED"];
const REVIEW_STATUS_TONE: Record<PeerReview["reviewStatus"], StatusTone> = {
  UNREVIEWED: "neutral",
  VERIFIED: "good",
  QUESTIONED: "attention",
  REJECTED: "risk",
  SUPERSEDED: "neutral",
};

function DecisionRow({
  run,
  decision,
  expanded,
  onToggle,
  reviewVersion,
  onReviewed,
}: {
  run: CalculationRun;
  decision: DecisionRecord;
  expanded: boolean;
  onToggle: () => void;
  reviewVersion: number;
  onReviewed: () => void;
}) {
  const reviewStore = createLocalStoragePeerReviewStore();
  const currentStatus = reviewStore.currentStatusForRecommendation(decision.recommendationId);
  void reviewVersion; // forces this component to re-read the review store after a status change

  function setReview(status: PeerReview["reviewStatus"]) {
    reviewStore.add({
      peerReviewId: nextPeerReviewId(decision.recommendationId),
      calculationRunId: run.calculationRunId,
      recommendationId: decision.recommendationId,
      reviewStatus: status,
      reviewedAt: new Date().toISOString(),
    });
    onReviewed();
  }

  return (
    <li className="rounded-fr-control border border-fr-border">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        {expanded ? <ChevronDown className="size-4 shrink-0 text-fr-ink-400" /> : <ChevronRight className="size-4 shrink-0 text-fr-ink-400" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fr-ink-900">{decision.action}</span>
          <span className="block truncate text-xs text-fr-ink-600">
            {decision.scope.type} {decision.scope.id} · {run.ruleset.rulesetId}
          </span>
        </span>
        <Pill tone={DECISION_TYPE_TONE[decision.decisionType]}>{decision.decisionType}</Pill>
        <Pill tone={REVIEW_STATUS_TONE[currentStatus]}>{currentStatus}</Pill>
      </button>

      {expanded ? (
        <div className="flex flex-col gap-3 border-t border-fr-border px-3 py-3 text-sm">
          <div>
            <p className="text-xs font-medium text-fr-ink-600">Reason codes</p>
            <p className="text-fr-ink-900">{decision.reasonCodes.join(", ")}</p>
          </div>

          {decision.calculationSteps.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-fr-ink-600">Calculation steps</p>
              <ol className="mt-1 flex flex-col gap-1">
                {decision.calculationSteps.map((step) => (
                  <li key={step.sequence} className="text-xs text-fr-ink-700">
                    {step.sequence}. {step.description}: {step.formulaExpression} = {String(step.result)}
                    {step.unit ? ` ${step.unit}` : ""}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {decision.complianceChecks.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-fr-ink-600">Compliance checks</p>
              <ul className="mt-1 flex flex-col gap-1">
                {decision.complianceChecks.map((check) => (
                  <li key={check.checkId} className="flex items-center gap-2 text-xs">
                    <Pill tone={check.result === "PASS" ? "good" : check.result === "FAIL" ? "risk" : "neutral"}>{check.result}</Pill>
                    <span className="text-fr-ink-700">{check.rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {decision.dataGaps.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-fr-ink-600">Missing evidence</p>
              <ul className="mt-1 flex flex-col gap-1">
                {decision.dataGaps.map((gap, i) => (
                  <li key={i} className="text-xs text-fr-ink-700">
                    {gap.description} — {gap.resolution ?? gap.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-medium text-fr-ink-600">Sources</p>
            <p className="text-xs text-fr-ink-700">{decision.sources.map((s) => s.sourceId).join(", ")}</p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-fr-ink-600">Peer review</p>
            <div className="flex flex-wrap gap-1.5">
              {REVIEW_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setReview(status)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    status === currentStatus ? "border-fr-green-700 text-fr-green-700" : "border-fr-border text-fr-ink-600"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-fr-ink-400">
            Run {run.calculationRunId} · trace {run.traceSha256?.slice(0, 12)}… · sealed {run.calculatedAt}
          </p>
        </div>
      ) : null}
    </li>
  );
}
