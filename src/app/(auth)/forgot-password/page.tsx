"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail, TriangleAlert } from "lucide-react";
import { requestPasswordReset, EMPTY_STATE, type AuthActionState } from "@/app/actions/auth";
import { AlertBanner } from "@/components/ui/AlertBanner";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(requestPasswordReset, EMPTY_STATE);

  return (
    <>
      <h1 className="text-lg font-semibold text-fr-ink-900">Reset your password</h1>
      <p className="mt-1 text-sm text-fr-ink-600">We&apos;ll email you a reset link.</p>

      {state.error ? (
        <AlertBanner tone="risk" icon={TriangleAlert} title="Couldn't send that" description={state.error} className="mt-4" />
      ) : null}
      {state.info ? (
        <AlertBanner tone="info" icon={Mail} title="Check your email" description={state.info} className="mt-4" />
      ) : null}

      <form action={formAction} className="mt-5 flex flex-col gap-4">
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
        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-fr-control bg-fr-green-700 py-3 text-sm font-semibold text-white transition-colors disabled:bg-fr-green-700/40"
        >
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-fr-ink-600">
        <Link href="/sign-in" className="font-semibold text-fr-green-700">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
