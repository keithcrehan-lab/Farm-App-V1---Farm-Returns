/**
 * Scientific engine V3 — Phase G: the real statutory closed-period
 * spreading calendar (`rules_statutory/closed_periods_2026.csv`, all 27
 * counties × 3 materials, zones A/B/C). Grounded exactly in
 * `GFT057`-`GFT080`.
 *
 * Every county within a zone shares identical dates per material in the
 * source CSV — confirmed by inspecting all 27 rows — so this is modelled
 * as one table keyed by zone, not 27 duplicated county rows, plus a
 * county->zone lookup.
 */

import { blockedInsufficientEvidence, legalProhibition, ok, type EngineOutcome } from "./evidence";

export const CLOSED_PERIOD_CALENDAR_VERSION = "closed_period_calendar_v1.0.0";

export type SpreadingZone = "A" | "B" | "C";
export type SpreadingMaterial = "chemical_fertiliser" | "organic_fertiliser_other_than_FYM" | "farmyard_manure";

/** `closed_periods_2026.csv`'s own `zone` column, one row per county. */
export const COUNTY_ZONE: Record<string, SpreadingZone> = {
  Carlow: "A", Cork: "A", Dublin: "A", Kildare: "A", Kilkenny: "A", Laois: "A",
  Offaly: "A", Tipperary: "A", Waterford: "A", Wexford: "A", Wicklow: "A",
  Clare: "B", Galway: "B", Kerry: "B", Limerick: "B", Longford: "B", Louth: "B",
  Mayo: "B", Meath: "B", Roscommon: "B", Sligo: "B", Westmeath: "B",
  Cavan: "C", Donegal: "C", Leitrim: "C", Monaghan: "C",
};

/**
 * `COUNTY_ZONE` above is keyed by the bare county name (e.g. `"Cork"`),
 * matching the statutory zone listing's own wording — `Farm.location.county`
 * is farmer-entered free text and may carry the common "Co. " prefix
 * (e.g. `"Co. Cork"`). Every real production caller of `COUNTY_ZONE`
 * (directly or via `checkClosedPeriodCalendar`) should normalise through
 * this first rather than repeating the mismatch — V3 closure pass
 * (second pass), the first production call site to connect farm data to
 * this table found the gap latent (real-alerts.ts).
 */
export function normaliseCountyForZoneLookup(county: string): string {
  return county.replace(/^Co\.\s*/i, "").trim();
}

interface ClosedPeriod {
  closedFromMmDd: string;
  closedThroughMmDd: string;
}

/** `closed_periods_2026.csv`'s `closed_from_mm_dd`/`closed_through_mm_dd`
 * columns, per zone/material — identical across every county sharing a
 * zone. */
export const CLOSED_PERIOD_BY_ZONE_MATERIAL: Record<SpreadingZone, Record<SpreadingMaterial, ClosedPeriod>> = {
  A: {
    chemical_fertiliser: { closedFromMmDd: "09-15", closedThroughMmDd: "01-29" },
    organic_fertiliser_other_than_FYM: { closedFromMmDd: "10-01", closedThroughMmDd: "01-12" },
    farmyard_manure: { closedFromMmDd: "11-01", closedThroughMmDd: "01-12" },
  },
  B: {
    chemical_fertiliser: { closedFromMmDd: "09-15", closedThroughMmDd: "01-29" },
    organic_fertiliser_other_than_FYM: { closedFromMmDd: "10-01", closedThroughMmDd: "01-15" },
    farmyard_manure: { closedFromMmDd: "11-01", closedThroughMmDd: "01-15" },
  },
  C: {
    chemical_fertiliser: { closedFromMmDd: "09-15", closedThroughMmDd: "02-14" },
    organic_fertiliser_other_than_FYM: { closedFromMmDd: "10-01", closedThroughMmDd: "01-31" },
    farmyard_manure: { closedFromMmDd: "11-01", closedThroughMmDd: "01-31" },
  },
};

/** Every closed period in this table wraps across the calendar year
 * (e.g. 09-15 -> 01-29 spans Sep this year to Jan next year) — detected
 * generically by `from > through` in mm-dd string order, not hard-coded
 * per zone. */
function isWithinClosedPeriod(mmDd: string, period: ClosedPeriod): boolean {
  const { closedFromMmDd, closedThroughMmDd } = period;
  if (closedFromMmDd > closedThroughMmDd) {
    return mmDd >= closedFromMmDd || mmDd <= closedThroughMmDd;
  }
  return mmDd >= closedFromMmDd && mmDd <= closedThroughMmDd;
}

export interface ClosedPeriodCalendarInput {
  county: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  material: SpreadingMaterial;
}

/**
 * `GFT057`-`GFT080`. `"BASELINE_OPEN"` — never "compliant"/"permitted" —
 * this is the CALENDAR check alone; ground condition, buffer and other
 * gates still apply separately (`checkSpreadingLegalGate` composes all
 * of them). A closed date is always `LEGAL_PROHIBITION`, regardless of
 * weather (spec H: "Favourable weather cannot create a legal exceptional
 * opening") — no exception/override parameter exists on this function at
 * all, since `dynamic_spreading_exception_events.csv` is currently empty
 * (no authoritative event has ever been verified) and there is nothing
 * for a caller to legitimately supply.
 */
export function checkClosedPeriodCalendar(input: ClosedPeriodCalendarInput): EngineOutcome<"BASELINE_OPEN"> {
  const zone = COUNTY_ZONE[input.county];
  if (zone === undefined) {
    return blockedInsufficientEvidence("MISSING_COUNTY_ZONE", ["county"]);
  }
  const period = CLOSED_PERIOD_BY_ZONE_MATERIAL[zone][input.material];
  const mmDd = input.date.slice(5, 10);

  if (isWithinClosedPeriod(mmDd, period)) {
    return legalProhibition(
      "CLOSED_PERIOD_CALENDAR",
      `${input.date} falls within the statutory closed period for ${input.material} in Zone ${zone} (${period.closedFromMmDd} - ${period.closedThroughMmDd}).`,
    );
  }
  return ok("BASELINE_OPEN", "DERIVED");
}
