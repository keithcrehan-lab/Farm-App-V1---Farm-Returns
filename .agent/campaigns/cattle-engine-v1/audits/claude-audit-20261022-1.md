# Independent Claude audit — C10 6e81831..8148e35

> Preserved verbatim from the final report of a fresh, read-only Claude subagent (Plan type: no Edit/Write tools), launched 2026-10-22 with no implementation-agent context, run against detached worktree `scratchpad/claude-audit-8148e35` at `8148e35`. **This is an independent CLAUDE audit. It is not the Codex strict audit required by `scripts/agent-campaign-run` for freeze, and is not Codex-independent verification.** Reproduction probes: `claude-audit-20261022-1.probes.md`. Status: `claude-audit-20261022-1.status.md`.

**Executed** (repo at detached 8148e35, no repo file modified):
- Read the full C10 delta, focused on the engine → view-model → component path: `src/domain/animal-plan/*`, `src/domain/cattle/presentation/{animal-profile,plan-view,plan-timeline,weight-view,timeline,cost-view,herd-view,work-view,format,numeric-input}.ts`, `src/components/cattle/{AnimalPlanScreen,AnimalProfileScreen,AnimalSections,PerformanceChart,RecordWeightSheet,WorkPanel}.tsx` + `session/*`, `src/server/cattle-demo/{demo-service,demo-replay,demo-economics,c10-engine-fixtures}.ts`, `src/app/(app)/cattle/*`, DOMAIN_CONTRACTS C10 sections, evidence-register; frozen C5 `predictWeight`, C6 goal projection, C4 canonical weight, Plan kernel deadline semantics, C3 occurredAt nullability.
- 8 execution probes (p1–p8, vitest under `/private/tmp/claude-501/c10-claude-audit-probes/`, probe-only vitest config with `root` = repo) driving the real demo service/replay/frozen engines through `demoAnimalView`, `demoProjection`, `planScreenView`, `buildAnimalProfile`, `outputsWithGoal`, `projectProductionGoals`. Command: `npx vitest run --config /private/tmp/claude-501/c10-claude-audit-probes/vitest.config.mts --disableConsoleIntercept <probe>`.
- `npx vitest run cattle animal-plan src/components/shell --maxWorkers=2` → 31 files, **1248 tests passed**.
- `npm run typecheck` → 12 errors, **none in C10 files** (11 in `apps/mobile-spike/...` — no node_modules for that app in this worktree; 1 `src/app/layout.tsx: Cannot find name 'LayoutProps'` — Next generated types absent, no `.next`). Environmental-looking; not certified green here.
- Not run: lint, full quality gate, build.
- Scope check: every changed file is inside the C10 scope_guard / allowed_shared_paths plus this campaign's `.agent` files. No C0–C9 / Plan kernel / `src/lib/farm-data` / `supabase` / config / package changes. (Observation, not a finding: 4983911 widened C10's own scope_guard/allowed_shared_paths in campaign.json citing the 2026-10-20 human authorisation, which can't be verified from the repo.)

## Counts
**Critical 0 / High 4 / Medium 5 / Low 4**

## Findings

### CL-001 HIGH — Negative C5 projection shown as a known projected weight on profile and chart (plan refuses it)
Family INVALID_PROJECTION_AS_KNOWN (F014 family). CONFIRMED by execution. REGRESSION.
Files: `src/domain/cattle/presentation/animal-profile.ts:372` (projection label), `src/domain/cattle/presentation/weight-view.ts:266-269` (chart `ChartOverlay`); contrast `src/domain/animal-plan/plan-economics.ts:217-219` + `plan-view.ts:134` (`PROJECTION_NOT_POSITIVE`).
Evidence (p2): session `RECORD_WEIGHT 1427 kg=5 observedDate=null` → `demoAnimalView`: profile projection label `"−93 kg by 4 Dec 2026"`, display `PREDICTION:PROJECTED` "Projected"; chart overlay `{"state":"SHOWN","kg":-92.98,"label":"−93 kg"}`; chart geometry (`PerformanceChart.tsx:94-102`) scales the y-axis into negative kg. C5 `predictWeight` does not clamp (`performance-derivation.ts:565`), so negatives reach C10. The plan screen for the same kind of output says "Unknown — no usable weight projection (the projected weight is zero or less)", and DOMAIN_CONTRACTS states zero/negative projections are refused.
Impact: a physically impossible weight shown as a resolved prediction and drawn on the chart; profile and plan disagree about the same C5 output.
Fix: one presentation admission helper for C5 projections used by profile label, chart overlay and plan; non-positive/non-finite PROJECTED → explicit unusable-projection state. Owner-driven regressions for profile + chart. Scope: inside C10.

