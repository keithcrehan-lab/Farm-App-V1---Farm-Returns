"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { AskAIButton } from "@/components/next/AskAI";
import { Pill } from "@/components/ui/StatusBadge";
import { EVIDENCE_STATE_UI_LABEL } from "@/domain/evidence";
import { decideAsFarmer } from "@/orchestration/decide";
import { submitPromptDecisionAction } from "@/app/actions/decisions";
import type { Prompt } from "@/orchestration/prompt";

/**
 * Canonical screen #11 — "Expanded Prompt / Why this matters: Evidence,
 * confidence, explanation and recommended action"
 * (`FARM_RETURN_NEXT_SPEC_v1_1.md` §4/§8, reference `media/image1.png`'s
 * "4. EXPANDED PROMPT" panel). Built as an overlay (`Sheet`), not a
 * route, per §7's "Ask AI must work as an overlay... so the farmer does
 * not lose their place in the world" — the same reasoning applies to this
 * sheet, and a `Prompt` has no stable persisted id a route could target
 * anyway (`ARCHITECTURE.md`: a Prompt is derived fresh on every request,
 * never persisted).
 *
 * Real evidence only: `prompt.inputsSnapshot`, when the producer supplied
 * one, is rendered verbatim (key/value pairs already computed by the real
 * domain gate that built this Prompt — see `src/orchestration/prompt/
 * index.ts`'s own `Prompt.inputsSnapshot` doc comment). Nothing here
 * recomputes or embellishes it.
 *
 * Accept/Dismiss records a real `decisions` row via `decideAsFarmer`
 * (pure) + `submitPromptDecisionAction` (the one sanctioned server
 * writer, `src/app/actions/decisions.ts`) — no Act-stage job is created
 * for any of today's four real Prompt kinds (see `PromptCard`'s own doc
 * comment for why), so "Accept" here means "recorded, not yet turned
 * into an operational job", not "job started". `decideAsFarmer` itself
 * throws if a caller tries to accept/edit a non-OK `basis` — mirrored
 * here by only ever offering "Accept" when `prompt.basis.status ===
 * "OK"`, so this component can never construct the throwing call.
 */
