/**
 * Target-season slurry forecast adoption (Codex audit F010).
 *
 * Two different things can say "this field gets slurry in season S":
 *
 * - A PHYSICAL RESERVATION (`slurry_allocations`, status `planned`): slurry
 *   that exists in a store now and is held for a field. It reduces the
 *   store's unallocated volume and is bounded by what is physically there.
 * - A FORECAST INTENT (this module): slurry the farmer expects to have in a
 *   future season — produced by housed animals between now and then — and
 *   has adopted as the planning basis for that season's fertiliser
 *   procurement. It is never written to `slurry_allocations`, never reduces
 *   today's tank contents and never counts as physical stock.
 *
 * Adoption is append-only: each adoption (or withdrawal) is one immutable
 * record holding the whole validated scenario, so a season's adopted plan is
 * always one complete, internally consistent set — never a partial write.
 * The latest record for a season governs; a withdrawal clears it.
 *
 * Combination rule (`planningSeasonSlurryAllocations`): for each field, a
 * physical reservation dated in the planning season wins over an adopted
 * intent for that field — the concrete plan replaces the forecast. An intent
 * only supplies the credit for a field with no physical reservation in that
 * season. A field never receives both, so forecast slurry is never counted
 * twice. Forecast provenance (source, planning date, forecast volume,
 * adoption id/time) is carried on every intent allocation.
 *
 * Supersession lifecycle (`forecastSupersededFieldIds`), per physical
 * allocation of the field whose planned application date OR actual spread
 * date falls in the planning season:
 * - planned: supersedes the intent (the reservation is the basis).
 * - completed: STILL supersedes. The slurry was actually spread; that actual
 *   is the field's evidence, and completion releasing the reservation must
 *   never bring the replaced forecast back — that would count the same
 *   field's slurry twice (forecast + actual).
 * - cancelled: does not supersede. A cancelled allocation reserves and
 *   credits nothing, so the season's still-adopted forecast is again the
 *   field's only slurry basis — no double count. The cancelled record is kept
 *   as history; it is never deleted.
 * Season rollover: adoptions, intents and superseding allocations are all
 * keyed to one planning season, so a prior season's adoption or allocation
 * never applies to (or suppresses) a later season.
 */

import { tracked, type SlurryAllocation } from "./types";
import type { SlurryAllocationRecord } from "./slurry-allocation-lifecycle";
import type { FarmSlurryForecast } from "./slurry-storage-forecast";
import type { SlurryPlanningApplicationMethod } from "./slurry-planning-scenario";

export const SLURRY_FORECAST_ADOPTION_VERSION = "slurry_forecast_adoption_v1.0.0";

export interface SlurryForecastIntent {
  fieldId: string;
  housingId: string;
  volumeM3: number;
  applicationMethod: SlurryPlanningApplicationMethod;
  applicationDate: string;
}

export interface SlurryForecastAdoptionRecord {
  id: string;
  farmId: string;
  planningSeason: string;
  action: "adopt" | "withdraw";
  /** Present for `adopt`. */
  planningDate?: string;
  forecastSource?: "FARMER_FORECAST" | "SYSTEM_FORECAST";
  expectedAvailableM3?: number;
  productionBasis?: "TARGET_SEASON_SAVED" | "CARRY_FORWARD_CURRENT_SETTINGS";
  carriedForwardFromSeason?: string;
  scenarioVersion?: string;
  /** Present for a `SYSTEM_FORECAST` adoption: the server-calculated
   * forecast it is bound to (`bindSystemSlurryForecast`). */
  systemForecast?: SystemSlurryForecastSnapshot;
  /** `SERVER_BOUND` only when the row was written through the server-only
   * write boundary after the forecast was recomputed and bound. Database
   * owned: a client can never set it. */
  systemForecastBinding?: "SERVER_BOUND";
  intents: SlurryForecastIntent[];
  adoptedAt: string;
  adoptedBy?: string;
}

/** The livestock/store forecast a `SYSTEM_FORECAST` adoption was bound to,
 * exactly as the server calculated it. */
export interface SystemSlurryForecastSnapshot {
  /** `SLURRY_STORAGE_FORECAST_VERSION` of the forecast model. */
  version: string;
  /** The assessment date the forecast was projected from (YYYY-MM-DD). */
  assessedOn: string;
  /** The planning date it was projected to. */
  targetDate: string;
  /** Each store's projected volume available for a new plan. */
  stores: { housingId: string; projectedAvailableForNewPlanM3: number }[];
}

