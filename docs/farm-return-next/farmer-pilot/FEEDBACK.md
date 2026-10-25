# Farmer Pilot — feedback ledger

Add one row per finding.

**Field values:**
- **Impact:** BLOCKER / HIGH FRICTION / LOW FRICTION / POSITIVE / REQUEST.
- **Frequency:** the number of pilot farmers affected.
- **Interpretation:** OBSERVED FACT / USER REQUEST / PRODUCT JUDGEMENT.
- **Status:** OPEN / WATCH / VALIDATED / PLANNED / REJECTED / FIXED.

**Rules:**
- Leave "Proposed response" blank unless it's obvious.
- Priority (P0–P3, see README) is assigned only after at least 3 sessions.
- Nothing here is built automatically.

**Session results** (one line per session):

| Farmer/session | Date | Time to first value | Would use again |
|---|---|---|---|

**Findings:**

| ID | Farmer/session | Date | Area | Observation | Trying to do | Expected by farmer | What happened | Impact | Frequency | Evidence | Interpretation | Proposed response | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| K1 | KNOWN PRE-PILOT | 2026-10-25 | What Matters / prices | What Matters reads CSO prices only from persisted rows (operator sync); Market Prices and the Fertiliser Plan use the CSO series built into the app | — | — | What Matters can say price evidence is unavailable while other screens show CSO prices | LOW FRICTION | 0 | Signed-in walkthrough | PRODUCT JUDGEMENT | | WATCH |
| K2 | KNOWN PRE-PILOT | 2026-10-25 | Manage herd | The Total Cattle live weight is based on group-level averages | — | — | It says "Live weight not recorded" even when an individual animal has a weight | LOW FRICTION | 0 | Signed-in walkthrough | OBSERVED FACT | | WATCH |
| K3 | KNOWN PRE-PILOT | 2026-10-25 | Plan | Closed-period notices are listed under "Genuine opportunities" | — | — | Prohibitions read as opportunities | LOW FRICTION | 0 | Signed-in walkthrough | OBSERVED FACT | | WATCH |
| K4 | KNOWN PRE-PILOT | 2026-10-25 | Records | The technical "Inputs" line shows raw codes | — | — | Machine codes are visible | LOW FRICTION | 0 | Signed-in walkthrough | OBSERVED FACT | | WATCH |
| K5 | KNOWN PRE-PILOT | 2026-10-25 | Dev data | The development farm contains QA/test rows (test shed, QA quotes, the animal "test") | — | — | Test rows appear in dev | LOW FRICTION | 0 | Signed-in walkthrough | OBSERVED FACT | | WATCH |
