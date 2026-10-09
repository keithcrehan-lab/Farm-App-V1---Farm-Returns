/**
 * Plan kernel — timing.
 *
 * Recommended windows and hard deadlines are distinct discriminated types.
 * A recommended window is advice and can never be read as a deadline; a
 * hard deadline must name the authority that fixes it (a registered source,
 * a farmer-confirmed commitment or a canonical record), so a legal date can
 * only enter Plan with its source. No regulatory date or scientific timing
 * value is defined in this module.
 */

import { isValidIsoUtcDateTime } from "../iso-datetime";
import type { SourceId } from "../source-register";

export interface RecommendedWindow {
  kind: "RECOMMENDED_WINDOW";
  /** `null` = open start (act any time before `endIso`). */
  startIso: string | null;
  /** `null` = open end. */
  endIso: string | null;
  /** Why this window is recommended. */
  basis: string;
}

export type HardDeadlineAuthority =
  | { kind: "REGISTERED_SOURCE"; sourceId: SourceId }
  | { kind: "FARMER_CONFIRMED_COMMITMENT"; description: string }
  | { kind: "CANONICAL_RECORD"; recordId: string; recordKind: string };

export interface HardDeadline {
  kind: "HARD_DEADLINE";
  dueIso: string;
  authority: HardDeadlineAuthority;
}

export interface PlanTiming {
  recommendedWindow: RecommendedWindow | null;
  hardDeadline: HardDeadline | null;
}

export const NO_TIMING: PlanTiming = { recommendedWindow: null, hardDeadline: null };

export type TimingResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function recommendedWindow(
  startIso: string | null,
  endIso: string | null,
  basis: string,
): TimingResult<RecommendedWindow> {
  if (startIso !== null && !isValidIsoUtcDateTime(startIso)) return { ok: false, error: "INVALID_WINDOW_START" };
  if (endIso !== null && !isValidIsoUtcDateTime(endIso)) return { ok: false, error: "INVALID_WINDOW_END" };
  if (startIso !== null && endIso !== null && Date.parse(endIso) < Date.parse(startIso)) {
    return { ok: false, error: "WINDOW_END_BEFORE_START" };
  }
  return { ok: true, value: { kind: "RECOMMENDED_WINDOW", startIso, endIso, basis } };
}

export function hardDeadline(dueIso: string, authority: HardDeadlineAuthority): TimingResult<HardDeadline> {
  if (!isValidIsoUtcDateTime(dueIso)) return { ok: false, error: "INVALID_DEADLINE" };
  return { ok: true, value: { kind: "HARD_DEADLINE", dueIso, authority } };
}

export type WindowPosition = "NO_WINDOW" | "BEFORE_WINDOW" | "IN_WINDOW" | "AFTER_WINDOW";

export function windowPosition(window: RecommendedWindow | null, nowIso: string): WindowPosition {
  if (window === null) return "NO_WINDOW";
  const now = Date.parse(nowIso);
  if (window.startIso !== null && now < Date.parse(window.startIso)) return "BEFORE_WINDOW";
  if (window.endIso !== null && now > Date.parse(window.endIso)) return "AFTER_WINDOW";
  return "IN_WINDOW";
}

export function isHardDeadlinePassed(deadline: HardDeadline | null, nowIso: string): boolean {
  return deadline !== null && Date.parse(nowIso) > Date.parse(deadline.dueIso);
}
