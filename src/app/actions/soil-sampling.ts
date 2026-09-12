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
import { getDecisionById } from "@/lib/farm-data/decisions";
import { getJobSessionById, listActiveJobSessionsForFarm, listConfirmedJobSessionsForFarm } from "@/lib/farm-data/job-sessions";
import type { ConfirmJobActualResult } from "@/lib/farm-data/job-actuals";
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
import { confirmJobSessionActualAction } from "@/app/actions/job-sessions";
import type { EngineOutcome } from "@/domain/evidence";
import { SOIL_SAMPLING_PLAN_VERSION, assessSamplingTimingReadiness, type SamplingPlan, type SamplingTimingAssessment } from "@/domain/soil-sampling-plan";
import type { CompletionType } from "@/domain/job-actual";

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

/**
 * Codex audit HIGH (round 1 of this checkpoint's own audit, 2026-09-12):
 * `assessSamplingTimingReadiness` was built and tested but never called
 * from anywhere real — the farmer-facing timing advisory the evidence
 * register describes was dead code. Wired here: the real evidence this
 * app genuinely has is this field's own most recently *confirmed*
 * `fertiliser_spreading`/`slurry_spreading` Actual (both are real
 * P/K-bearing applications) — no lime `ActivityType` exists yet
 * (`job-actual.ts`), so `lastLimeApplicationDate` stays honestly
 * `undefined` until one does. A `"did_not_happen"` confirmation is
 * excluded — it recorded that the application did not occur.
 */
export async function getSoilSamplingTimingAdvisoryAction(fieldId: string): Promise<SamplingTimingAssessment> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("getSoilSamplingTimingAdvisoryAction: no real farm for the current session");

  const { sessions } = await listConfirmedJobSessionsForFarm(farm.id);
  const pkApplicationDates = sessions
    .filter(
      (session) =>
        (session.activityType === "fertiliser_spreading" || session.activityType === "slurry_spreading") &&
        session.actual &&
        session.actual.completionType !== "did_not_happen" &&
        (session.actual.payload as { fieldIds?: unknown }).fieldIds instanceof Array &&
        ((session.actual.payload as { fieldIds: unknown[] }).fieldIds as unknown[]).includes(fieldId),
    )
    .map((session) => session.actual!.confirmedAt);
  const lastPkApplicationDate = pkApplicationDates.length > 0 ? pkApplicationDates.reduce((latest, d) => (d > latest ? d : latest)) : undefined;

  return assessSamplingTimingReadiness({ lastPkApplicationDate, sampleDate: new Date().toISOString().slice(0, 10) });
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

export interface ConfirmSoilSamplingSessionActionInput {
  /** Client-generated once, at "Confirm sample" time — same idempotency-
   * key pattern every Confirm Actual submission in this app uses. */
  id: string;
  jobSessionId: string;
  completionType: CompletionType;
  note?: string;
  confirmedAt?: string;
}

/**
 * Confirms a soil sampling session's Actual — the one real, safe way to
 * do it. Codex audit CRITICAL (round 1 of this checkpoint's own audit,
 * 2026-09-12): the previous design let the *client* supply `coreCount`,
 * `samplingZoneId` and `fieldIds` directly to the generic
 * `confirmJobSessionActualAction`, with `validateSoilSamplingActual`
 * only checking shape (a positive integer, a non-empty string) — a
 * direct authenticated caller could confirm "20 cores" for a session
 * with zero real `soil_core_observations` rows, or claim a different
 * zone/field than the one the session was actually authorised for. Every
 * one of those facts is now derived here, server-side, from the
 * session's own real, immutable state — never trusted from the client:
 *
 * - `fieldIds`: the session's own `primaryFieldId`, set once at Start
 *   and immutable since (`job_sessions` grant never includes it in the
 *   client-updatable column list).
 * - `samplingZoneId`: the authorising Decision's own frozen
 *   `inputsSnapshot.zoneId` — the zone this specific session was
 *   actually started for.
 * - `coreCount`: a real count of this session's own
 *   `soil_core_observations` rows, not a client-submitted number.
 * - `methodologyVersion`: the recorded cores' own real
 *   `methodology_version` (what was actually in effect while sampling
 *   happened), falling back to the current constant only when there are
 *   no cores to read one from (a `"did_not_happen"` confirmation).
 */
