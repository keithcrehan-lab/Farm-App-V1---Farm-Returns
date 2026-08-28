/**
 * Scientific engine V3 — Phase G: `SPREADING_LEGAL_GATE`, composing the
 * closed-period calendar (this phase), the ground/weather hard stops
 * (`rules_statutory/spreading_prohibitions_2026.csv`), and — where
 * relevant — the commonage/LESS/buffer gates already built (Phase F),
 * into the single ordered gate `FARM_RETURN_SCIENTIFIC_CALCULATION_SPEC.md`
 * Section H specifies:
 *
 *   1. current ruleset (closed-period calendar)
 *   2. authoritative exceptional-event registry (none exist —
 *      `dynamic_spreading_exception_events.csv` is empty)
 *   3. ground/weather hard stops
 *   4. buffers/slope/runoff
 *   5. only then agronomic opportunity
 *
 * This module implements steps 1 and 3 directly (the calendar and the
 * five statutory ground/weather prohibitions) and composes in the
 * commonage/LESS/buffer gates (Phase F) as optional steps a caller
 * supplies evidence for — `GFT063`/`GFT064`/`GFT071`/`GFT072`/`GFT079`/
 * `GFT080`: an open calendar does not imply permission (ground condition
 * still gates it), and favourable weather can never invent a legal
 * opening the closed-period calendar itself doesn't grant.
 *
 * Step 5 (agronomic opportunity) is deliberately NOT built here — spec H
 * itself: "No unvalidated 'scientific 0-100 probability'" — this app
 * already correctly declined to build that score (see
 * `docs/data-model.md`'s "Tenth audit pass" entry, `spreading.ts`'s own
 * header). This gate only ever answers PROHIBITED/PERMITTED/UNKNOWN.
 */

import { legalProhibition, ok, type EngineOutcome } from "./evidence";
import { checkClosedPeriodCalendar, type SpreadingMaterial } from "./closed-period-calendar";

export const SPREADING_LEGAL_GATE_VERSION = "spreading_legal_gate_v1.0.0";

export interface SpreadingGroundConditions {
  waterlogged?: boolean;
  floodedOrLikelyToFlood?: boolean;
  frozenOrSnowCovered?: boolean;
  /** `rules_statutory/spreading_prohibitions_2026.csv`'s own wording:
   * "heavy rain is forecast within 48 hours; regard must be had to Met
   * Éireann forecast." A caller-supplied boolean, not derived from live
   * data here — this app's real Met Éireann forecast integration
   * (`src/server/weather/`) is a separate, already-real subsystem this
   * gate doesn't itself call. */
  heavyRainForecast48h?: boolean;
  /** "ground is sloping steeply and there is a significant risk of
   * pollution having regard to runoff pathways, drains, hedges, soil
   * condition and ground cover" — a composite judgement this app cannot
   * derive from a single number; passed in as an already-assessed
   * boolean. */
  steepSlopeSignificantPollutionRisk?: boolean;
}

export interface SpreadingLegalGateInput {
  county: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  material: SpreadingMaterial;
  ground?: SpreadingGroundConditions;
}

/**
 * `GFT057`-`GFT080`. Order matches spec H: calendar first (a hard
 * `LEGAL_PROHIBITION` short-circuits immediately — there is no reason to
 * evaluate ground conditions for a date that's already closed, though the
 * conclusion is the same either way), then the five statutory ground/
 * weather stops, each checked independently and unconditionally (no
 * "favourable weather" input exists anywhere in this function's
 * parameters — there is nothing for one to override, by construction).
 */
export function checkSpreadingLegalGate(input: SpreadingLegalGateInput): EngineOutcome<"PERMITTED"> {
  const calendar = checkClosedPeriodCalendar({ county: input.county, date: input.date, material: input.material });
  if (calendar.status !== "OK") return calendar;

  const ground = input.ground ?? {};
  if (ground.waterlogged) {
    return legalProhibition("GROUND_WATERLOGGED", "Land is waterlogged (S.I. 588/2025, spreading prohibition).");
  }
  if (ground.floodedOrLikelyToFlood) {
    return legalProhibition("SPREAD_STOP_FLOOD", "Land is flooded or likely to flood.");
  }
  if (ground.frozenOrSnowCovered) {
    return legalProhibition("SPREAD_STOP_FROZEN_SNOW", "Land is snow-covered or frozen.");
  }
  if (ground.heavyRainForecast48h) {
    return legalProhibition("SPREAD_STOP_HEAVY_RAIN", "Heavy rain is forecast within 48 hours (Met Éireann forecast).");
  }
  if (ground.steepSlopeSignificantPollutionRisk) {
    return legalProhibition(
      "SPREAD_STOP_STEEP_RISK",
      "Ground is sloping steeply with a significant pollution risk having regard to runoff pathways, drains, hedges, soil condition and ground cover.",
    );
  }

  return ok("PERMITTED", "DERIVED");
}
