import "server-only";

/** Grass intake RESEARCH PREVIEW — authenticated, read-only, flag-gated.
 *
 * This is NOT a planning recommendation and never feeds the live grass
 * picture (cover, wedge, forecasts, fertiliser, Cattle, Today or Plan). It
 * only reports what the existing, source-scoped segment-demand adapter
 * (`getCurrentFarmGrassFieldSegmentDemand`) returns for ONE field over a
 * server-defined window, reduced to bounded typed statuses.
 *
 * Order of checks (each fails closed, before any later work):
 *  1. Private server env flag `GRASS_INTAKE_RESEARCH_PREVIEW` must be exactly
 *     "on". OFF by default; when off NOTHING is queried (the evidence table
 *     is a draft migration and is not deployed).
 *  2. Field id must be a canonical UUID (the browser can choose only a field,
 *     never a farm id or a date range).
 *  3. Existing app-admin check (verified email AND database `app_admins` row).
 *  4. The adapter binds the farm server-side (`getFarmForCurrentUser`); a
 *     field that is not on that farm HOLDS in the domain (`fieldNotFound`).
 * A missing evidence table or any read error returns UNAVAILABLE — never a
 * number, never a crash.
 */
import { canCurrentUserManageRegionalGrassGrowth } from "./regional-grass-admin";
import { getCurrentFarmGrassFieldSegmentDemand } from "./grass-field-segment-demand";

export const GRASS_INTAKE_PREVIEW_FLAG = "GRASS_INTAKE_RESEARCH_PREVIEW";
/** Fixed preview window (a display scope, not a scientific value): the 7 days up to the request. */
export const GRASS_INTAKE_PREVIEW_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 50;

/** Strict: only the exact value "on" enables it. Unset, "true", "1", " on" are all OFF. */
export function isGrassIntakePreviewFlagOn(): boolean {
  return process.env[GRASS_INTAKE_PREVIEW_FLAG] === "on";
}

/** Whether the Grass screen should offer the preview at all. Zero queries when the flag is off. */
export async function isGrassIntakePreviewAvailableForCurrentUser(): Promise<boolean> {
  if (!isGrassIntakePreviewFlagOn()) return false;
  try {
    return await canCurrentUserManageRegionalGrassGrowth();
  } catch {
    return false;
  }
}

/** Bounded, farmer-safe reason families. Raw domain reasons (which embed ids and timestamps) never leave the server. */
export type GrassIntakePreviewHeldReason =
  | "EVIDENCE_MISSING"
  | "EVIDENCE_STALE_OR_INCOMPLETE"
  | "EVIDENCE_CONFLICT"
  | "HEADCOUNT_MISMATCH"
  | "GROUP_RECORDS_CHANGED"
  | "SESSION_RECORDS_INCONSISTENT"
  | "COVER_NOT_VERIFIED_PRE_GRAZING"
  | "FEED_NOT_SUPPORTED"
  | "STAGE_NOT_SUPPORTED"
  | "OUTSIDE_SOURCE_RANGE"
  | "FIELD_NOT_ON_FARM"
  | "POSSIBLY_INCOMPLETE_READ"
  | "OTHER";

export type GrassIntakePreviewUnavailableReason =
  | "NOT_AUTHORISED"
  | "NO_FARM"
  | "INVALID_SCOPE"
  | "EVIDENCE_SCHEMA_UNAVAILABLE"
  | "READ_FAILED";

export interface GrassIntakePreviewWindow { from: string; to: string; days: number }

export type GrassIntakePreviewView =
  | { status: "DISABLED" }
  | { status: "UNAVAILABLE"; reason: GrassIntakePreviewUnavailableReason }
  | { status: "HELD"; version: string; window: GrassIntakePreviewWindow; reasons: GrassIntakePreviewHeldReason[] }
  | { status: "NO_RECORDED_GRAZING"; version: string; window: GrassIntakePreviewWindow }
  | {
      status: "READY";
      version: string;
      resolutionVersion: string;
      window: GrassIntakePreviewWindow;
      quantityBasis: "PLANNING_ALLOCATION_ONLY";
      completeness: "COMPLETE" | "PARTIAL_UNRECORDED_OCCUPANCY";
      /** Sum over grazed intervals only; when PARTIAL this is NOT the field's window demand. */
      grazedKgDm: number;
      grazedDays: number;
      unrecordedDays: number;
      models: ("suckler_pair" | "dairy_midseason")[];
      ruleIds: string[];
      sources: string[];
      gateVersions: string[];
      limitations: string[];
      /** Provenance ids (own farm only, capped). Not rendered as visible text. */
      evidenceRecordIds: string[];
      sourceSessionIds: string[];
    };

