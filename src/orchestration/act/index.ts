/**
 * Act stage — `MASTER_SPEC.md`: "The app creates a real record from the
 * decision — a job, a planned application, a stock movement — the same
 * shape a farmer would have hand-entered in V1," calling existing
 * `src/lib/farm-data/*` mutation functions, never duplicating them
 * (`ARCHITECTURE.md`'s reuse boundary / `DOMAIN_CONTRACTS.md`).
 *
 * This checkpoint's one real, end-to-end job type — proving the layering
 * actually works, not just documented (`BUILD_PLAN.md`'s Checkpoint 1
 * deliverable) — is `record_weight_observation`: a Decide-stage
 * acceptance of "record this animal's weight" becomes a real
 * `WeightObservation` row via the *existing*
 * `farm-data/individual-animals.ts`'s `addWeightObservation`, not a new
 * write path. Every other job type this app eventually needs (a
 * spreading run, a stock movement) is added the same way, one at a time,
 * once its own Prompt/Decide path exists for it — never invented ahead of
 * the Decide stage that would produce it.
 */
import "server-only";
import type { WeightObservation } from "@/domain/types";
import { addWeightObservation, getWeightObservationById } from "@/lib/farm-data/individual-animals";
import { insertDecision } from "@/lib/farm-data/decisions";
import { insertJob } from "@/lib/farm-data/jobs";
import type { Decision } from "@/orchestration/decide";

export type JobType = "record_weight_observation";

/** The only `Prompt.kind` `actRecordWeightObservation` accepts — see its
 * own doc comment (Codex audit round 11, HIGH). */
export const RECORD_WEIGHT_OBSERVATION_CALCULATION_KIND = "weight_observation_due";

export interface ActResult<T> {
  jobType: JobType;
  decisionId: string;
  record: T;
  /**
   * Present only when the real domain mutation above (`record`) succeeded
   * but persisting the `decisions`/`jobs` audit-trail rows afterward
   * failed — see `actRecordWeightObservation`'s own doc comment for the
   * full ordering/failure-mode reasoning. Never set on a call that threw
   * (a thrown call has no `ActResult` at all) — this field exists
   * precisely for the one case where the function *succeeds* (the
   * farmer's action is real and recorded) but its provenance trail is
   * incomplete, which must be visible to the caller, not silently
   * dropped. **Not a signal to retry `actRecordWeightObservation` itself**
   * (that would re-run the domain mutation — unsafe, see this function's
   * own doc comment) — the safe retry is
   * `persistRecordWeightObservationAuditTrail(decision, record.id)` alone
   * (Codex audit LOW, `docs/farm-return-next/audit-logs/
   * 20260829T202835Z.md`: this example previously omitted the required
   * `observationId` argument).
   */
  auditTrailError?: string;
}

export interface RecordWeightObservationEdits {
  animalId: string;
  weightKg: number;
  observedDate: string;
}

function parseRecordWeightObservationEdits(
  edits: Record<string, unknown> | undefined,
): RecordWeightObservationEdits | undefined {
  if (
    !edits ||
    typeof edits.animalId !== "string" ||
    edits.animalId.trim().length === 0 ||
    typeof edits.weightKg !== "number" ||
    !Number.isFinite(edits.weightKg) ||
    edits.weightKg <= 0 ||
    typeof edits.observedDate !== "string" ||
    edits.observedDate.trim().length === 0
  ) {
    return undefined;
  }
  return { animalId: edits.animalId, weightKg: edits.weightKg, observedDate: edits.observedDate };
}

/**
 * Shared by `actRecordWeightObservation` and
 * `persistRecordWeightObservationAuditTrail` — both are real, independent
 * entry points into a `record_weight_observation` Decision (the second
 * one specifically so a future caller can retry the audit trail alone,
 * see that function's own doc comment), so both validate the *real*
 * `Decision` object the same way, rather than one trusting a caller to
 * have already validated it (Codex audit HIGH,
 * `docs/farm-return-next/audit-logs/20260829T191955Z.md`: the first
 * version of `persistRecordWeightObservationAuditTrail` took `outcome`/
 * `decidedBy` as separate parameters a caller could pass mismatched
 * against `decision` itself).
 *
 * A TypeScript assertion function, not a plain boolean check — this is
 * what lets both callers read `decision.outcome`/`decision.decidedBy`
 * back with their real narrowed types immediately after calling this,
 * the same as an inline `if` guard would, without duplicating the checks
 * themselves in each function.
 */
