# C10 — Cattle UX/UI — architecture repair report (2026-10-21)

## 1. Status

**STOPPED — `REPEATED_HIGH_FINDING` (defect family `UNAVAILABLE_AS_EMPTY`, third occurrence).**

The repair was authorised as an architecture fix for this family. The strict campaign audit of the repair (`audit-20261021T110045Z-56621`, range `6e81831..537d4b4`) raised it again, as HIGH F005. The authorisation says: "If the same F005/unavailable-as-empty family appears again after this architecture repair, STOP." No further fixes were made.

C10 is **not audit-clean**, **not accepted** and **not eligible to freeze**. Nothing was pushed. C11 was not started.

## 2. Repository SHAs

| | SHA |
|---|---|
| Starting point (overnight STOP report) | `24a2779` |
| Architecture repair (audited HEAD, gate HEAD) | `537d4b4` |
| This report + audit records | the commit that adds this file (documentation only) |
| `origin` | unchanged; nothing pushed |

- Repair delta `24a2779..537d4b4`: 24 files, +1,018 / −240.
- Whole C10 delta `6e81831..537d4b4`: 57 files, +7,707 / −99.
- No frozen C0–C9 contract changed. No migration, schema or persistence change.

## 3. What the repair did (`537d4b4`)

### F005 — the availability invariant

The invariant was frozen in `DOMAIN_CONTRACTS.md` (C10): C10 never collapses unavailable, unknown, unresolved or failed data into a known-empty state.

**Model:**
- `Availability<T>` in `src/domain/cattle/presentation/availability.ts` is either KNOWN (possibly empty) or UNAVAILABLE with a display reason.
- The reasons are the `UNAVAILABLE_DISPLAY` states: EVALUATION, GROUP_SCOPE, PLANNING and COSTS.
- `AnimalCostRead` is a cost summary or UNAVAILABLE. The frozen, more specific states are kept as they were.

**View-models moved off the "null means empty" style:**
- **Groups:** `GroupVM.scope` and `GroupVM.workCounts`.
- **Herd:** `HerdVM.openWorkCount` and `AnimalRowVM.nextWork`.
- **Profile:** `chart`, `health.programmes`, `health.obligations`, `health.medicines`, `work.open` and `costSummary`. Identity fields and the goal show EVALUATION_UNAVAILABLE when their source is missing.
- **Group and animal coverage:** C4/C5 emit one entry per requested animal, so a missing entry is treated as unavailable.

**Tests:**
- `availability-invariant.test.tsx` runs 13 single-source mutations over the real replay outputs: scope, plan (herd and animal), weights, series, performance (null and missing entry), snapshot (profile and row), goals, health, recommendations and costs.
- Each mutation first proves its forbidden known-empty wording appears in the baseline. It then asserts the view-model state and the rendered text.
- It also has an all-at-once test, a known-empty-stays-known test and a structural walker test (16 tests in all).

**Why it still recurred:** the sweep covered the presentation view-models and the screens that render them. The record-weight sheet takes a raw `lastKg: number | null` prop, built from the profile weight. That prop sits outside the `Availability` model, so neither the mutation tests nor the walker reached it (§5, F005).

### F011 — housing facts and assumptions

