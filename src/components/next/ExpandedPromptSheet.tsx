"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { AskAIButton } from "@/components/next/AskAI";
import { Pill } from "@/components/ui/StatusBadge";
import { EVIDENCE_STATE_UI_LABEL } from "@/domain/evidence";
import { submitPromptDecisionAction, type RecomputablePromptKind } from "@/app/actions/decisions";
import { startJobSessionFromPromptAction } from "@/app/actions/job-sessions";
import type { SpreadingMaterial } from "@/domain/closed-period-calendar";
import type { Prompt } from "@/orchestration/prompt";

/**
 * GPS Job Session + Confirm Actual contract — the one real Prompt kind
 * this checkpoint can turn into a trackable physical job is
 * `"spreading_window"` (a real field-level "go spread now" action); the
 * other three (`soil_test_age`, `commonage_status`,
 * `local_buffer_override`) are recommendations/compliance notes with no
 * physical activity to track, so they keep the existing plain
 * Accept/Dismiss below, unchanged. See
 * `docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §6 for the five representative activities this contract validates
 * against — `chemical_fertiliser` maps to `"fertiliser_spreading"`, both
 * organic materials map to `"slurry_spreading"` (this repo's five
 * representative Actual contracts have no separate "farmyard manure"
 * activity — a disclosed simplification, not a scientific claim that FYM
 * and slurry are the same input).
 */
function activityTypeForSpreadingMaterial(material: SpreadingMaterial | undefined): string {
  if (material === "chemical_fertiliser") return "fertiliser_spreading";
  return "slurry_spreading";
}

/** The same closed set `submitPromptDecisionAction` recomputes server-side
 * — checked here too so an unrecognised `Prompt.kind` (a future producer
 * this component hasn't been taught about yet) fails closed with an
 * honest message instead of calling the server action with a kind it
 * can't handle. */
const RECOMPUTABLE_PROMPT_KINDS: readonly RecomputablePromptKind[] = [
  "spreading_window",
  "soil_test_age",
  "commonage_status",
  "local_buffer_override",
];

/**
 * The actual content, and the actual `state`/`record` logic — split out
 * from `ExpandedPromptSheet` (below) and keyed by `prompt.id` at its one
 * call site specifically so a *different* Prompt gets a fresh React
 * mount, not a re-render of the same instance.
 *
 * Codex audit LOW (round 2): the round-1 fix reset `state` from a
 * `useEffect` keyed on `prompt?.id` — correct eventually, but an effect
 * runs *after* React has already committed a render with the new
 * `prompt` and the *old* `state`, so a farmer could see one real,
 * committed frame of "Accepted — recorded to your farm." for a Prompt
 * they hadn't touched yet, before the effect fired and cleared it.
 * Keying this component by `prompt.id` instead makes React unmount the
 * old instance and mount a brand new one (fresh `useState` initial value,
 * no stale frame possible) whenever the Prompt actually changes — the
 * same "key resets state" mechanism React itself documents for exactly
 * this class of bug, not a workaround.
 */
