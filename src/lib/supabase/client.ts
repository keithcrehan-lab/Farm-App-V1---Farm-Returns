"use client";

/**
 * Real Farm V1 Phase 2 — Supabase client for Client Components.
 *
 * One browser client per call site (Supabase's own recommended pattern —
 * it's cheap and holds no state worth memoising across renders; the
 * underlying auth session lives in cookies, not in this object).
 */
import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "./env";

export function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
