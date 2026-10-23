/**
 * Cattle C10 — one reading of a C6 goal declaration, used by every surface
 * that shows a goal (profile goal line, chart overlay, timeline, plan rows,
 * plan save message). A recorded target C6 can't convert to kilograms stays
 * visible as recorded; it is never dropped and never read as "no target".
 *
 * C6 reports every declared goal in force (ACTIVE may hold several; only
 * SALE vs RETAIN, or one type with two outcomes, is a conflict). Choosing
 * between goals in force is outside C6 and C10: `soleActiveGoal` returns a
 * goal only when exactly one is in force, so a single-goal default (the
 * plan's sale date, the projection date, the chart line) never picks one.
 */

import type { ProductionGoalDeclaration } from "../goals";
import { formatDate, formatDayMonth, formatKg } from "./format";

/** KNOWN: C6 canonical kg; UNRESOLVED: a target recorded (`recorded`, e.g. "1000 lb") with no kg (UNSUPPORTED unit). */
export type GoalTargetRead = { state: "KNOWN"; kg: number } | { state: "NOT_SET" } | { state: "UNRESOLVED"; recorded: string };

export interface ActiveGoalRead {
  goalType: string;
  typeLabel: string;
  targetWeight: GoalTargetRead;
  targetDate: string | null;
}

export const GOAL_TYPE_LABEL: Readonly<Record<string, string>> = { FINISHING: "Finishing", SALE: "Sale", RETAIN: "Keep on farm", BREEDING: "Breeding", REPLACEMENT: "Replacement" };
const WEIGHT_UNIT_LABEL: Readonly<Record<string, string>> = { KILOGRAM: "kg", POUND: "lb" };

export function goalTargetOf(d: Pick<ProductionGoalDeclaration, "targetWeight">): GoalTargetRead {
  const t = d.targetWeight;
  if (!t) return { state: "NOT_SET" };
  return t.canonical.state === "KNOWN" ? { state: "KNOWN", kg: t.canonical.kg } : { state: "UNRESOLVED", recorded: `${t.value} ${WEIGHT_UNIT_LABEL[t.unit] ?? t.unit}` };
}

export function activeGoalOf(d: ProductionGoalDeclaration): ActiveGoalRead {
  return { goalType: d.goalType, typeLabel: GOAL_TYPE_LABEL[d.goalType] ?? d.goalType, targetWeight: goalTargetOf(d), targetDate: d.targetDate ?? null };
}

/** The single goal in force, or null when there are none or several (C10 never chooses between goals). */
export function soleActiveGoal(goals: readonly ActiveGoalRead[]): ActiveGoalRead | null {
  return goals.length === 1 ? goals[0] : null;
}

/** "640 kg" / "target weight 1400 lb recorded (can't be converted to kg)" / "no target weight set". */
export function goalTargetText(w: GoalTargetRead): string {
  return w.state === "KNOWN" ? formatKg(w.kg) : w.state === "UNRESOLVED" ? `target weight ${w.recorded} recorded (can't be converted to kg)` : "no target weight set";
}

/** "Finishing, 620 kg by 20 Nov 2026" — every part said, none left out. */
export function goalSummaryText(g: ActiveGoalRead): string {
  return `${g.typeLabel}, ${goalTargetText(g.targetWeight)}${g.targetDate ? ` by ${formatDate(g.targetDate)}` : ", no target date set"}`;
}

/** The timeline's goal detail: the same three target states, short form ("640 kg by 4 Dec"). */
export function goalTimelineDetail(d: Pick<ProductionGoalDeclaration, "targetWeight" | "targetDate">): string {
  const w = goalTargetOf(d);
  return `${goalTargetText(w)}${d.targetDate ? `${w.state === "KNOWN" ? "" : ","} by ${formatDayMonth(d.targetDate)}` : ""}`;
}
