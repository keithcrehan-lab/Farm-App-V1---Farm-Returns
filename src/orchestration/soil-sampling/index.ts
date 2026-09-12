import "server-only";

/**
 * Fertiliser Vertical V1, Checkpoint 1 — Soil Sampling orchestration.
 * `docs/product/farm-return-next-v1.1/SOIL_SAMPLING_ARCHITECTURE.md`'s
 * frozen object model, wired to the existing Prompt/Decision/Job Session
 * machinery rather than a new persisted "Plan"/"Session" table — see that
 * doc and `supabase/migrations/20260912000000_soil_core_observations.sql`'s
 * own header comment for the full reuse reasoning.
 *
 * Layering discipline matches every other orchestration module in this
 * programme (`job-session/index.ts`'s own header comment): calls existing
 * `src/domain/*.ts` pure functions and `src/lib/farm-data/*.ts`
 * persistence, never duplicating either.
 */
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { getDecisionById } from "@/lib/farm-data/decisions";
import { getJobSessionById } from "@/lib/farm-data/job-sessions";
import { insertSoilCoreObservation, listSoilCoreObservationsForSession, type NewSoilCoreObservationInput } from "@/lib/farm-data/soil-core-observations";
import type { JobSessionRecord, SoilCoreObservationRecord } from "@/lib/farm-data/mappers";
import { startJobSessionFromPrompt, type StartJobSessionResult } from "@/orchestration/job-session";
import type { Field } from "@/domain/types";
import type { EngineOutcome } from "@/domain/evidence";
import {
  StandardRepresentativeSamplingStrategy,
  SOIL_SAMPLING_PLAN_VERSION,
  type SamplingPlan,
  type SamplingZone,
} from "@/domain/soil-sampling-plan";

/** `Decision.calculationKind` / `Prompt.kind` for a soil sampling plan —
 * the same "one string, shared by Prompt and Decision" pattern
 * `FERTILISER_PLAN_CALCULATION_KIND` already establishes
 * (`app/actions/fertiliser-plan.ts`). */
export const SOIL_SAMPLING_PLAN_CALCULATION_KIND = "soil_sampling_plan";

/**
 * Builds this field's real `SamplingPlan` — the one and only place this
 * orchestration layer calls the domain strategy, so every caller (the
 * "Start Soil Sample" screen, a future evidence report) sees the exact
 * same plan for the exact same field/inputs. Never recomputed with
 * different inputs at two different call sites.
 */
export function buildFieldSamplingPlan(
  field: Pick<Field, "id" | "areaHa" | "lpisRef">,
  now: string,
  manuallyFlaggedNonUniform?: boolean,
): EngineOutcome<SamplingPlan> {
  return StandardRepresentativeSamplingStrategy.buildPlan({
    fieldId: field.id,
    areaHa: field.areaHa,
    lpisRef: field.lpisRef,
    now,
    // A farmer-reported signal, never inferred — see
    // `FieldHeterogeneitySignals`'s own doc comment for why an unset
    // flag is treated as "not asserted", not as a confirmed "uniform".
    // Attributed generically to `differentSoilType` because this V1
    // screen offers one plain checkbox, not four granular Teagasc
    // factors — `SamplingZone.reasons` already discloses this is a
    // logical, not geometric, split either way.
    heterogeneity: manuallyFlaggedNonUniform ? { differentSoilType: true } : undefined,
  });
}

export interface StartSoilSamplingSessionInput {
  farmId: string;
  field: Field;
  /** The exact, already-computed outcome from `buildFieldSamplingPlan` —
   * passed through whole (never re-wrapped in a fresh `ok()`) so the
   * Decision's own `estimate_snapshot` keeps the real `explain`
   * (assumptions/sourceIds/calculatedAt) the strategy produced, not a
   * stripped-down copy of just its value. Caller is responsible for
   * having already checked `.status === "OK"` — mirrors
   * `decideAsFarmer`'s own "cannot accept a non-OK basis" contract. */
  planOutcome: Extract<EngineOutcome<SamplingPlan>, { status: "OK" }>;
  zoneId: string;
  jobSessionId: string;
  decidedAt: string;
}

