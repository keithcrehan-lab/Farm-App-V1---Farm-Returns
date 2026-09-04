"use server";

/**
 * Farm Return Next — real Job Session persistence for the GPS Job Session
 * + Confirm Actual contract
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`).
 *
 * Two families of action here, matching that contract's own §8/§15
 * distinction between what does and does not carry scientific-evidence
 * risk:
 *
 * **Online-path actions** (`startJobSessionFromPromptAction`,
 * `pauseJobSessionAction`, `resumeJobSessionAction`,
 * `finishJobSessionAction`, `cancelJobSessionAction`) read fresh server
 * state and run `src/domain/job-session-lifecycle.ts`'s pure transitions
 * server-side (`src/orchestration/job-session/index.ts`) — the safest
 * path, used whenever the device has connectivity.
 *
 * **Offline-sync passthrough actions** (`applyQueuedManualJobSessionStartAction`,
 * `applyQueuedJobSessionPatchAction`) trust an already-computed patch the
 * client produced *while offline*, using the exact same pure domain
 * functions, against its own last-known local state — persisting it
 * as-given rather than re-deriving it from a (possibly now-stale, from
 * the client's perspective) server read. This is safe for exactly the
 * two classes of write this contract allows offline
 * (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md`'s own architecture note): a
 * manual job's lifecycle carries no scientific evidence to fabricate
 * (unlike a Prompt's `basis`), and `job_sessions_check_valid_transition`
 * (the migration's own trigger) still independently rejects an illegal
 * transition regardless of what this action is asked to send.
 *
 * **Deliberately NOT offered here**: an offline variant of
 * `startJobSessionFromPromptAction`. Starting a Job Session *from a real
 * Prompt* is a genuine Decide-stage `"accepted"` outcome against a
 * scientific Estimate — the same class of risk
 * `submitPromptDecisionAction`'s own audit history already fixed once
 * (`docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round1.md`,
 * HIGH: a client-constructed `basis` can be fabricated). Trusting an
 * offline-queued, client-computed Prompt acceptance would reopen that
 * exact gap. This is a real, disclosed, narrower-than-ideal scope for
 * this phase — starting a job *from a Prompt* requires connectivity;
 * starting one manually, and every lifecycle/Confirm-Actual step after a
 * session already exists, works fully offline. See
 * `GPS_JOB_SESSION_ACTUAL_CONTRACT.md`'s own "Offline-first" section and
 * `BLOCKERS.md` for the full account.
 *
 * `confirmJobSessionActualAction` needs no online/offline split at all:
 * a Confirm Actual submission has always been client-asserted-and-trusted
 * by design (the farmer is the source of truth for what actually
 * happened — the same posture `individual-animals.ts`'s
 * `addWeightObservation` already has for a farmer-entered weight), so
 * offline Confirm Actual poses no *different* risk than online Confirm
 * Actual.
 */
import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import type { JobSessionRecord, JobActualRecord } from "@/lib/farm-data/mappers";
import {
  cancelJobSessionAction as cancelJobSessionOrchestration,
  confirmJobSessionActualAction as confirmJobSessionActualOrchestration,
  finishJobSessionAction as finishJobSessionOrchestration,
  pauseJobSessionAction as pauseJobSessionOrchestration,
  resumeJobSessionAction as resumeJobSessionOrchestration,
  startJobSessionFromPrompt,
  startManualJobSession,
  type StartJobSessionResult,
} from "@/orchestration/job-session";
import { recomputePromptByKind, type RecomputablePromptKind } from "@/orchestration/prompt/recompute";
import { insertDecision, type DecisionInput } from "@/lib/farm-data/decisions";
import { insertJobSession, updateJobSessionStatus, type NewJobSessionInput, type JobSessionStatusPatch } from "@/lib/farm-data/job-sessions";
import { confirmJobSessionActual, type ConfirmJobActualInput, type ConfirmJobActualResult } from "@/lib/farm-data/job-actuals";
import type { SpreadingMaterial } from "@/domain/closed-period-calendar";
import { validateJobActualInput, type ActivityType, type FieldAreaContext, type RawJobActualInput } from "@/domain/job-actual";

async function requireCurrentFarm() {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("job-sessions action: no real farm for the current session");
  return farm;
}

// ---------------------------------------------------------------------------
// Online-path: Start from a real Prompt (connectivity required — see this
// file's own header comment).
// ---------------------------------------------------------------------------
export interface StartJobSessionFromPromptActionInput {
  promptKind: RecomputablePromptKind;
  fieldId: string;
  activityType: ActivityType | string;
  jobSessionId: string;
  origin: "prompt" | "plan";
  material?: SpreadingMaterial;
}

