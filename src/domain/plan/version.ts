/**
 * Plan Operating System v1, Phase 0 — the Plan kernel version stamped on
 * every Plan audit event, so a recorded transition can be reproduced
 * against the exact rules that produced it.
 */
export const PLAN_KERNEL_VERSION = "plan_kernel_v0.1.0" as const;

export type PlanKernelVersion = typeof PLAN_KERNEL_VERSION;