### CL-002 HIGH — Timeline goal entries silently drop an unresolved target weight
Family UNAVAILABLE_AS_EMPTY (direct F005 sibling). CONFIRMED by execution. REGRESSION.
File: `src/domain/cattle/presentation/timeline.ts:139` (renders target only when `canonical.state === "KNOWN"`).
Evidence (p3): `outputsWithGoal("1427", {FINISHING, 1400 POUND, 2026-12-04})` → profile goal line correctly "target weight 1400 lb recorded (can't be converted to kg)", but timeline entry `{"title":"Goal set: Finishing","detail":"by 4 Dec"}` — identical to a goal with no target.
Impact: activity history shows an unsupported recorded target as if none were set — the defect F005 fixed on the goal line.
Fix: render the timeline target through the same three-state target read as `goalSummaryText`; lb-target timeline regression. Scope: inside C10.

### CL-003 HIGH — Only the first of several ACTIVE C6 goals is shown; others silently dropped
Family UNAVAILABLE_AS_EMPTY / omission. CONFIRMED by execution against frozen C6. REGRESSION.
Files: `src/domain/cattle/presentation/animal-profile.ts:244` (`goalProj.activeGoals[0]`), `src/server/cattle-demo/demo-service.ts:77` (projection date from `activeGoals[0]`).
Evidence (p8): two declarations for 1427 (FINISHING 640 kg by 2026-12-04; SALE by 2026-11-01) → `projectProductionGoals` `ACTIVE [FINISHING 2026-12-04, SALE 2026-11-01]` (C6 treats only RETAIN/SALE as mutually exclusive); profile shows only "Finishing, 640 kg by 4 Dec 2026", status "Goal set"; the earlier sale goal appears nowhere; the plan's default sale date and projection date come from the first goal only.
Reachability: not from the shipped demo (one goalId per animal); reachable from any multi-goal ledger — the same fixture-path reachability the F005 precedent was rated on.
Impact: a declared, earlier sale intent is hidden.
Fix: `GoalRead` carries every active goal (or an explicit "several goals" state); list all on profile/timeline; plan states which goal it starts from. Scope: inside C10.

### CL-004 HIGH — Hard deadline shown one day later than the engine's deadline, contradicting the window on the same card
Family DEADLINE_MISSTATED. CONFIRMED by execution. REGRESSION.
Files: `src/domain/cattle/presentation/work-view.ts:246` (`` `Must be done by ${formatDate(hd.dueIso)}` ``) vs `work-view.ts:149-151` (window correctly "before {due}"); rendered together at `WorkPanel.tsx:70-71`.
Evidence (p4): animal 1458 birth registration — `window.endIso "2026-10-12T00:00:00Z"`, basis `…INCLUSIVE_START_EXCLUSIVE_END`, `hardDeadline.dueIso "2026-10-12T00:00:00Z"` (C9 admission forces `dueIso === window.dueAt`). View-model: `"Must be done by 12 Oct 2026"` beside `"Recommended window 13 Sep – before 12 Oct"`. Plan kernel: deadline passed when `now > dueIso` (`src/domain/plan/timing.ts:84`) — any time on 12 Oct is already late.
Impact: a legal/regulatory deadline reads one day more lenient than the engine's rule; a farmer acting on 12 Oct would be late.
Fix: phrase hard deadlines exactly like the exclusive window ("Must be done before 12 Oct 2026") or show the last allowed day — decided once in the view-model; regression. Scope: inside C10.