export async function startJobSessionFromPromptAction(
  input: StartJobSessionFromPromptActionInput,
): Promise<StartJobSessionResult> {
  const farm = await requireCurrentFarm();
  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((f) => f.id === input.fieldId);
  if (!field) {
    throw new Error(`startJobSessionFromPromptAction: field ${input.fieldId} not found on the current session's farm`);
  }
  const now = new Date().toISOString();
  const prompt = recomputePromptByKind({ promptKind: input.promptKind, farm, field, material: input.material, now });

  const result = await startJobSessionFromPrompt({
    prompt,
    activityType: input.activityType,
    jobSessionId: input.jobSessionId,
    decidedAt: now,
    origin: input.origin,
    primaryFieldId: input.fieldId,
  });
  revalidatePath("/today");
  revalidatePath("/plan");
  return result;
}

// ---------------------------------------------------------------------------
// Manual start — online path.
// ---------------------------------------------------------------------------
export interface StartManualJobSessionActionInput {
  activityType: string;
  jobSessionId: string;
  primaryFieldId?: string;
  /** GPS Job Mode campaign, 2026-09-04: `"detected"` for a farmer
   * confirming a real GPS Activity Candidate
   * (`src/domain/gps-activity-detection.ts`); defaults to `"manual"`
   * (every existing caller's behaviour is unchanged). */
  origin?: "manual" | "detected";
  /** Disclosed detection evidence for a `"detected"` origin only — never
   * an authoritative fact, purely contextual (confidence tier, sample
   * count, dwell seconds). */
  deviceMetadata?: Record<string, unknown>;
}

export async function startManualJobSessionAction(input: StartManualJobSessionActionInput): Promise<StartJobSessionResult> {
  const farm = await requireCurrentFarm();
  const now = new Date().toISOString();
  const result = await startManualJobSession({
    farmId: farm.id,
    activityType: input.activityType,
    jobSessionId: input.jobSessionId,
    decidedAt: now,
    primaryFieldId: input.primaryFieldId,
    origin: input.origin,
    deviceMetadata: input.deviceMetadata,
  });
  revalidatePath("/today");
  revalidatePath("/plan");
  return result;
}

// ---------------------------------------------------------------------------
// Offline-sync passthrough: manual start computed and queued while
// offline. See this file's own header comment for why this is safe for a
// manual start specifically (no scientific evidence to fabricate).
// ---------------------------------------------------------------------------
export async function applyQueuedManualJobSessionStartAction(input: {
  decision: DecisionInput;
  jobSession: NewJobSessionInput;
}): Promise<StartJobSessionResult> {
  // DecisionRecord (insertDecision's return) is a structural superset of
  // Decision (adds createdAt; decidedBy: "farmer" narrows Decision's own
  // "farmer" | "auto_rule") — no cast needed, it already satisfies the
  // shape StartJobSessionResult.decision requires.
  const decision = await insertDecision(input.decision);
  const jobSession = await insertJobSession(input.jobSession);
  revalidatePath("/today");
  revalidatePath("/plan");
  return { decision, jobSession };
}

// ---------------------------------------------------------------------------
// Lifecycle — online path (reads fresh state, runs the pure transition,
// persists).
// ---------------------------------------------------------------------------
export async function pauseJobSessionAction(jobSessionId: string): Promise<JobSessionRecord> {
  const farm = await requireCurrentFarm();
  return pauseJobSessionOrchestration(farm.id, jobSessionId, new Date().toISOString());
}

export async function resumeJobSessionAction(jobSessionId: string): Promise<JobSessionRecord> {
  const farm = await requireCurrentFarm();
  return resumeJobSessionOrchestration(farm.id, jobSessionId, new Date().toISOString());
}

export async function finishJobSessionAction(jobSessionId: string): Promise<JobSessionRecord> {
  const farm = await requireCurrentFarm();
  const result = await finishJobSessionOrchestration(farm.id, jobSessionId, new Date().toISOString());
  revalidatePath("/today");
  revalidatePath("/plan");
  return result;
}

export async function cancelJobSessionAction(jobSessionId: string, reason?: string): Promise<JobSessionRecord> {
  const farm = await requireCurrentFarm();
  const result = await cancelJobSessionOrchestration(farm.id, jobSessionId, new Date().toISOString(), reason);
  revalidatePath("/today");
  revalidatePath("/plan");
  return result;
}

// ---------------------------------------------------------------------------
// Offline-sync passthrough: a pause/resume/finish/cancel patch the client
// already computed itself (via the same pure `src/domain/
// job-session-lifecycle.ts` functions) while offline, against its own
// last-known local state. Persisted as-given — see this file's own header
// comment for why this is safe (no scientific evidence at stake; the
// database's own transition trigger is the independent backstop).
// ---------------------------------------------------------------------------
export async function applyQueuedJobSessionPatchAction(jobSessionId: string, patch: JobSessionStatusPatch): Promise<JobSessionRecord> {
  const farm = await requireCurrentFarm();
  const result = await updateJobSessionStatus(farm.id, jobSessionId, patch);
  revalidatePath("/today");
  revalidatePath("/plan");
  return result;
}

