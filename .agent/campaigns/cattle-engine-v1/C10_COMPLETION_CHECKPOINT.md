# C10 completion — durable checkpoint

Updated at every stage of the C10 autonomous completion run (brief: "FARM RETURN — C10 AUTONOMOUS COMPLETION", 2026-10-21).

| | |
|---|---|
| Stage | 8 — F001 (audit 76481, 0C/1H/0M) repaired in `512cab8`; gate `quality-20261023T151202Z-79562` pass (6,215 tests). Final Codex strict audit of `6e81831..` this commit next. |
| HEAD at checkpoint | this docs commit on top of `512cab8` |
| Last implementation candidate | `512cab8` |
| Working tree | clean |
| Pushed | never |
| C10 receipt / frozen | no / no |

## Completed
- `512cab8`: audit 76481 F001 repair — a Plan job keeps the evidence it was raised on (origin captured at creation, C8 record bound by pack id, current state reported separately) — report `C10_AUDIT_76481_REPAIR_REPORT.md`; evidence `audits/audit-20261023T133302Z-76481.*`.
- `2a31681`: audit 59009 structural repair (F015 every target comparison + first-item sweep + CL-011 per-product withdrawals; F016 one strict numeric parser; F017 price basis; F018 shared Sheet) — report `C10_AUDIT_59009_REPAIR_REPORT.md`.
- `66abde8`: strict audit `audit-20261023T114455Z-59009` of `42405c8` preserved (0C/2H/2M/0L, FAILED).
- `42405c8`: known-Medium repair (CL-005 "<1 kg", CL-006 90-day planning horizon, CL-009 goal version markers) — report `C10_FINAL_MEDIUM_REPAIR_REPORT.md`.
- `4ab6ed6`: Claude audit 2026-10-22-1 High repair (CL-001 projection admission, CL-002 goal read, CL-003 every goal in force, CL-004 exclusive deadline wording) — report `C10_FINAL_HIGH_REPAIR_REPORT.md`.
- `8148e35`: consolidated repair of F005 / F013 / F014 (+ related: health-record class, R7 omission rule, band label in presentation, non-finite → UNKNOWN). C10 suite 1,248 pass; browser-verified zero-projection path on localhost demo.
- `6991b85`: failed strict audit `audit-20261021T210236Z-97274` of `2c23760` preserved (FAILED · NOT ACCEPTED · NOT FROZEN).

## Findings of audit 97274 (repaired in `8148e35`, pending re-audit)
- F005 HIGH — unresolved goal target weight silently omitted (`AnimalProfileScreen.tsx:147`).
- F013 HIGH — DERIVED weight badged "Observation" (`timeline.ts:88`).
- F014 HIGH — zero projected weight → KNOWN "€Infinity/kg" (`plan-economics.ts:229`).

## Latest quality gate
`quality-20261021T215955Z-1156` on `8148e35`: pass (317 files, 6,125 tests, typecheck, lint, build). Previous: `quality-20261021T170145Z-81849` on `2c23760`.

## Latest strict audit
`audit-20261022T020709Z-16440` on `8148e35` (rerun 03:07 after the announced 03:02 reset): QUOTA_EXHAUSTED (exit 4) again — Codex now reports the limit lifts 2026-10-27 06:33 local. Unassessed, not a pass. In-session hourly wakeups stopped (a 5-day wait is not an in-session retry).
Earlier: `audit-20261021T225547Z-15226` on `8148e35`, range `6e81831..8148e35`: QUOTA_EXHAUSTED (exit 4) — unassessed, not a pass. Codex: usage limit, retry after 2026-10-22 03:02 local. Worktree `scratchpad/audit-8148e35` (branch `audit-c10-candidate-8148e35`) kept: a rerun resumes this audit.
Previous: `audit-20261021T210236Z-97274` on `2c23760`, range `6e81831..2c23760`: 0C / 3H / 0M / 0L.

## Claude-audit track (2026-10-22)
Result: `audits/claude-audit-20261022-1.md` (verbatim report), `.status.md`, `.probes.md`. Highs: CL-001 negative C5 projection shown as known on profile + chart; CL-002 timeline drops lb goal target; CL-003 only `activeGoals[0]` shown; CL-004 hard deadline "by 12 Oct" against an exclusive end (late on 12 Oct). All 4 reproduced by the coordinator.

A fresh read-only Claude subagent audits the full C10 delta `6e81831..8148e35` from detached worktree `scratchpad/claude-audit-8148e35`. This is an independent CLAUDE audit — not the Codex strict audit the runner requires (`scripts/agent-campaign-run` checks the auditor line `auditor: codex …`). Report to be preserved as `audits/claude-audit-20261022-<n>.md`.