const REASON_FAMILY: Record<string, GrassIntakePreviewHeldReason> = {
  noSourceScopedModelForGroup: "EVIDENCE_MISSING",
  missingPairEvidence: "EVIDENCE_MISSING",
  missingDairyEvidence: "EVIDENCE_MISSING",
  evidenceGroupMissing: "GROUP_RECORDS_CHANGED",
  pairLink: "EVIDENCE_STALE_OR_INCOMPLETE",
  cowHeadCount: "EVIDENCE_STALE_OR_INCOMPLETE",
  calfHeadCount: "EVIDENCE_STALE_OR_INCOMPLETE",
  cowAverageWeightKg: "EVIDENCE_STALE_OR_INCOMPLETE",
  calfAverageWeightKg: "EVIDENCE_STALE_OR_INCOMPLETE",
  calfStage: "EVIDENCE_STALE_OR_INCOMPLETE",
  noSupplementaryFeed: "EVIDENCE_STALE_OR_INCOMPLETE",
  headCount: "EVIDENCE_STALE_OR_INCOMPLETE",
  lactationStage: "EVIDENCE_STALE_OR_INCOMPLETE",
  preGrazingCover: "EVIDENCE_STALE_OR_INCOMPLETE",
  concentrate: "EVIDENCE_STALE_OR_INCOMPLETE",
  unverifiedUniqueCowCalfPair: "EVIDENCE_STALE_OR_INCOMPLETE",
  evidenceResolutionHeld: "EVIDENCE_CONFLICT",
  overlappingEvidence: "EVIDENCE_CONFLICT",
  groupInMultiplePairs: "EVIDENCE_CONFLICT",
  crossFarmRecord: "EVIDENCE_CONFLICT",
  duplicateRecordId: "EVIDENCE_CONFLICT",
  missingSupersededRecord: "EVIDENCE_CONFLICT",
  invalidSupersession: "EVIDENCE_CONFLICT",
  supersessionRecordedBeforeTarget: "EVIDENCE_CONFLICT",
  forkedSupersession: "EVIDENCE_CONFLICT",
  supersessionCycle: "EVIDENCE_CONFLICT",
  resolutionWindowMismatch: "EVIDENCE_CONFLICT",
  crossFarmResolution: "EVIDENCE_CONFLICT",
  headCountSnapshotMismatch: "HEADCOUNT_MISMATCH",
  invalidHeadCount: "HEADCOUNT_MISMATCH",
  groupNotFound: "GROUP_RECORDS_CHANGED",
  groupCategoryChanged: "GROUP_RECORDS_CHANGED",
  pairGroupCategoryMismatch: "GROUP_RECORDS_CHANGED",
  dairyStageOnNonDairyGroup: "GROUP_RECORDS_CHANGED",
  pairNotTogetherInField: "SESSION_RECORDS_INCONSISTENT",
  groupInOverlappingSessions: "SESSION_RECORDS_INCONSISTENT",
  invalidSession: "SESSION_RECORDS_INCONSISTENT",
  crossFarmSession: "SESSION_RECORDS_INCONSISTENT",
  duplicateSessionIds: "SESSION_RECORDS_INCONSISTENT",
  coverObservationUnverified: "COVER_NOT_VERIFIED_PRE_GRAZING",
  incompatibleCoverBasis: "COVER_NOT_VERIFIED_PRE_GRAZING",
  concentrateOnlyNotAsserted: "FEED_NOT_SUPPORTED",
  unsupportedFeedForDairyModel: "FEED_NOT_SUPPORTED",
  unsupportedFeedDryMatterFraction: "FEED_NOT_SUPPORTED",
  supplementaryFeedRecordedNone: "FEED_NOT_SUPPORTED",
  unsupportedLactationStage: "STAGE_NOT_SUPPORTED",
  UNSUPPORTED_CALF_STAGE: "STAGE_NOT_SUPPORTED",
  WEIGHT_OUTSIDE_REFERENCE: "OUTSIDE_SOURCE_RANGE",
  COVER_OUTSIDE_SOURCE: "OUTSIDE_SOURCE_RANGE",
  MEAL_OUTSIDE_SOURCE: "OUTSIDE_SOURCE_RANGE",
  invalidFarmOrDate: "OTHER",
  invalidScopeOrWindow: "OTHER",
  fieldNotFound: "FIELD_NOT_ON_FARM",
  possiblyTruncatedRead: "POSSIBLY_INCOMPLETE_READ",
};