### CL-005 MEDIUM — Tiny positive projection shown as a known "0 kg" with an extreme cost per kg
Family INVALID_ECONOMIC_DENOMINATOR (F014 family, residual). CONFIRMED by execution. REGRESSION.
Files: `plan-economics.ts:217` (accepts any >0), `plan-view.ts:272` (`formatKg` whole kg), `format.ts:70-74` (`formatEuroPerKg`).
Evidence (p1): `RECORD_WEIGHT 1427 kg=252.9` now, sale 2027-12-04 → C5 projects 0.447 kg; plan shows "Projected weight at sale **0 kg** (−252 kg)" KNOWN, "Cost per kg liveweight at sale **€4615.49/kg**" KNOWN, "Projected sale value €2", headline "−€2,297". With 253.5 kg: "2 kg", €847.51/kg. The same screen calls a zero projection unusable, yet shows "0 kg" as known — display rounding changes meaning. Recorded as a known limitation in DOMAIN_CONTRACTS ("Small positive projections"), which does not resolve the contradiction.
Impact: absurd but internally consistent figures without warning after a plausible typo (252 for 552). Arithmetic over a labelled prediction → Medium, not High.
Fix: in scope — never display a positive projection as "0 kg" ("<1 kg" or refuse projections that round to zero) and add an explicit "projected weight loss" warning when projection < current weight. A plausibility floor needs a sourced rule → **PRODUCT_DECISION_REQUIRED / SCIENTIFIC_DECISION_REQUIRED**.

### CL-006 MEDIUM — Unbounded linear extrapolation drives the plan headline for far-future sale dates
Family MISLEADING_EXTRAPOLATION. CONFIRMED by execution. REGRESSION (C10 consumption of frozen C5).
Files: `plan-view.ts:252-293`, `AnimalPlanScreen.tsx:306` (date input `min`, no `max`), `actions.ts:50` (any valid plan date accepted).
Evidence (p7): 1427 sale 2036-10-16 → "Projected weight at sale 4,507 kg", headline "Return from holding **+€3,878**"; sale 9999-12-31 → "3,150,437 kg", "+€2,975,891". Return heading "Return from holding to 16 Oct" has no year (`plan-view.ts:306`).
Impact: a straight-line projection over years becomes a confident positive return; the footnote doesn't offset a 4.5-tonne animal.
Fix: bound the plan horizon or flag extrapolation beyond the evidence window; year in plan headings. Horizon bounds → **PRODUCT_DECISION_REQUIRED / SCIENTIFIC_DECISION_REQUIRED**; year in headings in scope.

### CL-007 MEDIUM — Plan "Goal weight" row misstates why an unconvertible (lb) target is unknown, contradicting the profile
Family MISSTATED_UNKNOWN_REASON. CONFIRMED by execution. REGRESSION.
File: `src/domain/cattle/presentation/plan-view.ts:279-280` + line 143 (`GOAL_UNRESOLVED: "the goal records disagree or can't be read"`).
Evidence (p3): ACTIVE goal, 1400 lb target → row `"Unknown — the goal records disagree or can't be read"`; profile says "1400 lb recorded (can't be converted to kg)". The record is readable and nothing disagrees.
Fix: own reason for the unconvertible-unit case, distinct from conflict/unavailable. Scope: inside C10.

### CL-008 MEDIUM — Plan says "No goal date is declared" when the goal's declared date is today or past
Family KNOWN_AS_MISSING. CONFIRMED by execution. REGRESSION.
Files: `src/server/cattle-demo/demo-service.ts:104-112`, `plan-view.ts:207-213`.
Evidence (p3): goal FINISHING by 2026-10-01 (viewpoint 2026-10-16) → `saleDateSource = "No goal date is declared; the sale date is a starting suggestion."`, default sale date hardcoded `"2026-12-04"`; same for a goal dated 2026-10-16. Profile shows "… by 1 Oct 2026".
Fix: a "GOAL_DATE_NOT_AHEAD" source sentence (e.g. "The goal date, 1 Oct 2026, has passed; the sale date is a starting suggestion."). Scope: inside C10.

### CL-009 MEDIUM — Superseded goal versions not marked superseded on the timeline
Family PROVENANCE_MARKER_LOSS. CONFIRMED by execution. REGRESSION.
File: `src/domain/cattle/presentation/timeline.ts:137-149` (goal entries always `marker: null`); C6 supplies `GoalHistoryEntry.recordState: "SUPERSEDED"`.
Evidence (p6): after demo `SAVE_PLAN_GOAL`, v1 "Goal set: Finishing — 640 kg by 4 Dec" has `marker: null` beside v2 "Goal updated … 656 kg by 20 Jan". Weights/health/C1 entries are struck/marked "Corrected"; goals aren't. Timeline contract: "Superseded / conflicting history stays visible, marked."
Fix: map `recordState === "SUPERSEDED"` → `marker: "SUPERSEDED"`; regression. Scope: inside C10.

