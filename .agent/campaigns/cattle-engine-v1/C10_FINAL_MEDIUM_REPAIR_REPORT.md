# C10 — final known-Medium repair report

**Status: `READY_FOR_FINAL_STRICT_AUDIT`**

Codex usage in this task: ZERO

## Repository
| | |
|---|---|
| Branch | `campaign-cattle-engine-v1` |
| Starting HEAD / production SHA | `4efca1f` (docs-only) / `4ab6ed6` — verified |
| Implementation commit | `42405c8` |
| **Final production candidate** | **`42405c8`** |
| Report HEAD | this docs-only commit on top of `42405c8` |
| Working tree / pushed / receipt / frozen | clean / no / none / no |

## Every known Critical / High / Medium (all saved audit evidence)
Source: `audits/claude-audit-20261022-1.md` (the latest review; the last Codex audit `97274` had 0 Medium, its 3 Highs repaired in `8148e35`).

| ID | Sev | Disposition |
|---|---|---|
| CL-001 negative projection known on profile/chart | High | repaired `4ab6ed6` |
| CL-002 lb goal target dropped from timeline | High | repaired `4ab6ed6` |
| CL-003 only first active goal read | High | repaired `4ab6ed6` |
| CL-004 hard deadline "by" vs exclusive due | High | repaired `4ab6ed6` |
| CL-005 tiny positive projection shown "0 kg" | Medium | **repaired `42405c8`** |
| CL-006 unbounded straight-line extrapolation | Medium | **repaired `42405c8`** (authorised 90-day C10 safeguard) |
| CL-007 lb target: plan says "records disagree" | Medium | repaired `4ab6ed6` |
| CL-008 past goal date called "not declared" | Medium | repaired `4ab6ed6` |
| CL-009 superseded goal versions unmarked | Medium | **repaired `42405c8`** |

**Critical: none known open · High: none known open · Medium: none known open.**

## Projection display (CL-005)
`formatProjectedKg`: 0.447 kg → "<1 kg", 0.0001 → "<1 kg", 0.5 → "1 kg", 609.4 → "609 kg". Canonical value unchanged (`projectedWeightKg` KNOWN "0.447"). 0 / −0 / −12.5 stay "No usable projection", never "<1 kg". Used by profile label, chart label, plan cell.

## Projection horizon (CL-006)
`admitProjectedWeight(kg, daysAhead)`; `PLAN_PROJECTION_HORIZON_DAYS = 90` (C10 decision-use safeguard, recorded in the evidence register; not a C5 limit, not biology). Real C5 projections of 1427 (as of 16 Oct 2026):

| Sale date ahead | Projected weight · sale value · cost/kg at sale · profit · return |
|---|---|
| 1, 89, 90 days | KNOWN (prediction) |
| 91, 400 days | UNKNOWN — "this sale date is too far away for Farm Return's current straight-line weight forecast. Reweigh the animal and update the plan closer to sale" |

The farmer's date is kept (title shows it), cost forecasts stay known, C5 still projects (state PROJECTED). Profile/chart use the same admission: 1433's goal date (91 days) → "Too far ahead to project", nothing drawn. Order: invalid / not positive before horizon.

## Goal version history (CL-009)
Marked from C6's own `recordState`, `supersededBy`, `activeGoals`, `conflicts`:
- in force and C6 ACTIVE → "Current goal" (several in force → each current);
- replaced by a correction → "Superseded" (struck through); by END → "Superseded — goal ended"; by WITHDRAW → "Superseded — goal withdrawn"; the END / WITHDRAW record keeps its own title;
- version in a C6 intent conflict → conflict marker, never current;
- live declaration outside its valid period → "Not in force now";
- C6 INVALID → no version marked current.
No version removed; plan defaults read only goals in force. A corrected weight still reads "Corrected".

## Low findings
- Fixed now (same figures, mechanical): CL-013 part — per-kg money grouped ("€4,615.49/kg"); plan return heading carries the year.
- Deferred follow-up: CL-010 undated non-medicine health records not listed; CL-011 latent first-gate / first-withdrawal read (single-product demo); CL-012 future-dated cost entries not surfaced; CL-013 remainder — timeline / plan-timeline dates drop the year.

## Regression protection
All prior suites green, plus the boundary tests that caught two draft mistakes (a day count outside `plan-intervals.ts`; a component fallback) — both corrected by moving the code where the rule says. Unavailable vs empty, sealed boundary, measured vs estimated, housing, precision, plan intervals, save failures, no staleness rule, fixture mart, no FX, assumptions, negative projection, lb target, multiple goals, deadline wording — unchanged and tested.

## Verification (exact candidate `42405c8`)
| Check | Result |
|---|---|
| New regression tests | 23 (CL-005 ×9, CL-006 ×7, CL-009 ×7); mutation-checked: removing "<1 kg", removing the horizon, `>=` off-by-one, unmarked goal versions — each fails its tests |
| Boundary test file | 96 / 96 |
| C10 suite | 31 files, 1,292 tests pass |
| Full quality gate `quality-20261023T103806Z-44840` | **pass** — 317 files, 6,169 tests; typecheck pass; lint 0 errors (2 pre-existing C8 warnings); build pass |
| HEAD before/after gate | `42405c8` / `42405c8`, tree clean |

## Frozen contracts
No C0–C9 file changed. Changes: `src/components/cattle`, `src/domain/cattle/presentation`, `src/domain/animal-plan`, `src/server/cattle-demo`, `docs/evidence-register.md`, `docs/farm-return-next/DOMAIN_CONTRACTS.md`.

## Next
One Codex strict whole-phase audit of `6e81831..42405c8` (separate task). Freeze still needs the separately authorised adoption mechanism.
