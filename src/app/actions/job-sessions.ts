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
 * transition regardless of what this action is asked to send. Codex
 * audit HIGH (round 33) — this "no scientific evidence to fabricate"
 * premise turned out to be genuinely false for one specific
 * `activityType`: `"fertiliser_spreading"` DOES carry real, fail-closed
 * evidence gates (closed-period calendar, NAP compliance, soil
 * evidence, commonage, buffer distance) once round 32/33's fixes
 * required them at the online manual-start boundary —
 * `applyQueuedManualJobSessionStartAction` now re-runs the identical
 * checks, dated to the queue's own `decision.decidedAt`, rather than
 * trusting the queued payload unconditionally for that one activity
 * type. See that function's own doc comment for the full account.
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
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
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
import { FERTILISER_RECOMMENDATION_PROMPT_KIND } from "@/orchestration/prompt/fertiliser-recommendation";
import { insertDecision, type DecisionInput } from "@/lib/farm-data/decisions";
import { insertJobSession, updateJobSessionStatus, type NewJobSessionInput, type JobSessionStatusPatch } from "@/lib/farm-data/job-sessions";
import { confirmJobSessionActual, type ConfirmJobActualInput, type ConfirmJobActualResult } from "@/lib/farm-data/job-actuals";
import { checkClosedPeriodCalendar, normaliseCountyForZoneLookup, type SpreadingMaterial } from "@/domain/closed-period-calendar";
import { validateJobActualInput, type ActivityType, type FieldAreaContext, type RawJobActualInput } from "@/domain/job-actual";
import type { EngineOutcome } from "@/domain/evidence";

async function requireCurrentFarm() {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("job-sessions action: no real farm for the current session");
  return farm;
}

/** Codex audit HIGH (round 33): shared by every real fertiliser-spreading
 * execution boundary in this file that must fail closed on an
 * unverifiable/prohibited real recommendation basis — one honest message
 * per real `EngineOutcome` status, never a generic "blocked", so a
 * legal prohibition, missing evidence, and a genuine ambiguity each read
 * distinctly. `TILLAGE_FIELD_NOT_SUPPORTED` is deliberately the one
 * `NOT_APPLICABLE` reason NOT treated as blocking by this file's own
 * callers below — it means this app has no fertiliser-recommendation
 * coverage for tillage at all (a scope limitation, exactly like every
 * other activityType this manual-start path already covers with zero
 * gating), never that spreading there is prohibited or unverified. Every
 * other `NOT_APPLICABLE` reason (e.g. `NO_FERTILISER_CURRENTLY_RECOMMENDED`
 * — a real "no fertiliser is currently due here" classification) is
 * blocking, since it IS a real, resolved classification this app can and
 * does make. */
function describeBlockedFertiliserBasis(basis: EngineOutcome<unknown>): string {
  switch (basis.status) {
    case "LEGAL_PROHIBITION":
      return basis.consequence;
    case "AMBIGUOUS":
      return basis.detail;
    case "BLOCKED_INSUFFICIENT_EVIDENCE":
      return `insufficient evidence to confirm this field's current fertiliser recommendation (${basis.reasonCode})`;
    case "NOT_APPLICABLE":
      return `this field's fertiliser recommendation is currently NOT_APPLICABLE (${basis.reasonCode})`;
    case "UNKNOWN":
      return `this field's current fertiliser recommendation could not be verified (${basis.reasonCode})`;
    case "OK":
      // Never reached by this file's own real callers (each checks
      // `status !== "OK"` before calling this) — exhaustive rather than
      // a cast, so a future `EngineOutcome` variant fails to compile
      // here instead of silently falling through.
      return "the recommendation is currently OK";
  }
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
  /** Always `"prompt"` — this action starts a job from a live,
   * freshly-recomputed Prompt, constructing a new accepted Decision.
   * Starting a job from an already-existing, previously-accepted plan
   * Decision is `startJobSessionFromPlanAction`
   * (`src/app/actions/fertiliser-plan.ts`) instead — see
   * `startJobSessionFromPrompt`'s own doc comment
   * (`src/orchestration/job-session/index.ts`) for why the two must not
   * share this field's `"plan"` value. */
  origin: "prompt";
  material?: SpreadingMaterial;
}