export async function confirmSoilSamplingSessionAction(input: ConfirmSoilSamplingSessionActionInput): Promise<ConfirmJobActualResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("confirmSoilSamplingSessionAction: no real farm for the current session");

  const session = await getJobSessionById(farm.id, input.jobSessionId);
  if (!session) throw new Error(`confirmSoilSamplingSessionAction: session ${input.jobSessionId} not found for this farm`);
  if (session.activityType !== "soil_sampling") {
    throw new Error(`confirmSoilSamplingSessionAction: session ${input.jobSessionId} is not a soil sampling session`);
  }
  if (!session.primaryFieldId) {
    throw new Error(`confirmSoilSamplingSessionAction: session ${input.jobSessionId} has no real field — cannot confirm`);
  }

  const decision = await getDecisionById(farm.id, session.decisionId);
  const zoneId = typeof decision?.inputsSnapshot?.zoneId === "string" ? decision.inputsSnapshot.zoneId : undefined;
  if (!zoneId) {
    throw new Error(`confirmSoilSamplingSessionAction: session ${input.jobSessionId}'s authorising decision has no real zoneId — cannot confirm`);
  }

  let coreCount: number | undefined;
  let methodologyVersion = SOIL_SAMPLING_PLAN_VERSION;
  if (input.completionType !== "did_not_happen") {
    const cores = await listSoilCoreObservationsForSession(farm.id, input.jobSessionId);
    coreCount = cores.length;
    if (cores.length > 0) methodologyVersion = cores[0].methodologyVersion;
  }

  return confirmJobSessionActualAction({
    id: input.id,
    jobSessionId: input.jobSessionId,
    activityType: "soil_sampling",
    raw: {
      completionType: input.completionType,
      fieldIds: [session.primaryFieldId],
      samplingZoneId: zoneId,
      coreCount,
      methodologyVersion,
      note: input.note,
    },
    confirmedAt: input.confirmedAt,
  });
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
 * Every confirmed, real `CompositeSample` for one field — derived,
 * read-only (see `buildCompositeSampleView`'s own doc comment: no
 * separate `composite_samples` table exists).
 *
 * Codex audit CRITICAL (round 1 of this checkpoint's own audit,
 * 2026-09-12), two real findings fixed here:
 * 1. A `"did_not_happen"` confirmation (no real sample was taken) was
 *    previously still turned into a `CompositeSampleView` — a fabricated
 *    "0 cores, awaiting lab result" entry that contradicts the farmer's
 *    own confirmed fact. Filtered out below.
 * 2. `zoneAreaHa` was resolved via the *capped* `listDecisionsForFarm`
 *    (200-row history) with a silent `?? 0` fallback when a decision
 *    fell outside that cap or its `inputsSnapshot` was malformed — a
 *    fabricated area, not a real one. Each session's own decision is now
 *    fetched individually via the uncapped `getDecisionById`, and the
 *    real `CompositeSampleView.representedAreaHa` is left `undefined`
 *    (never `0`) when it genuinely cannot be resolved.
 */
export async function listFieldCompositeSamplesAction(fieldId: string): Promise<CompositeSampleView[]> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("listFieldCompositeSamplesAction: no real farm for the current session");

  const { sessions } = await listConfirmedJobSessionsForFarm(farm.id);
  const candidates = sessions.filter(
    (session) =>
      session.activityType === "soil_sampling" &&
      session.actual &&
      session.actual.completionType !== "did_not_happen" &&
      (session.actual.payload as { fieldIds?: unknown }).fieldIds instanceof Array &&
      ((session.actual.payload as { fieldIds: unknown[] }).fieldIds as unknown[]).includes(fieldId),
  );

  const views = await Promise.all(
    candidates.map(async (session) => {
      const payload = session.actual!.payload as { samplingZoneId: string; coreCount?: number; methodologyVersion: string };
      const decision = await getDecisionById(farm.id, session.decisionId);
      const zoneAreaHa = typeof decision?.inputsSnapshot?.zoneAreaHa === "number" ? decision.inputsSnapshot.zoneAreaHa : undefined;
      return buildCompositeSampleView({
        jobSessionId: session.id,
        fieldId,
        samplingZoneId: payload.samplingZoneId,
        zoneAreaHa,
        coreCount: payload.coreCount ?? 0,
        methodologyVersion: payload.methodologyVersion,
        confirmedAt: session.actual!.confirmedAt,
      });
    }),
  );

  return views.sort((a, b) => (a.sampleDate < b.sampleDate ? 1 : -1));
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