export interface StartSoilSamplingSessionResult extends StartJobSessionResult {
  zone: SamplingZone;
}

/**
 * Starts a real GPS-guided sampling session for one zone of an
 * already-computed `SamplingPlan`. Every zone gets its own fresh Decision
 * (never a shared/reused one) — `job_sessions_decision_id_unique` means
 * one Decision authorises exactly one session, and a field with more than
 * one zone genuinely needs more than one independent walked session.
 */
export async function startSoilSamplingSession(input: StartSoilSamplingSessionInput): Promise<StartSoilSamplingSessionResult> {
  const plan = input.planOutcome.value;
  const zone = plan.zones.find((z) => z.zoneId === input.zoneId);
  if (!zone) {
    throw new Error(`startSoilSamplingSession: zone ${input.zoneId} is not part of plan for field ${plan.fieldId}`);
  }
  if (plan.fieldId !== input.field.id) {
    throw new Error(`startSoilSamplingSession: plan is for field ${plan.fieldId}, not the requested field ${input.field.id}`);
  }

  const result = await startJobSessionFromPrompt({
    prompt: {
      id: globalThis.crypto.randomUUID(),
      farmId: input.farmId,
      kind: SOIL_SAMPLING_PLAN_CALCULATION_KIND,
      fieldId: input.field.id,
      calculationVersion: SOIL_SAMPLING_PLAN_VERSION,
      inputsSnapshot: { zoneId: zone.zoneId, zoneAreaHa: zone.areaHa, totalAreaHa: plan.totalAreaHa },
      basis: input.planOutcome,
    },
    activityType: "soil_sampling",
    jobSessionId: input.jobSessionId,
    decidedAt: input.decidedAt,
    origin: "prompt",
    primaryFieldId: input.field.id,
  });

  return { ...result, zone };
}

export interface RecordSoilCoreObservationInput {
  id: string;
  farmId: string;
  jobSessionId: string;
  fieldId: string;
  samplingZoneId: string;
  /** The farmer's own device's real local count of cores recorded so far
   * in this session, plus one — supplied by the client, not recomputed
   * here from a live server query. This is deliberate, not a missed
   * server-side check: true offline support (campaign "Offline /
   * interruption") means several cores can be recorded locally, in
   * order, before any of them ever reach the server, so only the client
   * genuinely knows the real walked order at the moment each core is
   * recorded. `soil_core_observations_session_sequence_unique`
   * (the migration) is the real, independent backstop — two different
   * cores claiming the same sequence for one session is rejected at the
   * database level regardless of what a client claims. */
  sequence: number;
  lat: number;
  lng: number;
  accuracyMeters?: number;
  recordedAt: string;
  deviationReason?: string;
}

/**
 * Resolves the one real field/zone a session was actually authorised for
 * — its own immutable `primaryFieldId`, plus its authorising Decision's
 * frozen `inputsSnapshot.zoneId` — or throws. The single shared boundary
 * every real read/write of this session's cores goes through, so
 * "authorised" can never mean something subtly different depending on
 * which caller is asking (Codex audit HIGH, round 3 of this checkpoint's
 * own audit, 2026-09-12: round 2's fix filtered only the Confirm path,
 * leaving Record/Resume/Refresh still counting every raw row).
 */
async function resolveAuthorisedZone(farmId: string, session: JobSessionRecord): Promise<{ fieldId: string; zoneId: string }> {
  if (!session.primaryFieldId) {
    throw new Error(`resolveAuthorisedZone: session ${session.id} has no real field`);
  }
  const decision = await getDecisionById(farmId, session.decisionId);
  const zoneId = typeof decision?.inputsSnapshot?.zoneId === "string" ? decision.inputsSnapshot.zoneId : undefined;
  if (!zoneId) {
    throw new Error(`resolveAuthorisedZone: session ${session.id}'s authorising decision has no real zoneId`);
  }
  return { fieldId: session.primaryFieldId, zoneId };
}

