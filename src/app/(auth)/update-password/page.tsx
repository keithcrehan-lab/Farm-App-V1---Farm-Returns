"use client";

import { useActionState } from "react";
import { TriangleAlert } from "lucide-react";
import { updatePassword } from "@/app/actions/auth";
import { EMPTY_STATE, type AuthActionState } from "@/app/actions/auth-state";
import { AlertBanner } from "@/components/ui/AlertBanner";

/**
 * Reached only via the reset-password email link, after `/auth/callback`
 * has exchanged the reset code for a real (short-lived) session — Supabase
 * requires an authenticated session to call `auth.updateUser`, it isn't a
 * bare "type a new password" form.
 */
export default function UpdatePasswordPage() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(updatePassword, EMPTY_STATE);

  return (
    <>
      <h1 className="text-lg font-semibold text-fr-ink-900">Choose a new password</h1>

      {state.error ? (
        <AlertBanner tone="risk" icon={TriangleAlert} title="Couldn't update your password" description={state.error} className="mt-4" />
      ) : null}

      <form action={formAction} className="mt-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
          New password
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-fr-control border border-fr-border bg-fr-surface px-3 py-2 text-sm text-fr-ink-900"
          />
          <span className="text-fr-ink-600/70">At least 8 characters.</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-fr-control bg-fr-green-700 py-3 text-sm font-semibold text-white transition-colors disabled:bg-fr-green-700/40"
        >
          {pending ? "Saving…" : "Save new password"}
        </button>
      </form>
    </>
  );
}