## Next exact action
One final independent Codex strict whole-phase audit of `6e81831..2a31681` (separate task):
`git worktree add -b audit-c10-candidate-2a31681 <scratch>/audit-2a31681 2a31681 && cd <scratch>/audit-2a31681 && AGENT_AUDIT_TIER=strict AGENT_CODEX_TIMEOUT=3600 scripts/agent-audit --campaign 6e81831`
Earlier notes (superseded):
Await the user's decisions above. No repair is to start without them. Codex strict audit remains required for freeze:
After 2026-10-27 06:33 local (or once Codex credits are available), rerun the strict campaign audit of `6e81831..8148e35` from the existing worktree (do not recreate it):
`cd <scratch>/audit-8148e35 && AGENT_AUDIT_TIER=strict AGENT_CODEX_TIMEOUT=3600 scripts/agent-audit --campaign 6e81831`
If the worktree is gone: `git worktree add -b audit-c10-candidate-<sha> <scratch>/audit-<sha> <sha> && cd <scratch>/audit-<sha> && AGENT_AUDIT_TIER=strict AGENT_CODEX_TIMEOUT=3600 scripts/agent-audit --campaign 6e81831`

## STOP — decisions required (2026-10-22)
1. **Authorise a C10-local structural repair** (no frozen-contract change):
   - A. `ProjectionRead`: admit C5 projections once, so a non-positive or non-finite value becomes UNUSABLE, with one display rule for positive values that round to 0 kg. The profile label, chart overlay, plan economics and plan rows all consume it.
   - B. `GoalRead`: carries every ACTIVE goal, a three-state target per goal (KNOWN / UNRESOLVED(recorded) / NOT_SET) and a date status (AHEAD / TODAY / PASSED). The profile, timeline (with SUPERSEDED markers), plan goal row, sale-date source and save intent all consume it.
   - C. `DeadlineRead`: one exclusive-end phrasing for hard deadlines and windows.
   - D. An enforcement test (TS-checker rule, like R1–R7): raw C5 `projection.kg`, C6 `targetWeight`/`activeGoals` and C9 `hardDeadline.dueIso` may only be read inside the admission module.
   - Plus the in-scope Medium/Low items: CL-007, CL-008, CL-009, CL-010–013, and the year in headings.
2. **Product decision, CL-003:** how several active goals are shown, and which one sets the plan's default sale date and projection date. Proposal: list all; the earliest-dated active goal drives the plan, which names it.
3. **Product/science decision, CL-005/CL-006:** a plausibility floor or horizon cap needs a sourced rule. Display-only mitigations need no number: "<1 kg" instead of "0 kg", a projected-weight-loss warning, and an extrapolation note when the sale date is beyond the evidence window.
4. **Wording, CL-004:** "Must be done before 12 Oct 2026" or "Last day: 11 Oct 2026".

## Freeze / adoption assessment (2026-10-22)
- `scripts/agent-campaign-run` validates a receipt's strict audit through `audit_problems`. That check requires the artifact's auditor line to start `auditor: codex` with `tier=strict model=gpt-6-astra reasoning=high`, and requires C=H=M=0.
- `origin: legacy-manual` receipts are only accepted for `kind: legacy` phases pinned in the manifest. C10 is `kind: campaign`.
- `.agent/README.md` says "never replace independent review with self-review". AGENTS.md says "never skip an audit because the audit tool is temporarily unavailable — retry".
- **So a Claude audit cannot freeze C10 under the existing framework.** Accepting one would change the audit requirements, which this brief forbids.
- The compliant route needs two things:
  - (a) a clean Codex strict audit, with Codex unavailable until 2026-10-27 06:33;
  - (b) a separately authorised manual-phase adoption mechanism in `agent-campaign-run`. It would record a manually built campaign phase (base `6e81831`, freeze SHA, passing gate log at the freeze SHA, Codex strict artifact with C=H=M=0) as a receipt with a distinct origin such as `manual-adopted`, validated like a normal receipt. Not implemented.

## Blockers
- Audit: Codex quota exhausted (23:56 on 10-21; rerun 03:07 on 10-22 reports reset 2026-10-27 06:33). NO automatic resumption is configured — a human (or a new session) must start the rerun.
- Freeze: the established protocol freezes only through `scripts/agent-campaign-run` (strict audit CRITICAL=HIGH=MEDIUM=0 → receipt → docs closure). The runner has no C10 task state (`--status`: C10 STOPPED PHASE_NOT_READY, stale). To be resolved at closure.