/** Reduce raw domain reasons (`code:id:id@iso`) to their bounded families; never echoes ids or timestamps. */
export function grassIntakePreviewReasonFamilies(raw: readonly string[]): GrassIntakePreviewHeldReason[] {
  const families = new Set<GrassIntakePreviewHeldReason>();
  for (const reason of raw) {
    const code = reason.split(/[:@]/, 1)[0] ?? "";
    families.add(Object.hasOwn(REASON_FAMILY, code) ? REASON_FAMILY[code] : "OTHER");
  }
  return [...families].sort();
}

const uniqSorted = (values: Iterable<string>, cap = Infinity) => [...new Set(values)].sort().slice(0, cap);

function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  // 42P01 undefined_table (PostgreSQL); PGRST205 table not in the PostgREST schema cache.
  return code === "42P01" || code === "PGRST205";
}

export async function getGrassIntakePreviewForCurrentFarm(
  input: { fieldId: unknown },
  now: Date = new Date(),
): Promise<GrassIntakePreviewView> {
  if (!isGrassIntakePreviewFlagOn()) return { status: "DISABLED" };
  if (typeof input?.fieldId !== "string" || !UUID.test(input.fieldId)) return { status: "UNAVAILABLE", reason: "INVALID_SCOPE" };
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return { status: "UNAVAILABLE", reason: "INVALID_SCOPE" };

  let authorised: boolean;
  try {
    authorised = await canCurrentUserManageRegionalGrassGrowth();
  } catch {
    return { status: "UNAVAILABLE", reason: "READ_FAILED" };
  }
  if (!authorised) return { status: "UNAVAILABLE", reason: "NOT_AUTHORISED" };

  // Whole-minute end so repeated clicks in the same minute evaluate the same window.
  const toMs = Math.floor(nowMs / 60_000) * 60_000;
  const window: GrassIntakePreviewWindow = {
    from: new Date(toMs - GRASS_INTAKE_PREVIEW_WINDOW_DAYS * DAY_MS).toISOString(),
    to: new Date(toMs).toISOString(),
    days: GRASS_INTAKE_PREVIEW_WINDOW_DAYS,
  };

  let result: Awaited<ReturnType<typeof getCurrentFarmGrassFieldSegmentDemand>>;
  try {
    result = await getCurrentFarmGrassFieldSegmentDemand({ fieldId: input.fieldId.toLowerCase(), from: window.from, to: window.to });
  } catch (error) {
    return { status: "UNAVAILABLE", reason: isMissingSchemaError(error) ? "EVIDENCE_SCHEMA_UNAVAILABLE" : "READ_FAILED" };
  }
  if (result.status !== "EVALUATED") return { status: "UNAVAILABLE", reason: "NO_FARM" };

  const demand = result.demand;
  switch (demand.status) {
    case "HELD":
      return { status: "HELD", version: demand.version, window, reasons: grassIntakePreviewReasonFamilies(demand.reasons) };
    case "NO_RECORDED_GRAZING":
      return { status: "NO_RECORDED_GRAZING", version: demand.version, window };
    case "READY": {
      const units = demand.intervals.flatMap(iv => (iv.status === "GRAZED" ? iv.units : []));
      return {
        status: "READY",
        version: demand.version,
        resolutionVersion: demand.resolutionVersion,
        window,
        quantityBasis: demand.quantityBasis,
        completeness: demand.completeness,
        grazedKgDm: demand.grazedKgDm,
        grazedDays: demand.intervals.reduce((a, iv) => a + (iv.status === "GRAZED" ? iv.days : 0), 0),
        unrecordedDays: demand.unrecordedDays,
        models: uniqSorted(units.map(u => u.model)) as ("suckler_pair" | "dairy_midseason")[],
        ruleIds: uniqSorted(units.map(u => u.ruleId)),
        sources: uniqSorted(units.map(u => u.source)),
        gateVersions: uniqSorted(units.map(u => u.gateVersion)),
        limitations: uniqSorted(units.flatMap(u => u.limitations)),
        evidenceRecordIds: uniqSorted(units.flatMap(u => u.evidenceRecordIds), MAX_IDS),
        sourceSessionIds: uniqSorted(units.flatMap(u => u.sourceSessionIds), MAX_IDS),
      };
    }
  }
}
