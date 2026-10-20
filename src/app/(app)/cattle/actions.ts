"use server";

/**
 * Cattle C10 — demonstration server functions. Stateless: each call replays
 * the demonstration herd + the caller's demo session through the frozen
 * engines and returns view-models. Nothing is written anywhere.
 *
 * Trust boundary: every argument is untrusted (a server function is
 * reachable by direct POST). Each call refuses outside local demonstration
 * mode, validates the session with `parseCattleDemoSession`, and validates
 * tag / scenario / date before any engine runs; the frozen engines then
 * validate again at their own canonical boundaries.
 */

import { isPlanDate } from "@/domain/animal-plan";
import { parseCattleDemoSession } from "@/components/cattle/session/demo-session";
import { DEMO_TAGS, demoAnimalView, demoHerdView, demoProjection, isCattleDemoMode, type DemoAnimalView, type DemoProjection } from "@/server/cattle-demo/demo-service";
import type { CattleDemoScenario } from "@/server/cattle-demo/demo-replay";
import type { HerdVM } from "@/domain/cattle/presentation";

export type CattleActionResult<T> = { ok: true; value: T } | { ok: false; reason: "REAL_ACCOUNT_MODE" | "INVALID_REQUEST" | "UNKNOWN_ANIMAL" };

const SCENARIOS: readonly CattleDemoScenario[] = ["STANDARD", "PLANNING_RUN_FAILURE", "EMPTY_HERD"];

function guard(session: unknown, scenario: unknown): { ok: true; session: ReturnType<typeof parseCattleDemoSession> & { ok: true }; scenario: CattleDemoScenario } | { ok: false; reason: "REAL_ACCOUNT_MODE" | "INVALID_REQUEST" } {
  if (!isCattleDemoMode()) return { ok: false, reason: "REAL_ACCOUNT_MODE" };
  const parsed = parseCattleDemoSession(session);
  if (!parsed.ok || typeof scenario !== "string" || !(SCENARIOS as readonly string[]).includes(scenario)) return { ok: false, reason: "INVALID_REQUEST" };
  return { ok: true, session: parsed, scenario: scenario as CattleDemoScenario };
}

export async function loadCattleHerd(session: unknown, scenario: unknown): Promise<CattleActionResult<HerdVM>> {
  const g = guard(session, scenario);
  if (!g.ok) return g;
  return { ok: true, value: demoHerdView(g.session.session, g.scenario) };
}

export async function loadCattleAnimal(session: unknown, tag: unknown, scenario: unknown): Promise<CattleActionResult<DemoAnimalView>> {
  const g = guard(session, scenario);
  if (!g.ok) return g;
  if (typeof tag !== "string" || !DEMO_TAGS.includes(tag)) return { ok: false, reason: "UNKNOWN_ANIMAL" };
  const view = demoAnimalView(g.session.session, tag, g.scenario);
  return view === null ? { ok: false, reason: "UNKNOWN_ANIMAL" } : { ok: true, value: view };
}

export async function projectCattleWeight(session: unknown, tag: unknown, saleDate: unknown, scenario: unknown): Promise<CattleActionResult<DemoProjection>> {
  const g = guard(session, scenario);
  if (!g.ok) return g;
  if (typeof tag !== "string" || !DEMO_TAGS.includes(tag)) return { ok: false, reason: "UNKNOWN_ANIMAL" };
  if (!isPlanDate(saleDate)) return { ok: false, reason: "INVALID_REQUEST" };
  return { ok: true, value: demoProjection(g.session.session, tag, saleDate, g.scenario) };
}
