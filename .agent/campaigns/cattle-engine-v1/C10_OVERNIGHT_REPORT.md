# C10 — Cattle UX/UI — overnight report (2026-10-20 → 2026-10-21)

## 1. Status

**STOPPED — `REPEATED_HIGH_FINDING` (defect family `UNAVAILABLE_AS_EMPTY`).**

STOP: REPEATED_HIGH_FINDING — strict campaign re-audit `audit-20261021T055508Z-36620` raised HIGH F005 in the same defect family (unavailable evidence shown as empty) as audit #1's HIGH F005. The brief makes a recurring High family a hard stop, so there were no further fixes.

C10 is **not accepted** and **not runner-frozen**. Nothing was pushed. C11 was not started.

## 2. Repository SHAs

| | SHA |
|---|---|
| Base (C9 frozen + harness docs) | `6e81831` |
| Brief freeze | `4983911` |
| Core reference experience | `58526f0` |
| Polish / edge states | `5ba21bb` |
| Remediation of audit #1 (F005–F010) | `f6b311d` (audited HEAD) |
| This report + audit records | the commit that adds this file (documentation only) |
| `origin` | `a15553e`, unchanged; nothing pushed |

Delta `6e81831..f6b311d`: 51 files, +6,687 / −99. No frozen or forbidden paths changed, and there are no migrations or persistence changes.

## 3. Implementation

C10 was built by hand, directly on `campaign-cattle-engine-v1`. The runner can't adopt a human-built phase (`UNEXPECTED_INTERVENING_CHANGE`).

- **Screens:** herd overview → group → animal profile → record-weight sheet → animal plan.
- **Demo mode:** a per-browser session. All engines run server-side through stateless actions on the demo session.
- **Presentation layer:** `src/domain/cattle/presentation/` holds the display tables, which are total over the frozen vocabularies. Tones are good / neutral / info / attention / risk / unknown / conflict / review.
- **New patterns:**
  - `EVALUATION_UNAVAILABLE`
  - `Evaluated<T>`
  - `PLAN_CURRENCY = "EUR"`, with non-euro costs UNKNOWN (no FX)
  - `formatMoney`
  - `useDemoView`, a key-scoped loader that drops stale responses
  - `saleWithdrawalNotice`
- **UI rule:** no scientific or financial calculation lives in a UI component.
- **Contracts:** the C10 contract bullets were added to `docs/farm-return-next/DOMAIN_CONTRACTS.md`.

## 4. Journeys 1–10

The reference journey was verified in a browser at phone width:

1. Open the herd.
2. Open the Finishers group.
3. Open animal 1427.
4. Record weight 548.24. The job closes and the screen shows 548.
5. Plan with target 620. The saved confirmation appears.
6. The profile shows "Finishing, 620 kg by 4 Dec 2026".
7. Reopen the plan. It keeps 620.
8. The projection is 599 kg at 1.04 kg/day.
9. The failure scenario shows "Couldn't be checked" and "Not shown: weighings".
10. No console errors.

Sweep: all 24 animal and plan pages had zero horizontal overflow and no errors.

These journeys still have defects, per the open audit findings below:

- A failed group-scope evaluation renders as an empty group (F005).
- Unknown housing yields known economics (F011).
- A refused save of an unchanged plan is silent (F010).

## 5. Design system

The design system reuses the existing `fr-v2` tokens. Mobile-first measures:

- 44px+ touch targets
- a 16px gutter
- chart text 20px on mobile and 12px on desktop
- haloed chart labels
- the chart key in its own row on mobile

The C10 pre-build review is in `C10_PREBUILD_REVIEW.md`.

## 6. Boundaries

- No changes to frozen C0–C9 contracts or Plan semantics.
- C8 economic authority is unchanged.
- No science or price source was invented. Mart prices are synthetic demo data.
- No persistence, schema or migrations.
- No real signed-in account sees demo figures.

## 7. Tests

