"use client";

/**
 * A pop-up tip for one step, and the "?" button that brings it back.
 * See `src/lib/step-tips.ts` for what is remembered and where.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import {
  askForStepTip,
  dismissStepTip,
  getServerStepTipState,
  getStepTipState,
  isStepTipVisible,
  skipAllStepTips,
  subscribeStepTips,
} from "@/lib/step-tips";

function useStepTipVisible(id: string): boolean {
  const state = useSyncExternalStore(subscribeStepTips, getStepTipState, getServerStepTipState);
  return isStepTipVisible(state, id);
}

/** `floating` sits over a map; `inline` sits inside an already-dark panel. */
export function StepTip({ id, children, className = "", variant = "floating" }: { id: string; children: ReactNode; className?: string; variant?: "floating" | "inline" }) {
  const visible = useStepTipVisible(id);
  if (!visible) return null;
  return (
    <div
      role="status"
      data-step-tip={id}
      className={`pointer-events-auto border-l-[3px] border-fr-v2-straw px-3 py-2 text-white sm:px-3.5 sm:py-3 ${variant === "inline" ? "bg-white/[0.07]" : "bg-fr-v2-forest-deep/95 shadow-xl backdrop-blur"} ${className}`}
    >
      {/* Kept short on phones so a tip never hides the thing it is about. */}
      <p className="text-[13px] leading-snug text-white/90">
        <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fr-v2-straw">Tip</span>
        {children}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-3 sm:mt-2">
        <button type="button" onClick={skipAllStepTips} className="min-h-9 text-xs font-semibold text-white/65 underline underline-offset-4 hover:text-white sm:min-h-10">
          Skip all tips
        </button>
        <button type="button" onClick={() => dismissStepTip(id)} className="min-h-9 bg-fr-v2-straw px-4 text-xs font-semibold text-fr-v2-forest-deep hover:bg-white sm:min-h-10">
          Got it
        </button>
      </div>
    </div>
  );
}

/** Shown only while the step's tip is closed. `tone` matches the bar it sits on. */
export function StepTipButton({ id, tone = "dark", className = "" }: { id: string; tone?: "dark" | "light"; className?: string }) {
  const visible = useStepTipVisible(id);
  if (visible) return null;
  return (
    <button
      type="button"
      onClick={() => askForStepTip(id)}
      aria-label="Show the tip for this step"
      className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone === "dark" ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-fr-ink-600 hover:bg-black/5"} ${className}`}
    >
      <HelpCircle className="size-5" aria-hidden />
    </button>
  );
}