function assertWeightObservationDecisionIsActable(
  decision: Decision,
): asserts decision is Decision & { outcome: "accepted" | "edited"; decidedBy: "farmer" } {
  if (decision.outcome !== "accepted" && decision.outcome !== "edited") {
    throw new Error(
      `decision ${decision.id} has outcome "${decision.outcome}" — only an accepted or edited decision may act`,
    );
  }
  if (decision.decidedBy !== "farmer") {
    throw new Error(
      `decision ${decision.id} was decided by "${decision.decidedBy}" — no reviewed auto-rule may call Act yet (SCIENTIFIC_RULES.md, BLOCKERS.md)`,
    );
  }
  if (decision.calculationKind !== RECORD_WEIGHT_OBSERVATION_CALCULATION_KIND) {
    throw new Error(
      `decision ${decision.id} is for calculationKind "${decision.calculationKind}", not "${RECORD_WEIGHT_OBSERVATION_CALCULATION_KIND}"`,
    );
  }
  if (decision.estimateSnapshot.status !== "OK") {
    throw new Error(
      `decision ${decision.id}'s estimateSnapshot has status "${decision.estimateSnapshot.status}", not "OK"`,
    );
  }
}

/**
 * Acts on a `record_weight_observation` Decision — the checkpoint's one
 * real end-to-end path. Throws (never silently coerces or no-ops) on:
 *
 * - a Decision the farmer didn't actually accept/edit — Codex audit
 *   finding, `docs/farm-return-next/audit-logs/20260829T001857Z.md`: the
 *   first version of this function checked `decision.edits`' *shape* but
 *   never `decision.outcome`/`decidedBy`, so a `"dismissed"` Decision that
 *   still happened to carry `edits`, or a structurally-valid
 *   `decidedBy: "auto_rule"` Decision, would have silently written a real
 *   record — exactly the unconfirmed real-world side effect
 *   `SCIENTIFIC_RULES.md`'s Decide-stage boundary forbids. `decidedBy` is
 *   required to be `"farmer"` unconditionally here, not just today's
 *   *practical* state that no auto-rule exists yet (`BLOCKERS.md`) — an
 *   auto-rule earning the right to call Act still needs its own reviewed
 *   entry point, never silent admission through this one.
 * - malformed/missing edits (animalId/weightKg/observedDate absent,
 *   non-finite or non-positive weight, empty-string id/date) — the same
 *   fail-closed discipline the domain layer applies to a missing input.
 * - a Decision that didn't actually come from a `weight_observation_due`
 *   Prompt, or whose own `estimateSnapshot` wasn't `"OK"` — Codex audit
 *   finding, HIGH, `docs/farm-return-next/audit-logs/20260829T012813Z.md`:
 *   the first version checked `outcome`/`decidedBy`/edit shape but never
 *   *which* Prompt the Decision was for, so any accepted Decision with
 *   suitably-shaped edits — even one that started life as, say, a
 *   spreading-window Prompt with a since-recomputed or blocked basis —
 *   could create a real weight observation. `decideAsFarmer` already
 *   refuses to build an accepted/edited Decision from a non-OK basis, and
 *   the database's own CHECK constraint mirrors that — but Act is the
 *   last line of defense before a real domain mutation runs, and must not
 *   assume either of those upstream guards ran (`CLAUDE.md`'s "never
 *   assume application code is the only writer," applied here to a
 *   different caller, not just a different table).
 *
 * Farm Return Next Checkpoint 2, Vertical D — now also persists the
 * `decisions`/`jobs` audit trail (`src/lib/farm-data/decisions.ts`'s
 * `insertDecision`, `src/lib/farm-data/jobs.ts`'s `insertJob`), which
 * Checkpoint 1 deliberately left unwired (`BLOCKERS.md`'s "grant
 * dependency"/"no client access yet" entries — the grant these two calls
 * now rely on ships in this same checkpoint's own migration,
 * `20260829010000_decisions_jobs_client_access.sql`).
 *
 * **Ordering and failure-mode decision, reasoned through explicitly per
 * this checkpoint's own brief — there is no single obviously-correct
 * answer here:**
 *
 * `addWeightObservation` runs first, unchanged, exactly as it always has.
 * The `decisions`/`jobs` inserts run *after* it, not before, and a
 * failure in either of them does **not** roll back or re-throw past the
 * already-successful weight observation. Three real alternatives were
 * considered and rejected:
 *
 * 1. Persist `decisions`/`jobs` first, `addWeightObservation` second. If
 *    the (still real, still failure-prone) domain mutation then failed,
 *    the audit trail would already claim a "confirmed" job for a weight
 *    observation that never actually exists — a *worse* lie than an
 *    incomplete trail, since it asserts a fact that is false rather than
 *    merely omitting one that's true. Rejected.
 * 2. Keep this function's current order, but re-throw if the
 *    `decisions`/`jobs` inserts fail after `addWeightObservation`
 *    succeeded. A Server Action caller sees this as a plain failure — but
 *    the farmer's action *did* succeed; a caller (or a farmer retrying
 *    what looks like a failed submission) would have every reason to
 *    resubmit, and `addWeightObservation` has no idempotency/uniqueness
 *    constraint to stop that from creating a second, duplicate real
 *    `WeightObservation` row. Turning a real success into an apparent
 *    failure risks a concrete, farmer-visible data-quality bug for the
 *    sake of a supplementary audit-trail write. Rejected.
 * 3. **Chosen**: catch a `decisions`/`jobs` persistence failure,
 *    `console.error` it (not silent — a real, visible server log, the
 *    same `[module] ...`-prefixed pattern `farm-store.tsx`'s own
 *    real-mode write-failure logging already uses), and surface it on the
 *    returned `ActResult` as `auditTrailError` rather than throwing. The
 *    function's primary contract — "did the farmer's real action happen"
 *    — stays honest and unambiguous (it succeeded, `record` is real); the
 *    secondary, genuinely-failed fact ("is the full Decide/Act trace also
 *    persisted") is reported through the result's own shape, which a
 *    caller can inspect and show a soft, non-blocking warning for, without
 *    this module inventing a UI here (out of scope this checkpoint). This
 *    mirrors `ARCHITECTURE.md`'s own cited precedent for exactly this
 *    shape — `farm-store.tsx`'s `SyncStatusBanner` pattern: "local state
 *    responds immediately, a real write is separately tracked," where a
 *    failure is real and visible, never a console-only fire-and-forget and
 *    never a rollback of work already done.
 *
 * **`auditTrailError` is NOT a signal to retry `actRecordWeightObservation`
 * itself — Codex audit finding, MEDIUM, `docs/farm-return-next/
 * audit-logs/20260829T190434Z.md`: the first version of this comment
 * implied a caller could safely retry the whole call after this failure,
 * which is false.** Retrying by calling `actRecordWeightObservation`
 * again with the same `Decision` would re-run `addWeightObservation` —
 * which has no idempotency key — creating a second, duplicate real
 * `WeightObservation` row. The narrower, genuinely safe retry is
 * `persistRecordWeightObservationAuditTrail` (below) alone — see the
 * "Update" paragraph after this one, and that function's own doc comment.
 *
 * `insertDecision` is attempted before `insertJob` (required —
 * `jobs.decision_id` is a `not null` foreign key into `decisions`, so a
 * job can only be inserted once its decision exists) and nested inside
 * the same try: if `insertDecision` itself fails, `insertJob` is never
 * attempted at all (there is no valid `decision_id` to give it), and the
 * surfaced `auditTrailError` names the decision failure specifically. If
 * `insertDecision` succeeds but `insertJob` fails, `auditTrailError`
 * names the job failure specifically — the decision itself is safely
 * persisted either way.
 *
 * **Update (Codex audit HIGH, `docs/farm-return-next/audit-logs/
 * 20260829T191227Z.md`) — this checkpoint no longer stops at documenting
 * "no safe retry path" as a known gap; it closes it.** The
 * decisions/jobs persistence is now `persistRecordWeightObservationAuditTrail`
 * below, a separately-exported function specifically so a future caller
 * (once the Records/Activity UI that would trigger it exists — out of
 * scope this checkpoint) can retry *only* the audit trail, never
 * repeating `addWeightObservation`, and have that retry actually be safe
 * — see that function's own doc comment and `insertDecision`'s
 * (`src/lib/farm-data/decisions.ts`) matching retry-safety fix.
 */