export function ExpandedPromptSheet({
  open,
  onClose,
  prompt,
  fieldName,
  canRecord,
}: {
  open: boolean;
  onClose: () => void;
  prompt: Prompt | undefined;
  /** Real field name for this Prompt's `fieldId`, when known — resolved
   * by the caller (Today already has the real `Field[]` loaded), never
   * looked up again here. */
  fieldName?: string;
  /** Real-mode gate — `useIsRealMode()` at the call site. In demo/mock
   * mode there is no real signed-in farm for `insertDecision`'s
   * ownership check to match, so recording is disabled with an honest
   * explanation instead of attempting (and failing) a write. */
  canRecord: boolean;
}) {
  const [state, setState] = useState<{ status: "idle" | "submitting" | "done" | "error"; outcome?: "accepted" | "dismissed"; message?: string }>({
    status: "idle",
  });

  if (!prompt) return null;
  const isOk = prompt.basis.status === "OK";
  const inputs = prompt.inputsSnapshot ? Object.entries(prompt.inputsSnapshot) : [];

  async function record(outcome: "accepted" | "dismissed") {
    if (!prompt) return;
    if (!canRecord) {
      setState({ status: "error", message: "Demo mode — this decision isn't saved to a real account here." });
      return;
    }
    setState({ status: "submitting" });
    try {
      const decision = decideAsFarmer(prompt, outcome, new Date().toISOString());
      // decideAsFarmer (src/orchestration/decide) always sets decidedBy to
      // the literal "farmer" — `decidedBy: "auto_rule"` is reserved for a
      // future, separately-reviewed auto-rule constructor that doesn't
      // exist yet (that module's own doc comment) — but its return type is
      // the wider `Decision["decidedBy"]` union, since a *type* covering
      // every real caller of that interface must allow both. `DecisionInput`
      // (the one real writer's own input contract) intentionally narrows to
      // the literal so a caller who hasn't already checked can't submit an
      // "auto_rule" decision by accident; this call site's actual value is
      // always "farmer" by construction, so re-asserting the literal here
      // is honest, not a cast past a real runtime possibility.
      await submitPromptDecisionAction({ ...decision, decidedBy: "farmer" });
      setState({ status: "done", outcome });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Could not record this decision." });
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={prompt.title}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-label uppercase tracking-wide text-fr-ink-600">Why this matters</p>
          <p className="font-display mt-1 text-lg text-fr-ink-900">{prompt.title}</p>
          {fieldName ? <p className="text-sm text-fr-ink-600">{fieldName}</p> : null}
        </div>

        <p className="text-sm text-fr-ink-600">{prompt.description}</p>

        <div className="flex flex-wrap gap-2">
          {prompt.basis.status === "OK" ? <Pill tone="good">{EVIDENCE_STATE_UI_LABEL[prompt.basis.evidenceState]}</Pill> : null}
          {/* "Compliance value"/"Planning advice" describe what *kind* of
              value this is, not a problem — `info` (blue), not `risk`
              (red), the same "blue = informational/data" semantic
              `status.ts`'s own header comment defines. A genuine legal
              restriction is already conveyed by `basis.status ===
              "LEGAL_PROHIBITION"` itself (`describeBlockedBasis`'s own
              copy), not by this badge. */}
          {prompt.regulatory ? (
            <Pill tone="info">{prompt.regulatory === "compliance_value" ? "Compliance value" : "Planning advice"}</Pill>
          ) : null}
        </div>

        {inputs.length > 0 ? (
          <div className="rounded-fr-control border border-fr-border bg-fr-surface-alt p-3">
            <p className="mb-2 text-label uppercase tracking-wide text-fr-ink-600">Evidence checked</p>
            <dl className="flex flex-col gap-1">
              {inputs.map(([key, value]) => (
                <div key={key} className="flex gap-2 text-sm">
                  <dt className="shrink-0 font-medium text-fr-ink-900">{key}:</dt>
                  <dd className="min-w-0 truncate text-fr-ink-600">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {state.status === "done" ? (
          <div className="flex items-center gap-2 rounded-fr-control bg-fr-good-bg px-3 py-2.5 text-sm text-fr-good">
            <CheckCircle2 className="size-4 shrink-0" />
            {state.outcome === "accepted" ? "Accepted — recorded to your farm." : "Dismissed — recorded to your farm."}
          </div>
        ) : (
          <>
            {state.status === "error" ? (
              <div className="flex items-center gap-2 rounded-fr-control bg-fr-attention-bg px-3 py-2.5 text-sm text-fr-attention">
                <XCircle className="size-4 shrink-0" />
                {state.message}
              </div>
            ) : null}
            <div className="flex gap-3">
              {isOk ? (
                <button
                  type="button"
                  disabled={state.status === "submitting"}
                  onClick={() => record("accepted")}
                  className="flex-1 rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Accept
                </button>
              ) : null}
              <button
                type="button"
                disabled={state.status === "submitting"}
                onClick={() => record("dismissed")}
                className="flex-1 rounded-full border border-fr-border px-4 py-2.5 text-sm font-medium text-fr-ink-900 disabled:opacity-60"
              >
                Not now
              </button>
            </div>
            {!isOk ? (
              <p className="text-xs text-fr-ink-400">
                This Prompt&apos;s evidence isn&apos;t a clear &quot;OK&quot; right now, so it can only be dismissed here, not
                accepted.
              </p>
            ) : null}
          </>
        )}

        <AskAIButton
          className="self-start"
          context={{
            screen: `Expanded Prompt — ${prompt.kind}`,
            facts: {
              Prompt: prompt.title,
              ...(fieldName ? { Field: fieldName } : {}),
              Evidence: prompt.basis.status,
              ...(prompt.calculationVersion ? { "Calculation version": prompt.calculationVersion } : {}),
            },
          }}
        />
      </div>
    </Sheet>
  );
}
