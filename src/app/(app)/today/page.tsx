/**
 * Today screen v0 — `docs/farm-return-next/BUILD_PLAN.md`'s Checkpoint 1
 * deliverable: "reuses Dashboard's existing content verbatim under the
 * new IA (UX_DESIGN.md), no Prompt logic yet." A literal re-export, not a
 * copy — there is exactly one implementation of this screen's content,
 * so the two routes can never drift apart.
 *
 * Deliberately not yet wired into navigation or any auth-redirect target
 * (`nav-items.ts`, `proxy.ts`, sign-in/sign-up/onboarding's `/dashboard`
 * redirects) — every one of those already has a real, live-verified E2E
 * assertion pinned to `/dashboard`
 * (`tests/e2e/real-mode-flow.spec.ts`'s `waitForURL("**\/dashboard")`).
 * Repointing them here now would risk that suite for a screen that, at
 * v0, renders byte-identical content to the route it would replace —
 * there is nothing to gain yet and a real regression to risk. The full
 * cutover (nav relabelled "Today", auth redirects retargeted, this
 * comment removed) belongs to whichever later checkpoint first gives
 * Today content that actually differs from Dashboard (real Prompts,
 * `docs/farm-return-next/BUILD_PLAN.md`'s Vertical B) — tracked in
 * `docs/farm-return-next/BLOCKERS.md`, not silently assumed done here.
 */
export { default } from "../dashboard/page";
