"use server";

/**
 * Real Farm V1 Phase 2 — auth Server Actions.
 *
 * Every action re-verifies inputs and reports failure via a returned state
 * object (for `useActionState` forms) rather than throwing, per Next.js's
 * own guidance that thrown errors in a Server Action surface as a generic
 * error boundary, not a form-level message. Per the Data Security guide,
 * a Server Action is reachable by direct POST regardless of which page
 * rendered its form, so each one is self-contained rather than trusting a
 * caller-side check.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AuthActionState } from "./auth-state";

function readCredentials(formData: FormData): { email: string; password: string } | null {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return null;
  }
  return { email, password };
}

export async function signIn(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const credentials = readCredentials(formData);
  if (!credentials) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials);
  if (error) return { error: error.message };

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/dashboard");
}

export async function signUp(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const credentials = readCredentials(formData);
  if (!credentials) return { error: "Enter your email and password." };
  if (credentials.password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
  const { error, data } = await supabase.auth.signUp({
    ...credentials,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };

  // Supabase's default project setting requires email confirmation before
  // a session exists — `data.session` is null in that case, and the
  // farmer needs to be told to check their inbox rather than land on a
  // dashboard that silently isn't signed in.
  if (!data.session) {
    return { error: null, info: "Check your email to confirm your account, then sign in." };
  }

  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/sign-in");
}

export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email) return { error: "Enter your email." };

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/update-password`,
  });
  if (error) return { error: error.message };

  return { error: null, info: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = formData.get("password");
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/dashboard");
}
