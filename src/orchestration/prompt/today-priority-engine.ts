/**
 * Today Opportunity Priority Engine V1 (2026-09-19) — the shared,
 * explainable farm-level priority decision every category resolver in
 * `today-opportunities.ts` feeds real, already-computed facts into.
 *
 * This replaces the transitional "inherit priority from one
 * representative field's own status" approach
 * (`select-primary.ts`'s `selectPrimaryPrompt` + `priorityForEngineStatus`,
 * still used for MEMBERSHIP filtering and for the older per-field
 * `select-primary.ts`/map-marker use cases, but no longer for a
 * category's own overall priority). Priority now answers "how important
 * is it for the farmer to deal with this farm-level opportunity now?" —
 * never "how many fields are affected" (that's `affectedFieldCount`,
 * computed independently) and never "which field has the worst status"
 * (deliberately not a `selectPrimaryPrompt`-style pick).
 *
 * **The model**: each category builder in `today-opportunities.ts`
 * inspects its own real, aggregated facts (open/closed/evidence-gap
 * counts, a real legal blocker, a real evidence-confidence tier, ...)
 * and reduces them to exactly one `PrioritySituation` — a real,
 * documented, farm-level judgement specific to that category's own
 * domain (see each builder's own doc comment for its category-specific
 * V1 rules). This module's only job is the one shared, transparent,
 * reusable step after that: mapping a `PrioritySituation` to a
 * `TodayPriority` via one fixed, documented precedence table, and
 * carrying the real reasons/blockers/evidence-confidence text the
 * caller already built through to the final `PriorityResolution` for
 * "Why this priority?" drill-down (section 3/9 of this checkpoint's
 * brief) — a plain-language explanation, never a numeric score.
 *
 * No arbitrary numeric weights, no invented scientific/urgency
 * thresholds: `SITUATION_PRIORITY` below is the entire decision, and
 * every situation name states in plain English the real condition it
 * represents.
 */
import { TODAY_PRIORITY_LABEL, type TodayPriority } from "./today-priority";

/**
 * The one real, farm-level judgement a category builder reduces its own
 * aggregated facts to. Ordered here from weakest to strongest signal —
 * see `SITUATION_PRIORITY` for the actual priority each maps to, and
 * each category builder's own doc comment for how it decides which one
 * applies.
 *
 * - `evidence_gap` — nothing determinable for this category at all (a
 *   pure "we don't know" state) — always the weakest signal, regardless
 *   of anything else a caller might otherwise report.
 * - `healthy` — confirmed, current, real evidence and genuinely nothing
 *   to act on — informational, not urgent, and deliberately distinct
 *   from an evidence gap (a valid soil test is not the same kind of
 *   "nothing to report" as a missing one).
 * - `weak_evidence` — a real opportunity might exist, but the evidence
 *   behind it is itself ambiguous/uncertain — real, but not solid enough
 *   to elevate.
 * - `blocked` — a real, meaningful opportunity exists and is backed by
 *   solid evidence, but a real legal/operational blocker prevents acting
 *   on it right now. Stays visible and planning-relevant (never
 *   silently dropped, never removed from category membership — see
 *   `today-opportunities.ts`'s own V2 correction note), never presented
 *   as more urgent than "currently blocked" actually is.
 * - `actionable` — a real, meaningful opportunity, backed by solid
 *   evidence, genuinely actionable right now, but with no real
 *   time-sensitive reason (available in this codebase today) to elevate
 *   it further.
 * - `actionable_time_sensitive` — everything `actionable` has, plus a
 *   genuine, already-real time-sensitive fact (e.g. a legally open,
 *   time-limited spreading window) — never an invented weather/seasonal
 *   score.
 */
export type PrioritySituation = "evidence_gap" | "healthy" | "weak_evidence" | "blocked" | "actionable" | "actionable_time_sensitive";

/**
 * The entire priority decision — deliberately a flat lookup table, not a
 * scoring function, so the full rule set is visible at a glance and
 * every mapping is independently reviewable. A category unable to
 * establish a real `actionable_time_sensitive` signal (Lime, Soil — see
 * their own builders' doc comments for why) simply never selects that
 * situation, which is how "Lime/Soil can never reach HIGH in this
 * increment" is enforced — a real, disclosed consequence of missing
 * data, not a per-category special case bolted onto this table.
 */
const SITUATION_PRIORITY: Record<PrioritySituation, TodayPriority> = {
  evidence_gap: "VERY_LOW",
  healthy: "LOW",
  weak_evidence: "LOW",
  blocked: "MEDIUM",
  actionable: "MEDIUM",
  actionable_time_sensitive: "HIGH",
};

export interface PriorityResolution {
  priority: TodayPriority;
  priorityLabel: string;
  /** Real, farmer-legible facts supporting this opportunity — "why does
   * this exist at all", not just "why is it this priority". Empty when
   * the situation has nothing positive to report (a pure evidence gap). */
  reasons: string[];
  /** Real, farmer-legible facts constraining it (a legal restriction, an
   * evidence gap) — empty when nothing is currently constraining it. */
  blockers: string[];
  /** A short, real evidence-confidence summary where one already exists
   * (reusing this app's own `EvidenceState` vocabulary, never a
   * fabricated numeric score) — `undefined` when no real evidence tier
   * applies (e.g. a pure evidence-gap situation). */
  evidenceSummary?: string;
}

/**
 * Applies the one shared precedence table above to a category's own
 * already-decided `situation` and already-built explanation text. This
 * function makes no domain judgement of its own — it is intentionally
 * "dumb": the real judgement already happened in the caller's own
 * category-specific logic (`today-opportunities.ts`).
 */
export function resolveFarmPriority(situation: PrioritySituation, reasons: string[], blockers: string[], evidenceSummary?: string): PriorityResolution {
  const priority = SITUATION_PRIORITY[situation];
  return { priority, priorityLabel: TODAY_PRIORITY_LABEL[priority], reasons, blockers, evidenceSummary };
}
