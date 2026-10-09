/**
 * Tiny generic fixtures for the Plan kernel tests. Not cattle behaviour:
 * a group of three animal subjects and an abstract data requirement.
 */

import { subjectRef } from "../subject";
import { NO_CANONICAL_EVIDENCE, type CanonicalEvidence, type CompletionContract } from "./completion";
import { NO_DEPENDENCIES } from "./dependencies";
import { createPlanJob, type PlanJob, type PlanJobInput } from "./job";
import type { PlanEvaluationContext } from "./reevaluate";
import type { ScopeSelector } from "./scope";
import { NO_TIMING } from "./timing";

export const NOW = "2026-10-09T09:00:00Z";
export const LATER = "2026-10-10T09:00:00Z";

export const GROUP = subjectRef("ANIMAL_GROUP", "g1");
export const A1 = subjectRef("ANIMAL", "a1");
export const A2 = subjectRef("ANIMAL", "a2");
export const A3 = subjectRef("ANIMAL", "a3");
export const A4 = subjectRef("ANIMAL", "a4");

export const GROUP_SELECTOR: ScopeSelector = { kind: "MEMBERS_OF", parent: GROUP, memberType: "ANIMAL" };

export const DATA_CONTRACT: CompletionContract = { kind: "DATA_COMPLETION", requirementKey: "test.requirement" };

export function makeJob(overrides: Partial<PlanJobInput> = {}): PlanJob {
  return createPlanJob(
    {
      id: "job-1",
      actionKey: "TEST_ACTION",
      title: "Test job",
      creationSource: { kind: "FARM_RETURN", reason: "DATA_GAP" },
      scope: { kind: "DYNAMIC", selector: GROUP_SELECTOR, additions: "FOLLOW_ON_WORK" },
      initialMembers: [A1, A2, A3],
      completionContract: DATA_CONTRACT,
      timing: NO_TIMING,
      dependencies: NO_DEPENDENCIES,
      systemPriority: { tier: "INFORMATION_VALUE", basis: "test" },
      status: "PLANNED",
      route: { kind: "LIVESTOCK_GROUP", groupId: "g1" },
      ...overrides,
    },
    NOW,
  ).job;
}

export function presence(present: readonly (typeof A1)[], missing: readonly (typeof A1)[] = []): CanonicalEvidence {
  return {
    ...NO_CANONICAL_EVIDENCE,
    dataPresence: {
      "test.requirement": {
        status: "AVAILABLE",
        members: [
          ...present.map((subject) => ({ subject, state: "PRESENT" as const, sourceRecordId: `rec-${subject.id}` })),
          ...missing.map((subject) => ({ subject, state: "MISSING" as const })),
        ],
      },
    },
  };
}

export function context(overrides: Partial<PlanEvaluationContext> = {}): PlanEvaluationContext {
  return {
    nowIso: NOW,
    scopeReality: [{ selector: GROUP_SELECTOR, membership: { status: "KNOWN", members: [A1, A2, A3] } }],
    evidence: presence([], [A1, A2, A3]),
    jobStatuses: {},
    blockers: {},
    ...overrides,
  };
}
