"use server";

/**
 * Fertiliser Vertical V1, Checkpoint 1 — Server Actions for the guided
 * soil sampling workflow (`docs/product/farm-return-next-v1.1/
 * SOIL_SAMPLING_ARCHITECTURE.md`). Every generic Job Session lifecycle
 * action a soil sampling session also needs (pause/resume/finish/cancel/
 * confirm) is **not** duplicated here — the existing, activity-agnostic
 * actions in `src/app/actions/job-sessions.ts`
 * (`pauseJobSessionAction`/`resumeJobSessionAction`/`finishJobSessionAction`/
 * `cancelJobSessionAction`/`confirmJobSessionActualAction`) are called
 * directly by the sampling screen — `DOMAIN_CONTRACTS.md`'s reuse
 * boundary applied to this checkpoint's own new UI, not just to
 * `src/domain/`.
 */
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { getDecisionById, listDecisionsForFarm } from "@/lib/farm-data/decisions";
import { listActiveJobSessionsForFarm, listConfirmedJobSessionsForFarm } from "@/lib/farm-data/job-sessions";
import type { JobSessionRecord, SoilCoreObservationRecord } from "@/lib/farm-data/mappers";
import {
  buildFieldSamplingPlan,
  startSoilSamplingSession,
  recordSoilCoreObservation,
  buildCompositeSampleView,
  requireOwnedField,
  type StartSoilSamplingSessionResult,
  type CompositeSampleView,
} from "@/orchestration/soil-sampling";
import { listSoilCoreObservationsForSession } from "@/lib/farm-data/soil-core-observations";
import type { EngineOutcome } from "@/domain/evidence";
import type { SamplingPlan } from "@/domain/soil-sampling-plan";
import type { SoilSamplingActual } from "@/domain/job-actual";

// Re-exported so client components never import directly from
// `@/orchestration/soil-sampling` (a `server-only`-marked module) — this
// "use server" file is the one real boundary between them.
export type { StartSoilSamplingSessionResult, CompositeSampleView };

/** Real, farm-owned field's live `SamplingPlan` — recomputed on every
 * call (cheap, pure, deterministic; never cached stale across a field
 * area edit). `manuallyFlaggedNonUniform` is the farmer's own real
 * assertion from the "Start Soil Sample" screen — never inferred. */
export async function getFieldSoilSamplingPlanAction(fieldId: string, manuallyFlaggedNonUniform?: boolean): Promise<EngineOutcome<SamplingPlan>> {
  const { field } = await requireOwnedField(fieldId);
  return buildFieldSamplingPlan(field, new Date().toISOString(), manuallyFlaggedNonUniform);
}

export interface StartSoilSamplingSessionActionInput {
  fieldId: string;
  zoneId: string;
  manuallyFlaggedNonUniform?: boolean;
}

export async function startSoilSamplingSessionAction(input: StartSoilSamplingSessionActionInput): Promise<StartSoilSamplingSessionResult> {
  const { farmId, field } = await requireOwnedField(input.fieldId);
  const now = new Date().toISOString();
  const planOutcome = buildFieldSamplingPlan(field, now, input.manuallyFlaggedNonUniform);
  if (planOutcome.status !== "OK") {
    throw new Error(`startSoilSamplingSessionAction: cannot start — sampling plan is "${planOutcome.status}" (${"reasonCode" in planOutcome ? planOutcome.reasonCode : ""})`);
  }
  return startSoilSamplingSession({
    farmId,
    field,
    planOutcome,
    zoneId: input.zoneId,
    jobSessionId: globalThis.crypto.randomUUID(),
    decidedAt: now,
  });
}

export interface RecordSoilCoreObservationActionInput {
  id: string;
  jobSessionId: string;
  fieldId: string;
  samplingZoneId: string;
  sequence: number;
  lat: number;
  lng: number;
  accuracyMeters?: number;
  recordedAt: string;
  deviationReason?: string;
}

export async function recordSoilCoreObservationAction(input: RecordSoilCoreObservationActionInput): Promise<{ observation: SoilCoreObservationRecord; totalCores: number }> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("recordSoilCoreObservationAction: no real farm for the current session");
  return recordSoilCoreObservation({ ...input, farmId: farm.id });
}

/** Real, persisted cores for a session — used to restore progress after
 * an app restart/interruption (campaign "Offline / interruption": never
 * fabricate missing GPS continuity, only show what is genuinely
 * recorded). */
export async function listSoilCoreObservationsForSessionAction(jobSessionId: string): Promise<SoilCoreObservationRecord[]> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("listSoilCoreObservationsForSessionAction: no real farm for the current session");
  return listSoilCoreObservationsForSession(farm.id, jobSessionId);
}

