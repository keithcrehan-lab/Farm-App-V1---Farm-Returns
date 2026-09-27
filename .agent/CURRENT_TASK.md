cat > .agent/CURRENT_TASK.md <<'EOF'
# Task: Phase 1B.1 — Fix slurry lifecycle stale refresh handling
Starting HEAD: 98fcd8b

## Context

Phase 1B currently has one remaining Codex finding:

### [MEDIUM] Failed refresh leaves completed plans active while reporting success

Location:

`src/store/farm-store.tsx:561`

Observed behaviour:

- lifecycle mutation succeeds on the server;
- subsequent slurry-plan refresh fails;
- `refreshSlurryPlan` swallows the error;
- `runRemoteLifecycle` still reports success;
- UI closes the sheet and can continue showing the old active planned record and stale volume summary.

This must be fixed before Phase 1B is frozen.

Do not alter Phase 1A database lifecycle semantics.

---

## Objective

Make lifecycle mutations and stale-state handling truthful when the mutation succeeds but the subsequent read/refresh fails.

The UI must never imply that fresh canonical state has been loaded when it has not.

---

## Required behaviour

If a lifecycle mutation succeeds but the refresh/read fails:

- preserve the fact that the server mutation succeeded;
- do NOT report that the plan was successfully refreshed;
- mark the displayed slurry-plan state as stale;
- do not present stale data as current;
- provide a clear retry mechanism;
- preserve enough UI context for the farmer to understand what happened.

Plain-language behaviour should be similar to:

> Your change was saved, but the latest slurry plan could not be refreshed.

Provide a retry action such as:

`Refresh plan`

Do not expose internal error codes.

---

## Completion case

If:

1. farmer marks allocation as spread;
2. completion succeeds remotely;
3. refresh fails;

then:

- do not imply the allocation is still definitely active;
- do not show stale active actions as if canonical state is current;
- show stale-state messaging;
- allow refresh retry.

Do not attempt to undo the successful completion locally.

Server state remains authoritative.

---

## Edit and cancellation cases

Apply the same truthfulness rules to:

- edit;
- cancellation.

If the mutation succeeds but refresh fails:

- the mutation remains successful;
- displayed lifecycle data becomes stale;
- stale data must not be presented as canonical current state;
- farmer gets a refresh retry.

---

## Stale rejection case

If a lifecycle action is rejected because canonical server state has changed, and the subsequent refresh also fails:

- do not claim that the latest plan has been loaded;
- surface a stale-state message;
- provide refresh retry;
- do not optimistically overwrite canonical state.

---

## State model

Prefer an explicit stale/refresh-error state over silently swallowing refresh errors.

Do not introduce duplicated lifecycle truth in React.

The store may track display freshness, but canonical lifecycle state remains server/database authoritative.

Lifecycle mutation outcome and subsequent refresh outcome must be represented separately.

---

## Active actions while stale

When lifecycle state is known to be stale:

- do not allow stale cards to continue offering Edit, Cancel or Mark as spread as though their state is current;
- disable or suppress lifecycle mutation actions until canonical state is refreshed;
- clearly explain that the plan needs refreshing.

Do not infer terminal or active state locally after a failed read.

---

## Retry

Add a farmer-facing retry path.

On successful retry:

- clear stale state;
- replace old displayed lifecycle data with canonical refreshed data;
- restore normal actions only when the refreshed record is still eligible;
- update current/reserved/unallocated figures from canonical refreshed data.

On failed retry:

- remain stale;
- retain farmer-readable recovery messaging;
- do not leak internal error strings.

---

## Error language

Do not expose:

- raw server exceptions;
- SQL errors;
- lifecycle enum errors;
- internal refresh error names.

Use plain farmer-facing language.

Example:

> Your change was saved, but the latest slurry plan could not be refreshed.

and:

> We couldn't refresh your slurry plan. Try again.

---

## Tests

At minimum add regression coverage for:

A. successful completion + failed refresh;

B. successful edit + failed refresh;

C. successful cancellation + failed refresh;

D. stale lifecycle rejection + failed refresh;

E. UI does not say the plan was refreshed when refresh failed;

F. stale state is visible;

G. retry action is available;

H. lifecycle action buttons are unavailable while state is stale;

I. successful retry clears stale state;

J. successfully refreshed terminal allocation no longer exposes active lifecycle actions;

K. successful retry updates summary volumes from canonical state;

L. failed retry leaves stale state intact;

M. stale UI does not expose internal error codes.

Run relevant targeted tests.

---

## Scope

Do not change:

- Phase 1A SQL;
- reconciliation semantics;
- capacity semantics;
- scientific logic;
- recommendation logic;
- the already-audited unknown-store totals fix.

This is a UI/store truthfulness and recovery fix only.

Do not add a database migration.

---

## Definition of done

- mutation success and refresh success are represented separately;
- refresh failures are no longer swallowed;
- stale lifecycle UI is clearly identified;
- stale lifecycle actions are not presented as safe/current;
- retry works;
- successful retry restores canonical state;
- farmer-readable messaging is used;
- tests pass;
- typecheck passes;
- build passes.

Verify command: `npm run typecheck && npm run build`
EOF

./scripts/agent-status