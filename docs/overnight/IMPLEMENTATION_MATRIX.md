# Farm Return Next v1.1 — implementation matrix

Maps `docs/product/farm-return-next-v1.1/FARM_RETURN_NEXT_SPEC_v1_1.md`
against the repository as of this overnight session. Statuses:
`SHIPPED`, `PARTIAL`, `NOT_STARTED`, `BLOCKED_HUMAN`, `BLOCKED_EXTERNAL`.

Baseline before this session (`BUILD_STATE.json`, `checkpoint2-vertical-h`):
Verticals A (telemetry backend) and G (notifications backend) shipped and
audited clean but with no UI; Vertical B shipped four real Prompt
producers with no screen surfacing them; Vertical D shipped a real
Records reader (`JobHistoryCard`/`reports` page); Vertical H shipped real
Sentinel-2 scene discovery with no NDVI computation (no CDSE credentials)
and no UI; Verticals C, E, F blocked (E on an approved visual reference —
now resolved by the v1.1 spec freeze itself).

**Update (2026-09-02, resumed session):** the session that produced most
of this matrix was cut off by a hard usage-session limit partway through
a round-3 Codex-audit remediation (see `OVERNIGHT_BUILD_LOG.md`'s
"Session interruption and resume" section). A resuming session verified,
completed, and committed that remediation, then ran two further real
Codex audit rounds (4 and 5, both `GATE: PASS`) against it, fixing every
Critical/High/Medium finding either round raised. No new phase or
vertical was started in the resumed session — this update only closes
out Phase 1's own audit trail. See `OVERNIGHT_BUILD_LOG.md`'s "Codex
audit round 3/4/5" sections and `BLOCKERS.md`'s "Phase 1 Codex
round-4/5 items" entry for the small number of LOW-severity items
deliberately left open.

**Update (2026-09-02, GPS Job Session + Confirm Actual contract):** a
further session built Phase 4/canonical screens #3-4 for real — the
domain layer, database schema (3 migrations, `PENDING_DEV_VALIDATION`),
persistence/orchestration/offline-outbox wiring, and the Start Job /
Active GPS Job Mode / Finish Job / Confirm Actual / Records UI — through
5 real Codex audit rounds (`GATE: PASS`, 0 Critical/High, at round 5).
See `OVERNIGHT_BUILD_LOG.md`'s "Phase 2 — GPS Job Session + Confirm
Actual contract" section and `BLOCKERS.md`'s "GPS Job Session + Confirm
Actual contract" entry for full detail. This closes the code/schema side
of Phase 4's own blocker but not the "live and verified" side: no Dev DB
write credentials exist in any session so far, so all three new
migrations remain unapplied and unverified against a real database —
Phase 4 moves from `BLOCKED_HUMAN + BLOCKED_EXTERNAL (schema)` to
`BLOCKED_EXTERNAL (DB only)` below, not to `SHIPPED`.

**Update (2026-09-02, Job Session / Confirm Actual real Dev database
validation):** a further session gained real Supabase CLI access to
`Farm Return V1 Dev` (the user authenticated the CLI directly in their
own terminal) and applied the three pending migrations plus every
further corrective migration this phase's own live validation and audit
work required, then ran a real, repeatable validation script directly
against a live database (RLS/farm isolation, job lifecycle, Actual
integrity, offline retry/idempotency, append-only revisions,
grant-exactness) and reproduced/closed the disclosed cancellation-race
MEDIUM via a real two-connection concurrency test and a new atomic
`confirm_job_session_actual` RPC — 10 further Codex audit rounds,
`GATE: PASS` (0/0/0/0) at round 10. See `OVERNIGHT_BUILD_LOG.md`'s
"Phase 3 — Job Session / Confirm Actual real Dev database validation"
section and `docs/validation/job-session-actual-dev-validation.md` for
full detail. **This closes the "live and verified" side of Phase 4's
blocker too** — Phase 4 moves from `BLOCKED_EXTERNAL (DB only)` to
`SHIPPED, VALIDATED_DEV` below. One residual, genuinely
`BLOCKED_EXTERNAL` item remains (`supabase_admin`'s own separate
default-ACL entry — a real Supabase-platform role-hierarchy boundary,
not a mistake in the SQL) and is disclosed in `BLOCKERS.md`; it does not
block Phase 4's own completion.

## §19 Implementation sequence phases

