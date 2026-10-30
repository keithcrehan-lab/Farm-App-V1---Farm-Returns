/**
 * Human, specific auth error wording. Supabase's own messages and codes are never shown to the farmer; unknown errors
 * get a plain fallback. Matching is on Supabase's documented error codes first, then its stable message text.
 */
export type AuthFlow = "SIGN_IN" | "SIGN_UP" | "RESET";

const MESSAGES = {
  INVALID_CREDENTIALS: "That email and password don't match an account. Check them and try again.",
  EMAIL_NOT_CONFIRMED: "Confirm your email first — open the link we sent you, then sign in.",
  ALREADY_REGISTERED: "There's already an account with this email. Sign in instead.",
  WEAK_PASSWORD: "Choose a stronger password — at least 8 characters, not a common one.",
  INVALID_EMAIL: "That email address doesn't look right. Check it and try again.",
  RATE_LIMITED: "Too many attempts just now. Wait a minute, then try again.",
  SIGNUPS_DISABLED: "New accounts can't be created right now. Please try again later.",
} as const;

const FALLBACK: Record<AuthFlow, string> = {
  SIGN_IN: "We couldn't sign you in just now. Please try again.",
  SIGN_UP: "We couldn't create your account just now. Please try again.",
  RESET: "We couldn't send that just now. Please try again.",
};

export function humanAuthError(error: unknown, flow: AuthFlow): string {
  const code = String((error as { code?: unknown } | null)?.code ?? "").toLowerCase();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  const status = Number((error as { status?: unknown } | null)?.status);
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return MESSAGES.INVALID_CREDENTIALS;
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return MESSAGES.EMAIL_NOT_CONFIRMED;
  if (code === "user_already_exists" || code === "email_exists" || message.includes("already registered")) return MESSAGES.ALREADY_REGISTERED;
  if (code === "weak_password" || message.includes("password should")) return MESSAGES.WEAK_PASSWORD;
  if (code === "email_address_invalid" || code === "validation_failed" || message.includes("invalid email") || message.includes("is invalid")) return MESSAGES.INVALID_EMAIL;
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || status === 429 || message.includes("rate limit")) return MESSAGES.RATE_LIMITED;
  if (code === "signup_disabled" || message.includes("signups not allowed")) return MESSAGES.SIGNUPS_DISABLED;
  return FALLBACK[flow];
}
