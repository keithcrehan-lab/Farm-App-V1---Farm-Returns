"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { signIn, EMPTY_STATE, type AuthActionState } from "@/app/actions/auth";
import { AlertBanner } from "@/components/ui/AlertBanner";

export function SignInForm() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(signIn, EMPTY_STATE);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  return (
    <>
      <h1 className="text-lg font-semibold text-fr-ink-900">Sign in</h1>
      <p className="mt-1 text-sm text-fr-ink-600">Sign in to your farm.</p>

      {state.error ? (
        <AlertBanner tone="risk" icon={Mail} title="Couldn't sign you in" description={state.error} className="mt-4" />
      ) : null}

      <form action={formAction} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-fr-control border border-fr-border bg-fr-surface px-3 py-2 text-sm text-fr-ink-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded-fr-control border border-fr-border bg-fr-surface px-3 py-2 text-sm text-fr-ink-900"
          />
        </label>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs font-medium text-fr-green-700">
            Forgot password?
          </Link>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-fr-control bg-fr-green-700 py-3 text-sm font-semibold text-white transition-colors disabled:bg-fr-green-700/40"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-fr-ink-600">
        New to Farm Return?{" "}
        <Link href="/sign-up" className="font-semibold text-fr-green-700">
          Create an account
        </Link>
      </p>
    </>
  );
}