| Phase | Deliverable | Status | Note |
|---|---|---|---|
| 0 | Dev database validation / migrations | `SHIPPED, VALIDATED_DEV` | Real Supabase CLI access to `Farm Return V1 Dev` (2026-09-02, the user authenticated the CLI directly in their own terminal) was used to apply/live-validate every real migration in this schema: `job_sessions`/`job_actuals`/`telemetry_events` (Phase 4 below, `docs/validation/job-session-actual-dev-validation.md`) **and**, as of Phase A (2026-09-02/03), `decisions`/`jobs`/`weight_observation_reference` too — `supabase/validation/decisions_jobs_rls_validation.sql` run for real, 29/29 checks PASS, 4 Codex audit rounds, `GATE: PASS` (0/0/0/0) at round 4. All three decisions/jobs migrations promoted `APPLIED_DEV` -> `VALIDATED_DEV`. See `docs/validation/decisions-jobs-dev-validation.md` for full detail. One genuine residual `BLOCKED_EXTERNAL` item, not blocking this row's own completion: `supabase_admin`'s own separate default-ACL entry (a real Supabase-platform role-hierarchy boundary; SQL preserved in `BLOCKERS.md`). |
| 1 | Canonical visual tokens/patterns | `SHIPPED`, 5 real Codex audit rounds clean (rounds 4-5 both `GATE: PASS`, 0 Critical/High) | `globals.css` `--font-display` token; `src/lib/status.ts` `ActivityState`; `src/components/ui/Sheet.tsx`; `src/components/next/{PromptCard,ExpandedPromptSheet,GateConstraintCard,AskAI,DecisionHistoryCard}.tsx`; nav cutover (`nav-items.ts`, `MobileBottomNav.tsx`, `DesktopSidebar.tsx`, `MoreSheet.tsx`). See `docs/overnight/OVERNIGHT_BUILD_LOG.md`'s "Session interruption and resume" section for the round-3 transcript-loss/recovery account. |
| 2 | Today / Living farm world | `PARTIAL` (this session) | Real hero map (`FarmMapCard`, reused) + real "What matters now" Prompt + "Also worth a look" list, all from the four real, already-shipped Prompt producers. Missing (documented, not faked): Ready/Active/To-confirm status strip, location-aware "near Back Meadow" card, ambient live weather — see `today/page.tsx`'s own header comment for exactly why each is absent rather than approximated. |
| 3 | Farm / Field exploration | `PARTIAL` | "Farm" nav item points at the existing real `/fields` map/list screen as an honest interim (`nav-items.ts`'s own comment). No Now/Soil/Activity/Constraints tab surface, no satellite intelligence panel on a field yet — genuinely `NOT_STARTED` beyond this interim routing. |
| 4 | One complete physical-job loop | `SHIPPED, VALIDATED_DEV` | **Code/schema complete and live-validated**: real `job_sessions`/`job_actuals` schema, domain state machine, `LocationTrackingProvider` (web adapter), offline-outbox wiring, atomic `confirm_job_session_actual` RPC, and Start Job → Active GPS Job Mode → Finish Job → Confirm Actual → Records UI, per `docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`. All three migrations plus every further corrective migration are applied to `Farm Return V1 Dev` and live-validated for real (RLS/lifecycle/ownership/idempotency/append-only/grant-exactness, plus a real two-connection reproduction closing the previously-disclosed cancellation-race MEDIUM). 15 Codex audit rounds total across the two build phases (5 + 10), `GATE: PASS` at both closures (0 Critical/High at round 5; 0/0/0/0 at round 10). See `BLOCKERS.md`'s "GPS Job Session + Confirm Actual contract" and "Job Session / Confirm Actual real Dev database validation" entries, and `docs/validation/job-session-actual-dev-validation.md`, for full detail — including the standing, systemic, accepted numeric-truthfulness gap every table in this schema already carries, and the one genuinely `BLOCKED_EXTERNAL` residual (`supabase_admin`'s own separate default-ACL entry). **Phase B (native/background GPS readiness, 2026-09-03)** strengthened this loop's own offline-resilience further — a real `NetworkStateProvider` capability boundary, sign-out outbox cleanup that never destroys unsynced data, stale-item reclaim on session mount, a local-storage-failure banner — 6 Codex audit rounds, `GATE: PASS` (0/0/0/0) at round 6. `backgroundTrackingSupported` remains honestly `false` on the current web adapter; the native container/framework choice itself is `BLOCKED_HUMAN` — see `docs/farm-return-next/NATIVE_GPS_ARCHITECTURE_DECISION.md`. |
| 5 | Plan | `PARTIAL` (this session) | Real "genuine opportunities" list (every real Prompt) + an honest, explicit "no jobs scheduled yet" state — no Day/Week/Month tabs (would have nothing real to differentiate per day; see `plan/page.tsx`'s own header comment on why that was deliberately not built rather than stubbed). |
| 6 | Records | `PARTIAL` (extended this session) | `JobHistoryCard` (Vertical D, pre-existing, unchanged) + new `DecisionHistoryCard`/`listDecisionsForFarm` for decisions with no job attached, on a new `/records` route. `/reports` untouched, still has its own copy plus CSV/audit-trail tools. |
| 7 | Contextual Ask AI | `PARTIAL` (this session) | `AskAIButton`/overlay shipped, wired on Today/Plan/Records/Expanded Prompt with real, inspectable context (never invented). No AI/LLM provider is configured in this repo (no API key, no server route) — the overlay states this plainly and fails closed rather than fabricating a response; wiring a real provider in later only needs to fill in one call, not rebuild the component. |
| 8 | Livestock + Breeding & Births | `NOT_STARTED` | Pre-existing V1 Livestock module (`/livestock`) is real and unchanged; no Next-specific species-aware Breeding & Births engine exists. Deferred — this session prioritised the first Prompt→Decide→Record loop per the build-priority order. |
| 9 | Satellite / vegetation UI | `NOT_STARTED` (backend `PARTIAL`, pre-existing) | Sentinel-2 scene discovery (`src/domain/satellite-field-coverage.ts`, `src/server/satellite/cdse-stac-client.ts`) shipped and audited clean in a prior session; still no UI, still no real NDVI computation (no CDSE credentials, unchanged this session — checked, not re-attempted, since account creation is prohibited). |
| 10 | Soil / Constraint / Input Planning expansion | `PARTIAL` | `GateConstraintCard` (the reusable pattern component for canonical screen #12) shipped this session, with tests, but not wired to a live screen — no approved Field-exploration surface exists yet to host a real `p-build-up-eligibility` check against a real field (needs Phase 3 first). |
| 10 (Evidence) | Scientific Validation + Evidence Ledger | `NOT_STARTED` (foundations exist) | `src/domain/evidence.ts`'s `EngineOutcome`/`EvidenceState` vocabulary (pre-existing) already carries most of §13's required fields per calculation; no dedicated Calculation & Evidence Ledger table/report generator exists yet. Not attempted this session — correctly sequenced after the first real journey, per the build-priority order. |
| 11 | Financial Intelligence | `NOT_STARTED` (V1 Finance page pre-existing, unchanged) | No Estimate-vs-Actual financial model beyond V1's existing `/finance` page (mostly mock-labelled). |
| 12 | Feed & Finish | `NOT_STARTED` | V1's `/feed-optimiser` is pre-existing and unrelated to the v1.1 Feed & Finish engine described in §15. |
| 13 | Trusted Data Update Layer | `NOT_STARTED` | No Source Registry table/UI exists yet. |
| 14 | Quote & Procurement | `NOT_STARTED` | V1's `supplier-quotes` schema/table exists (pre-existing, different feature) but no Request-Quote-from-calculated-need workflow. |

## Canonical screen set (§4)

| # | Screen | Status |
|---|---|---|
| 1 | Today / Living farm world | `PARTIAL` — see Phase 2 above |
| 2 | Farm / Field exploration | `PARTIAL` — interim routing only |
| 3 | GPS Job Mode | `SHIPPED, VALIDATED_DEV` — real screen shipped (`src/app/(app)/job/[id]/page.tsx`, `ActiveJobSessionView.tsx`), code/schema complete and live-validated — see Phase 4 above. Background-tracking-while-backgrounded remains the disclosed, honest web-platform limitation (native container choice `BLOCKED_HUMAN`, see Phase B) |
| 4 | Confirm Actual | `SHIPPED, VALIDATED_DEV` — real screen shipped (`ConfirmActualSheet.tsx`), code/schema complete and live-validated — see Phase 4 above |
| 5 | Plan | `PARTIAL` — see Phase 5 above |
| 6 | Records | `PARTIAL` — see Phase 6 above |
| 7 | Livestock world | `NOT_STARTED` (V1 Livestock module reachable via More, unchanged) |
| 8 | Breeding & Births | `NOT_STARTED` |
| 9 | Soil / scientific detail | `NOT_STARTED` (V1 `/soil` reachable via More, unchanged; no Next-pattern rebuild) |
| 10 | Satellite / vegetation intelligence | `NOT_STARTED` (backend only, see Phase 9 above) |
| 11 | Expanded Prompt / Why this matters | `SHIPPED` (this session) — `ExpandedPromptSheet.tsx` |
| 12 | Gate / Constraint | `PARTIAL` (this session) — `GateConstraintCard.tsx` shipped, not wired to a live screen |
| 13 | Input Planning | `NOT_STARTED` (V1 `/input-planner` reachable via More, unchanged) |
| 14 | Ask AI contextual overlay | `PARTIAL` — see Phase 7 above |
| 15 | Feed & Finish | `NOT_STARTED` |
| 16 | Financial Intelligence | `NOT_STARTED` |
| 17 | Calculation & Evidence | `NOT_STARTED` |
| 18 | Quote & Procurement | `NOT_STARTED` |

## First milestone acceptance test (§20) — honest status

1. Open Today and see real farm state plus at least one genuine Prompt. **MET.**
2. Open the Prompt and understand why it exists from real supporting evidence. **MET** (`ExpandedPromptSheet`).
3. Accept/plan the action and create a real job/activity. **MET** — Accept creates a real `decisions` row (when Supabase is configured and the session is real); a `spreading_window` Prompt can now also Start a real Job Session (`startJobSessionFromPromptAction`), code/schema complete and live-validated against `Farm Return V1 Dev` (see Phase 4 above).
4. Enter GPS Job Mode with the correct farm/field/job context. **MET** — a real screen exists (`src/app/(app)/job/[id]/page.tsx`) reading the session's own real farm/field/activityType; the underlying `job_sessions` schema and its farm-isolation/lifecycle rules are live-validated (see Phase 4 above).
5. Finish the job and enter Completed—estimated. **MET** — `finishJobSessionAction` implements exactly this transition (never creating an Actual), code-complete, audited, and live-validated.
6. Review and confirm/edit Actual values. **MET** — `ConfirmActualSheet` + `confirmJobSessionActualAction` implement the five activity-specific payloads with real field-area reconciliation, routed through the atomic `confirm_job_session_actual` RPC, code-complete, audited (15 Codex rounds across two phases, `GATE: PASS` at both closures), and live-validated.
7. Find the Completed—actual record in Records. **MET** — a dismissed/accepted *decision* is findable via `DecisionHistoryCard`; a confirmed Job Session Actual is also now rendered (`JobSessionRecordCard`, merged into the same timeline), code-complete and live-validated.
8. Use Ask AI from at least Today, Field, Prompt, active job or Record and verify it receives only the relevant explicit context. **MET** for Today, Expanded Prompt, Plan, Records — verified by test (`AskAI.test.tsx`) that only real, caller-supplied facts render, with an honest fail-closed "not connected yet" state.
9. Demonstrate failure behaviour when data/context is absent rather than hallucinating a result. **MET** — every Prompt producer's own `BLOCKED_INSUFFICIENT_EVIDENCE`/`AMBIGUOUS`/`NOT_APPLICABLE` arms are shown honestly (pre-existing domain behaviour, now actually reachable through a real screen for the first time); Ask AI's own empty-context state.
10. For every material derived number in the completed journey, demonstrate a provenance/evidence path or mark it unsupported. **MET** for what's shown — `ExpandedPromptSheet` renders `inputsSnapshot`/`calculationVersion`/`regulatory` verbatim; nothing in this session's new UI invents a number.

**Conclusion (updated 2026-09-02, Job Session / Confirm Actual real Dev
database validation): the milestone's full physical-job loop is now
genuinely complete and live-verified** — steps 3–7 (Start Job → GPS Job
Mode → Confirm Actual → Records) have real, audited code and schema
(`GPS_JOB_SESSION_ACTUAL_CONTRACT.md`, 15 Codex rounds across two build
phases, `GATE: PASS` at both closures) *and* are now applied to and
live-validated against `Farm Return V1 Dev` — real RLS/farm isolation,
job lifecycle integrity, Actual integrity, offline retry/idempotency,
append-only revisions, grant-exactness, and a real two-connection
reproduction closing the previously-disclosed cancellation-race MEDIUM.
Full account: `docs/validation/job-session-actual-dev-validation.md`.
What remains genuinely `NOT_STARTED`/`PARTIAL` is unrelated to this
milestone's own ten acceptance steps — the standing, systemic, accepted
numeric-truthfulness gap every table in this schema already carries
(disclosed, not unique to Job Session), and `decisions`/`jobs`' own
three migrations, which remain `APPLIED_DEV` (not yet `VALIDATED_DEV`),
are the smallest next increment now that real Dev access exists.
