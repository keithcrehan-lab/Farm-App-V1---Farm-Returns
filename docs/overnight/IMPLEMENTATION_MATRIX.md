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

## §19 Implementation sequence phases

| Phase | Deliverable | Status | Note |
|---|---|---|---|
| 0 | Dev database validation / migrations | `BLOCKED_EXTERNAL` | No Dev DB credentials in this session (only the public anon key — confirmed 401 via a real `curl`). RLS validation script exists (`supabase/validation/decisions_jobs_rls_validation.sql`) but cannot be run from here. Unchanged from the prior session's own finding. |
| 1 | Canonical visual tokens/patterns | `SHIPPED`, 5 real Codex audit rounds clean (rounds 4-5 both `GATE: PASS`, 0 Critical/High) | `globals.css` `--font-display` token; `src/lib/status.ts` `ActivityState`; `src/components/ui/Sheet.tsx`; `src/components/next/{PromptCard,ExpandedPromptSheet,GateConstraintCard,AskAI,DecisionHistoryCard}.tsx`; nav cutover (`nav-items.ts`, `MobileBottomNav.tsx`, `DesktopSidebar.tsx`, `MoreSheet.tsx`). See `docs/overnight/OVERNIGHT_BUILD_LOG.md`'s "Session interruption and resume" section for the round-3 transcript-loss/recovery account. |
| 2 | Today / Living farm world | `PARTIAL` (this session) | Real hero map (`FarmMapCard`, reused) + real "What matters now" Prompt + "Also worth a look" list, all from the four real, already-shipped Prompt producers. Missing (documented, not faked): Ready/Active/To-confirm status strip, location-aware "near Back Meadow" card, ambient live weather — see `today/page.tsx`'s own header comment for exactly why each is absent rather than approximated. |
| 3 | Farm / Field exploration | `PARTIAL` | "Farm" nav item points at the existing real `/fields` map/list screen as an honest interim (`nav-items.ts`'s own comment). No Now/Soil/Activity/Constraints tab surface, no satellite intelligence panel on a field yet — genuinely `NOT_STARTED` beyond this interim routing. |
| 4 | One complete physical-job loop | `BLOCKED_EXTERNAL` (DB only) | **Code/schema complete**, 5 Codex audit rounds clean (`GATE: PASS` at round 5, 0 Critical/High) — real `job_sessions`/`job_actuals` schema, domain state machine, `LocationTrackingProvider` (web adapter), offline-outbox wiring, and Start Job → Active GPS Job Mode → Finish Job → Confirm Actual → Records UI, per `docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`. **Not yet live**: the 3 new migrations are `PENDING_DEV_VALIDATION` — no Dev DB write credentials in any session so far to apply or verify them. See `BLOCKERS.md`'s "GPS Job Session + Confirm Actual contract" entry for the full account, including one disclosed residual MEDIUM (a narrow cancellation-race sub-case) and the standing, systemic, accepted numeric-truthfulness gap every table in this schema already carries. |
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
| 3 | GPS Job Mode | `PARTIAL` — real screen shipped (`src/app/(app)/job/[id]/page.tsx`, `ActiveJobSessionView.tsx`), code/schema complete, DB unverified — see Phase 4 above |
| 4 | Confirm Actual | `PARTIAL` — real screen shipped (`ConfirmActualSheet.tsx`), code/schema complete, DB unverified — see Phase 4 above |
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
3. Accept/plan the action and create a real job/activity. **PARTIAL** — Accept creates a real `decisions` row (when Supabase is configured and the session is real); a `spreading_window` Prompt can now also Start a real Job Session (`startJobSessionFromPromptAction`), code/schema complete but unverified against a live database (see Phase 4 above).
4. Enter GPS Job Mode with the correct farm/field/job context. **PARTIAL** — a real screen exists (`src/app/(app)/job/[id]/page.tsx`) reading the session's own real farm/field/activityType; not yet live-verified end-to-end (no Dev DB).
5. Finish the job and enter Completed—estimated. **PARTIAL** — `finishJobSessionAction` implements exactly this transition (never creating an Actual), code-complete and audited, not yet live-verified.
6. Review and confirm/edit Actual values. **PARTIAL** — `ConfirmActualSheet` + `confirmJobSessionActualAction` implement the five activity-specific payloads with real field-area reconciliation, code-complete and audited (5 Codex rounds, `GATE: PASS`), not yet live-verified.
7. Find the Completed—actual record in Records. **PARTIAL** — a dismissed/accepted *decision* is findable via `DecisionHistoryCard`; a confirmed Job Session Actual is also now rendered (`JobSessionRecordCard`, merged into the same timeline), code-complete, not yet live-verified.
8. Use Ask AI from at least Today, Field, Prompt, active job or Record and verify it receives only the relevant explicit context. **MET** for Today, Expanded Prompt, Plan, Records — verified by test (`AskAI.test.tsx`) that only real, caller-supplied facts render, with an honest fail-closed "not connected yet" state.
9. Demonstrate failure behaviour when data/context is absent rather than hallucinating a result. **MET** — every Prompt producer's own `BLOCKED_INSUFFICIENT_EVIDENCE`/`AMBIGUOUS`/`NOT_APPLICABLE` arms are shown honestly (pre-existing domain behaviour, now actually reachable through a real screen for the first time); Ask AI's own empty-context state.
10. For every material derived number in the completed journey, demonstrate a provenance/evidence path or mark it unsupported. **MET** for what's shown — `ExpandedPromptSheet` renders `inputsSnapshot`/`calculationVersion`/`regulatory` verbatim; nothing in this session's new UI invents a number.

**Conclusion: the milestone is genuinely, honestly not yet complete** — steps 4–6 (GPS Job Mode / Confirm Actual) now have real, audited code and schema (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md`, 5 Codex rounds, `GATE: PASS`) but remain unverified against a live database: this and every prior session has no Dev DB write credentials to apply the 3 pending migrations. What *is* complete, audited, and live-verifiable today is the narrower loop: Prompt → Expanded Prompt → Decide → Records → Ask AI; the GPS Job Session + Confirm Actual segment is real and built but honestly reported as `PENDING_DEV_VALIDATION`, not yet demonstrated end-to-end against a real database.
