/**
 * GET /auth/callback?code=...&next=/dashboard
 *
 * Supabase's PKCE email-link flow: sign-up confirmation and
 * password-reset emails both link here with a one-time `code`, which this
 * route exchanges for a real session cookie before redirecting on to
 * `next` (defaults to the signed-in dashboard; the reset-password action
 * sets `next=/update-password`). Must be a Route Handler, not a Server
 * Component — only a Route Handler/Server Action can write the outgoing
 * session cookie.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=confirmation_failed`);
}