/** The pure filter every "verified cores" reader ultimately applies —
 * split out (Codex audit LOW, round 4 of this checkpoint's own audit,
 * 2026-09-12) so a caller that has *already* resolved its own real
 * `{session, fieldId, zoneId}` (e.g. `recordSoilCoreObservation`,
 * `confirmSoilSamplingSessionAction`) can filter an already-fetched row
 * set without a second, redundant session/decision re-fetch — never a
 * second, separately-maintained copy of the same rule. */
export function filterVerifiedSoilCoreObservations(cores: SoilCoreObservationRecord[], fieldId: string, zoneId: string): SoilCoreObservationRecord[] {
  return cores.filter((core) => core.fieldId === fieldId && core.samplingZoneId === zoneId);
}

/**
 * The one real "how many cores does this session genuinely have" answer
 * — every recorded `soil_core_observations` row for this session,
 * filtered to only those whose own `fieldId`/`samplingZoneId` match what
 * the session was actually authorised for. `recordSoilCoreObservation`'s
 * own write-time check (below) means every core inserted through this
 * app's own sanctioned path already satisfies this, but a row reaching
 * the table any other way (same-farm, so the database's own cross-farm
 * trigger alone would not catch it) must never silently inflate this
 * count — used identically by Record/Resume/Refresh/Confirm, so
 * "verified" means the same thing everywhere. Prefer
 * `filterVerifiedSoilCoreObservations` directly when the caller already
 * has its own real `{fieldId, zoneId}` resolved, to avoid the
 * session/decision re-fetch this convenience wrapper performs.
 */
export async function listVerifiedSoilCoreObservationsForSession(farmId: string, jobSessionId: string): Promise<SoilCoreObservationRecord[]> {
  const session = await getJobSessionById(farmId, jobSessionId);
  if (!session || session.activityType !== "soil_sampling") return [];
  const { fieldId, zoneId } = await resolveAuthorisedZone(farmId, session);
  const all = await listSoilCoreObservationsForSession(farmId, jobSessionId);
  return filterVerifiedSoilCoreObservations(all, fieldId, zoneId);
}

/**
 * Records one core. Re-verifies the session is real, belongs to this
 * farm, is genuinely ready/active, and — Codex audit CRITICAL (round 2 of
 * this checkpoint's own audit, 2026-09-12) — that the claimed
 * `fieldId`/`samplingZoneId` actually match this session's own immutable
 * field and its authorising Decision's frozen zone, before accepting
 * evidence for it. Without this, a direct authenticated caller could
 * record cores tagged with an arbitrary zone (same-farm, so the
 * database's own cross-farm trigger would not catch it) and have them
 * counted toward a different zone's confirmed sample at Confirm time.
 * Same "re-verify at every real execution boundary" discipline
 * `confirmJobSessionActualAction` already applies — never trust a stale
 * client-side check alone.
 */
export async function recordSoilCoreObservation(input: RecordSoilCoreObservationInput): Promise<{ observation: SoilCoreObservationRecord; totalCores: number }> {
  const session = await getJobSessionById(input.farmId, input.jobSessionId);
  if (!session) {
    throw new Error(`recordSoilCoreObservation: no session ${input.jobSessionId} found for farm ${input.farmId}`);
  }
  if (session.activityType !== "soil_sampling") {
    throw new Error(`recordSoilCoreObservation: session ${input.jobSessionId} is not a soil sampling session`);
  }
  if (session.status !== "active" && session.status !== "ready") {
    throw new Error(`recordSoilCoreObservation: session ${input.jobSessionId} is "${session.status}" — cores can only be recorded while the session is ready/active`);
  }
  const { fieldId: authorisedFieldId, zoneId: authorisedZoneId } = await resolveAuthorisedZone(input.farmId, session);
  if (authorisedFieldId !== input.fieldId) {
    throw new Error(`recordSoilCoreObservation: session ${input.jobSessionId} is scoped to a different field than requested`);
  }
  if (authorisedZoneId !== input.samplingZoneId) {
    throw new Error(`recordSoilCoreObservation: session ${input.jobSessionId} was not authorised for zone ${input.samplingZoneId}`);
  }
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    throw new Error("recordSoilCoreObservation: sequence must be a positive integer");
  }

  const insertInput: NewSoilCoreObservationInput = {
    id: input.id,
    farmId: input.farmId,
    jobSessionId: input.jobSessionId,
    fieldId: input.fieldId,
    samplingZoneId: input.samplingZoneId,
    sequence: input.sequence,
    lat: input.lat,
    lng: input.lng,
    accuracyMeters: input.accuracyMeters,
    recordedAt: input.recordedAt,
    methodologyVersion: SOIL_SAMPLING_PLAN_VERSION,
    deviationReason: input.deviationReason,
  };
  const observation = await insertSoilCoreObservation(insertInput);
  // A real, server-confirmed, *verified* count for display — purely
  // informational (e.g. showing "may be behind" after an offline batch
  // sync); never used to decide the next `sequence` (see this
  // function's own input doc comment for why that must stay
  // client-authoritative). Filters the already-fetched row set with the
  // `{authorisedFieldId, authorisedZoneId}` this function already
  // resolved above, rather than re-fetching the session/decision a
  // second time (Codex audit LOW, round 4).
  const all = await listSoilCoreObservationsForSession(input.farmId, input.jobSessionId);
  const verified = filterVerifiedSoilCoreObservations(all, authorisedFieldId, authorisedZoneId);
  return { observation, totalCores: verified.length };
}