### CL-010 LOW — Undated C3 health records (non-medicine) appear nowhere on the profile
Established by reading (PLAUSIBLE). REGRESSION. `timeline.ts:123` (`if (h.occurredAt === null) continue;`); health section lists medicines only (`animal-profile.ts:282-296`); C3 allows `occurredAt: null` (`health-engine.ts:110,366`). Partly mitigated by the "dated records" footnote. Fix: list undated records with "Date not recorded" or add to `timelineGaps`.

### CL-011 LOW (latent) — Only the first food-product withdrawal gate and first withdrawal per medicine are read
Established by reading (PLAUSIBLE). `animal-profile.ts:265` (`withdrawalGate.entries[0]`), `animal-profile.ts:286` (`e.withdrawals[0]`); `saleWithdrawalNotice` checks only that entry. Unreachable with the single-product demo; with meat + milk an in-withdrawal second product gives no sale notice. Fix: read every gate entry.

### CL-012 LOW — Future-dated cost entries never surfaced
Established by reading. `cost-ledger.ts:129,154` produce `futureEntryIds`; nothing in presentation/components reads it (grep). The ledger's "never dropped silently" claim is not honoured at the UI. Not reachable with current fixtures. Fix: note excluded future entries in `costView`.

### CL-013 LOW — Per-kg money lacks thousands grouping; plan/timeline dates drop the year
CONFIRMED (p1, p7). `format.ts:73` → "€4615.49/kg"; `plan-view.ts:306`, `plan-timeline.ts:46-47`, `AnimalSections.tsx:134` strip the year — ambiguous across years.

## F005 / F013 / F014 verification
- **F005 — PARTIAL.** Fixed: profile goal line renders explicit KNOWN / UNRESOLVED / NOT_SET; chart has an UNRESOLVED goal note (p3, `animal-profile.ts:158-162`, `weight-view.ts:288-293`); unsupported-unit weight history → NOT_CHARTABLE, not empty. Family not fixed: CL-002, CL-003, CL-007, CL-008.
- **F013 — CONFIRMED FIXED.** `timeline.ts:43-56` maps owner `informationClass` exactly (DERIVED_VALUE → "Calculated", never "Observation"), rendering regression in `c10-presentation-boundary.test.tsx` (~line 380). Profile caption, herd row, chart and previous-weight line use C4 `measurementBasis`. Other hardcoded classes match owners (goals INTENT = C6; C1 assertions carry no owner class). Wording observation only: "Calculated" for an externally supplied figure.
- **F014 — PARTIAL.** Fixed: the reported 0 kg path gives UNKNOWN for projected weight, sale value, cost/kg at sale, profit, return; no "Infinity"/"NaN" renders (p1, kg 252.765…); non-positive/non-finite can't be KNOWN (`plan-economics.ts:153,217-234`); `costPerKgLiveweight` guards weight. Family not fixed: CL-001, CL-005.

## Areas reviewed with no findings
- Real-account separation: every page returns `CattleUnavailable` and every server action refuses (`REAL_ACCOUNT_MODE`) when Supabase is configured; actions stateless, zod-validated session/tag/scenario/date, 40-event cap, no writes; no farm identity to bind, no mock data on a real path.
- Economics formulas match the brief/evidence-register (Decimal, no pre-display rounding); missing costs/housing/valuation → UNKNOWN with reasons, never zero; non-euro ledger never gets €; per-head basis refused for sale value.
- Housing: `derivePlanIntervals` single interval derivation; unknown housing blocks housing-dependent figures unless assumed, and assumed figures are marked.
- Mart valuation: fixture never labelled live; staleness from a supplied setting.
- Numeric editing exact (`stepDecimalText`, `canonicalNumberText`).
- Record-weight sheet: explicit previous-weight states; back-dated weights state their job effect.
- Cross-screen consistency after a demo session (record weight + save plan, p5): profile goal line, profile projection, chart overlay, plan projected weight, plan goal row and default sale date agree for every demo animal.
- Frozen contracts: no C0–C9 or Plan file changed in the delta.
- Targeted suite: 1248 tests pass.