function ExpandedPromptSheetBody({
  prompt,
  fieldName,
  canRecord,
}: {
  prompt: Prompt;
  fieldName?: string;
  canRecord: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<{ status: "idle" | "submitting" | "done" | "error"; outcome?: "accepted" | "dismissed"; message?: string }>({
    status: "idle",
  });

  const isOk = prompt.basis.status === "OK";
  const inputs = prompt.inputsSnapshot ? Object.entries(prompt.inputsSnapshot) : [];
  const recomputableKind = RECOMPUTABLE_PROMPT_KINDS.includes(prompt.kind as RecomputablePromptKind)
    ? (prompt.kind as RecomputablePromptKind)
    : undefined;
  const isJobStartable = recomputableKind === "spreading_window";

  async function startJob() {
    if (!prompt.fieldId || recomputableKind !== "spreading_window") return;
    if (!canRecord) {
      setState({ status: "error", message: "Demo mode — this can't start a real job here." });
      return;
    }
    setState({ status: "submitting" });
    try {
      const jobSessionId = globalThis.crypto.randomUUID();
      await startJobSessionFromPromptAction({
        promptKind: "spreading_window",
        fieldId: prompt.fieldId,
        activityType: activityTypeForSpreadingMaterial(prompt.inputsSnapshot?.material as SpreadingMaterial | undefined),
        jobSessionId,
        origin: "prompt",
        material: prompt.inputsSnapshot?.material as SpreadingMaterial | undefined,
      });
      router.push(`/job/${jobSessionId}`);
    } catch (error) {
      console.error("[ExpandedPromptSheet] startJobSessionFromPromptAction failed:", error);
      setState({ status: "error", message: "Something went wrong starting this job — please try again." });
    }
  }

  async function record(outcome: "accepted" | "dismissed") {
    if (!prompt.fieldId) return;
    if (!canRecord) {
      setState({ status: "error", message: "Demo mode — this decision isn't saved to a real account here." });
      return;
    }
    if (!recomputableKind) {
      setState({ status: "error", message: "This Prompt kind can't be recorded yet." });
      return;
    }
    setState({ status: "submitting" });
    try {
      await submitPromptDecisionAction({
        promptKind: recomputableKind,
        fieldId: prompt.fieldId,
        outcome,
        material: recomputableKind === "spreading_window" ? (prompt.inputsSnapshot?.material as SpreadingMaterial | undefined) : undefined,
      });
      setState({ status: "done", outcome });
    } catch (error) {
      // Codex audit LOW (round 1): a raw server/database error message
      // could expose implementation detail (table/constraint names) to a
      // signed-in farmer. Logged in full to the browser console (reachable
      // for support/debugging) but shown on-screen as a stable, generic
      // message.
      console.error("[ExpandedPromptSheet] submitPromptDecisionAction failed:", error);
      setState({ status: "error", message: "Something went wrong recording this decision — please try again." });
    }
  }

  return (
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

      {/* Codex audit HIGH (round 3, docs/overnight/audits/
          phase-1-visual-nav-today-plan-records-codex-audit-round3.md):
          `calculationVersion` was only ever handed to Ask AI's own
          context object, never actually rendered in the Prompt's own
          detail view — a real gap against `SCIENTIFIC_RULES.md`'s "a
          Prompt's own trace... must be inspectable", which this evidence
          box exists specifically to satisfy. Shown whenever either it or
          `inputsSnapshot` is present, not gated on `inputs.length` alone. */}
      {inputs.length > 0 || prompt.calculationVersion ? (
        <div className="rounded-fr-control border border-fr-border bg-fr-surface-alt p-3">
          <p className="mb-2 text-label uppercase tracking-wide text-fr-ink-600">Evidence checked</p>
          <dl className="flex flex-col gap-1">
            {prompt.calculationVersion ? (
              <div className="flex gap-2 text-sm">
                <dt className="shrink-0 font-medium text-fr-ink-900">Calculation version:</dt>
                <dd className="min-w-0 truncate text-fr-ink-600">{prompt.calculationVersion}</dd>
              </div>
            ) : null}
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
            {isOk && isJobStartable ? (
              <button
                type="button"
                disabled={state.status === "submitting"}
                onClick={startJob}
                className="flex-1 rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Start job
              </button>
            ) : isOk ? (
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
            // Phase C (contextual Ask AI completeness, 2026-09-03): this
            // screen already shows the real evidence tier to the farmer
            // as a `Pill` (above, `EVIDENCE_STATE_UI_LABEL[prompt.basis.evidenceState]`)
            // — Ask AI's own context previously got only the raw
            // `basis.status` string ("OK"), silently dropping the actual
            // tier a farmer can already see. Same "Ask AI must see
            // exactly the same facts a farmer sees" rule
            // `ConfirmActualSheet.tsx`'s own numeric-truthfulness fix
            // already established.
            Evidence:
              prompt.basis.status === "OK"
                ? { value: EVIDENCE_STATE_UI_LABEL[prompt.basis.evidenceState], evidenceState: prompt.basis.evidenceState }
                : prompt.basis.status,
            ...(prompt.calculationVersion ? { "Calculation version": prompt.calculationVersion } : {}),
          },
        }}
      />
    </div>
  );
}

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
 * recomputes or embellishes it for display.
 *
 * Accept/Dismiss records a real `decisions` row via
 * `submitPromptDecisionAction` (`src/app/actions/decisions.ts`), which
 * recomputes the Prompt itself server-side from a fresh database read —
 * this component sends only `promptKind`/`fieldId`/`outcome`/`material`,
 * never the evidence itself (Codex audit HIGH, round 1: the first version
 * built the whole `Decision` client-side via `decideAsFarmer` and trusted
 * it verbatim server-side, letting a client submit fabricated evidence
 * for its own farm's historical record — see that action's own doc
 * comment for the full account). No Act-stage job is created for any of
 * today's four real Prompt kinds (see `PromptCard`'s own doc comment for
 * why), so "Accept" here means "recorded, not yet turned into an
 * operational job", not "job started". `decideAsFarmer` (server-side)
 * throws if a caller tries to accept/edit a non-OK `basis` — mirrored
 * here by only ever offering "Accept" when `prompt.basis.status ===
 * "OK"`, so a submitted Accept can never hit that throw in practice.
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
  if (!prompt) return null;
  return (
    <Sheet open={open} onClose={onClose} title={prompt.title}>
      <ExpandedPromptSheetBody key={prompt.id} prompt={prompt} fieldName={fieldName} canRecord={canRecord} />
    </Sheet>
  );
}
