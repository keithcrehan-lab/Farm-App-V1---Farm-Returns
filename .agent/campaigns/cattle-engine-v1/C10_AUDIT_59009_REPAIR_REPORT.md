# C10 — strict audit 59009 structural repair report

**Status: `READY_FOR_FINAL_STRICT_AUDIT`**

Codex usage in this task: ZERO

## Repository
| | |
|---|---|
| Branch | `campaign-cattle-engine-v1` |
| Starting HEAD / production SHA | `66abde8` (docs-only: audit 59009 evidence) / `42405c8` — verified, no `src` change above it |
| Implementation commit | `2a31681` |
| **Final production candidate** | **`2a31681`** |
| Report HEAD | this docs-only commit on top of `2a31681` |
| Working tree / pushed / receipt / frozen | clean / no / none / no |

## F015 (High) — every target comparison kept
- **Root cause:** `headlinePerformance` and the profile target line read `perf.comparisons[0]`; C5 defines no precedence between targets.
- **Rule:** one comparison → its own state; several with one state → that state, `target.summary` "On track across 2 targets"; several that differ (incl. a conflict or an unusable comparison beside a resolved one) → `TARGET:MIXED` "Mixed target results". `target.comparisons` lists every comparison with its own state, value, band and the source of the exact version C5 compared (conflicting versions said as such; was `versions[0]`). Profile, herd row and rendered list agree.
- **Withdrawal (CL-011, same family):** C3 gives one gate entry per queried food product → `health.withdrawals` (one row per product), each medicine's withdrawal per product, `saleWithdrawalNotices` one notice per product that bears on the sale date, naming it ("Check it before any sale for slaughter"); no product-to-slaughter rule invented. The single-product demo reads as before.
- **Also repaired (sweep):** a job headline over several open blockers in different states (was the first blocker's) → `BLOCKER:MIXED`; each blocker's wording now uses that blocker's own kind (was "any blocker on the item"); `demoProjection` reads the requested animal by id (was `animals[0]`).

### First-item sweep (C10: presentation, animal-plan, cattle-demo, components)
| Read | Classification |
|---|---|
| `comparisons[0]` ×2, `targetDef.versions[0]` | **repaired** (unowned) |
| `withdrawalGate.entries[0]`, `e.withdrawals[0]` | **repaired** (CL-011) |
| `blockers[0]` headline; `items.find(... blocker id)` wording | **repaired** |
| `demo-service` `evaluation.animals[0]` | **repaired** (keyed by animal) |
| `work.open[0]` (profile primary), herd `open[0]` (next job) | owner order — Plan-kernel priority (`animalWork`); others listed / counted; annotated `first-item:` |
| `goals[0]`, `blockers[0]` / `comparisons[0]` after `size === 1`, `replacedBy[0]`, `recordIds[0]`, `[...locations][0]`, `soleActiveGoal` | guarded singletons |
| `byScheme.find(scheme)`, `series/performance/recommendations/ledgers .find(animalId)`, `targetDefinitions.find(targetId)`, `plan groups .find(identityKey)`, `MARTS.find(martId)`, `HerdScreens groups.find(groupRef)` | keyed lookups (owner-unique keys) |
| `phases.find(HOUSED)` (one housed phase by derivation), `cost-ledger currencies[0]` (only when one currency), demo mart band `rows.find` (non-overlapping fixture bands), `REASON_COPY.find` (C10's own ordered copy table), `lastInterval` reverse-find ("Most recent", chronological) | owner-defined singleton / order |
| `words[0]` (singular/plural pair), `format.ts` regex groups, photo-store local ids, `medicines.items[0].label` (fallback label of an ITEMS list) | not result collections |
Structural test: every `[0]` / `.at(0)` / `.slice(0, 1)` in presentation must be a guarded singleton or carry a `first-item:` owner-order note.

## F016 (High) — numbers accepted or refused, never rewritten
- **Root cause:** `onChange={… .replace(/[^\d.]/g, "")}` in Record Weight and the plan's NumberField stripped characters before validation.
- **Architecture:** `parseNumericInput(raw, NumericFieldSpec)` — raw text kept as typed → parse/validate → canonical exact decimal text → display formatting separate. Field specs (`NUMERIC_FIELDS`): WEIGHT_KG (>0, ≤2000, 2 dp), TARGET_KG (>0, ≤2000, 2 dp), PLAN_AMOUNT (≥0, ≤9,999,999.9999, 4 dp — the economics' own input bound); all positive-only (no universal rule: `allowNegative` per field). `stepNumericInput` steps exactly and leaves invalid text alone.
- **Comma/dot:** "52.1" / "52,1" → 52.1; "0.35" / "0,35" → 0.35. One separator only. "1,000" (comma before exactly three digits) and grouped forms are refused: "Enter the number without a thousands separator."
- **Refused, text kept:** "-12" (NEGATIVE), "1e3", "12abc", "1.2.3", ",,", "1,2.3" (SYNTAX), too many decimals, out of range — each with a visible `role="alert"` message and `aria-invalid`; save blocked; no previous value overwritten.
- **Numeric-field sweep:** Record Weight scale reading; plan target weight; concentrate kg/day; concentrate €/tonne; forage €/day; housing & bedding €/day — all through the parser. Dates use native date inputs (not numeric). Plan economics receive only parsed canonical text (invalid raw passes unchanged and is refused by `readNumber`). Server actions validate numbers with zod (unchanged). Structural test bans `.replace(`, `Number(`, `parseFloat(`, `parseInt(`, `valueAsNumber`, `type="number"` in cattle components.
- **Precision:** 548.24 + 5 = 553.24 (and from "548,24"); F007 tests green.

## F017 (Medium) — price basis kept
Per-head comparable: range "(€1,800/head – €2,200/head)", basis "€/head as reported", no "/kg", no "× projected weight"; projected sale value UNKNOWN "a per-head price can't be moved to a new weight" (economics unchanged); current value per head shown. Per-kg comparable unchanged. Sweep: the only basis-bearing strings are `priceRange`, the sale-value hint and `basis` — all now follow `valuation.basis`.

## F018 (Medium) — shared Sheet
Record Weight uses `src/components/ui/Sheet` unchanged (outside C10 scope, so not modified): focus moves in, Tab / Shift+Tab trapped, Escape closes (topmost only), focus restored, body scroll locked, dialog semantics. The bespoke cattle Sheet is removed. The scale reading is focused inside the trapped panel (microtask after the Sheet's own focus). Visual: the panel chrome and title bar are the shared component's; the C10 form inside is unchanged.

## Previous invariants
All prior suites green (unavailable vs empty, sealed boundary, measured vs estimated, housing mapping, precision, plan intervals, save feedback, no staleness rule, fixture mart, no FX, assumptions, negative / tiny projection, 90-day horizon, lb target, multiple goals, goal history, deadline wording). Two existing tests updated for shape only: `health.withdrawal` → `health.withdrawals[0]` (single-product demo); the focus test awaits the microtask.

## Verification (exact candidate `2a31681`)
| Check | Result |
|---|---|
| New tests | `c10-audit-59009.test.tsx`: 41 (F015 ×9, CL-011 ×2, F016 ×24, F017 ×2, F018 ×1, structural guards ×2) |
| Mutations | first comparison only → 5 fail; first withdrawal only → 2 fail; `.replace(/[^\d.]/g, "")` stripping → 5 fail; per-head as /kg → 1 fails; sheet without focus trap → 1 fails. All restored byte-identical. |
| C10 suite | 32 files, 1,333 tests pass |
| Full quality gate `quality-20261023T123333Z-62420` | **pass** — 318 files, 6,210 tests; typecheck pass; lint 0 errors (2 pre-existing C8 warnings); build pass |
| HEAD before/after gate | `2a31681` / `2a31681`, tree clean |

## Frozen contracts
No C0–C9 file changed. Changes: `src/components/cattle`, `src/domain/cattle/presentation`, `src/server/cattle-demo`, `docs/farm-return-next/DOMAIN_CONTRACTS.md`. The shared `src/components/ui/Sheet.tsx` is imported, not modified.

## Known findings
| Finding | Status |
|---|---|
| Audit 59009 F015 (H), F016 (H), F017 (M), F018 (M) | closed `2a31681` |
| Claude audit CL-001 – CL-009 (4 H, 5 M) | closed (`4ab6ed6`, `42405c8`) |
| Audit 97274 F005 / F013 / F014 (H) | closed (`8148e35`) |
| CL-011 (Low, first withdrawal) | closed `2a31681` |
| Open Lows (accepted follow-up) | CL-010 undated non-medicine health records not listed; CL-012 future-dated cost entries not surfaced; CL-013 rest — timeline / plan-timeline dates drop the year |

**Critical: none known open · High: none known open · Medium: none known open.**

## Next
One Codex strict whole-phase audit of `6e81831..2a31681` (separate task). Freeze still needs the separately authorised adoption mechanism.
