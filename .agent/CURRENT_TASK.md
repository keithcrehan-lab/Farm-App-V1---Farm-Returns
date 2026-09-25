# Task: Simplify What Matters card

Starting HEAD: auto

Verify command: `npm run typecheck && npm run build`

## Objective

Improve the existing What Matters card on the Today page without changing any domain, economic, ranking, weather or actionability logic.

For an ACTIONABLE recommendation, make the primary information hierarchy:

1. Action + field name
2. Expected net economic benefit
3. Rainfall Window Score
4. One short explanation or details affordance

## Scope

- WhatMattersPilotCard
- Today-page presentation only if required
- desktop and mobile presentation
- focused component tests if needed

## Out of scope

- domain logic
- Phase 5–11 semantics
- ranking/actionability logic
- contractor pricing
- map
- news
- broader Today-page redesign
- migrations

## Acceptance criteria

- audited recommendation behaviour unchanged
- expected economic benefit remains net benefit
- label remains exactly "Rainfall Window Score"
- UNKNOWN and BLOCKED semantics remain unchanged
- no UI-side actionability calculations
- no new domain logic in React
- existing relevant tests remain green
- primary recommendation is visually clearer and less cluttered

## STOP conditions

Stop if the task requires changing domain contracts, actionability semantics, economic calculations or ranking logic.



