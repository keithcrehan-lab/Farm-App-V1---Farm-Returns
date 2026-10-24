"use client";

/**
 * Pilot Integration P4 — the What Matters pilot's client state, shared by the Farm screen's "What matters now" slot
 * and the dedicated What Matters screen (`/what-matters`), so both show the one real evaluation and neither carries a
 * copy of this logic. Moved here verbatim from the Farm screen (`today/page.tsx`); behaviour is unchanged. Every
 * figure comes from the server action (`evaluateWhatMattersPilot`) — nothing is computed here.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { evaluateWhatMattersPilot, confirmWhatMattersPilotCondition, saveFarmerContractorCostRate, type WhatMattersPilotActionResult, type WhatMattersPilotCandidateContext, type WhatMattersEvidenceSummary } from "@/app/actions/what-matters-pilot";
import type { WhatMattersPilotResult } from "@/domain/what-matters-presentation";
import type { FieldMissingSlurryPlanningDetails } from "@/domain/what-matters-no-recommendation";
import type { FarmerConfirmationCode, FarmerDeclarationEvidence } from "@/domain/slurry-actionability-policy";
import { useSyncStatus } from "@/store/farm-store";

export function useWhatMattersPilot() {
  const router = useRouter();
  // What Matters pilot — Phase 5 -> 7/7.1 -> 8 -> 11A -> 11B ->
  // SLURRY_ACTIONABILITY_POLICY_IE_V1 -> Phase 10 -> Phase 9, wired live
  // (`src/app/actions/what-matters-pilot.ts`, real farm data, real Met
  // Éireann weather, real persisted CSO price evidence). This is now the
  // ONLY source for the "What matters now" recommendation slot below —
  // `selectPrimaryPrompt`/`primaryPrompt` (still computed further down for
  // the map's own selected-field default and the unrelated Ask AI context
  // fact) no longer drives it. A thrown/failed evaluation resolves to an
  // honest "unable to verify" message, never a silent fallback to
  // `primaryPrompt` — see the action's own header comment.
  const [pilotState, setPilotState] = useState<{
    result: WhatMattersPilotResult;
    evaluatedAt: string;
    declarations: FarmerDeclarationEvidence[];
    contractorRatePerHa: string | null;
    candidateContext: Record<string, WhatMattersPilotCandidateContext>;
    missingSlurryDetails: FieldMissingSlurryPlanningDetails[];
    multiSourceSlurryFieldIds: string[];
    plannedSlurryFieldCount: number | undefined;
    evidence: WhatMattersEvidenceSummary | null;
  } | null>(null);
  const [pilotError, setPilotError] = useState<string | null>(null);
  const [pilotLoading, setPilotLoading] = useState(false);
  // A failed *save* (validation/no-farm/DB-write/re-evaluation-after-write)
  // is kept separate from `pilotError`: the row stays visible with its own
  // reason rather than the whole What Matters section flipping to the
  // generic "unable to verify" state (one-time-setup UI brief).
  const [contractorRateError, setContractorRateError] = useState<string | null>(null);

  function applyPilotResult(res: WhatMattersPilotActionResult) {
    if (res.status === "ok") {
      setPilotError(null);
      setPilotState({ result: res.result, evaluatedAt: res.evaluatedAt, declarations: res.declarations, contractorRatePerHa: res.contractorRatePerHa, candidateContext: res.candidateContext, missingSlurryDetails: res.missingSlurryDetails ?? [], multiSourceSlurryFieldIds: res.multiSourceSlurryFieldIds ?? [], plannedSlurryFieldCount: res.plannedSlurryFieldCount, evidence: res.evidence ?? null });
    } else {
      // Honest failure state -- never a fallback to the legacy Prompt
      // selector (brief: "Better to show 'Unable to verify a
      // recommendation right now' than produce an unaudited
      // recommendation").
      setPilotError(res.message);
    }
  }

  // Farm-store edits persist fire-and-forget (`persistRemote`): a farmer
  // who adds spreading details on Fields and comes straight back here could
  // otherwise have Today evaluate before that write lands and show the
  // old "missing details" state. Evaluation waits for pending writes to
  // settle, runs once per mount, and runs again only when a further write
  // has actually succeeded since the last evaluation (`syncedCount` only
  // advances on success, including a banner retry) — so a failed save
  // followed by a successful retry re-reads the newly persisted data,
  // while a failure alone, or nothing changing, never re-evaluates.
  const { pendingCount: pendingFarmWrites, syncedCount: syncedFarmWrites } = useSyncStatus();
  const farmWritesPending = pendingFarmWrites > 0;
  const pilotEvaluatedAtSyncedCount = useRef<number | null>(null);
  // One request-ordering sequence shared by every call that produces What
  // Matters state (automatic evaluation, farmer confirmation, contractor-rate
  // save). Only the latest-started request may apply its response or clear
  // `pilotLoading` — e.g. an older confirmation that resolves after a
  // retry-triggered re-evaluation is discarded rather than restoring stale
  // state (Codex audit MEDIUM).
  const pilotEvaluationSeq = useRef(0);
  const pilotUnmounted = useRef(false);
  useEffect(() => {
    pilotUnmounted.current = false;
    return () => {
      pilotUnmounted.current = true;
    };
  }, []);
  function beginPilotRequest(): () => boolean {
    const seq = ++pilotEvaluationSeq.current;
    return () => !pilotUnmounted.current && seq === pilotEvaluationSeq.current;
  }

  useEffect(() => {
    if (pilotEvaluatedAtSyncedCount.current === syncedFarmWrites) return;
    // One real, explicit server evaluation per stable persisted state (same sanctioned "synchronize with an external system" pattern this file's own `mounted`/`greetingText` effects already use above), not derivable state.
    setPilotLoading(true);
    if (farmWritesPending) return;
    pilotEvaluatedAtSyncedCount.current = syncedFarmWrites;
    const isCurrent = beginPilotRequest();
    evaluateWhatMattersPilot().then(
      (res) => {
        if (!isCurrent()) return;
        setPilotLoading(false);
        applyPilotResult(res);
      },
      // Codex audit MEDIUM: a real Server Action call itself can reject
      // (transport/serialization/deployment failure), not just resolve
      // with the action's own already-caught `{status: "error"}` shape.
      // Without this handler that left the skeleton loading indefinitely
      // -- never the legacy Prompt fallback, but also never the honest
      // "unable to verify" message the brief requires.
      (error: unknown) => {
        if (!isCurrent()) return;
        console.error("[TodayPage] evaluateWhatMattersPilot rejected:", error);
        setPilotLoading(false);
        setPilotError("Unable to verify a recommendation right now.");
      },
    );
  }, [farmWritesPending, syncedFarmWrites]);

  async function handlePilotConfirm(code: FarmerConfirmationCode, value: boolean) {
    // Codex audit MEDIUM: without this guard, clicking a second Yes/No
    // (on either the same or a different required question) before the
    // first confirm round-trip resolves sends two requests that both
    // still carry the same `priorDeclarations` snapshot -- whichever
    // response lands last silently overwrites the other's freshly
    // recomputed result, and one real farmer declaration can be lost.
    // The domain layer itself never fabricates actionability either way;
    // this is purely a UI-level request-ordering fix, matched by the
    // `disabled` prop passed to `WhatMattersPilotCard` below.
    if (pilotLoading) return;
    if (!pilotState || pilotState.result.kind !== "needs_confirmation") return;
    const candidate = pilotState.result.candidate;
    const context = pilotState.candidateContext[candidate.recordId];
    if (!context) return;
    setPilotLoading(true);
    const isCurrent = beginPilotRequest();
    try {
      const res = await confirmWhatMattersPilotCondition({
        evaluatedAt: pilotState.evaluatedAt,
        priorDeclarations: pilotState.declarations,
        opportunityRecordId: candidate.recordId,
        boundAssessmentId: context.assessmentId,
        evaluatedActionId: context.evaluatedActionId,
        fieldId: context.fieldId,
        conditionCode: code,
        value,
      });
      if (!isCurrent()) return;
      applyPilotResult(res);
    } catch (error: unknown) {
      // Same real Server Action rejection risk as the initial evaluation
      // effect above -- never leave the card stuck mid-confirmation.
      console.error("[TodayPage] confirmWhatMattersPilotCondition rejected:", error);
      if (!isCurrent()) return;
      setPilotError("Unable to verify a recommendation right now.");
    } finally {
      // A newer request owns `pilotLoading` once this one is superseded.
      if (isCurrent()) setPilotLoading(false);
    }
  }

  /** Same UI-level request-ordering guard as `handlePilotConfirm` — a real
   * domain recalculation, never a local cost toggle. Applies the one
   * entered rate to every real slurry action on this farm
   * (`saveFarmerContractorCostRate`'s own header). */
  async function handleSaveContractorCostRate(ratePerHa: string) {
    if (pilotLoading || !pilotState) return;
    setPilotLoading(true);
    setContractorRateError(null);
    const isCurrent = beginPilotRequest();
    try {
      const res = await saveFarmerContractorCostRate({
        evaluatedAt: pilotState.evaluatedAt,
        priorDeclarations: pilotState.declarations,
        ratePerHa,
      });
      if (!isCurrent()) return;
      if (res.status === "ok") {
        // Success: apply the freshly re-evaluated pilot state, which now
        // carries the persisted `contractorRatePerHa` -- the input row's
        // own render condition below hides it immediately as a result,
        // with no separate "hide" step needed.
        applyPilotResult(res);
      } else {
        // A real save failure (invalid rate / no farm / DB write / the
        // re-evaluation that follows it) -- keep the existing pilot state
        // and input row exactly as they were, and surface the reason next
        // to the input rather than replacing the whole section.
        setContractorRateError(res.message);
      }
    } catch (error: unknown) {
      console.error("[TodayPage] saveFarmerContractorCostRate rejected:", error);
      if (!isCurrent()) return;
      setContractorRateError("Unable to verify a recommendation right now.");
    } finally {
      if (isCurrent()) setPilotLoading(false);
    }
  }

  function pilotFieldName(): string | undefined {
    if (!pilotState) return undefined;
    const result = pilotState.result;
    const candidate = result.kind === "none" ? null : result.candidate;
    if (!candidate) return undefined;
    return pilotState.candidateContext[candidate.recordId]?.fieldName;
  }

  function handlePilotViewDetails() {
    if (!pilotState || pilotState.result.kind !== "actionable") return;
    const context = pilotState.candidateContext[pilotState.result.candidate.recordId];
    if (context) router.push(`/fields?field=${context.fieldId}`);
  }

  return { pilotState, pilotError, pilotLoading, contractorRateError, handlePilotConfirm, handleSaveContractorCostRate, pilotFieldName, handlePilotViewDetails };
}
