/**
 * Plan kernel — goals/outcomes and programmes.
 *
 * A goal is the farmer's chosen intent ("sell this group in a target
 * period"), never a computed target: Phase 0 carries no numeric target,
 * strategy or economics. A programme groups related jobs under a goal and
 * exists only so jobs can reference it; it owns no schedule of its own.
 * Both point at canonical farm entities through `SubjectRef` and never copy
 * their facts.
 */

import type { SubjectRef } from "../subject";

export type PlanGoalStatus = "ACTIVE" | "ACHIEVED" | "ABANDONED";

export interface PlanGoal {
  id: string;
  /** Farmer-readable outcome statement. Free text, not a calculated target. */
  outcome: string;
  status: PlanGoalStatus;
  /** Canonical entities the outcome is about (references only). */
  subjects: readonly SubjectRef[];
  createdAt: string;
}

export interface PlanProgramme {
  id: string;
  title: string;
  /** `null` for a standalone programme (e.g. routine seasonal work). */
  goalId: string | null;
}
