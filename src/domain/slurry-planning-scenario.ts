import type { SlurryAllocation } from "./types";

export const SLURRY_PLANNING_SCENARIO_VERSION = "slurry_planning_scenario_v1.0.0";

export type SlurryPlanningApplicationMethod = NonNullable<SlurryAllocation["applicationMethod"]>["value"];

export interface SlurryPlanningCandidateInput {
  fieldId: string;
  housingId: string;
  volumeM3: number;
  /** Raw Server Action input: validated at runtime before it can become a
   * scenario candidate. Never defaults to LESS or another method. */
  applicationMethod: string;
  applicationDate: string;
}

export interface ValidSlurryPlanningCandidate extends Omit<SlurryPlanningCandidateInput, "applicationMethod"> {
  applicationMethod: SlurryPlanningApplicationMethod;
}

export interface SlurryPlanningScenarioInput {
  planningDate: string;
  expectedAvailableM3: number;
  source: "FARMER_FORECAST" | "SYSTEM_FORECAST";
  candidates: SlurryPlanningCandidateInput[];
}

export type SlurryPlanningScenarioResult =
  | { status: "INVALID"; issues: string[]; version: string }
  | {
      status: "READY";
      planningDate: string;
      expectedAvailableM3: number;
      allocatedM3: number;
      unallocatedM3: number;
      source: "FARMER_FORECAST" | "SYSTEM_FORECAST";
      candidates: ValidSlurryPlanningCandidate[];
      version: string;
    };

const APPLICATION_METHODS = new Set<SlurryPlanningApplicationMethod>(["LESS", "splashplate", "incorporate_24h", "other"]);

function isApplicationMethod(value: string): value is SlurryPlanningApplicationMethod {
  return APPLICATION_METHODS.has(value as SlurryPlanningApplicationMethod);
}

function isoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function buildSlurryPlanningScenario(input: SlurryPlanningScenarioInput): SlurryPlanningScenarioResult {
  const issues: string[] = [];
  if (!isoDate(input.planningDate)) issues.push("PLANNING_DATE_INVALID");
  if (!Number.isFinite(input.expectedAvailableM3) || input.expectedAvailableM3 < 0) issues.push("EXPECTED_AVAILABLE_VOLUME_INVALID");

  const ids = new Set<string>();
  const fieldIds = new Set<string>();
  let allocatedM3 = 0;
  for (const candidate of input.candidates) {
    const key = `${candidate.fieldId}::${candidate.housingId}`;
    if (ids.has(key)) issues.push("DUPLICATE_FIELD_STORE_CANDIDATE");
    ids.add(key);
    if (fieldIds.has(candidate.fieldId)) issues.push("MULTIPLE_CANDIDATES_FOR_FIELD_UNSUPPORTED");
    fieldIds.add(candidate.fieldId);
    if (!candidate.fieldId || !candidate.housingId) issues.push("CANDIDATE_IDENTITY_INVALID");
    if (!Number.isFinite(candidate.volumeM3) || candidate.volumeM3 <= 0) issues.push("CANDIDATE_VOLUME_INVALID");
    if (!isApplicationMethod(candidate.applicationMethod)) issues.push("CANDIDATE_METHOD_INVALID");
    if (!isoDate(candidate.applicationDate)) issues.push("CANDIDATE_APPLICATION_DATE_INVALID");
    allocatedM3 += Number.isFinite(candidate.volumeM3) && candidate.volumeM3 > 0 ? candidate.volumeM3 : 0;
  }

  if (allocatedM3 > input.expectedAvailableM3 + 1e-9) issues.push("FORECAST_VOLUME_EXCEEDED");
  if (issues.length > 0) return { status: "INVALID", issues: [...new Set(issues)], version: SLURRY_PLANNING_SCENARIO_VERSION };
  return {
    status: "READY",
    planningDate: input.planningDate,
    expectedAvailableM3: input.expectedAvailableM3,
    allocatedM3,
    unallocatedM3: input.expectedAvailableM3 - allocatedM3,
    source: input.source,
    candidates: input.candidates.map((candidate) => ({
      ...candidate,
      applicationMethod: candidate.applicationMethod as SlurryPlanningApplicationMethod,
    })),
    version: SLURRY_PLANNING_SCENARIO_VERSION,
  };
}
