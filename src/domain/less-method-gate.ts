/**
 * Scientific engine V3 — Phase F2: `LESS_METHOD_GATE`.
 *
 * `ADVERSARIAL_AUDIT_REPORT.md` §1.2 (AF004, HIGH): "LOW EMISSION SLURRY
 * SPREADING requirements apply in specified current statutory situations.
 * The same slurry nutrient-plan calculation cannot be detached from
 * whether the planned application method is legally admissible." This
 * also closes `SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` conflict #6:
 * `nutrients.ts`'s `slurryMethod`/`slurryTiming` parameters were accepted
 * but never read — this gate is what a future wiring of them should
 * actually consult, rather than leaving the field silently inert.
 *
 * Three independent statutory triggers
 * (`rules_statutory/less_requirements_2026.csv`), any one of which
 * requires LOW_EMISSION_SLURRY_SPREADING:
 * - `LESS_GSR_100`: previous-year GSR from grazing livestock manure
 *   ≥100 kg N/ha before export.
 * - `LESS_PIG_SLURRY`: any pig slurry, any holding.
 * - `LESS_ARABLE`: any slurry applied to arable land (its own alternative:
 *   incorporate into soil within 24 hours).
 * Plus one documented exception (`LESS_STEEP_HEALTH_SAFETY_EXCEPTION`):
 * where LESS is required by the GSR rule but is inappropriate for
 * operator health & safety on a steep slope, a downward-facing
 * splashplate close to the ground is permitted IF the LPIS parcel and
 * spreading date(s) are recorded — an undocumented exception claim does
 * not satisfy it.
 */

import { legalProhibition, notApplicable, ok, type EngineOutcome } from "./evidence";

export const LESS_METHOD_GATE_VERSION = "less_method_gate_v1.0.0";

/** `rules_statutory/less_requirements_2026.csv`'s own GSR trigger
 * threshold: "previous-year GSR from grazing livestock manure >=100 kg
 * N/ha prior to export." */
export const LESS_GSR_TRIGGER_KG_N_HA = 100;

/** `rules_statutory/less_requirements_2026.csv`'s own arable-alternative
 * window: "incorporate slurry into soil within 24 hours." */
export const LESS_ARABLE_INCORPORATION_WINDOW_HOURS = 24;

export type SlurryMaterial = "cattle_slurry" | "pig_slurry" | "sheep_slurry" | "other_slurry";
export type SlurryApplicationMethod = "LESS" | "splashplate" | "incorporate_24h" | "other";
export type LessTriggerRule = "LESS_GSR_100" | "LESS_PIG_SLURRY" | "LESS_ARABLE";

export interface LessMethodGateInput {
  material: SlurryMaterial;
  /** Previous-year GSR from grazing livestock manure before export,
   * kg N/ha — the same statutory figure `calculateStatutoryGrasslandStockingRateKgHa`
   * produces. `undefined` means this specific trigger cannot be
   * evaluated (not that it's known not to apply) — see the doc comment
   * on `checkLessMethodGate` for how that's handled. */
  gsrKgNHa?: number;
  landUse: "grass" | "arable";
  method: SlurryApplicationMethod;
  /** Only meaningful when `LESS_ARABLE` is the trigger. */
  incorporatedWithinHours?: number;
  /** The documented `LESS_STEEP_HEALTH_SAFETY_EXCEPTION` — only
   * satisfies the gate when BOTH records are actually confirmed, per the
   * rule's own "must record LPIS parcel and spreading date(s)" text. An
   * unrecorded claim of the exception does not count. */
  steepSlopeHealthSafetyException?: { lpisParcelRecorded: boolean; spreadingDatesRecorded: boolean };
}

export interface LessMethodGateOk {
  result: "COMPLIANT" | "COMPLIANT_ALTERNATIVE";
  triggeredBy: LessTriggerRule[];
}

function activeTriggers(input: LessMethodGateInput): LessTriggerRule[] {
  const triggers: LessTriggerRule[] = [];
  if (input.gsrKgNHa !== undefined && input.gsrKgNHa >= LESS_GSR_TRIGGER_KG_N_HA) triggers.push("LESS_GSR_100");
  if (input.material === "pig_slurry") triggers.push("LESS_PIG_SLURRY");
  if (input.landUse === "arable") triggers.push("LESS_ARABLE");
  return triggers;
}

/**
 * `GFT052`-`GFT055`. Returns `NOT_APPLICABLE` (`LESS_GATE_NOT_APPLICABLE`)
 * when no trigger fires (e.g. `GFT053`: GSR 99 does not reach the 100
 * threshold, cattle slurry on grass land, no pig/arable trigger either).
 * Returns `LEGAL_PROHIBITION` when a trigger fires and the method doesn't
 * satisfy it — reason code names the first-priority active trigger
 * (GSR ≥ pig ≥ arable) when several apply at once.
 */
export function checkLessMethodGate(input: LessMethodGateInput): EngineOutcome<LessMethodGateOk> {
  const triggers = activeTriggers(input);
  if (triggers.length === 0) {
    return notApplicable("LESS_GATE_NOT_APPLICABLE");
  }

  if (input.method === "LESS") {
    return ok({ result: "COMPLIANT", triggeredBy: triggers }, "DERIVED");
  }

  if (
    triggers.includes("LESS_ARABLE") &&
    input.incorporatedWithinHours !== undefined &&
    input.incorporatedWithinHours <= LESS_ARABLE_INCORPORATION_WINDOW_HOURS
  ) {
    return ok({ result: "COMPLIANT_ALTERNATIVE", triggeredBy: ["LESS_ARABLE"] }, "DERIVED");
  }

  if (
    triggers.includes("LESS_GSR_100") &&
    input.material === "cattle_slurry" &&
    input.steepSlopeHealthSafetyException?.lpisParcelRecorded === true &&
    input.steepSlopeHealthSafetyException?.spreadingDatesRecorded === true
  ) {
    return ok({ result: "COMPLIANT_ALTERNATIVE", triggeredBy: ["LESS_GSR_100"] }, "DERIVED");
  }

  const priorityTrigger = triggers.includes("LESS_GSR_100")
    ? "LESS_REQUIRED_GSR100"
    : triggers.includes("LESS_PIG_SLURRY")
      ? "LESS_REQUIRED_PIG_SLURRY"
      : "LESS_REQUIRED_ARABLE";

  return legalProhibition(
    priorityTrigger,
    `Low Emission Slurry Spreading is required for this application (${triggers.join(", ")}) but the proposed method ("${input.method}") does not satisfy it.`,
  );
}
