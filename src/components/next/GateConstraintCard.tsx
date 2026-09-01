"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { AskAIButton, type AskAIContext } from "@/components/next/AskAI";

/**
 * Canonical screen #12 — Gate / Constraint (`FARM_RETURN_NEXT_SPEC_v1_1.md`
 * §5/§12, reference `media/image1.png`'s "5. Gate / Constraint" panel).
 * §5 is explicit this is not a Prompt: "It is not an accept/edit/dismiss
 * Prompt" — so unlike `PromptCard`/`ExpandedPromptSheet`, this component
 * offers no Accept/Dismiss at all, only "View details" / "I understand" /
 * Ask AI, per §12's own pattern list.
 *
 * `criteria` renders the real eligibility checklist a caller already
 * evaluated (e.g. `src/domain/p-build-up-eligibility.ts`'s own checks) —
 * this component never decides what's met/not met itself, only presents
 * a caller-supplied real result, the same "domain computes, component
 * presents" boundary every other card in this app already keeps.
 *
 * Not wired to a live screen yet in this build — `docs/overnight/
 * IMPLEMENTATION_MATRIX.md` records this as a real, deliberate gap (no
 * approved Field-exploration surface exists yet to host a real
 * p-build-up-eligibility check against a real field's real evidence,
 * `BUILD_PLAN.md`'s Vertical E). Ships now, with tests, so the first real
 * Gate a future Field-exploration screen surfaces reuses this rather than
 * inventing its own.
 */
export function GateConstraintCard({
  title,
  explanation,
  criteria,
  onViewDetails,
  askAIContext,
}: {
  title: string;
  explanation: string;
  criteria: { label: string; met: boolean }[];
  onViewDetails?: () => void;
  askAIContext: AskAIContext;
}) {
  return (
    <Card className="border-fr-attention/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-fr-attention" />
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <p className="text-sm text-fr-ink-600">{explanation}</p>

      {criteria.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {criteria.map((c) => (
            <li key={c.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-fr-ink-900">{c.label}</span>
              <span className={c.met ? "font-medium text-fr-good" : "font-medium text-fr-risk"}>
                {c.met ? "Met" : "Not met"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {onViewDetails ? (
          <button
            type="button"
            onClick={onViewDetails}
            className="rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            View details
          </button>
        ) : null}
        <button type="button" className="rounded-full border border-fr-border px-4 py-2.5 text-sm font-medium text-fr-ink-900">
          I understand
        </button>
        <AskAIButton context={askAIContext} />
      </div>
    </Card>
  );
}