- `currentlyHoused` (observed, from the C1 location) is kept separate from `assumedCurrentHousing` (the farmer's plan input: OUTDOORS, HOUSED or null). Nothing is inferred.
- The plan output carries `housing: {observed, basis: OBSERVED | ASSUMED | UNKNOWN, assumption}`.
- **Unknown housing with no assumption:** the housing-dependent results (`HOUSING_DEPENDENT_RESULTS`) are UNKNOWN with `CURRENT_HOUSING_UNKNOWN`, and the plan screen explains why.
- **With an assumption:** the calculation proceeds. Each dependent row and the headline show an "Assumed housing" mark. The assumption lives only in the plan inputs, and the animal record is not changed.
- The assumption control is shown only when housing isn't observed.
- **Tests:** an 8-test domain block (observed outdoors, observed housed, unknown with no assumption, assumed outdoors, assumed housed, changing or removing the assumption, an assumption being ignored when housing is observed, and profit/cost propagation), plus UI tests for animal 1433 and for recorded housing.
- No scientific model was added. Evidence-register row: "Housed days to sale", C10 v2.

### F010 — save feedback

- A refused save now always shows a visible alert. The `draftDirty` gate was removed.
- Editing the plan clears the previous save result.
- A failed projection request shows `PROJECTION_REQUEST_FAILED`.
- Tests: refusal of an unchanged plan, and successful save.

### Staleness rule

- The demo-only 28-day weighing-staleness override was removed. The demo now uses `DEFAULT_CANDIDATE_ACTION_REGISTRY`, and no replacement rule was invented.
- Animal 1427 no longer raises a weighing job. Only 1438 and 1442 need weighing, which a registry-identity test checks.

### Ownership boundaries

These are documented in `DOMAIN_CONTRACTS.md`:
- **Weights and goals:** the cattle contracts.
- **Photos:** an application/media adapter.
- **Cost ledger:** an economics capability.
- **Mart data:** behind the provider boundary, with no scraping or fabrication.
- **FX:** no conversion; non-euro costs fail clearly.

## 4. Verification

| Step | Result |
|---|---|
| Targeted F005 / F011 / F010 tests | pass |
| C10 phase verify (`vitest cattle animal-plan src/components/shell`) | 26 files, 1,103 tests pass |
| Typecheck | pass |
| Lint | 0 errors (2 pre-existing C8 warnings) |
| **Full quality gate at `537d4b4`** (`quality-20261021T070123Z-40574`) | **pass**: 312 files / 5,980 tests, typecheck, lint, build. This is a new run, not the old 5,950 result. |
| Browser, 390 px demo | No overflow and no console errors. Recording a weight for 1442 closes its job. 1427 has no staleness job. The 1433 plan shows the unknown-housing message, then assumption marks once an assumption is chosen. The failure scenario shows "work couldn't be worked out". The empty herd shows "No animals recorded." |
| Strict audit attempt 1 (`audit-20261021T070125Z-40585`) | UNASSESSED: Codex QUOTA_EXHAUSTED. Not treated as a pass; retried at 12:00. |
| **Strict audit attempt 2 (`audit-20261021T110045Z-56621`)** | **0C / 3H / 0M / 0L**: see §5 |

## 5. Audit findings (`audit-20261021T110045Z-56621`)

All three findings were confirmed by reading the code at `537d4b4`.

- **H F005 `UNAVAILABLE_AS_EMPTY` — recurrence; the STOP trigger.** `RecordWeightSheet.tsx:75` prints "No earlier weight recorded." whenever `lastKg === null`. That includes animal 1438, whose readings conflict (498/512 kg), and a failed weight evaluation.
  - Required fix: carry the weight availability/conflict state into the sheet, and keep the absence wording for confirmed NONE only.
- **H F007 `INPUT_PRECISION_LOSS` — recurrence.** The plan path was fixed in `f6b311d`, but the sheet still loses precision. `RecordWeightSheet.tsx:34` initialises with `Math.round(lastKg)`, and `step()` at line 41 rounds too. Entering 548.24 and pressing +5 submits 553, not 553.24. Rounded input becomes canonical weight evidence.
- **H F012 `UI_DOMAIN_CALCULATION_DIVERGENCE` — new family.** `PlanTimeline` (`AnimalPlanScreen.tsx:170–181`) recomputes housed days in the component. It excludes housing that starts today (`housingDate > asOf`), while the domain counts it. Example: viewpoint and housing date 2026-10-16, sale 2026-12-04. The domain reports 49 housed days and €26.95 housing cost; the timeline shows "not housed before sale".
  - Required fix: render the durations from the domain result, keeping only layout geometry in the component.
  - This also breaks the AGENTS.md rule against calculations in UI components.

**Assessment.** None of the three needs a new product or economic decision; each has a clear local fix. They do show the same structural weakness, though: the component layer still turns raw nullable values and duplicated date arithmetic into farmer-facing statements. A repair that holds would extend the availability model to every component prop (no raw `T | null` that can mean "unknown"), and would ban date or money arithmetic in `src/components/cattle/`, enforced by a lint or test check. That changes the C10 architecture scope, so it needs your approval. Under the STOP rule I haven't started it.

## 6. Freeze and runner adoption (Decision 6) — read-only review

The runner (`scripts/agent-campaign-run`) has **no supported mechanism** to adopt a phase built by hand:
- Legacy phases must come before every campaign phase (lines 246–248).
- `legacy-manual` receipts are checked against the manifest's legacy pin (524–530).
- Product commits between phases fail with `UNEXPECTED_INTERVENING_CHANGE` (744–751).
- Receipts must never be edited by hand (~1251).
- `--status` reports C10 as `STOPPED PHASE_NOT_READY`.

No receipts were forged and no campaign history was edited.

**Minimal infrastructure needed** (a separately authorised infrastructure task) is an explicit, human-authorised **external/manual phase adoption** that:
1. checks the phase base (the C9 closure, `5c5832e`) and the resulting tree;
2. checks the changed paths against the C10 manifest's scope and allowed paths;
3. binds a clean strict-audit artifact at the exact freeze SHA;
4. records verification attestations (the quality-gate run id) and the human authorisation;
5. writes a receipt with full provenance;

and does all this without weakening `UNEXPECTED_INTERVENING_CHANGE` for agent-run phases.

**Freeze eligibility: no.** The audit isn't clean, and adoption infrastructure doesn't exist yet.

## 7. Needs human approval

1. **How to handle the third `UNAVAILABLE_AS_EMPTY` recurrence.** The options:
   - Authorise the component-boundary extension in §5 (Availability on every component prop, plus no date or money arithmetic in components, with an enforcement test) and fix F005, F007 and F012.
   - Re-scope C10.
2. **The adoption infrastructure task** in §6.
3. Still open from the overnight report:
   - persistence owners (weights, goals, cost ledger, photos);
   - a real mart price source;
   - a weighing-staleness policy, if one is wanted (none is in force now);
   - FX handling (non-euro costs stay UNKNOWN).

## 8. State files

`BUILD_STATE.json` and `IMPLEMENTATION_LOG.md` were not updated. That matches the earlier C10 commits, because C10 isn't recorded by the runner. Record it at adoption time.

## 9. Review commands

```sh
git log --oneline 24a2779..HEAD
git diff --stat 24a2779..537d4b4
cat .agent/campaigns/cattle-engine-v1/audits/audit-20261021T110045Z-56621.md
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npx next dev -p 3100
#   /cattle/animals/1438 → Record weight (F005)   /cattle/animals/1433/plan (F011 assumption)
npx vitest run cattle animal-plan src/components/shell --maxWorkers=1
```
