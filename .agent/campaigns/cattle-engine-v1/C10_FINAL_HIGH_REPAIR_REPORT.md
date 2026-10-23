# C10 — final known-High repair report

**Status: `READY_FOR_FINAL_STRICT_AUDIT`**

Codex usage in this task: ZERO

## Repository
| | |
|---|---|
| Branch | `campaign-cattle-engine-v1` |
| Starting HEAD | `e58c1e9` (docs-only above `8148e35`, verified commit by commit) |
| Starting production SHA | `8148e35` |
| Implementation commit | `4ab6ed6` (single commit: production code, regression tests, DOMAIN_CONTRACTS entry) |
| **Final production candidate** | **`4ab6ed6`** |
| Final report HEAD | this docs-only commit on top of `4ab6ed6` |
| Working tree | clean |
| Pushed | no |
| Receipt / frozen / campaign closed | no / no / no |

## The four findings (independent Claude audit `audits/claude-audit-20261022-1.md`, all reproduced on `8148e35`)

### CL-001 HIGH — negative C5 projection shown as a known weight (profile + chart)
- **Reproduction:** `RECORD_WEIGHT 1427 5 kg` → profile "−93 kg by 4 Dec 2026" (Projected), chart overlay drawn at −92.98 kg. The plan refused the same output.
- **Invariant / owner:** C5 `predictWeight` extrapolates without bounds and is frozen; C10's own contract (audit 97274 repair) already refuses zero/negative projections — but only in the plan.
- **Root cause:** three C10 readers of one C5 output, one admission.
- **Fix:** `admitProjectedWeight(kg)` (animal-plan) — USABLE only if positive and finite, else NOT_USABLE (`PROJECTION_NOT_POSITIVE` / `PROJECTION_INVALID`). Used by plan economics, the profile projection (`PREDICTION:NOT_USABLE`, no label) and the chart (`ChartOverlay` NOT_USABLE + note). No clamping; no new biological rule.
- **Farmer sees:** "No usable projection — continuing the recent daily gain gives a weight of zero or less, which can't be right"; chart note; plan figures Unknown with the same reason.

### CL-002 HIGH — a lb goal target dropped from the timeline
- **Reproduction:** goal FINISHING 1400 lb by 4 Dec → timeline "Goal set: Finishing — by 4 Dec", identical to no target.
- **Owner:** C6 `GoalTargetWeight.canonical` is KNOWN or UNSUPPORTED; C10 owns no conversion.
- **Root cause:** the timeline read only `canonical.state === "KNOWN"`.
- **Fix:** `goal-read.ts` — one reading of a C6 declaration (KNOWN / UNRESOLVED recorded / NOT_SET) for goal line, chart, timeline and plan. Sibling: the plan's goal-weight row now says "the goal target 1400 lb is recorded but can't be converted to kg" (was "records disagree").
- **Farmer sees:** "target weight 1400 lb recorded (can't be converted to kg), by 4 Dec" on the timeline, matching the goal line.

### CL-003 HIGH — only the first of several ACTIVE goals read
- **Reproduction:** FINISHING 640 kg by 4 Dec + SALE by 1 Nov → C6 `ACTIVE [FINISHING, SALE]`; profile showed only Finishing; plan/projection dates from `activeGoals[0]`.
- **Owner:** C6 reports every declared goal in force and chooses none; only SALE+RETAIN or one type with two outcomes is INTENT_CONFLICT; "judging it is a product decision outside this phase".
- **Fix:** `GoalRead` ACTIVE carries every goal. `soleActiveGoal` yields a goal only when exactly one is in force. With several: goal line lists all; no chart goal line (note); no goal-derived projection date (`PREDICTION:SEVERAL_GOALS`); plan goal-weight row Unknown ("several goals are in force and the plan doesn't pick one"), empty target box, sale date a stated suggestion. INTENT_CONFLICT / INVALID / NONE unchanged (owner states). Sibling: a declared goal date that isn't ahead is named ("The goal date, 1 Oct 2026, isn't after today…"), never "No goal date is declared".
- **No selection policy invented.**

### CL-004 HIGH — hard deadline "by" against an exclusive due instant
- **Reproduction:** 1458 birth registration: "Must be done by 12 Oct 2026" beside "Recommended window 13 Sep – before 12 Oct"; the Plan kernel counts any instant after `dueIso` (12 Oct 00:00Z) as late.
- **Owner:** C9 `hardDeadline` (sourced authority, `dueIso === window.dueAt`, exclusive).
- **Fix:** "Must be done before {date}" — still only for a C9 sourced hard deadline. Bounded sweep: C7 programme `DUE` "Due now" → "In its recommended window"; trigger copy "due or overdue" → "in or past its recommended window". Obligation states (C2 owner states) unchanged.

## Frozen-contract impact
No C0–C9 production file or contract changed (verified: diff touches only `src/components/cattle`, `src/domain/cattle/presentation`, `src/domain/animal-plan`, `src/server/cattle-demo`, and `docs/farm-return-next/DOMAIN_CONTRACTS.md`).

## Regression protection (all prior suites retained and passing)
Known vs unavailable · component boundary R1–R7 · weight provenance ("Weighed" only for measured) · housing by location kind · precision (548.24 exact) · single plan-interval derivation · visible save failure · no 28-day staleness rule · fixture mart never live · no silent currency conversion · assumptions never facts — unchanged code paths, existing tests green.

## Tests
- New: 21 cases in `c10-presentation-boundary.test.tsx` ("Claude audit 2026-10-22-1"): 7 projection boundary cases + auditor path + normal-path consistency; kg / lb / none timeline + lb cross-surface; one / several / INTENT_CONFLICT / NONE / INVALID / past-date goals; hard deadline, herd-wide timing sweep, no-timing, programme wording.
- Mutation check: reintroducing each defect (deadline "by", admission accepting any finite value, timeline KNOWN-only target, first goal only) fails its tests; restored.

## Verification (exact candidate `4ab6ed6`)
| Check | Result |
|---|---|
| Boundary test file | 73 / 73 pass |
| C10 suite (`cattle animal-plan src/components/shell`) | 31 files, 1,269 tests pass |
| Full quality gate `quality-20261023T083609Z-29367` | **pass** — 317 files, 6,146 tests; typecheck pass; lint 0 errors (2 pre-existing C8 warnings); build pass |
| HEAD before/after gate | `4ab6ed6` / `4ab6ed6`, tree clean |

## Not done (by instruction) and open risks
- No receipt, no freeze, no adoption mechanism, no push, no Pilot Integration, no Codex.
- The Claude audit's other Medium/Low findings (CL-005 tiny positive projection shown "0 kg"; CL-006 unbounded extrapolation horizon — both need a product/scientific decision; CL-009 superseded goal versions unmarked on the timeline; CL-010–CL-013) remain open. The runner's freeze threshold is CRITICAL = HIGH = **MEDIUM** = 0, so the final strict Codex audit may raise them.
- Freeze route for a hand-built campaign phase still needs the separately authorised adoption mechanism (`C10_COMPLETION_CHECKPOINT.md`).
