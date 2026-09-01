import "server-only";

/**
 * Farm Return Next Checkpoint 2, Vertical D — real persistence for the
 * Decide stage. Requires `supabase/migrations/20260829010000_decisions_jobs_client_access.sql`
 * to be applied to the live project *in addition to*
 * `20260829000000_orchestration_foundation.sql` — the table exists as of
 * the earlier migration, but `authenticated` had no `select`/`insert`
 * grant on it (and no `field_id`/`calculation_version`/`inputs_snapshot`
 * columns) until this one. Every call here will fail with a real, honest
 * Postgres permission/schema error until both are applied, not a silently
 * wrong result — the same disclosed-until-applied posture
 * `individual-animals.ts`'s own header comment documents for its own
 * migration.
 *
 * `DecisionInput` is deliberately its own interface here, not
 * `@/orchestration/decide`'s `Decision` type — see `mappers.ts`'s
 * `DecisionRecord` doc comment for the full layering reasoning (farm-data
 * must not import from the orchestration layer above it). A real
 * `Decision` object satisfies `DecisionInput` structurally field-for-field
 * (checked by TypeScript at every call site, no import required) —
 * `fieldId`/`calculationVersion`/`inputsSnapshot` map to real columns
 * (Codex audit HIGH, `docs/farm-return-next/audit-logs/
 * 20260829T190434Z.md`: the first version of this file silently dropped
 * all three).
 *
 * **Architecture — plain authenticated client + RLS, not a privileged
 * client.** An earlier version of this checkpoint routed the actual insert
 * through a service-role Supabase client
 * (`src/lib/supabase/service-role.ts`, since removed) after the same
 * ownership pre-check this file still performs. A dedicated architectural
 * security review (see `docs/farm-return-next/BLOCKERS.md`'s
 * "Decisions/jobs persistence: service-role reverted to RLS" entry for the
 * complete account) reverted that: `insertDecision` now performs the
 * insert through the same regular, RLS-respecting, session-scoped client
 * used for the ownership check — the identical pattern every other
 * `src/lib/farm-data/*.ts` mutation in this app already uses
 * (`individual-animals.ts`'s `addWeightObservation`, etc.). The concern the
 * service-role escalation was built to close — a client holding a real
 * user's session JWT could call Supabase's REST API directly, bypassing
 * this app's own server code, to insert a shape-valid-but-fabricated
 * `decisions` row for their own farm — is real, but is not unique to
 * `decisions`/`jobs`: it is the identical, already-accepted, systemic
 * trust model of every other table in this schema (`farms`, `fields`,
 * `livestock_weight_observations`, etc.), none of which have ever used a
 * privileged credential. Closing it would require a whole-app
 * service-role-mediated write architecture, not a `decisions`/`jobs`-scoped
 * one — genuinely out of scope for this checkpoint, and not something a
 * single table's persistence module should introduce unilaterally.
 * Meanwhile a service-role client does not even fully close the concern it
 * was built for (it cannot verify a payload's *truthfulness*, only that a
 * caller reached the server at all — the same limit
 * `decisions_estimate_snapshot_ok_shape`'s own comment already names), and
 * it trades away RLS as an *independent* second enforcement layer in
 * exchange for this module's own manual ownership check being the *only*
 * one — a real defense-in-depth regression, and a direct conflict with
 * this app's own "never assume application code is the only writer"
 * principle applied to itself. Plain RLS + grants is what ships.
 */
import { createClient } from "@/lib/supabase/server";
import { rowToDecision, type DecisionOutcome, type DecisionRecord } from "./mappers";
import type { DecisionRow } from "./row-types";
import type { EngineOutcome } from "@/domain/evidence";
// Used only to compare an already-persisted `decisions` row's content
// against what a retried `insertDecision` call actually requested (see
// below). Extracted to `json-equal.ts` (Vertical A) once `telemetry.ts`
// needed the identical retry-safety comparison — see that file's own doc
// comment for why.
import { jsonValuesEqual } from "./json-equal";

export interface DecisionInput {
  id: string;
  farmId: string;
  promptId: string;
  calculationKind: string;
  estimateSnapshot: EngineOutcome<unknown>;
  outcome: DecisionOutcome;
  edits?: Record<string, unknown>;
  /** Only "farmer" is accepted — `decisions.decided_by`'s own CHECK
   * constraint rejects anything else (no reviewed auto-rule exists yet,
   * `SCIENTIFIC_RULES.md`). Typed as the literal here, not
   * `Decision["decidedBy"]`'s wider `"farmer" | "auto_rule"` union, so a
   * caller that hasn't already narrowed it (the way
   * `actRecordWeightObservation`'s own `decidedBy !== "farmer"` guard
   * does before ever reaching this call) gets a compile-time error
   * instead of a runtime database rejection. */
  decidedBy: "farmer";
  decidedAt: string;
  /** Same-farm-enforced by `decisions_check_field_same_farm`
   * (`20260829010000_decisions_jobs_client_access.sql`) — a `fieldId`
   * belonging to another farm is rejected at insert time, the same
   * protection `jobs.decision_id` already has. */
  fieldId?: string;
  calculationVersion?: string;
  inputsSnapshot?: Record<string, unknown>;
}

/**
 * Inserts a farmer Decision, via the regular RLS-respecting session client
 * (see this file's own header for why, not a privileged one). `decisions`
 * is select+insert only at the database level
 * (`20260829000000_orchestration_foundation.sql`'s
 * `decisions_owner_select`/`decisions_owner_insert` policies — no
 * update/delete policy or grant exists, and this migration doesn't add
 * one) — "a decision, once made, is a historical fact," that migration's
 * own header comment. There is deliberately no `updateDecision`/
 * `deleteDecision` export in this file, and never will be: any such
 * function would fail at the database on every real call once the
 * migration above is applied, so not writing it documents the same
 * invariant at the application layer instead of leaving a function
 * nobody should ever call sitting in this module's exports.
 */
