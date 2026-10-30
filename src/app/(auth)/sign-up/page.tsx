"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "@/app/actions/auth";
import { EMPTY_STATE, type AuthActionState } from "@/app/actions/auth-state";
import { AuthField, AuthHeading, AuthMessage, AuthSubmit, authInputClass } from "@/components/auth/AuthFields";

/** Create account: email and password only — the farm itself is set up next, on the map. */
export default function SignUpPage() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(signUp, EMPTY_STATE);

  return (
    <>
      <AuthHeading title="Create your account" lead="Start by setting up your farm. It only takes a few minutes." />

      {state.info ? (
        <div className="mt-6">
          <AuthMessage tone="info">{state.info}</AuthMessage>
        </div>
      ) : (
        <form action={formAction} className="mt-8 flex flex-col gap-5">
          {state.error ? <AuthMessage tone="error">{state.error}</AuthMessage> : null}
          <AuthField label="Email">
            <input type="email" name="email" required autoComplete="email" inputMode="email" className={authInputClass} />
          </AuthField>
          <AuthField label="Password" hint="At least 8 characters.">
            <input type="password" name="password" required minLength={8} autoComplete="new-password" className={authInputClass} />
          </AuthField>
          <AuthSubmit pending={pending} label="Create account" pendingLabel="Creating your account…" />
        </form>
      )}

      <p className="mt-8 text-sm text-fr-v2-charcoal">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-fr-v2-forest underline decoration-fr-v2-forest/30 underline-offset-[3px] hover:decoration-fr-v2-forest">
          Sign in
        </Link>
      </p>
    </>
  );
}