export async function actRecordWeightObservation(
  decision: Decision,
  source: string,
): Promise<ActResult<WeightObservation>> {
  assertWeightObservationDecisionIsActable(decision);
  const edits = parseRecordWeightObservationEdits(decision.edits);
  if (!edits) {
    throw new Error(
      `actRecordWeightObservation: decision ${decision.id} is missing valid animalId/weightKg/observedDate edits`,
    );
  }
  const record = await addWeightObservation(decision.farmId, edits.animalId, edits.weightKg, edits.observedDate, source);

  // Everything below this point is the decisions/jobs audit-trail write —
  // see this function's own doc comment, and
  // persistRecordWeightObservationAuditTrail's own, for the full
  // ordering/failure-mode/retry-safety reasoning. `record` above is
  // already real; a failure from here on is reported via
  // `auditTrailError`, never thrown, and never silent. `record.id` is
  // passed through so that function can verify a real observation exists
  // before persisting a job claiming one does (see its own doc comment).
  const { auditTrailError } = await persistRecordWeightObservationAuditTrail(decision, record.id);

  return {
    jobType: "record_weight_observation",
    decisionId: decision.id,
    record,
    ...(auditTrailError ? { auditTrailError } : {}),
  };
}

/**
 * Persists the `decisions`/`jobs` audit trail for a `record_weight_observation`
 * Decision that has already produced a real domain mutation — extracted
 * as its own export (Codex audit HIGH, `docs/farm-return-next/audit-logs/
 * 20260829T191227Z.md`) specifically so a future caller can retry *only*
 * this step after a partial failure, without ever repeating
 * `addWeightObservation` — see `actRecordWeightObservation`'s own doc
 * comment for the full ordering/failure-mode reasoning this function's
 * behaviour follows.
 *
 * Retry-safe by construction, not just by documentation: `insertDecision`
 * (`src/lib/farm-data/decisions.ts`) itself tolerates a primary-key
 * conflict on `decision.id` (a `decisions` row is immutable once written,
 * so a conflict there can only mean an earlier attempt's insert actually
 * committed server-side even though its caller never saw success) by
 * fetching and returning the existing row instead of failing. So calling
 * this function again with the exact same already-accepted `Decision`
 * after a prior partial failure (e.g. the decision insert committed but
 * the job insert didn't) is genuinely safe: the second attempt's decision
 * insert is a no-op-equivalent, and only the still-missing job gets
 * created. **Never call this with a different `Decision` object for the
 * same real-world action** — that would persist a second, separate
 * decision.
 *
 * No caller retries this yet this checkpoint (the Records/Activity UI
 * that would trigger a retry is explicitly out of scope) — this function
 * exists so that caller has something safe to call once it's built,
 * closing the "no durable completion path" gap Codex flagged rather than
 * only documenting it as a known limitation.
 *
 * Validates `decision` itself via the same
 * `assertWeightObservationDecisionIsActable` guard
 * `actRecordWeightObservation` uses — takes only `decision`, not a
 * separate `outcome`/`decidedBy` (Codex audit HIGH,
 * `docs/farm-return-next/audit-logs/20260829T191955Z.md`: the first
 * version took those as separate parameters a caller could pass
 * mismatched against `decision`, persisting a false "accepted" audit
 * record for what was actually a dismissed Decision). This function is a
 * second real entry point into this Decision, independently callable —
 * it must not assume a caller already validated `decision` any more than
 * `actRecordWeightObservation` does.
 *
 * `observationId` is required, not optional, and is verified — both that
 * it exists for this farm, **and** that its `animalId`/`weightKg`/
 * `observedDate` actually match `decision.edits` (Codex audit HIGH,
 * `docs/farm-return-next/audit-logs/20260829T194336Z.md` and
 * `20260829T200643Z.md`: the first version validated only `decision`,
 * never that the real-world action it claims to record actually
 * happened; the *second* version verified existence but not content — a
 * caller (this is an independently-callable retry entry point, not
 * something only reachable right after a real `addWeightObservation`
 * call) could pass *any* existing same-farm `observationId`, persisting
 * a `confirmed` job whose recorded provenance doesn't actually describe
 * that observation, breaking `SCIENTIFIC_RULES.md`'s inspectable-trace
 * requirement). This is a real, targeted (`farmId`+`id`, not a farm-wide
 * list) database round-trip on every call, including the normal path
 * from `actRecordWeightObservation` — a deliberate cost for a genuine
 * fail-closed guarantee, not a redundant check.
 * `getWeightObservationById` (`src/lib/farm-data/individual-animals.ts`)
 * is used specifically rather than the existing
 * `listWeightObservationsForFarm` (Codex audit HIGH,
 * `docs/farm-return-next/audit-logs/20260829T201312Z.md`: the first
 * version of this check called `listWeightObservationsForFarm` and
 * searched the result locally — correct with a handful of rows, but
 * PostgREST caps an unbounded `select` at a default row limit, so a farm
 * with enough observation history could have a just-inserted row fall
 * outside that page, silently failing this check for every subsequent
 * action on that farm).
 *
 * The verification step (and everything after it) is inside the same
 * failure-mode contract as the `decisions`/`jobs` inserts below —
 * reported via `auditTrailError`, never thrown (Codex audit HIGH,
 * `docs/farm-return-next/audit-logs/20260829T195829Z.md`: the first
 * version ran the verification query *outside* any try/catch, so a
 * transient failure there — not "the observation doesn't exist," just
 * the query itself failing — would throw out of this function and, via
 * `actRecordWeightObservation`, out past an already-successful
 * `addWeightObservation`, reintroducing exactly the "caller retries and
 * duplicates the mutation" risk this whole design exists to prevent).
 */