// ---------------------------------------------------------------------------
// Confirm Actual — no online/offline split needed (see this file's own
// header comment).
// ---------------------------------------------------------------------------
export interface ConfirmJobSessionActualActionInput {
  /** Client-generated once, at submission time — see
   * `src/orchestration/job-session/index.ts`'s
   * `confirmJobSessionActualAction` own doc comment. */
  id: string;
  jobSessionId: string;
  activityType: ActivityType;
  raw: RawJobActualInput;
  confirmedAt?: string;
}

export async function confirmJobSessionActualAction(input: ConfirmJobSessionActualActionInput): Promise<ConfirmJobActualResult> {
  const farm = await requireCurrentFarm();
  // Codex audit HIGH (round 1, docs/overnight/audits/
  // gps-job-session-actual-contract-codex-audit-round1.md): this action
  // previously accepted `fields: FieldAreaContext[]` straight from the
  // client and used those `areaHa` numbers as "the real mapped area" —
  // an authenticated client could submit a fabricated figure for a
  // `"whole"` completion. Re-fetched fresh here, server-side, from this
  // farm's own real fields (RLS-scoped) instead — the client no longer
  // has any say in what a field's area actually is.
  // `src/lib/farm-data/job-actuals.ts`'s own `reconcileWholeFieldArea` is
  // a second, independent enforcement of the same rule (defense in
  // depth: this refetch also makes `validateJobActualInput`'s own
  // structural validation run against real data, not just the final
  // persisted value).
  const fields: FieldAreaContext[] = (await listFieldsForFarm(farm.id)).map((f) => ({ fieldId: f.id, areaHa: f.areaHa }));
  const result = await confirmJobSessionActualOrchestration({
    id: input.id,
    farmId: farm.id,
    jobSessionId: input.jobSessionId,
    activityType: input.activityType,
    raw: input.raw,
    fields,
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
  });
  revalidatePath("/records");
  return result;
}

/** Offline-sync target for `confirmJobSessionActualAction` — identical
 * trust posture, exposed separately only so the outbox's own `syncFn`
 * wiring (`src/lib/offline/job-session-sync.ts`) has one stable, minimal
 * surface (a plain `ConfirmJobActualInput`) that does not change shape if
 * `confirmJobSessionActualAction`'s own richer input (raw payload +
 * fields, validated at submission time) ever does.
 *
 * Codex audit HIGH (round 3, docs/overnight/audits/
 * gps-job-session-actual-contract-codex-audit-round3.md, finding 2): this
 * action previously passed `input.payload` straight to the farm-data
 * layer's `confirmJobSessionActual`, which explicitly trusts its caller
 * already ran `validateJobActualInput` — but nothing on *this* path ever
 * had. That broke this file's own header comment's claim that online and
 * offline Confirm Actual "pose no different risk": the online action
 * (`confirmJobSessionActualAction` above) re-validates against real,
 * freshly fetched fields; this one did not, at all. `payload` is
 * reconstructed into a `RawJobActualInput` and re-validated here, the
 * same server-side, real-fields re-check the online path already gets —
 * true parity, not just a documented intent to have it. */
export async function applyQueuedJobActualConfirmationAction(input: ConfirmJobActualInput): Promise<ConfirmJobActualResult> {
  const farm = await requireCurrentFarm();

  const fields: FieldAreaContext[] = (await listFieldsForFarm(farm.id)).map((f) => ({ fieldId: f.id, areaHa: f.areaHa }));
  const raw: RawJobActualInput = {
    ...(input.payload as Record<string, unknown>),
    completionType: input.completionType,
    note: input.note,
  } as RawJobActualInput;
  const validation = validateJobActualInput(input.activityType as ActivityType, raw, fields);
  if (!validation.ok) {
    throw new Error(`applyQueuedJobActualConfirmationAction: invalid queued Actual payload — ${validation.errors.join("; ")}`);
  }

  const result = await confirmJobSessionActual({
    ...input,
    farmId: farm.id,
    payload: validation.payload as unknown as Record<string, unknown>,
  });
  // Codex audit HIGH (round 1, docs/overnight/audits/
  // gps-job-session-actual-contract-codex-audit-round1.md): the prior
  // version returned `result` unconditionally, even when
  // `sessionStatusUpdateError` was set — the outbox's own `flush()` (see
  // `src/lib/offline/outbox.ts`) treats a resolved promise as success and
  // marks the item "synced", so the queued item's own retry mechanism
  // never got a chance to repair the status. Throwing here instead makes
  // `flush()` record it as "failed" and retry on a future call — safe by
  // construction: `confirmJobSessionActual`'s own id-first retry-safety
  // means the retry finds the already-inserted Actual and re-attempts
  // only the status move (its "same-status no-op" branch makes this
  // harmless even if the first attempt's status update actually did
  // land after all).
  if (result.sessionStatusUpdateError) {
    throw new Error(
      `applyQueuedJobActualConfirmationAction: Actual ${result.actual.id} recorded, but confirming job_sessions status failed (${result.sessionStatusUpdateError}) — will retry`,
    );
  }
  revalidatePath("/records");
  return result;
}

export type { JobActualRecord };
