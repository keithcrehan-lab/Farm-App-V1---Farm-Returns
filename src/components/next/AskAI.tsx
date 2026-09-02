"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { EVIDENCE_STATE_UI_LABEL, type EvidenceState } from "@/domain/evidence";

/**
 * Farm Return Next v1.1 §7: "Ask AI — available everywhere... The
 * assistant receives only the explicit current context technically
 * available on that screen. Context is never invented." and §14's Ask AI
 * row: "Query the exact context currently being viewed."
 *
 * `AskAIContext` is the real, inspectable answer to "what does this
 * screen actually know right now" — every field here must come from real
 * app state at the call site, never a placeholder. `facts` is rendered
 * verbatim in the overlay specifically so this is demonstrable, not just
 * asserted: a farmer (or an auditor) can see exactly what Ask AI would
 * have to work with.
 *
 * **A fact can optionally carry the same real `EvidenceState` tier
 * (`src/domain/evidence.ts`) the scientific engine already computes for
 * it — Phase C (contextual Ask AI completeness, 2026-09-03).** Before
 * this, every fact was a bare string with no way to tell Ask AI (or a
 * farmer reading this overlay) whether a number was Measured, an
 * official-model estimate, or a farmer-confirmed Actual — exactly the
 * "Ask AI must distinguish Observed/Estimated/Farmer Actual/authoritative
 * external data" requirement this app's own product spec names. This
 * reuses the scientific engine's own six-value vocabulary and its own
 * `EVIDENCE_STATE_UI_LABEL` display strings verbatim — never a new,
 * competing tier taxonomy. A `farmerActual: true` fact marks the other
 * tier this vocabulary doesn't cover (a farmer's own confirmed value,
 * never derived from Observed/Estimated evidence — the same distinction
 * `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §1 enforces at the domain layer).
 * A plain string fact (no tier) means exactly what it always did — a
 * real, present fact this screen holds with no formal evidence tier to
 * disclose (a count, a name, a status label) — never a silent downgrade
 * of a fact that does have one.
 *
 * **A discriminated union, not one object with two independent optional
 * fields** — Codex audit round 1 of this phase (MEDIUM) correctly found
 * that an object shape (`{value, evidenceState?, farmerActual?}`) let a
 * type-safe caller set both `evidenceState` and `farmerActual` on the
 * same fact, silently rendering only one tag and hiding the other. The
 * `never` fields below make that combination a compile-time error, not
 * a runtime ambiguity the render logic would have to arbitrate.
 */
export type AskAIFact =
  | { value: string; evidenceState: EvidenceState; farmerActual?: never }
  | { value: string; farmerActual: true; evidenceState?: never }
  | { value: string; evidenceState?: never; farmerActual?: never };

export interface AskAIContext {
  /** Which primary/secondary screen this was opened from, e.g. "Today",
   * "Expanded Prompt — spreading_window". Free-form, presentational only. */
  screen: string;
  /** Real facts already available at the call site — e.g. `{ Farm:
   * "Green Acres", Field: "Back Meadow", Prompt: "spreading_window" }`.
   * No entry here may be a guess, a placeholder or a value not already
   * held by the component that renders this — the same "fail closed if
   * context is missing" rule as everywhere else in this app; when a call
   * site has nothing real to offer for a given key, it must omit that
   * key entirely rather than filling it with an empty/placeholder value.
   * A value may be a plain string, or an `AskAIFact` when a real evidence
   * tier or Farmer Actual status exists for it — see `AskAIFact`'s own
   * doc comment. */
  facts: Record<string, string | AskAIFact>;
}

function normaliseFact(fact: string | AskAIFact): AskAIFact {
  return typeof fact === "string" ? { value: fact } : fact;
}

/**
 * There is no AI/LLM provider wired into this app yet (no API key, no
 * server route) — `docs/overnight/IMPLEMENTATION_MATRIX.md` records this
 * as a real, current gap, not an oversight this component should paper
 * over. Per `CLAUDE.md`'s "never invent a production... number" and this
 * app's own "fail closed, never fabricate" rule, this overlay shows
 * exactly the real context it was given and says plainly that no model is
 * connected yet, rather than synthesising a plausible-sounding canned
 * answer that would misrepresent this as a working feature. The overlay
 * itself — the affordance, the context contract, the fail-closed empty
 * state — is real and reusable; only the model call is missing, and
 * wiring one in later only needs to fill in `onAsk` below, not rebuild
 * this component.
 */
function AskAIOverlay({ open, onClose, context }: { open: boolean; onClose: () => void; context: AskAIContext }) {
  const facts = Object.entries(context.facts);
  return (
    <Sheet open={open} onClose={onClose} title="Ask AI">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-fr-ink-900">Ask AI</p>
          <p className="text-sm text-fr-ink-600">{context.screen}</p>
        </div>

        <div className="rounded-fr-control border border-fr-border bg-fr-surface-alt p-3">
          <p className="mb-2 text-label uppercase tracking-wide text-fr-ink-600">What Ask AI can see right now</p>
          {facts.length === 0 ? (
            <p className="text-sm text-fr-ink-600">No specific context is available on this screen yet.</p>
          ) : (
            <dl className="flex flex-col gap-1">
              {facts.map(([key, rawFact]) => {
                const fact = normaliseFact(rawFact);
                const tierLabel = fact.farmerActual
                  ? "Farmer confirmed"
                  : fact.evidenceState
                    ? EVIDENCE_STATE_UI_LABEL[fact.evidenceState]
                    : undefined;
                return (
                  <div key={key} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <dt className="shrink-0 font-medium text-fr-ink-900">{key}:</dt>
                    <dd className="min-w-0 truncate text-fr-ink-600">{fact.value}</dd>
                    {tierLabel ? (
                      <span
                        data-testid="ask-ai-fact-tier"
                        className="shrink-0 rounded-full border border-fr-border bg-fr-surface px-1.5 py-0.5 text-[11px] font-medium text-fr-ink-600"
                      >
                        {tierLabel}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </dl>
          )}
        </div>

        <div className="rounded-fr-control border border-fr-border bg-fr-surface p-3 text-sm text-fr-ink-600">
          Ask AI isn&apos;t connected yet on this build. Once a validated AI provider is configured, it will answer
          using only the real context shown above — never invented farm facts.
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-wide text-fr-ink-600">Ask anything about your farm</span>
          <input
            type="text"
            disabled
            placeholder="Not available yet"
            className="w-full rounded-fr-control border border-fr-border bg-fr-surface-alt px-3 py-2.5 text-sm text-fr-ink-400"
          />
        </label>
      </div>
    </Sheet>
  );
}

/**
 * The persistent "Ask AI" affordance itself — §3's "secondary but easy to
 * reach" rule. Drop this on any primary screen with a real
 * `AskAIContext`; it owns its own open/close state so a call site needs
 * nothing more than the one prop.
 */
export function AskAIButton({ context, className }: { context: AskAIContext; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-fr-green-700/20 bg-fr-green-100 px-3.5 py-2 text-sm font-medium text-fr-green-700",
          className,
        )}
      >
        <Sparkles className="size-4" />
        Ask AI
      </button>
      <AskAIOverlay open={open} onClose={() => setOpen(false)} context={context} />
    </>
  );
}
