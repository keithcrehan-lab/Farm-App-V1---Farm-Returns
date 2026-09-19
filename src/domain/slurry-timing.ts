/**
 * Slurry Timing Evidence Patch V1 — the canonical slurry-application
 * timing classification.
 *
 * Source (verified directly against the primary document, not merely a
 * search-result summary): Teagasc — "Farm Carbon Navigator User Manual"
 * (Jan 2016 edition), §5.6 "Improved Slurry Management" (Beef) and §6.4
 * "Improved Slurry Management" (Dairy) — identical text in both:
 *
 *   "Enter the % of the annual slurry application in the three periods
 *    Spring Jan – April, Summer May – June, Late Summer July – October."
 *
 * https://www.teagasc.ie/media/website/about/our-organisation/Instruction-Carbon-Navigator-V2.pdf
 *
 * This is a TIMING LABEL only — see `src/domain/nutrients.ts`'s
 * `resolveAvailableSlurryNutrients` for which of these categories
 * actually has an evidenced available-N/P/K rule behind it (`SPRING` and
 * `SUMMER` only, as of Slurry Timing Evidence Patch V1). `LATE_SUMMER` is
 * a real, named Carbon Navigator period — it is NOT the same thing as a
 * nutrient-availability rule, and this module makes no claim that one
 * exists for it. `UNSUPPORTED` is for a date the Carbon Navigator itself
 * publishes no period for at all (November/December, or a malformed
 * date) — never silently folded into the nearest neighbouring period.
 */

export type SlurryTimingCategory = "SPRING" | "SUMMER" | "LATE_SUMMER" | "UNSUPPORTED";

export const SLURRY_TIMING_SOURCE =
  "Teagasc Farm Carbon Navigator User Manual (Jan 2016) — slurry application periods: Spring Jan-Apr, Summer May-Jun, Late Summer Jul-Oct";

/**
 * `isoDate` — an ISO `YYYY-MM-DD` date string (e.g.
 * `SlurryAllocation.applicationDate.value`, the format an HTML
 * `<input type="date">` already produces — see `FieldDrawer.tsx`). Reads
 * the month component directly off the string (matching this codebase's
 * established `isoDate.slice(5, ...)` pattern — `closed-period-calendar.ts`,
 * `concentrate-gates.ts` — rather than constructing a `Date` object,
 * which would be sensitive to the runtime's local timezone for a plain
 * calendar-date string with no time component).
 */
export function classifySlurryTiming(isoDate: string): SlurryTimingCategory {
  const month = Number(isoDate.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return "UNSUPPORTED";
  if (month >= 1 && month <= 4) return "SPRING";
  if (month >= 5 && month <= 6) return "SUMMER";
  if (month >= 7 && month <= 10) return "LATE_SUMMER";
  // November/December — no Carbon Navigator period covers these months.
  return "UNSUPPORTED";
}