export async function insertDecision(decision: DecisionInput): Promise<DecisionRecord> {
  const supabase = await createClient();

  // Farm-ownership pre-check — a signed-in user can only ever see their
  // own farms via `select`, so a caller supplying a `farmId` the current
  // session doesn't own gets a clear, honest rejection here, with a
  // specific error message. This is a genuine, real check on its own
  // terms, but it is deliberately not the *only* enforcement: the insert
  // below runs through the exact same RLS-respecting client, so
  // `decisions_owner_insert`'s `with check` independently rejects a
  // cross-farm insert at the database level even if this check were ever
  // buggy or bypassed — the two layers are independent by construction,
  // not merely by convention.
  const { data: ownedFarm, error: ownershipError } = await supabase
    .from("farms")
    .select("id")
    .eq("id", decision.farmId)
    .maybeSingle();
  if (ownershipError) throw ownershipError;
  if (!ownedFarm) {
    throw new Error(`insertDecision: farm ${decision.farmId} does not belong to the current session`);
  }

  const { data, error } = await supabase
    .from("decisions")
    .insert({
      id: decision.id,
      farm_id: decision.farmId,
      prompt_id: decision.promptId,
      calculation_kind: decision.calculationKind,
      estimate_snapshot: decision.estimateSnapshot,
      outcome: decision.outcome,
      edits: decision.edits ?? null,
      decided_by: decision.decidedBy,
      decided_at: decision.decidedAt,
      field_id: decision.fieldId ?? null,
      calculation_version: decision.calculationVersion ?? null,
      inputs_snapshot: decision.inputsSnapshot ?? null,
    })
    .select("*")
    .single();
  if (error) {
    // Retry-safety (Codex audit HIGH, docs/farm-return-next/audit-logs/
    // 20260829T191227Z.md: "ensure failed provenance can be durably
    // completed without repeating the [domain mutation]"). `decision.id`
    // is client-generated once, at construction time
    // (`decideAsFarmer`/`crypto.randomUUID()`), so a `23505`
    // (unique_violation) here can only mean an earlier attempt's insert
    // already committed server-side even though that attempt's caller
    // never saw a successful response (e.g. the write committed but the
    // network response was lost). Any other error still throws unchanged.
    //
    // Content-compared, not just id-compared (Codex audit HIGH,
    // docs/farm-return-next/audit-logs/20260829T191955Z.md): fetching
    // *any* row with a matching id and trusting it unconditionally would
    // silently return stale/wrong data if an id were ever reused for a
    // genuinely different decision (should never happen given
    // `decideAsFarmer`'s fresh-uuid-per-decision construction, but
    // `CLAUDE.md`'s "never assume application code is the only writer"
    // applies to this class of bug too) — a subsequent job would then be
    // created against provenance that never actually authorised the
    // current action. Every real column is compared field-for-field; a
    // mismatch fails closed instead. This is what makes
    // `act/index.ts`'s `persistRecordWeightObservationAuditTrail`
    // genuinely safe to call again with the same `Decision`, not just
    // documented as such.
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("decisions")
        .select("*")
        .eq("id", decision.id)
        .single();
      if (fetchError) throw fetchError;
      const existingRow = existing as DecisionRow;
      // `decidedAt`/`decided_at` are normalized to a canonical ISO
      // instant on both sides before comparing (Codex audit HIGH,
      // docs/farm-return-next/audit-logs/20260829T201312Z.md): Postgres/
      // PostgREST can return a `timestamptz` in a different (but
      // equivalent) textual form than what was sent (e.g.
      // `2026-08-29T09:00:00+00:00` for a `...Z` input) — a plain string
      // comparison would then treat the identical decision as
      // "conflicting content" and fail closed on a perfectly legitimate
      // retry, permanently blocking the job trace from ever completing.
      // `new Date(x).toISOString()` collapses any valid representation of
      // the same instant to the same string.
      const matches = jsonValuesEqual(
        {
          farmId: decision.farmId,
          promptId: decision.promptId,
          calculationKind: decision.calculationKind,
          estimateSnapshot: decision.estimateSnapshot,
          outcome: decision.outcome,
          edits: decision.edits ?? null,
          decidedBy: decision.decidedBy,
          decidedAt: new Date(decision.decidedAt).toISOString(),
          fieldId: decision.fieldId ?? null,
          calculationVersion: decision.calculationVersion ?? null,
          inputsSnapshot: decision.inputsSnapshot ?? null,
        },
        {
          farmId: existingRow.farm_id,
          promptId: existingRow.prompt_id,
          calculationKind: existingRow.calculation_kind,
          estimateSnapshot: existingRow.estimate_snapshot,
          outcome: existingRow.outcome,
          edits: existingRow.edits,
          decidedBy: existingRow.decided_by,
          decidedAt: new Date(existingRow.decided_at).toISOString(),
          fieldId: existingRow.field_id,
          calculationVersion: existingRow.calculation_version,
          inputsSnapshot: existingRow.inputs_snapshot,
        },
      );
      if (!matches) {
        throw new Error(
          `insertDecision: a decisions row with id ${decision.id} already exists with different content — refusing to silently return stale/mismatched data`,
        );
      }
      return rowToDecision(existingRow);
    }
    throw error;
  }

  return rowToDecision(data as DecisionRow);
}
