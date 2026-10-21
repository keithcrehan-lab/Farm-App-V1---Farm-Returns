# C10 — Cattle UX/UI — structural repair report (2026-10-21)

## Status

**`READY_FOR_FINAL_AUDIT` — NOT YET AUDITED.**

- The candidate `0e89336` passes all deterministic verification. The self-review is clean.
- The one strict whole-phase audit was started. Codex returned `QUOTA_EXHAUSTED` ("try again at 5:00 PM"), so it was not retried and is not a pass.
- C10 is not frozen and has no receipt. Nothing was pushed, and no further phase was started.

## Repository

| | |
|---|---|
| Branch | `campaign-cattle-engine-v1` |
| Starting SHA | `cd9c30b` (implementation underneath: `537d4b4`) |
| Final implementation SHA (the candidate) | **`0e89336`** |
| Final HEAD | the commit that adds this report (documentation and audit record only) |
| Working tree | clean |
| Pushed | no (`origin` unchanged) |

The candidate is a single commit with a coherent change set: 29 files across the C10 domain, presentation, components, demo service, tests and contracts.

## Invariant A — explicit known/unavailable values (F005, third recurrence)

**Architecture.** The boundary is: owner result → C10 admission adapter (`src/domain/cattle/presentation`, `src/domain/animal-plan`) → explicit state → UI. Components no longer receive a bare nullable weight, housing or goal.

| Value | Representation |
|---|---|
| **Weight** | `LatestWeightVM` (`latestWeightOf`) is `KNOWN {kg, observedAt}` \| `NONE` \| `CONFLICT {candidatesKg}` \| `UNSUPPORTED` \| `UNAVAILABLE`. |
| Weight in the plan | `CurrentWeightRead` (`currentWeightInput`) is `NOT_WEIGHED` \| `WEIGHTS_DISAGREE` \| `UNIT_NOT_SUPPORTED` \| `WEIGHTS_UNAVAILABLE`. Each reason is kept as `CURRENT_WEIGHT_*`; none is collapsed into "unknown". |
| **Housing** | `HousingObservation`: `KNOWN {housed}` or `UNKNOWN {NOT_RECORDED \| RECORDS_DISAGREE \| RECORD_INVALID \| RECORD_UNAVAILABLE}`. The F011 assumption model is unchanged: observed housing wins, an assumption is used only when housing is unknown and is marked, and neither changes the record. |
| **Goal** | `GoalRead`: `ACTIVE {targetWeight: KNOWN \| NOT_SET \| UNRESOLVED}` \| `NONE` \| `UNRESOLVED`. |
| Sale date source | `GOAL \| NO_GOAL_DATE \| GOAL_UNRESOLVED`. |
| **Costs** | `costView` is the one display reading: `UNAVAILABLE \| NONE_RECORDED \| NOT_IN_EURO \| UNREADABLE \| RECORDED` (exact totals). It replaces the `?? "0"` fallbacks in `CostSection` and the duplicated metric logic. |

**Admission points reviewed:** herd, group, animal profile, record weight, weight history and performance, goals, health, obligations and programmes, Plan work, timeline, photos, cost ledger, mart valuation, Animal Plan, and profit.

**Paths converted:**

| # | Path | Before | Now |
|---|---|---|---|
| 1 | Record-weight sheet: previous weight | — | Rendered by `previousWeightLine`; the old `lastKg` prop is removed. |
| 2 | Plan current weight | Bare `number \| null` | Explicit `CurrentWeightRead`. |
| 3 | Mart request liveweight | — | Taken from `LatestWeightVM`. |
| 4 | Goal unavailable or conflicting in the plan | Read as "no goal": "No goal date is declared", "Saving declares a finishing goal" | Says the goal couldn't be determined. |
| 5 | Herd row breed and sex | "Not recorded" for disputed or unreadable records | "Records disagree" or "Can't be read". |
| 6 | Group location label | "Not recorded" for a conflict | "Records disagree". |
| 7 | Group work line | Silent when planning failed or when there were no jobs | "Work couldn't be checked" when planning failed; "Nothing currently needs attention" for known-empty. |
| 8 | Group membership | — | "Membership couldn't be checked" (`SCOPE:UNAVAILABLE`); a known 0 stays "0 animals". |
| 9 | Untagged or unavailable row tag | "—" | The tag's state. |
| 10 | Profile "most recent" gain | "—" when C5 didn't run | Unavailable. |
| 11 | Timeline | Silently dropped a missing per-animal weight series and unreadable group/location history | Both are listed as gaps. |
| 12 | Why-panel | — | Says when the C8 recommendation record couldn't be read. |
| 13 | Dead `liveObservations` | Had a `?? []` collapse | Removed. |

