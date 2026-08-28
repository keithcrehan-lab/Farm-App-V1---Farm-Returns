/**
 * Real Farm V1 Phase 2 — shared `useActionState` shape for the auth forms.
 *
 * Deliberately NOT inside `auth.ts`: a `"use server"` file may only export
 * async functions — Next.js's Server Actions compiler rejects any other
 * export (a plain object like `EMPTY_STATE` included) with a build/runtime
 * error ("A 'use server' file can only export async functions, found
 * object"). Splitting the shared state shape out into its own plain module
 * is the documented fix, not a workaround.
 */
export interface AuthActionState {
  error: string | null;
  info?: string | null;
}

export const EMPTY_STATE: AuthActionState = { error: null };
