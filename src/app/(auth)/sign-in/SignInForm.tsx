"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/app/actions/auth";
import { EMPTY_STATE, type AuthActionState } from "@/app/actions/auth-state";
import { AuthField, AuthHeading, AuthMessage, AuthSubmit, authInputClass } from "@/components/auth/AuthFields";
import { HOME_ROUTE } from "@/lib/home-route";

/** Returning farmer: quiet and focused. Where they land is decided by their farm (Farm, or the setup they left). */
export function SignInForm() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(signIn, EMPTY_STATE);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? HOME_ROUTE;
  const linkFailed = searchParams.get("error") === "confirmation_failed";

  return (
    <>
      <AuthHeading title="Welcome back" lead={null} />

      <form action={formAction} className="mt-8 flex flex-col gap-5">
        {state.error ? <AuthMessage tone="error">{state.error}</AuthMessage> : null}
        {!state.error && linkFailed ? <AuthMessage tone="error">That email link didn&apos;t work or has expired. Sign in below, or create your account again.</AuthMessage> : null}
        <input type="hidden" name="next" value={next} />
        <AuthField label="Email">
          <input type="email" name="email" required autoComplete="email" inputMode="email" className={authInputClass} />
        </AuthField>
        <AuthField label="Password">
          <input type="password" name="password" required autoComplete="current-password" className={authInputClass} />
        </AuthField>
        <AuthSubmit pending={pending} label="Sign in" pendingLabel="Signing in…" />
      </form>

      <div className="mt-6 flex flex-col gap-3 text-sm text-fr-v2-charcoal">
        <Link href="/forgot-password" className="self-start font-semibold text-fr-v2-forest underline decoration-fr-v2-forest/30 underline-offset-[3px] hover:decoration-fr-v2-forest">
          Forgot password?
        </Link>
        <p>
          New to Farm Return?{" "}
          <Link href="/sign-up" className="font-semibold text-fr-v2-forest underline decoration-fr-v2-forest/30 underline-offset-[3px] hover:decoration-fr-v2-forest">
            Create an account
          </Link>
        </p>
      </div>
    </>
  );
}