**Left as ordinary optional state:** local UI state, meaning plan-form draft text and the in-memory session photo store.

**Adversarial tests:**
- `c10-invariants.test.ts` covers:
  - the weight-state matrix (known, none, conflict, unsupported, unavailable, and a malformed KNOWN);
  - a false-empty phrase sweep;
  - no averaging of a conflict;
  - the cost-state matrix.
- `availability-invariant.test.tsx` covers:
  - 16 owner-failure mutations over the real engine replay, now including the **plan surface**: goals failed, weights failed and snapshot failed;
  - a known-empty work test (0 jobs gives "Nothing currently needs attention" and "0 open jobs", never "couldn't be checked");
  - the earlier known-empty group and structural walker tests.
- `c10-invariants.test.tsx` renders the record-weight sheet for 1427 (known), 1442 (none), 1438 (conflict) and the failure scenario (unavailable). It also opens the sheet from the real profile for 1438.
- `cattle-boundary.test.ts` fails if a component reintroduces `lastKg`, `currentWeightKg`, `currentlyHoused` or `targetWeightKg`.

**F005 behaviour (rendered):**

| Case | Text |
|---|---|
| Known previous weight | "Last recorded 521 kg on 14 Sep." |
| No previous weight (C4 NONE) | "No earlier weight recorded." |
| Conflicting readings (1438) | "Previous weight couldn't be determined — records disagree (498 kg or 512 kg)." The entry starts empty; nothing is averaged or picked. |
| Evaluation unavailable | "Previous weight couldn't be checked." |
| Unsupported unit | "Previous weight couldn't be used — it's in a unit that can't be converted to kilograms." |

## Invariant B — numeric precision (F007)

**Canonical / edit / display separation:**
- A field's canonical value is its exact decimal text.
- `canonicalNumberText` gives the exact starting value; the sheet starts at `548.24`, not `548`.
- `stepDecimalText` does stepping arithmetic with `decimal.js`, which was already a dependency.
- Display rounding stays only in `format.ts`.

This applies to the record-weight sheet and every plan `NumberField`: target kg, concentrate kg/day and €/tonne, forage €/day, and housing €/day. The old plan stepper rounded to 2 decimal places. The cost ledger, mart €/kg and economics were already exact `Decimal` strings, and remain so.

**F007:** 548.24 + 5 = **553.24**, and it is saved as 553.24. The browser check matched: 548.24 → +5 → 553.24, then −5 twice → 543.24.

**Tests:**
- table cases: 548.24±5, 412.5+5, 0.1+0.2, 1.10+0.1, 0.55+0.05, 0.375+0.05, 340+10, 3.6215+0.0001;
- 25 × (+5) then 25 × (−5) returns exactly to the start;
- clamping keeps the decimals;
- a rendered sheet and plan-field stepping test (0.375 → 0.425; 342.125 → 332.125);
- a static rule: no component rounds, truncates or re-parses a value. Chart axis geometry is exempt.

## Invariant C — one canonical plan-interval derivation (F012)

**Representation.** `derivePlanIntervals` (`src/domain/animal-plan/plan-intervals.ts`) resolves everything once and returns `PlanIntervals`. It resolves:
- the start and sale dates;
- the housing basis (observed, assumed or unknown);
- the phases (`OUTDOORS`/`HOUSED`, `[from, to)` in whole UTC days);
- the housed and outdoor days, and `housedFrom`;
- validity issues.

Rules:
- Housing today means housed every remaining day.
- When the animal is housed now, a planned housing date is not used.
- When housing is unknown, there is no split, but the dates are still checked.

**Consumers:**
- `computeAnimalPlanEconomics` returns it as `intervals` and takes every day count from it, so feed and housing cost, and therefore profit, use those counts.
- The plan timeline is `planTimeline(economics.intervals)`, which adds only wording and bar proportions.
- The row hints come from the same values.
- The component's own `daysBetween` was removed.
- A static test fails if any component, or any C10 module other than `plan-intervals.ts`, computes plan days. Mart report age is a different interval and is exempt.

