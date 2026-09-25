# Live Audit: What Matters slurry completion flow

## Mode

This is a LIVE END-TO-END RUNTIME AUDIT.

Current expected branch:
`farm-return-next`

Current expected HEAD:
`f9c480a`

Do not modify source files.
Do not commit anything.
Do not fix defects during this audit.

Normal Dev UI writes required to exercise the farmer flow are allowed, but document every persisted data change you make.

Use headed Playwright/Chromium so the audit is visible while it runs.

Target:
`http://localhost:3000/today`

Reuse the existing authenticated Dev session if available.
Do not clear cookies or local storage unnecessarily.

## Goal

Verify the complete farmer journey introduced by the recent What Matters work:

Today
→ missing slurry planning information detected
→ Add spreading details
→ existing canonical field/slurry editor
→ complete only missing data
→ save
→ Back to Today
→ What Matters reevaluates from persisted data
→ correct next state appears

Judge actual runtime behaviour, not the implementation report.

---

## 1. Environment verification

Before interacting:

- confirm repository path
- confirm branch is `farm-return-next`
- confirm HEAD is `f9c480a` or report the actual HEAD
- confirm working tree state
- confirm the running localhost server belongs to this repository
- confirm authenticated Dev account

Do not continue against another worktree.

---

## 2. Desktop initial state

Use 1440×900.

Open `/today`.

Capture screenshot before interaction.

Record:

- exact What Matters message
- whether `Add spreading details` appears
- which field it relates to
- what information Farm Return says is missing
- whether any internal codes/implementation terminology are visible
- console errors
- failed network requests

Verify the message does not promise that completing the data will necessarily create an actionable recommendation.

---

## 3. Follow Add spreading details

Click the real CTA.

Verify:

- destination exists
- correct field opens
- correct existing editor/tab opens
- farmer can understand why they were sent there
- existing persisted values are preserved
- only genuinely missing inputs are requested

Check specifically:

### Method missing, date known
If current Dev data exposes this:
- method should be requested
- existing date should not need re-entry

### Date missing, method known
If current Dev data exposes this:
- date should be requested
- existing method should not need re-entry

### Both missing
If current Dev data exposes this:
- both should be requested

Do not fabricate state through direct database edits merely to reach these scenarios.

If current Dev data cannot exercise a scenario, report it as UNREACHABLE.

---

## 4. Save real missing details

For one normal single-source allocation:

- enter valid missing spreading details through the UI
- save using the canonical existing save flow
- record exactly what Dev data was changed
- confirm success state
- use `Back to Today`

Do not invent unsupported spreading methods or scientific assumptions.

---

## 5. Verify reevaluation

After returning to Today:

Confirm that What Matters evaluates the newly persisted server data.

Verify:

- old missing-details CTA does not remain stale
- old explanatory message does not remain because of client state
- persisted method/date survive refresh
- What Matters moves to whatever state the real audited pipeline produces

Possible valid next states include:

- ranked opportunity
- NEEDS_CONFIRMATION
- unsupported scientific evidence
- missing economic evidence
- no positive economic opportunity
- regulatory/actionability restriction

Do not expect or force ACTIONABLE.

Capture screenshot of the resulting state.

Hard refresh `/today`.

Confirm the same persisted state survives refresh.

---

## 6. Request-order / stale-state behaviour

Observe runtime behaviour around save and reevaluation.

Look for:

- old confirmation result overwriting newer evaluation
- stale loading state
- duplicate evaluations
- flicker back to old CTA
- stale contractor-rate result
- request loops

Do not manufacture arbitrary timing hacks.

If the real UI naturally exposes overlapping requests, test them.

Otherwise report the race as NOT REPRODUCED rather than claiming it passed empirically.

---

## 7. Failed-save retry

If a failed save can be produced safely through the real UI without corrupting Dev data:

Test:

failed save
→ return/remain on flow
→ retry successfully
→ return to Today
→ What Matters reevaluates
→ stale CTA does not remain

Do not break application configuration or directly corrupt the database just to manufacture a failure.

If this cannot safely be exercised, mark it UNREACHABLE IN LIVE DEV and rely on regression-test coverage.

---

## 8. Multi-source slurry allocation

Inspect whether current Dev data contains a field receiving slurry from more than one housing/source allocation.

If yes:

- verify it does NOT receive a misleading `Add spreading details` CTA when the current resolver cannot make it a candidate
- verify farmer-facing explanation is truthful
- verify no internal implementation terminology leaks

Do not change the resolver or invent a combined date.

If no such Dev example exists, report UNREACHABLE.

---

## 9. Mobile verification

Switch to 390×844.

Repeat the important visible journey:

- Today
- What Matters missing-details state
- CTA
- destination editor
- missing-input UI
- Back to Today
- resulting What Matters state

Check:

- horizontal overflow
- clipped controls
- overlapping text
- CTA visibility
- save button accessibility
- date/method controls
- Back to Today
- What Matters position in page hierarchy

Capture screenshots.

---

## 10. Navigation and runtime health

Inspect:

- console errors
- page exceptions
- HTTP failures
- failed server actions
- hydration warnings
- stale state
- unexpected redirects
- broken field links
- duplicate saves
- unexpected refreshes

Do not report a warning as an application defect unless it is reproducible and attributable.

---

## Required final report

Return:

### CURRENT HEAD

### LIVE AUDIT VERDICT

Choose one:

- WORKING
- PARTIALLY WORKING
- BROKEN
- BLOCKED

Then provide:

| Flow/state | Result | What actually happened | Defect / UX issue | Severity |

Cover at minimum:

- initial Today state
- CTA visibility
- correct field destination
- adaptive missing inputs
- save
- Back to Today
- reevaluation
- refresh persistence
- stale-response behaviour
- failed-save retry
- multi-source case
- desktop
- mobile
- console/network

Then:

## TOP ISSUES FOUND

Only include issues actually observed or independently reproduced.

## WHAT WORKS AND SHOULD NOT BE REDESIGNED

## DATA CHANGES MADE

List every Dev data value changed during the audit.

## SCREENSHOTS

List path and what each screenshot proves.

Save artifacts under:

`/tmp/farm-return-slurry-completion-audit/`

## UNREACHABLE STATES

Clearly list anything current Dev data could not exercise.

Do not modify source files.
Do not fix issues.
Stop after producing the audit.