/**
 * Every confirmed `CompositeSample` for one field — derived, read-only
 * (see `buildCompositeSampleView`'s own doc comment: no separate
 * `composite_samples` table exists). `zoneAreaHa` is resolved from the
 * authorising Decision's own `inputsSnapshot`, frozen at session-start
 * time — never recomputed from a plan that may have since changed for
 * this field.
 */
export async function listFieldCompositeSamplesAction(fieldId: string): Promise<CompositeSampleView[]> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("listFieldCompositeSamplesAction: no real farm for the current session");

  const [{ sessions }, { decisions }] = await Promise.all([listConfirmedJobSessionsForFarm(farm.id), listDecisionsForFarm(farm.id)]);
  const decisionsById = new Map(decisions.map((d) => [d.id, d]));

  return sessions
    .filter((session) => session.activityType === "soil_sampling" && session.actual)
    .map((session) => {
      const payload = session.actual!.payload as unknown as SoilSamplingActual;
      if (!payload.fieldIds.includes(fieldId)) return null;
      const decision = decisionsById.get(session.decisionId);
      const zoneAreaHa = typeof decision?.inputsSnapshot?.zoneAreaHa === "number" ? decision.inputsSnapshot.zoneAreaHa : 0;
      return buildCompositeSampleView({
        jobSessionId: session.id,
        fieldId,
        samplingZoneId: payload.samplingZoneId,
        zoneAreaHa,
        coreCount: payload.coreCount ?? 0,
        methodologyVersion: payload.methodologyVersion,
        confirmedAt: session.actual!.confirmedAt,
      });
    })
    .filter((view): view is CompositeSampleView => view !== null)
    .sort((a, b) => (a.sampleDate < b.sampleDate ? 1 : -1));
}

export interface ActiveSoilSamplingSessionView {
  session: JobSessionRecord;
  zoneId: string;
  zoneAreaHa: number;
  totalAreaHa: number;
  cores: SoilCoreObservationRecord[];
}

/**
 * Real, server-side "restore local progress" for an interrupted sampling
 * session (campaign "Offline / interruption") — an unfinished
 * `soil_sampling` job session for this field, with its zone context
 * (from the authorising Decision's own frozen `inputsSnapshot`) and every
 * genuinely recorded core. Returns `null` when there is none — never a
 * fabricated "resume" state.
 */
export async function getActiveSoilSamplingSessionForFieldAction(fieldId: string): Promise<ActiveSoilSamplingSessionView | null> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("getActiveSoilSamplingSessionForFieldAction: no real farm for the current session");

  const { sessions } = await listActiveJobSessionsForFarm(farm.id);
  const session = sessions.find((s) => s.activityType === "soil_sampling" && s.primaryFieldId === fieldId);
  if (!session) return null;

  const decision = await getDecisionById(farm.id, session.decisionId);
  const zoneId = typeof decision?.inputsSnapshot?.zoneId === "string" ? decision.inputsSnapshot.zoneId : undefined;
  const zoneAreaHa = typeof decision?.inputsSnapshot?.zoneAreaHa === "number" ? decision.inputsSnapshot.zoneAreaHa : undefined;
  const totalAreaHa = typeof decision?.inputsSnapshot?.totalAreaHa === "number" ? decision.inputsSnapshot.totalAreaHa : undefined;
  if (!zoneId || zoneAreaHa === undefined || totalAreaHa === undefined) {
    // The authorising decision's own inputsSnapshot is genuinely missing
    // or malformed — fail closed rather than resume into an unknown zone.
    return null;
  }

  const cores = await listSoilCoreObservationsForSession(farm.id, session.id);
  return { session, zoneId, zoneAreaHa, totalAreaHa, cores };
}

/**
 * The one authoritative `CompositeSampleView` for a just-confirmed
 * session — the client's "Done" summary screen calls this after
 * `confirmJobSessionActualAction` succeeds, rather than reconstructing
 * the same view client-side from pieces it would otherwise have to
 * duplicate (`buildCompositeSampleView`'s own formatting logic stays
 * server-only). Returns `undefined` only if the confirmed session
 * genuinely cannot be found for this field — never fabricated.
 */
export async function getCompositeSampleForSessionAction(fieldId: string, jobSessionId: string): Promise<CompositeSampleView | undefined> {
  const samples = await listFieldCompositeSamplesAction(fieldId);
  return samples.find((s) => s.jobSessionId === jobSessionId);
}

/** Real, farm-owned fields — used by the soil sampling entry screen to
 * list candidates without re-deriving field lookup logic. */
export async function listFieldsForSoilSamplingAction() {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("listFieldsForSoilSamplingAction: no real farm for the current session");
  return listFieldsForFarm(farm.id);
}