**F012:** housing on 16 Oct with sale on 4 Dec, observed outdoors, gives 49 housed days and €26.95. The timeline reads "49 days to sale · housed from today (16 Oct), 49 days housed". The browser check matched (49 housed days, €27).

**Boundary tests:** these are table-driven, at domain, presentation and rendered level:
- housing today, tomorrow, midway, and the day before sale;
- housing on the sale date and after sale (invalid);
- housing before today;
- already housed;
- known outdoors;
- unknown with no assumption, with and without a date;
- unknown with an outdoors assumption and with a housed assumption;
- sale on or before today, and unreadable dates.

Phases always tile the interval exactly. Economics equal the canonical split across the whole matrix.

## Self-review

The sweep script is `scratchpad/c10src.txt` plus grep. It covered every C10 source (45 files).

| Search | Matches | Verdict |
|---|---|---|
| `?? []`, `\|\| []`, `?? 0`, `?? ""` | form draft text, the photo store, cost-ledger direct/allocated totals (a known zero inside RECORDED), timeline loops (now paired with gaps), the work-view explanation (now flagged when the record is unavailable), demo fixtures | All of these are legitimate. |
| `Math.round`/`floor`/`ceil`/`trunc`, `toFixed`, `parseInt`/`parseFloat` | `format.ts` (display), chart axis geometry, the gain trace display, exact `Decimal.toFixed()` | Nothing feeds a canonical value. |
| `daysBetween`, housed/outdoor/remaining/total days | `plan-intervals.ts`; economics reading the intervals; the plan timeline reading the intervals; mart report age | One authoritative derivation path. |

One duplicated calendar-date validator in `demo-session.ts` was replaced with `isPlanDate`.

**Residual (low, not changed):** `demo-service` falls back to `""` for the as-of date if the fixed demo viewpoint were unreadable. The viewpoint is a constant, and the fallback would only produce a date-invalid plan.

## Verification (candidate `0e89336`)

| Step | Result |
|---|---|
| Targeted invariant tests | 5 files, 108 tests pass |
| C10 suite (`cattle animal-plan src/components/shell`) | 29 files, 1,187 tests pass |
| Typecheck | pass |
| Lint | 0 errors (2 pre-existing C8 warnings) |
| **Full quality gate** (`quality-20261021T114452Z-60461`, HEAD `0e89336` before and after, tree clean) | **pass**: 315 files / 6,064 tests, typecheck, lint, build |
| Browser (demo, 390 px frames) | No horizontal overflow on herd, group, 1438, 1433 plan, or the failure-scenario herd and profile; no console errors. F005, F007 and F012 confirmed as above. |

## Codex usage

| | |
|---|---|
| Targeted pre-audit | **Not run.** The audit tool's focused modes are bound to the runner's `agent-fix` task state (stale C9), not to a campaign phase, so no meaningfully cheaper C10-bounded audit exists. |
| Final strict audit | **Started once:** `audit-20261021T123946Z-74378`, range `6e81831..0e89336`, verdict **UNASSESSED (QUOTA_EXHAUSTED)**. Not retried, and not treated as a pass. |
| Quota prevented completion | **yes**. Codex said "try again at 5:00 PM". |

Run the final audit once quota is available, against the exact candidate:

```sh
git rev-parse HEAD   # report commit on top of 0e89336 (docs only), or check out 0e89336
AGENT_AUDIT_TIER=strict AGENT_CODEX_TIMEOUT=3600 scripts/agent-audit --campaign 6e81831
```

Note: the campaign range ends at HEAD. Auditing from the report commit adds only this file and an audit record, which are documentation.

## C10 status

**`READY_FOR_FINAL_AUDIT`**

C10 is not frozen or complete. After a clean strict audit, freezing still needs the separately authorised adoption infrastructure described in `C10_REPAIR_REPORT.md` §6.

## Needs human decision

1. Run the one strict audit when Codex quota allows. Then follow the brief's rules:
   - clean → `READY_FOR_ADOPTION`;
   - a recurrence of any of the three families → STOP, with the bypassing path named.
2. The adoption/freeze infrastructure task.
3. Still open:
   - persistence owners;
   - a real mart source;
   - an optional staleness policy;
   - FX.