/** Display rounding tolerance: the client shows and resubmits a calculated
 * volume to 2 decimal places, so a resubmitted figure may differ from the
 * server's by at most half a hundredth. Anything more is a different
 * number. */
const SYSTEM_FORECAST_VOLUME_TOLERANCE_M3 = 0.005 + 1e-9;

export type SystemSlurryForecastBinding =
  | { status: "BOUND"; expectedAvailableM3: number; snapshot: SystemSlurryForecastSnapshot }
  | { status: "REJECTED"; issues: string[] };

/**
 * Binds a scenario labelled `SYSTEM_FORECAST` to the forecast the server
 * itself calculated (Codex audit F010). The caller's label and volume are
 * never trusted: the forecast must be complete (every store READY) and for
 * the scenario's planning date, the caller's available volume must be that
 * forecast's figure, and the field intent drawn from each store must fit
 * within that store's projected availability. On success the adoption
 * records the SERVER's volume and the snapshot, not the caller's.
 */
export function bindSystemSlurryForecast(input: {
  planningDate: string;
  expectedAvailableM3: number;
  candidates: readonly { housingId: string; volumeM3: number }[];
  forecast: FarmSlurryForecast;
  assessedOn: string;
}): SystemSlurryForecastBinding {
  const { forecast } = input;
  if (forecast.status !== "READY") return { status: "REJECTED", issues: ["SYSTEM_FORECAST_UNAVAILABLE"] };
  if (forecast.targetDate !== input.planningDate)
    return { status: "REJECTED", issues: ["SYSTEM_FORECAST_DATE_MISMATCH"] };
  const issues: string[] = [];
  if (
    !Number.isFinite(input.expectedAvailableM3) ||
    Math.abs(input.expectedAvailableM3 - forecast.projectedAvailableForNewPlanM3) > SYSTEM_FORECAST_VOLUME_TOLERANCE_M3
  )
    issues.push("SYSTEM_FORECAST_VOLUME_MISMATCH");
  const availableByStore = new Map<string, number>();
  for (const store of forecast.stores)
    if (store.status === "READY") availableByStore.set(store.housingId, store.projectedAvailableForNewPlanM3);
  const drawnByStore = new Map<string, { volumeM3: number; count: number }>();
  for (const candidate of input.candidates) {
    const drawn = drawnByStore.get(candidate.housingId) ?? { volumeM3: 0, count: 0 };
    drawnByStore.set(candidate.housingId, { volumeM3: drawn.volumeM3 + candidate.volumeM3, count: drawn.count + 1 });
  }
  for (const [housingId, drawn] of drawnByStore) {
    const available = availableByStore.get(housingId);
    if (available === undefined) issues.push("SYSTEM_FORECAST_STORE_NOT_FORECAST");
    else if (drawn.volumeM3 > available + drawn.count * SYSTEM_FORECAST_VOLUME_TOLERANCE_M3)
      issues.push("SYSTEM_FORECAST_STORE_VOLUME_EXCEEDED");
  }
  if (issues.length > 0) return { status: "REJECTED", issues: [...new Set(issues)] };
  return {
    status: "BOUND",
    expectedAvailableM3: forecast.projectedAvailableForNewPlanM3,
    snapshot: {
      version: forecast.version,
      assessedOn: input.assessedOn,
      targetDate: forecast.targetDate,
      stores: [...availableByStore].map(([housingId, projectedAvailableForNewPlanM3]) => ({
        housingId,
        projectedAvailableForNewPlanM3,
      })),
    },
  };
}

/** Where a planning-season slurry allocation came from. Carried with the
 * allocation into the canonical calculation so a credit always names its
 * own basis — never a bare volume. */
export type PlanningSlurrySource =
  | {
      kind: "PHYSICAL_RESERVATION";
      allocationId?: string;
      planRevision?: number;
    }
  | {
      kind: "FORECAST_INTENT";
      adoptionId: string;
      adoptedAt: string;
      planningDate: string;
      forecastSource: "FARMER_FORECAST" | "SYSTEM_FORECAST";
      expectedAvailableM3: number;
      scenarioVersion: string;
      adoptionVersion: typeof SLURRY_FORECAST_ADOPTION_VERSION;
    }
  | {
      kind: "PREVIEW_SCENARIO";
      planningDate: string;
      forecastSource: "FARMER_FORECAST" | "SYSTEM_FORECAST";
      scenarioVersion: string;
    }
  | { kind: "AUTOMATIC_CANDIDATE"; planningDate: string };