export async function persistRecordWeightObservationAuditTrail(
  decision: Decision,
  observationId: string,
): Promise<{ auditTrailError?: string }> {
  assertWeightObservationDecisionIsActable(decision);
  const outcome = decision.outcome;
  const decidedBy = decision.decidedBy;
  // Re-parsed here, independently of actRecordWeightObservation's own
  // parse — this function is a second real entry point and must not
  // trust a caller already validated decision.edits, same reasoning as
  // assertWeightObservationDecisionIsActable above.
  const edits = parseRecordWeightObservationEdits(decision.edits);
  if (!edits) {
    throw new Error(
      `persistRecordWeightObservationAuditTrail: decision ${decision.id} is missing valid animalId/weightKg/observedDate edits`,
    );
  }

  let auditTrailError: string | undefined;
  try {
    const matchingObservation = await getWeightObservationById(decision.farmId, observationId);
    if (!matchingObservation) {
      throw new Error(`no weight observation ${observationId} found for farm ${decision.farmId}`);
    }
    if (
      matchingObservation.animalId !== edits.animalId ||
      matchingObservation.weightKg !== edits.weightKg ||
      matchingObservation.observedDate !== edits.observedDate
    ) {
      throw new Error(
        `weight observation ${observationId} does not match decision ${decision.id}'s edits (animalId/weightKg/observedDate) — refusing to persist an audit trail whose provenance doesn't describe the real observation`,
      );
    }
  } catch (verificationError) {
    console.error(
      `[act] verifying weight observation ${observationId} exists for decision ${decision.id} failed:`,
      verificationError,
    );
    auditTrailError = `Weight observation recorded, but its existence could not be verified before persisting the audit trail: ${verificationError instanceof Error ? verificationError.message : String(verificationError)}`;
  }
  if (auditTrailError) {
    return { auditTrailError };
  }

  try {
    await insertDecision({
      id: decision.id,
      farmId: decision.farmId,
      promptId: decision.promptId,
      calculationKind: decision.calculationKind,
      estimateSnapshot: decision.estimateSnapshot,
      outcome,
      edits: decision.edits,
      decidedBy,
      decidedAt: decision.decidedAt,
      fieldId: decision.fieldId,
      calculationVersion: decision.calculationVersion,
      inputsSnapshot: decision.inputsSnapshot,
    });
    try {
      // `status: "confirmed"` — chosen, not defaulted, against the
      // migration's real five-value CHECK
      // (proposed/scheduled/in_progress/confirmed/dismissed): this
      // function is only ever called once the domain mutation it
      // authorises has already succeeded, unlike a real GPS-job-mode flow
      // where a job is proposed/scheduled ahead of the work and only
      // confirmed once the farmer marks it done later (`MASTER_SPEC.md`'s
      // Confirm stage). "proposed"/"scheduled"/"in_progress" would all
      // misrepresent work that is already complete as still pending;
      // "dismissed" would misrepresent a real, successful action as not
      // having happened. "confirmed" is the only one of the five that
      // doesn't lie about this job's real state.
      await insertJob({
        farmId: decision.farmId,
        decisionId: decision.id,
        jobType: "record_weight_observation",
        status: "confirmed",
        // The real WeightObservation row this job's "confirmed" status
        // claims happened — already verified above (existence AND content
        // match against decision.edits) before this insert is ever
        // attempted, closing the "job persists with no pointer to the
        // Actual that justified it" gap (overnight-run Codex audit,
        // docs/farm-return-next/audit-logs/20260831T204350Z.md, HIGH; see
        // 20260829020000_jobs_weight_observation_reference.sql's own
        // header comment for the full reasoning).
        weightObservationId: observationId,
      });
    } catch (jobError) {
      console.error(`[act] persisting the job audit-trail row for decision ${decision.id} failed:`, jobError);
      auditTrailError = `Weight observation recorded, but the job audit-trail row failed to save: ${jobError instanceof Error ? jobError.message : String(jobError)}`;
    }
  } catch (decisionError) {
    console.error(`[act] persisting the decision audit-trail row for decision ${decision.id} failed:`, decisionError);
    auditTrailError = `Weight observation recorded, but the decision audit-trail row failed to save: ${decisionError instanceof Error ? decisionError.message : String(decisionError)}`;
  }

  return auditTrailError ? { auditTrailError } : {};
}
