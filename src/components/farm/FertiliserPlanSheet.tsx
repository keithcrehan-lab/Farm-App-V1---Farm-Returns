"use client";

/**
 * Fertiliser Vertical campaign, item 3/9/28 — "Plan this application":
 * turns a field's real, live `fertiliser_recommendation` Prompt into a
 * real, persisted plan (a real accepted/edited Decision — see
 * `FERTILISER_VERTICAL_PHASE0.md`'s "no new Plan table" architecture
 * decision). A dedicated sheet, not a reuse of `ExpandedPromptSheet` —
 * that component is shared across every other Prompt kind, none of
 * which need a farmer-editable product/quantity/date form; adding one
 * there would leak fertiliser-specific fields into every other Prompt's
 * detail view.
 *
 * Two distinct real actions, matching item 4's "must not collapse into
 * one mutable value" distinction:
 * - **Accept as recommended** — `outcome: "accepted"`, no `edits` at
 *   all. The plain, unmodified recommendation becomes the Plan.
 * - **Save my plan** — `outcome: "edited"`, `edits` carrying the
 *   farmer's own chosen product/quantity/date (even when numerically
 *   identical to the recommendation) — a real, explicit planning act,
 *   distinct from a bare acceptance.
 *
 * Both call the same real, server-recomputing `submitPromptDecisionAction`
 * — this sheet never constructs or trusts its own copy of the
 * recommendation's evidence; the server always re-derives it fresh
 * (`decisions.ts`'s own doc comment).
 */
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { submitPromptDecisionAction } from "@/app/actions/decisions";
import { FERTILISER_RECOMMENDATION_PROMPT_KIND, type FertiliserRecommendationSummary } from "@/orchestration/prompt/fertiliser-recommendation";
import { formatNumber } from "@/lib/format";

const inputClass = "w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900";

export function FertiliserPlanSheet({
  open,
  onClose,
  fieldId,
  fieldName,
  recommendation,
  canRecord,
  onPlanned,
  timing,
}: {
  open: boolean;
  onClose: () => void;
  fieldId: string;
  fieldName: string;
  recommendation: FertiliserRecommendationSummary;
  canRecord: boolean;
  onPlanned: () => void;
  /** Fertiliser Vertical campaign, item 7 — the field's own real,
   * current spreading-window status (`promptForSpreadingWindow`'s own
   * title/description, the same real calendar-only legal gate Today/Plan
   * already surface) — never a new, invented "spreading suitability"
   * score. Optional purely for this sheet's own tests; every real caller
   * supplies it. */
  timing?: { title: string; description: string };
}) {
  const defaultProduct = recommendation.products[0]?.name ?? "";
  const defaultQuantityKg = recommendation.products.find((p) => p.name === defaultProduct)?.totalKg;

  const [product, setProduct] = useState(defaultProduct);
  const [quantity, setQuantity] = useState(defaultQuantityKg !== undefined ? String(defaultQuantityKg) : "");
  const [plannedDate, setPlannedDate] = useState("");
  const [state, setState] = useState<{ status: "idle" | "submitting" | "error"; message?: string }>({ status: "idle" });

  const quantityNumber = Number(quantity);
  const canSavePlan = product.trim().length > 0 && quantity.trim().length > 0 && Number.isFinite(quantityNumber) && quantityNumber > 0;

  async function submit(outcome: "accepted" | "edited" | "dismissed") {
    if (!canRecord) {
      setState({ status: "error", message: "Demo mode — this isn't saved to a real account here." });
      return;
    }
    setState({ status: "submitting" });
    try {
      await submitPromptDecisionAction({
        promptKind: FERTILISER_RECOMMENDATION_PROMPT_KIND,
        fieldId,
        outcome,
        edits:
          outcome === "edited"
            ? {
                plannedProduct: product,
                plannedQuantityKg: quantityNumber,
                ...(plannedDate ? { plannedDate } : {}),
              }
            : undefined,
      });
      onPlanned();
    } catch (error) {
      console.error("[FertiliserPlanSheet] submit failed:", error);
      setState({ status: "error", message: "Something went wrong — please try again." });
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Plan this application">
      <div className="flex flex-col gap-4">
        <div className="rounded-fr-control border border-fr-border bg-fr-surface-alt p-3">
          <p className="mb-1 text-label uppercase tracking-wide text-fr-ink-600">Recommended — {fieldName}</p>
          {recommendation.products.map((p) => (
            <p key={p.name} className="text-sm text-fr-ink-600">
              {p.name}: {formatNumber(p.totalKg, 1)} kg ({p.npkAnalysis})
            </p>
          ))}
        </div>

        {timing ? (
          <div className="rounded-fr-control border border-fr-border bg-fr-surface-alt p-3">
            <p className="mb-1 text-label uppercase tracking-wide text-fr-ink-600">Timing</p>
            <p className="text-sm font-medium text-fr-ink-900">{timing.title}</p>
            <p className="text-sm text-fr-ink-600">{timing.description}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <p className="text-label uppercase tracking-wide text-fr-ink-600">Your plan</p>
          <select aria-label="Product" className={inputClass} value={product} onChange={(e) => setProduct(e.target.value)}>
            {recommendation.products.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              aria-label="Quantity (kg)"
              className={inputClass}
              type="number"
              placeholder="Quantity (kg)"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <input aria-label="Planned date (optional)" className={inputClass} type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
          </div>
        </div>

        {state.status === "error" ? (
          <div role="alert" className="rounded-fr-control bg-fr-attention-bg px-3 py-2.5 text-sm text-fr-attention">
            {state.message}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={state.status === "submitting" || !canSavePlan}
            onClick={() => submit("edited")}
            className="rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            Save my plan
          </button>
          <button
            type="button"
            disabled={state.status === "submitting"}
            onClick={() => submit("accepted")}
            className="rounded-full border border-fr-border px-4 py-2.5 text-sm font-medium text-fr-ink-900 disabled:opacity-60"
          >
            Accept as recommended
          </button>
          <button
            type="button"
            disabled={state.status === "submitting"}
            onClick={() => submit("dismissed")}
            className="px-4 py-2 text-sm text-fr-ink-600 disabled:opacity-60"
          >
            Not now
          </button>
        </div>
      </div>
    </Sheet>
  );
}
