cat > .agent/CURRENT_TASK.md <<'EOF'
# Task: Phase 1B.2 — Prevent stale lifecycle sheets reopening terminal allocations
Starting HEAD: d5d1a2a

## Context

Codex found one remaining Phase 1B.1 regression:

### [MEDIUM] Refresh retry can reopen actions for a terminal allocation

Location:

`src/components/farm/SlurryPlanLifecycle.tsx:234`

Observed sequence:

1. farmer opens a lifecycle sheet;
2. mount/plan refresh is pending;
3. refresh fails;
4. stale state hides the sheet, but selected `sheet.record` remains retained;
5. retry succeeds;
6. canonical refreshed allocation is now completed or cancelled;
7. stale state clears;
8. old retained sheet selection can reopen with mutation controls from the previously active record.

The UI must never expose Edit, Cancel or Mark as spread for an allocation that canonical refreshed state says is terminal.

---

## Objective

Make lifecycle sheet selection freshness-safe.

Selected lifecycle UI state must never survive a stale/fresh transition in a way that can re-enable actions for a completed or cancelled allocation.

---

## Required behaviour

When slurry-plan freshness becomes stale:

- clear the selected lifecycle sheet;
- close any open lifecycle dialog/sheet;
- do not retain an actionable stale record in hidden UI state.

After canonical refresh succeeds:

- do not automatically reopen the previously selected sheet;
- lifecycle actions must only be available for records that are currently present in the refreshed active/eligible allocation set;
- completed and cancelled records remain history-only.

If the farmer wants to act again after refresh, they must select a currently eligible active record from the refreshed UI.

---

## Selection validation

Any function that opens an Edit, Cancel or Mark-as-spread sheet must validate against current refreshed lifecycle state.

Do not trust an old retained object reference.

Prefer resolving the current record by canonical allocation ID from the latest active records at interaction time.

If no current eligible active record exists:

- do not open lifecycle actions;
- do not infer that the previous state is still valid;
- optionally show a plain message such as:

> This spreading plan has changed. Refresh the plan and try again.

Do not expose internal lifecycle enums or errors.

---

## Retry semantics

On failed refresh:

- stale state remains;
- selected sheet is cleared;
- lifecycle mutation controls remain unavailable.

On successful retry:

- stale state clears;
- refreshed canonical plan is rendered;
- no previous sheet auto-reopens;
- completed/cancelled records expose no active actions;
- active records regain actions normally.

---

## Tests

At minimum add regression coverage for:

A. active sheet open → refresh fails → selected sheet is cleared;

B. refresh retry succeeds with the allocation now completed → sheet does not reopen;

C. refresh retry succeeds with the allocation now cancelled → sheet does not reopen;

D. refreshed terminal allocations expose no Edit, Cancel or Mark as spread actions;

E. refreshed active allocation can be selected again manually and opens normally;

F. stale hidden `sheet.record` cannot re-enable actions;

G. no internal error strings are shown;

H. existing Phase 1B.1 stale/retry tests continue to pass.

Run targeted lifecycle UI tests.

---

## Scope

Do not change:

- Phase 1A SQL;
- lifecycle persistence semantics;
- reconciliation semantics;
- capacity semantics;
- scientific logic;
- recommendation logic;
- unknown-store totals handling.

No database migration.

This is a UI state/freshness safety fix only.

---

## Definition of done

- stale transition clears actionable sheet selection;
- successful retry does not reopen stale selection;
- sheet actions are resolved from current refreshed eligible records;
- terminal allocations cannot regain lifecycle mutation controls;
- targeted tests pass;
- full tests pass;
- typecheck passes;
- build passes.

Verify command: `npm run typecheck && npm run build`
EOF

./scripts/agent-status