export type PlanningSlurryAllocation = SlurryAllocation & {
  planningSource: PlanningSlurrySource;
};

/** The adoption that governs `planningSeason`, or `undefined` when none is
 * adopted (no record, or the latest record is a withdrawal). A
 * `SYSTEM_FORECAST` adoption is a verified system forecast only when it
 * carries its server snapshot AND the `SERVER_BOUND` marker of the
 * server-only write boundary; a snapshot alone proves nothing (a legacy or
 * directly inserted row could carry a forged one). Anything else never
 * governs (fails closed). */
export function currentSlurryForecastAdoption(
  records: readonly SlurryForecastAdoptionRecord[],
  planningSeason: string,
): (SlurryForecastAdoptionRecord & { action: "adopt" }) | undefined {
  const latest = records
    .filter((record) => record.planningSeason === planningSeason)
    .sort((a, b) => Date.parse(b.adoptedAt) - Date.parse(a.adoptedAt) || (a.id < b.id ? 1 : -1))[0];
  if (!latest || latest.action !== "adopt") return undefined;
  if (
    latest.forecastSource !== "FARMER_FORECAST" &&
    !(latest.systemForecast && latest.systemForecastBinding === "SERVER_BOUND")
  )
    return undefined;
  return latest as SlurryForecastAdoptionRecord & { action: "adopt" };
}

export function forecastIntentAllocations(
  adoption: SlurryForecastAdoptionRecord & { action: "adopt" },
): PlanningSlurryAllocation[] {
  const source = `Adopted ${adoption.planningSeason} slurry forecast (${
    adoption.forecastSource === "FARMER_FORECAST" ? "farmer forecast" : "livestock/store forecast"
  })`;
  const extra = { sourceDate: adoption.adoptedAt.slice(0, 10) };
  return adoption.intents.map((intent) => ({
    fieldId: intent.fieldId,
    housingId: intent.housingId,
    volumeM3: intent.volumeM3,
    applicationMethod: tracked(intent.applicationMethod, "farmer_adjusted", source, extra),
    applicationDate: tracked(intent.applicationDate, "farmer_adjusted", source, extra),
    planningSource: {
      kind: "FORECAST_INTENT",
      adoptionId: adoption.id,
      adoptedAt: adoption.adoptedAt,
      planningDate: adoption.planningDate ?? "",
      forecastSource: adoption.forecastSource ?? "SYSTEM_FORECAST",
      expectedAvailableM3: adoption.expectedAvailableM3 ?? 0,
      scenarioVersion: adoption.scenarioVersion ?? "",
      adoptionVersion: SLURRY_FORECAST_ADOPTION_VERSION,
    },
  }));
}

/** Fields whose adopted forecast intent for `planningSeason` is replaced by
 * a physical allocation — planned or completed, never cancelled (see the
 * module comment's supersession lifecycle). `allocationRecords` is every
 * allocation of the farm with its full lifecycle. */
export function forecastSupersededFieldIds(
  allocationRecords: readonly Pick<
    SlurryAllocationRecord,
    "fieldId" | "status" | "priority" | "applicationDate" | "actualSpreadDate"
  >[],
  planningSeason: string,
): Set<string> {
  const superseded = new Set<string>();
  for (const record of allocationRecords) {
    const inSeason =
      record.applicationDate?.value?.slice(0, 4) === planningSeason ||
      record.actualSpreadDate?.slice(0, 4) === planningSeason;
    if (!inSeason) continue;
    if (record.status === "completed") superseded.add(record.fieldId);
    else if (record.status === "planned" && record.priority !== "not_suitable") superseded.add(record.fieldId);
  }
  return superseded;
}

/** Physical reservations already filtered to the planning season, plus the
 * adopted intents for fields not superseded (`forecastSupersededFieldIds`,
 * see the module comment). */
export function planningSeasonSlurryAllocations(
  physicalSeasonAllocations: readonly PlanningSlurryAllocation[],
  adoptedIntents: readonly PlanningSlurryAllocation[],
  supersededFieldIds: ReadonlySet<string>,
): PlanningSlurryAllocation[] {
  const physicalFields = new Set(
    physicalSeasonAllocations.filter((a) => a.priority !== "not_suitable").map((a) => a.fieldId),
  );
  return [
    ...physicalSeasonAllocations,
    ...adoptedIntents.filter((intent) => !physicalFields.has(intent.fieldId) && !supersededFieldIds.has(intent.fieldId)),
  ];
}
