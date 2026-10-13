/**
 * Cattle C7 — deterministic occurrence derivation from declared schedule data.
 *
 * Nothing here is a schedule: every anchor, offset, interval and count comes
 * from the declared programme action, applied exactly as declared with C2's
 * exact UTC arithmetic (`addObligationOffset`; `DAY` = 86 400 s, `HOUR` =
 * 3 600 s; no calendar months, no local time, no rounding).
 *
 * - Anchor: `FIXED_INSTANT` (the declared instant) or `DATE_OF_BIRTH` (the UTC
 *   start of the C1 birth date — the C2 convention). The engine resolves the
 *   anchor; an unresolved anchor yields no occurrence (UNKNOWN / conflict /
 *   invalid upstream), never a guessed one.
 * - Occurrence n (0-based, n < count; one occurrence without `repeat`):
 *   `base = anchor + n × interval` (the interval amount multiplied exactly),
 *   `opensAt = base + opensAfter`, `dueAt = base + dueAfter`.
 * - Boundary convention (engine convention, not veterinary content): the
 *   window starts at `opensAt` inclusive; it ends at `dueAt` exclusive unless
 *   the action declares `INCLUSIVE_START_INCLUSIVE_END`. Before `opensAt` is
 *   BEFORE; inside is IN; at or after the end is AFTER.
 * - Occurrence id (C2 `obligationOccurrenceId` pattern):
 *   `<programmeId>|<actionId>|<animalId>|<anchorKind>|<canonical anchor>|<n>`
 *   — deterministic, independent of the programme version, so a completion
 *   declaration names an occurrence exactly and version binding is checked
 *   separately (CAT-INV-025).
 * - A window outside years 0000–9999 is unrepresentable ⇒ the derivation
 *   fails closed for that occurrence (`null`).
 */

import { compareInstants } from "../animal-ledger";
import { addObligationOffset } from "../regulatory/obligation-time";
import type { ProgrammeAction, ProgrammeAnchorKind, ProgrammeWindowBoundary } from "./programme-definition";

export interface ProgrammeOccurrence {
  occurrenceId: string;
  /** 0-based position in the declared repeat sequence. */
  index: number;
  anchorKind: ProgrammeAnchorKind;
  /** Canonical spelling. */
  anchorAt: string;
  opensAt: string;
  dueAt: string;
  boundary: ProgrammeWindowBoundary;
}

export type WindowPosition = "BEFORE" | "IN" | "AFTER";

export function programmeOccurrenceId(programmeId: string, actionId: string, animalId: string, anchorKind: ProgrammeAnchorKind, anchorAt: string, index: number): string {
  return `${programmeId}|${actionId}|${animalId}|${anchorKind}|${anchorAt}|${index}`;
}

/** Each declared occurrence of `action` for one animal, in index order; `null` entries are unrepresentable windows. */
export function deriveProgrammeOccurrences(
  programmeId: string,
  action: ProgrammeAction,
  animalId: string,
  anchorAt: string,
): ({ index: number; occurrence: ProgrammeOccurrence | null })[] {
  const { anchor, window, repeat } = action.schedule;
  const count = repeat === null ? 1 : repeat.count;
  const out: { index: number; occurrence: ProgrammeOccurrence | null }[] = [];
  for (let index = 0; index < count; index++) {
    const base = repeat === null ? anchorAt : addObligationOffset(anchorAt, { amount: repeat.interval.amount * index, unit: repeat.interval.unit });
    const opensAt = base === null ? null : addObligationOffset(base, window.opensAfter);
    const dueAt = base === null ? null : addObligationOffset(base, window.dueAfter);
    out.push({
      index,
      occurrence:
        opensAt === null || dueAt === null
          ? null
          : { occurrenceId: programmeOccurrenceId(programmeId, action.actionId, animalId, anchor.kind, anchorAt, index), index, anchorKind: anchor.kind, anchorAt, opensAt, dueAt, boundary: window.boundary },
    });
  }
  return out;
}

/** Position of instant `t` relative to the occurrence window (boundary convention in the header). */
export function windowPosition(o: Pick<ProgrammeOccurrence, "opensAt" | "dueAt" | "boundary">, t: string): WindowPosition {
  if (compareInstants(t, o.opensAt) < 0) return "BEFORE";
  const vsEnd = compareInstants(t, o.dueAt);
  if (vsEnd < 0 || (vsEnd === 0 && o.boundary === "INCLUSIVE_START_INCLUSIVE_END")) return "IN";
  return "AFTER";
}