- **Phase verify:** 25 files and 1,073 tests pass. Typecheck passes. Lint shows 0 errors and 2 pre-existing C8 warnings.
- **Full quality gate** (`quality-20261021T010502Z-20604`, at the pre-remediation tree): 311 files and 5,950 tests pass; typecheck, lint and build pass.
- **Not run:** no full gate was run after `f6b311d`; only the phase verify ran. The full gate takes about 55 minutes.

## 8. Audit findings

| Audit | Range | Result |
|---|---|---|
| `audit-20261021T004656Z-18870` (strict) | `6e81831..5ba21bb` | 0C / 3H / 3M: F005 unavailable-as-empty (programmes), F006 currency, F007 weight rounding, F008–F010 view/form state. All fixed in `f6b311d` with regression tests. |
| `audit-20261021T015919Z-34455` | `6e81831..f6b311d` | UNASSESSED (Codex QUOTA_EXHAUSTED). Retried; not treated as a pass. |
| `audit-20261021T055508Z-36620` (strict) | `6e81831..f6b311d` | **0C / 2H / 1M**, detailed below. |

Findings in `audit-20261021T055508Z-36620`:

- **H F005 `UNAVAILABLE_AS_EMPTY` (recurrence).** `herd-view.ts:87` sets `scopeState: "SCOPE_FAILED"` with `memberCount: 0`, but neither the herd screen nor the group screen reads `scopeState`. A failed group evaluation therefore shows "0 animals" with no notice. Confirmed by inspection.
- **H F011 `UNKNOWN_HOUSING_AS_OUTDOORS` (new family).** In `plan-economics.ts:152`, `currentlyHoused: null` is treated as outdoors. That produces known housed/outdoor day counts, a housing cost and a KNOWN return.
- **M F010 `IGNORED_MUTATION_REJECTION`.** A refused save of an unchanged plan shows no alert, because the alert is gated on `draftDirty` (`AnimalPlanScreen.tsx:379`).

All three records are copied into `audits/`.

**Note:** the audit header shows the runner's stale task title ("Cattle C9 - Plan Interface"). The range is the C10 delta.

## 9. Open decisions (human)

1. **Repeated High family.** How should the `UNAVAILABLE_AS_EMPTY` recurrence be handled?
   - The fix looks local: render `SCOPE_FAILED` on both screens and keep counts unknown.
   - The pattern recurs, though, so a systematic sweep may be wanted: every nullable engine output → an explicit unavailable state, with a test per path.
2. **F011 housing.** What does unknown current housing mean for a plan?
   - Option (a): returns stay UNKNOWN until housing is known.
   - Option (b): the user must state housing as a plan assumption.

   This is an economic-semantics choice, so I didn't make it.
3. **Recording C10.** How should the runner record or freeze a human-built C10?
4. **Persistence owners:** weights, goals, the cost ledger and photos.
5. **Mart source:** a real mart price source.
6. **Demo staleness:** the 28-day policy.
7. **Non-euro costs:** FX handling. Today they are UNKNOWN.

## 10. STOP conditions

| Condition | Result |
|---|---|
| Recurring High family | **Hit**: `UNAVAILABLE_AS_EMPTY` |
| Frozen-contract change | Not hit |
| Persistence or migration | Not hit |
| Unclear owner | Not hit |
| C8 authority | Not hit |
| Invented science or price | Not hit |
| Weakened frozen tests | Not hit |

## 11. Morning-review commands

```sh
git log --oneline 6e81831..HEAD
git diff --stat 6e81831..f6b311d
cat .agent/campaigns/cattle-engine-v1/audits/audit-20261021T055508Z-36620.md
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev -- -p 3100
#   /cattle  /cattle/groups/SYNTH-GROUP-FINISHERS  /cattle/animals/1427  /cattle/animals/1427/plan
#   append ?scenario=PLANNING_RUN_FAILURE  or  ?scenario=EMPTY_HERD
npx vitest run src/domain/cattle src/components/cattle src/domain/animal-plan
# after fixes: AGENT_AUDIT_TIER=strict AGENT_CODEX_TIMEOUT=3600 scripts/agent-audit --campaign 6e81831
```
