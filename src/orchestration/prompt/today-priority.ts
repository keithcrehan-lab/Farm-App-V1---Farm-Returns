/**
 * Farm Priority Tracker V1/V2 — the shared priority vocabulary behind
 * Today's summary tile (`app/(app)/today/page.tsx`'s bottom status
 * strip) and the Farm-Topic Notification cards
 * (`today-opportunities.ts`). Farmer-facing labels are High priority /
 * Medium priority / Low priority / For later (`TODAY_PRIORITY_LABEL`);
 * the internal canonical model stays HIGH/MEDIUM/LOW/VERY_LOW so no enum
 * name ever reaches the UI directly.
 *
 * V2 (Farm-Topic Notification Aggregation, 2026-09-19): the concrete
 * per-category resolvers that used to live here (`slurryCategoryPriority`
 * etc.) moved into `today-opportunities.ts`, which now builds one full
 * `TodayOpportunity` per category (headline, affected fields, evidence)
 * instead of a bare priority — this module keeps only the shared
 * vocabulary both that module and the tile's own counting logic depend
 * on, so there is exactly one place a category's priority is decided,
 * never two competing copies.
 *
 * Priority assignment is deliberately the smallest transitional layer
 * that lets Today consume real, already-computed statuses without
 * hardcoding field counts into the UI — not a new agronomic, regulatory
 * or weather-driven scoring system. `priorityForEngineStatus` reuses
 * `select-primary.ts`'s own `EngineOutcome` status ordering almost
 * verbatim (`LEGAL_PROHIBITION` outranks `OK` outranks
 * `AMBIGUOUS`/`UNKNOWN` outranks `BLOCKED_INSUFFICIENT_EVIDENCE`),
 * relabelled to this tracker's four farmer-facing bands. This is
 * genuinely provisional, not canonical — see `today-opportunities.ts`'s
 * own doc comment for the known per-category limitations this causes.
 */
import type { EngineOutcome } from "@/domain/evidence";

/** Internal canonical model — never rendered directly; see `TODAY_PRIORITY_LABEL`. */
export type TodayPriority = "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW";

/** The one place the agreed farmer-facing copy lives — no enum name
 * (`HIGH`, `VERY_LOW`, ...) is ever put in front of a farmer directly. */
export const TODAY_PRIORITY_LABEL: Record<TodayPriority, string> = {
  HIGH: "High priority",
  MEDIUM: "Medium priority",
  LOW: "Low priority",
  VERY_LOW: "For later",
};

/** Most to least urgent — the order category cards render in and the
 * order the tile's own four segments are read in. */
export const TODAY_PRIORITY_ORDER: readonly TodayPriority[] = ["HIGH", "MEDIUM", "LOW", "VERY_LOW"];

/**
 * Base status->priority mapping, reused across every Prompt-shaped
 * category (Slurry, Fertiliser, Soil — see `today-opportunities.ts`).
 * Mirrors `select-primary.ts`'s own `STATUS_RANK` ordering exactly (same
 * four bands, same order), just relabelled for this tracker — not a
 * second, independently-tuned scale.
 *
 * `NOT_APPLICABLE` deliberately returns `undefined` ("no active item for
 * this category") rather than a priority: for Fertiliser
 * (`fertiliser-recommendation.ts`'s own doc comment) and Slurry's
 * spreading-window check, it genuinely means the check doesn't apply (a
 * tillage field, a zero real remaining need) — nothing to show, the same
 * "nothing to decide yet" treatment `promptStatusTone` already gives it.
 * `today-opportunities.ts`'s own Soil builder overrides this one arm,
 * because `soil_test_age`'s `NOT_APPLICABLE` means something different
 * for that one Prompt kind — see its own doc comment.
 */
export function priorityForEngineStatus(status: EngineOutcome<unknown>["status"]): TodayPriority | undefined {
  switch (status) {
    case "LEGAL_PROHIBITION":
      return "HIGH";
    case "OK":
      return "MEDIUM";
    case "AMBIGUOUS":
    case "UNKNOWN":
      return "LOW";
    case "BLOCKED_INSUFFICIENT_EVIDENCE":
      return "VERY_LOW";
    case "NOT_APPLICABLE":
      return undefined;
  }
}

export interface TodayPriorityCounts {
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  VERY_LOW: number;
}

/**
 * Aggregates at most one priority per category into the tracker's own
 * four counts — the tile's whole reason to exist: "how many active
 * Today items are in each priority band", never "how many fields are
 * affected." A category resolver returning `undefined` (no active item)
 * contributes to no band at all, so the four counts do not have to sum
 * to the number of categories passed in.
 */
export function countTodayPriorities(categoryPriorities: readonly (TodayPriority | undefined)[]): TodayPriorityCounts {
  const counts: TodayPriorityCounts = { HIGH: 0, MEDIUM: 0, LOW: 0, VERY_LOW: 0 };
  for (const priority of categoryPriorities) {
    if (priority) counts[priority] += 1;
  }
  return counts;
}
