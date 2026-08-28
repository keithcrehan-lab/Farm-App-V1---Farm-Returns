import "server-only";

/**
 * Real Farm V1 Phase 2 — Supabase client for Server Components, Server
 * Actions and Route Handlers.
 *
 * `cookies()` is async in this Next.js version (see cookies.md — v15+).
 * Server Components can only *read* cookies (Next.js throws if `.set` is
 * called during rendering); Server Actions and Route Handlers can both
 * read and write, which is what lets Supabase refresh an expiring session
 * transparently. The try/catch mirrors Supabase's own documented Next.js
 * App Router pattern: a Server Component's `setAll` call is expected to
 * throw and is safe to ignore there because `src/proxy.ts` already
 * refreshes the session on every request before a Server Component runs.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseEnv } from "./env";

export async function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — proxy.ts already refreshed
          // the session cookie for this request, so this is a no-op.
        }
      },
    },
  });
}