export async function startJobSessionFromPromptAction(
  input: StartJobSessionFromPromptActionInput,
): Promise<StartJobSessionResult> {
  // Codex audit HIGH (round 8): this pre-existing, cross-cutting action
  // never validated `activityType` against `promptKind` at all — for
  // the fertiliser_recommendation kind this campaign added to
  // `RecomputablePromptKind`, a direct caller could submit any
  // `activityType` (e.g. "slurry_spreading") alongside a real,
  // recomputed fertiliser recommendation, producing a real accepted
  // fertiliser Decision linked to a semantically unrelated job — the
  // exact class of mismatch `startJobSessionFromPlanAction`'s own round-1
  // fix already closed for the plan-specific start path
  // (`src/app/actions/fertiliser-plan.ts`), never propagated here. The
  // current UI never offers this combination, but that does not secure
  // this callable server action. Scoped narrowly to the one Prompt kind
  // this campaign introduced — the other four kinds' own activityType
  // semantics predate this campaign and are out of its authority to
  // redesign.
  if (input.promptKind === FERTILISER_RECOMMENDATION_PROMPT_KIND && input.activityType !== "fertiliser_spreading") {
    throw new Error(
      `startJobSessionFromPromptAction: activityType must be "fertiliser_spreading" for a "${FERTILISER_RECOMMENDATION_PROMPT_KIND}" Prompt — a fertiliser plan can never authorise any other job type`,
    );
  }

  const farm = await requireCurrentFarm();
  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((f) => f.id === input.fieldId);
  if (!field) {
    throw new Error(`startJobSessionFromPromptAction: field ${input.fieldId} not found on the current session's farm`);
  }
  const now = new Date().toISOString();
  const prompt =
    input.promptKind === FERTILISER_RECOMMENDATION_PROMPT_KIND
      ? recomputePromptByKind({
          promptKind: input.promptKind,
          farm,
          field,
          allFields: fields,
          livestockGroups: await listLivestockGroupsForFarm(farm.id),
          slurryAllocations: await listSlurryAllocationsForFarm(farm.id),
          now,
        })
      : recomputePromptByKind({ promptKind: input.promptKind, farm, field, material: input.material, now });

  // Codex audit HIGH (round 32, extended): the same real gap
  // `startJobSessionFromPlanAction` (`src/app/actions/fertiliser-plan.ts`)
  // was fixed for — a real execution boundary that turns an accepted
  // fertiliser Decision into an actual active Job Session must
  // independently re-verify the statutory closed-period calendar, never
  // trust that the Prompt being accepted already encoded it. This
  // function is a second, structurally identical execution boundary:
  // `recomputePromptByKind` for `FERTISER_RECOMMENDATION_PROMPT_KIND`
  // never consults the calendar (that's the separate, purely
  // informational `spreading_window` Prompt kind — `spreading-window.ts`'s
  // own header), so accepting a live fertiliser recommendation here would
  // otherwise start a real chemical-fertiliser spreading job during a
  // legally prohibited period exactly as the plan-start path could.
  // Scoped to the one Prompt kind this campaign owns, matching the
  // narrow activityType check above in this same function.
  if (input.promptKind === FERTILISER_RECOMMENDATION_PROMPT_KIND) {
    const closedPeriod = checkClosedPeriodCalendar({
      county: normaliseCountyForZoneLookup(farm.location.county),
      date: now.slice(0, 10),
      material: "chemical_fertiliser",
    });
    if (closedPeriod.status !== "OK") {
      throw new Error(
        `startJobSessionFromPromptAction: cannot start this job — ${
          closedPeriod.status === "LEGAL_PROHIBITION"
            ? closedPeriod.consequence
            : "the statutory closed-period calendar could not be verified for this farm's county"
        }`,
      );
    }
  }

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
   * an authoritative fact, purely contextual (confidence tier,
   * qualifying sample count, candidate field entry timestamp). */
  deviceMetadata?: Record<string, unknown>;
}

