/**
 * Plan kernel — system priority.
 *
 * Farm Return's internal importance of a job, kept separate from lifecycle
 * status, readiness and the farmer's working order (`farmer-order.ts`).
 * Phase 0 defines the ordered hierarchy only: there are no scores, weights
 * or economic values here, and nothing in this module can reorder a
 * farmer-selected sequence.
 */

/** Highest first: hard legal/compliance/welfare obligations, then avoiding
 * material loss, then expected net return, then high-value information. */
export const SYSTEM_PRIORITY_TIERS = [
  "HARD_OBLIGATION",
  "AVOID_MATERIAL_LOSS",
  "EXPECTED_NET_RETURN",
  "INFORMATION_VALUE",
] as const;

export type SystemPriorityTier = (typeof SYSTEM_PRIORITY_TIERS)[number];

export interface SystemPriority {
  tier: SystemPriorityTier;
  /** Why this tier applies (explainable, never a hidden score). */
  basis: string;
}

export function systemPriorityRank(tier: SystemPriorityTier): number {
  return SYSTEM_PRIORITY_TIERS.indexOf(tier);
}

/** Negative when `a` is more important than `b`; tier only. */
export function compareSystemPriority(a: SystemPriority, b: SystemPriority): number {
  return systemPriorityRank(a.tier) - systemPriorityRank(b.tier);
}
