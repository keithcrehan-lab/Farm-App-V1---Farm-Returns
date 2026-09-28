# Legacy blocker discovery index

## Legacy constraints requiring task-specific reconciliation

This is a conservative index, **not a claim that old implementation gaps are still current**.
No entry is declared resolved by this rotation. For a task touching a listed area, read its
original section (line number in link), following updates and current contract before acting.
Explicitly RESOLVED entries are indexed separately in `history/BLOCKERS-index.md`.
The complete byte-for-byte [historical record](history/BLOCKERS-through-b24c266.md) retains
all prose, decisions and within-section caveats. Search it by affected symbols when the index
is insufficient; headings are discovery hints, not a substitute for a relevant constraint.
New blockers go here with ID, affected area, status and evidence link; resolved entries move to history.

- No automated market-price feed — [original L13](history/BLOCKERS-through-b24c266.md#L13)
- No sourced silage yield/DM-conversion data — [original L16](history/BLOCKERS-through-b24c266.md#L16)
- Met Éireann forecast commercial licence — [original L18](history/BLOCKERS-through-b24c266.md#L18)
- Fertiliser price not yet in the price-resolution hierarchy — [original L21](history/BLOCKERS-through-b24c266.md#L21)
- No separate external architecture document. — [original L28](history/BLOCKERS-through-b24c266.md#L28)
- DECIDED (product-owner decision, 2026-09-01) — telemetry retention policy. — [original L33](history/BLOCKERS-through-b24c266.md#L33)
- New (2026-09-01) — Vertical A's real `navigator.geolocation` capture wiring and Vertical C's job-mode screens are not yet built, by deliberate scoping decision, not an oversight. — [original L65](history/BLOCKERS-through-b24c266.md#L65)
- DECIDED (product-owner decision, 2026-09-01) — GPS job-mode offline conflict resolution. — [original L78](history/BLOCKERS-through-b24c266.md#L78)
- DECIDED (product-owner decision, 2026-09-01) — offline queue architecture. — [original L96](history/BLOCKERS-through-b24c266.md#L96)
- DECIDED (product-owner decision, 2026-09-01) — notification channel. — [original L106](history/BLOCKERS-through-b24c266.md#L106)
- New (2026-09-01) — notification expiry window (14 days) is a Farm Return operational default, not a confirmed product-owner decision. — [original L119](history/BLOCKERS-through-b24c266.md#L119)
- New (2026-09-01) — no notification-centre UI exists yet, by deliberate scoping decision, matching Vertical A's own precedent. — [original L131](history/BLOCKERS-through-b24c266.md#L131)
- New (2026-09-01) — `notifications`' `insert` grant does not itself verify a notification's content came from a real `OK`-status Prompt, the identical, already-accepted, systemic limitation `decisions.ts`'s own header comment documents for `decisions.estimate_snapshot`. — [original L138](history/BLOCKERS-through-b24c266.md#L138)
- DECIDED (product-owner decision, 2026-09-01) — satellite field intelligence provider/evidence base. — [original L156](history/BLOCKERS-through-b24c266.md#L156)
- New (2026-09-01) — real NDVI/vegetation-index computation from raw Sentinel-2 bands is blocked on credentials this build session cannot obtain, not a technical or network limitation. — [original L182](history/BLOCKERS-through-b24c266.md#L182)
- Decide-stage auto-rule boundary has zero implemented rules yet. — [original L203](history/BLOCKERS-through-b24c266.md#L203)
- NEW (Phase B, 2026-09-03, native/background GPS readiness) — `BLOCKED_HUMAN`: the native container/framework choice itself. — [original L243](history/BLOCKERS-through-b24c266.md#L243)
- `Prompt`/`Decision` gained `fieldId`/`calculationVersion` (Checkpoint 2, Vertical B, additive). — [original L355](history/BLOCKERS-through-b24c266.md#L355)
- FINAL POSITION (Checkpoint 2, Vertical B, Round 16) — `calculateNutrientPlan`'s own `NutrientPlan.soilTestAgeValidity` deliberately still does NOT call `checkFieldSoilTestAgeValidity`, and this vertical is not the one that gets to make that change. — [original L423](history/BLOCKERS-through-b24c266.md#L423)
- `jobs` has no target-entity reference yet. — [original L496](history/BLOCKERS-through-b24c266.md#L496)
- `estimate_calibration` isn't in the Checkpoint 1 migration. — [original L512](history/BLOCKERS-through-b24c266.md#L512)
- `telemetry_events` isn't in the Checkpoint 1 migration either — [original L551](history/BLOCKERS-through-b24c266.md#L551)
- REVERSED (dedicated architectural security review, after Checkpoint 2 Vertical D shipped — not a Codex audit round) — Decisions/jobs persistence: service-role reverted to RLS. — [original L749](history/BLOCKERS-through-b24c266.md#L749)
- Every other table in this schema — not just `decisions`/`jobs` — still grants raw `insert`/`update`/`delete` to `authenticated` with zero RPC gating, including `livestock_weight_observations` (the exact table `actRecordWeightObservation`'s own pre-existing `addWeightObservation` call writes through). — [original L809](history/BLOCKERS-through-b24c266.md#L809)
- `/today` exists but isn't wired into navigation or any auth-redirect target yet. — [original L858](history/BLOCKERS-through-b24c266.md#L858)
- Why Vertical B's `src/domain/` additions this checkpoint are in scope, not a boundary violation — final position after five real rounds (10/14/16/17/18). — [original L876](history/BLOCKERS-through-b24c266.md#L876)
- `closed-period-calendar.ts`'s statutory closed-period table has no evidenced "year of applicability," and nothing anywhere in this app rejects a date outside whatever year(s) that might be (Checkpoint 2, Vertical B, second slice) — built, audited, narrowed, and ultimately reverted across four real Codex audit rounds, a genuine self-correction worth recording in full, not smoothed into a single clean "resolved." — [original L928](history/BLOCKERS-through-b24c266.md#L928)
- `promptForSpreadingWindow`/`checkSpreadingWindowGate` deliberately never accept caller-supplied ground/weather conditions, even though the frozen `spreading-legal-gate.ts`'s `checkSpreadingLegalGate` can compose them (Checkpoint 2, Vertical B, second slice) — not a missing feature, a considered, evidenced scope boundary. — [original L1074](history/BLOCKERS-through-b24c266.md#L1074)
- Minor, non-blocking: `spreading-legal-gate.ts`'s own module doc comment overclaims what `checkSpreadingLegalGate` actually composes (found during Checkpoint 2, Vertical B, second slice's investigation, while this vertical was still using that function — before the ground- provenance gap above led to removing that dependency entirely). — [original L1105](history/BLOCKERS-through-b24c266.md#L1105)
- `jobs.status` has no real write path yet after creation. — [original L1123](history/BLOCKERS-through-b24c266.md#L1123)
- `calculateNutrientPlan`/`local-buffer-override-gate.ts` divergence on a missing actual buffer distance — real, evidenced, deliberately not fixed here (Checkpoint 2, Vertical B, fourth slice, build-priority #2, 2026-09-01). — [original L1198](history/BLOCKERS-through-b24c266.md#L1198)
- `nutrients.ts`'s own composition of the national and local buffer checks doesn't model the real statutory precedence relationship between them — real, sourced, evidenced, not fixed here (Checkpoint 2, Vertical B, fourth slice, third audit round, 2026-09-01). — [original L1233](history/BLOCKERS-through-b24c266.md#L1233)
- Vertical C (Act/Confirm/GPS job mode) cannot be built end-to-end against a real, persisted job today — a genuine schema gap, checked against the real migrations before concluding this, not assumed. — [original L1267](history/BLOCKERS-through-b24c266.md#L1267)
- Also genuinely blocked, independent of the schema question: this build session has no Dev database write credentials at all — [original L1288](history/BLOCKERS-through-b24c266.md#L1288)
- What this session built instead, staying inside what's real today — [original L1297](history/BLOCKERS-through-b24c266.md#L1297)
- Unblocks when: — [original L1308](history/BLOCKERS-through-b24c266.md#L1308)
- `src/domain/p-build-up-eligibility.ts`'s `evaluatePBuildUpEligibility` — real, already-implemented, real-data-backed, but not yet a Prompt, by product-owner decision (2026-09-01), not oversight. — [original L1321](history/BLOCKERS-through-b24c266.md#L1321)
- `Sheet.tsx`'s open-stack position is not Suspense/transition-safe — reviewed, not a demonstrated bug. — [original L1346](history/BLOCKERS-through-b24c266.md#L1346)
- `decisions.test.ts`'s server-action coverage is missing the `spreading_window` success path. — [original L1363](history/BLOCKERS-through-b24c266.md#L1363)
- `JobHistoryCard`'s `job.updatedAt` display has no dedicated regression test. — [original L1371](history/BLOCKERS-through-b24c266.md#L1371)
- A `job_actuals` row's own claimed *quantity/area number* is enforced by the sanctioned application write path (`confirmJobSessionActual`'s own `reconcileAndVerifyPayload`), not independently re-verified by a database CHECK — a real, disclosed, systemic gap, narrowed across rounds 2 and 3 but not, and not fully closable, this phase. — [original L1523](history/BLOCKERS-through-b24c266.md#L1523)
- CRITICAL, found by live validation, not by any of the prior six Codex audit rounds against this contract (none had live DB access) — `authenticated` held a full, unintended `DELETE`/`UPDATE`/`TRUNCATE`/ `TRIGGER`/`REFERENCES` grant on seven tables, three of them pre-existing V1 tables. — [original L1576](history/BLOCKERS-through-b24c266.md#L1576)
- The same root cause, one layer over, for function `EXECUTE` privilege — [original L1649](history/BLOCKERS-through-b24c266.md#L1649)
- `confirm_job_session_actual`'s own retry-safety id-check had a narrower residual race, found by Codex audit round 1: it ran *before* the function's own `for update` lock, not after. — [original L1666](history/BLOCKERS-through-b24c266.md#L1666)
- `MANUAL_JOB_START_RESERVED_OUTCOME_KEYS`'s own denylist-shaped guard was itself only as strong as its own list — Codex audit LOW. — [original L1674](history/BLOCKERS-through-b24c266.md#L1674)
- A real, local numeric-truthfulness gap, found by this phase's own audit (not a security issue — a transparency one): Confirm Actual never showed the field's own real mapped area before a farmer confirmed a "whole field" completion against it. — [original L1682](history/BLOCKERS-through-b24c266.md#L1682)
- NEW — `BLOCKED_HUMAN` on Today's final visual polish (marker/pin styling, exact primary-card vertical position). — [original L1714](history/BLOCKERS-through-b24c266.md#L1714)
- NEW — pre-existing, systemic: `PageHeader`'s desktop `weather` prop defaults to a hardcoded literal, `"12°C · Light Rain"`, displayed as if real on every screen that doesn't pass an explicit override (`src/components/shell/PageHeader.tsx`). — [original L1753](history/BLOCKERS-through-b24c266.md#L1753)
- NEW — `BLOCKED_HUMAN` on Farm/Field exploration's full-bleed map composition — same root cause as Today's own entry above, one level further. — [original L1775](history/BLOCKERS-through-b24c266.md#L1775)
- NEW — `BLOCKED_HUMAN` on Plan's opportunity-list density (same oscillating-taste signature as Today/Farm above) and a real, cross-cutting finding surfaced for Phase V7. — [original L1798](history/BLOCKERS-through-b24c266.md#L1798)
- NEW — Visual Alignment Phases V5/V6/V8/V9 (Active GPS Job Mode, Confirm Actual, Livestock, Satellite/Vegetation) were not attempted this session, each for a real, disclosed reason, not an oversight. — [original L1826](history/BLOCKERS-through-b24c266.md#L1826)
- NEW — two real, non-blocking Medium findings from the final whole- session Codex audit's round 3, logged rather than fixed (same severity taxonomy this file already uses elsewhere for a non-blocking Medium — see the `auditTrailError` entry above). — [original L1862](history/BLOCKERS-through-b24c266.md#L1862)
- NEW — `BLOCKED_HUMAN`: should an already-applied Dev migration (`20260904020000_support_profile_facts_declared_area_and_value_shape.sql`) be edited retroactively to close a real, but currently inert, migration-sequencing safety gap? — [original L1891](history/BLOCKERS-through-b24c266.md#L1891)