export async function startManualJobSessionAction(input: StartManualJobSessionActionInput): Promise<StartJobSessionResult> {
  const farm = await requireCurrentFarm();
  // Codex audit MEDIUM (round 10, 2026-09-04): `startManualJobSession`
  // inserts the Decision row *before* creating the job session (the
  // latter alone protected by the database's own same-farm trigger) — a
  // stale, deleted, or cross-farm `primaryFieldId` previously let the
  // Decision persist successfully while the job session insert then
  // failed, leaving an orphaned, misleading "accepted" decision with no
  // session behind it. Validated here, before either row is touched,
  // mirroring `startJobSessionFromPromptAction`'s own existing check.
  const needsFields = input.primaryFieldId !== undefined || input.activityType === "fertiliser_spreading";
  const fields = needsFields ? await listFieldsForFarm(farm.id) : undefined;
  if (input.primaryFieldId && !fields!.some((f) => f.id === input.primaryFieldId)) {
    throw new Error(`startManualJobSessionAction: field ${input.primaryFieldId} not found on the current session's farm`);
  }
  const now = new Date().toISOString();

  // Codex audit HIGH (round 33): this manual/detected start path
  // (`GpsActivityCandidateCard.confirm()`'s own fallback whenever GPS
  // plan matching returns "none"/"ambiguous" is a real, reachable
  // caller) is the one real fertiliser-spreading job-start boundary
  // round 32 never covered — `constructManualJobStartDecision` builds a
  // bare `{manual: true, activityType}` Decision with no agronomic/legal
  // evaluation at all, by design, for every activity type this action
  // serves. That is correct for "livestock_work"/"field_inspection"/etc,
  // but for "fertiliser_spreading" it means every fail-closed gate this
  // vertical has built (closed-period calendar, NAP compliance, soil
  // evidence, commonage, buffer distance) was silently bypassed whenever
  // no unique plan/Prompt already existed for the field. Fixed by
  // reusing the identical live recompute `startJobSessionFromPromptAction`
  // already runs for this same Prompt kind (`recomputePromptByKind`,
  // `FERTILISER_RECOMMENDATION_PROMPT_KIND`) — its `basis` already
  // composes every one of those gates via `calculateNutrientPlan` — plus
  // the same explicit closed-period check round 32 added, since that
  // calendar is never part of this Prompt kind's own basis (it belongs
  // to the separate, purely informational `spreading_window` kind).
  if (input.activityType === "fertiliser_spreading") {
    if (!input.primaryFieldId) {
      throw new Error(
        "startManualJobSessionAction: a fertiliser_spreading job must specify primaryFieldId — every fail-closed evidence/legal gate this vertical enforces is field-scoped, and a manual/detected start with no known field cannot be verified against any of them",
      );
    }
    const field = fields!.find((f) => f.id === input.primaryFieldId)!;
    const recomputed = recomputePromptByKind({
      promptKind: FERTILISER_RECOMMENDATION_PROMPT_KIND,
      farm,
      field,
      allFields: fields!,
      livestockGroups: await listLivestockGroupsForFarm(farm.id),
      slurryAllocations: await listSlurryAllocationsForFarm(farm.id),
      now,
    });
    // `TILLAGE_FIELD_NOT_SUPPORTED` is a scope limitation, not a real
    // prohibition — see `describeBlockedFertiliserBasis`'s own doc
    // comment for why this one NOT_APPLICABLE reason is deliberately let
    // through while every other non-OK status blocks.
    const basis = recomputed.basis;
    if (basis.status !== "OK" && !(basis.status === "NOT_APPLICABLE" && basis.reasonCode === "TILLAGE_FIELD_NOT_SUPPORTED")) {
      throw new Error(
        `startManualJobSessionAction: cannot start this manual/detected fertiliser-spreading job — ${describeBlockedFertiliserBasis(basis)}`,
      );
    }
    const closedPeriod = checkClosedPeriodCalendar({
      county: normaliseCountyForZoneLookup(farm.location.county),
      date: now.slice(0, 10),
      material: "chemical_fertiliser",
    });
    if (closedPeriod.status !== "OK") {
      throw new Error(
        `startManualJobSessionAction: cannot start this job — ${
          closedPeriod.status === "LEGAL_PROHIBITION"
            ? closedPeriod.consequence
            : "the statutory closed-period calendar could not be verified for this farm's county"
        }`,
      );
    }
  }

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
// offline. See this file's own header comment for why this is safe for
// every OTHER manual-start activity type (no scientific evidence to
// fabricate) — Codex audit HIGH (round 33): that premise is genuinely
// false for "fertiliser_spreading" once `startManualJobSessionAction`'s
// own online path (this file, above) gained real fail-closed evidence
// gates, so this offline-sync twin needed the identical treatment or it
// would remain a fully unrestricted second bypass of every one of them.
// ---------------------------------------------------------------------------
export async function applyQueuedManualJobSessionStartAction(input: {
  decision: DecisionInput;
  jobSession: NewJobSessionInput;
}): Promise<StartJobSessionResult> {
  // Codex audit HIGH (round 33): re-runs the identical two checks
  // `startManualJobSessionAction` runs online, but validated against the
  // real, disclosed `decision.decidedAt` this queued start actually
  // happened at (never the sync-time `now()`) — sync can genuinely occur
  // well after the physical start, and the closed-period calendar/live
  // recommendation basis are both dated facts, not sync-time ones.
  // Deliberately fails closed (refuses to sync at all) rather than
  // authorising an unverifiable or legally prohibited claim — a known,
  // disclosed limitation for exactly this one activity type: a farmer
  // whose device queued a genuinely legitimate fertiliser start offline
  // could still have that sync rejected if the field's evidence
  // genuinely changed before the device reconnects (see
  // `FERTILISER_VERTICAL_ARCHITECTURE.md`'s own "Known limitations").
  if (input.jobSession.activityType === "fertiliser_spreading") {
    const farm = await requireCurrentFarm();
    if (!input.decision.fieldId) {
      throw new Error(
        "applyQueuedManualJobSessionStartAction: a queued fertiliser_spreading start must carry decision.fieldId — every fail-closed evidence/legal gate this vertical enforces is field-scoped",
      );
    }
    const fields = await listFieldsForFarm(farm.id);
    const field = fields.find((f) => f.id === input.decision.fieldId);
    if (!field) {
      throw new Error(`applyQueuedManualJobSessionStartAction: field ${input.decision.fieldId} not found on the current session's farm`);
    }
    const queuedAt = input.decision.decidedAt;
    const recomputed = recomputePromptByKind({
      promptKind: FERTILISER_RECOMMENDATION_PROMPT_KIND,
      farm,
      field,
      allFields: fields,
      livestockGroups: await listLivestockGroupsForFarm(farm.id),
      slurryAllocations: await listSlurryAllocationsForFarm(farm.id),
      now: queuedAt,
    });
    const basis = recomputed.basis;
    if (basis.status !== "OK" && !(basis.status === "NOT_APPLICABLE" && basis.reasonCode === "TILLAGE_FIELD_NOT_SUPPORTED")) {
      throw new Error(
        `applyQueuedManualJobSessionStartAction: cannot sync this queued fertiliser-spreading start — ${describeBlockedFertiliserBasis(basis)}`,
      );
    }
    const closedPeriod = checkClosedPeriodCalendar({
      county: normaliseCountyForZoneLookup(farm.location.county),
      date: queuedAt.slice(0, 10),
      material: "chemical_fertiliser",
    });
    if (closedPeriod.status !== "OK") {
      throw new Error(
        `applyQueuedManualJobSessionStartAction: cannot sync this job — ${
          closedPeriod.status === "LEGAL_PROHIBITION"
            ? closedPeriod.consequence
            : "the statutory closed-period calendar could not be verified for this farm's county"
        }`,
      );
    }
  }

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