/**
 * The permanent, human-facing "Sample ID" for a soil sampling session —
 * a formatted view of the session's own real, permanent
 * `job_sessions.id`, never a second, separately-generated identity (see
 * `20260912000000_soil_core_observations.sql`'s header comment for why
 * no separate `composite_samples` row exists). Stable for the life of
 * the session: calling this twice for the same id always returns the
 * same string.
 */
export function formatCompositeSampleId(jobSessionId: string): string {
  return `FR-SOIL-${jobSessionId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export interface CompositeSampleView {
  sampleId: string;
  jobSessionId: string;
  fieldId: string;
  samplingZoneId: string;
  coreCount: number;
  /** Absent when the authorising Decision's own frozen `inputsSnapshot`
   * could not genuinely be resolved (Codex audit CRITICAL, this
   * checkpoint's own round 1: an earlier version defaulted this to `0`
   * when unavailable — a fabricated area, not a real one). Never `0`
   * standing in for "unknown". */
  representedAreaHa?: number;
  methodology: "standard_representative";
  methodologyVersion: string;
  sampleDate: string;
  status: "awaiting_lab_result";
}

/**
 * Derives the `CompositeSample` view a confirmed soil sampling session
 * already fully represents — a pure, read-only projection, never a
 * second stored copy of facts `job_sessions`/`job_actuals`/
 * `soil_core_observations` already hold (this checkpoint's own "no new
 * mutable composite_samples table" decision). `zoneAreaHa` comes from the
 * confirming Actual's own zone, not recomputed from a plan that may have
 * since changed.
 */
export function buildCompositeSampleView(input: {
  jobSessionId: string;
  fieldId: string;
  samplingZoneId: string;
  zoneAreaHa?: number;
  coreCount: number;
  methodologyVersion: string;
  confirmedAt: string;
}): CompositeSampleView {
  return {
    sampleId: formatCompositeSampleId(input.jobSessionId),
    jobSessionId: input.jobSessionId,
    fieldId: input.fieldId,
    samplingZoneId: input.samplingZoneId,
    coreCount: input.coreCount,
    representedAreaHa: input.zoneAreaHa,
    methodology: "standard_representative",
    methodologyVersion: input.methodologyVersion,
    sampleDate: input.confirmedAt,
    status: "awaiting_lab_result",
  };
}

/** Small helper the Server Action layer uses to fetch a real, farm-owned
 * field before building a plan for it — kept here so both the plan and
 * the session-start actions share one real lookup, never two subtly
 * different ones. */
export async function requireOwnedField(fieldId: string): Promise<{ farmId: string; field: Field }> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("requireOwnedField: no real farm for the current session");
  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((f) => f.id === fieldId);
  if (!field) throw new Error(`requireOwnedField: field ${fieldId} not found on the current session's farm`);
  return { farmId: farm.id, field };
}
