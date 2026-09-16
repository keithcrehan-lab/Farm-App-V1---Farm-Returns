import "server-only";

/**
 * Managed Quote Pilot, Checkpoint 1 — operator authority check.
 *
 * `quote_operators` is a new, narrow allow-list table (`docs/farm-return-
 * next/MANAGED_QUOTE_PILOT_ARCHITECTURE.md` section 4) — never derived
 * from `farms.user_id` or any farmer-editable field. No client can read
 * the table directly (its own migration grants nothing to
 * `authenticated`); the only way to check membership is the
 * `is_quote_operator_for_current_user` security-definer function this
 * module wraps.
 *
 * Grassland Fertiliser Pilot Completion, Checkpoint C — Codex audit
 * round 3 CRITICAL: the original `is_quote_operator(uuid)` took an
 * arbitrary caller-supplied user id rather than deriving the caller's
 * own real identity internally, and (alongside every other quote-pilot
 * function) had never had its default `PUBLIC` execute grant revoked —
 * together, any anonymous caller could query real operator-membership
 * status for any arbitrary real user id. Fixed at the root via a new,
 * zero-argument RPC (`20260915233000_quote_pilot_revoke_public_execute_and_harden_operator_check.sql`)
 * that derives `auth.uid()` internally and can only ever answer for the
 * real caller's own identity — this module now calls that instead.
 */
import { createClient } from "@/lib/supabase/server";

export async function isQuoteOperatorForCurrentUser(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("is_quote_operator_for_current_user");
  if (error) throw error;
  return data === true;
}
