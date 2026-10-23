# C10 — strict audit 76481 repair report (F001)

**Status: repaired, gate passed — submitted to one final Codex strict audit of `6e81831..` the commit carrying this report**

Codex usage during investigation and implementation: ZERO

## Repository
| | |
|---|---|
| Branch | `campaign-cattle-engine-v1` |
| Previous candidate / audit | `2a31681` / `audit-20261023T133302Z-76481` (0C/1H/0M/0L) — evidence `audits/audit-20261023T133302Z-76481.*` |
| Implementation commit | `512cab8` |
| Report HEAD | this docs-only commit on top of `512cab8` (no `src` change) |
| Pushed / receipt / frozen | no / none / no |

## F001 (High) — a job left open after replay loses its "Why?" evidence
- **Reproduction (before repair, `2a31681`):** `demoAnimalView({version:1,events:[{kind:"RECORD_WEIGHT",eventId:"w1",tag:"1442",kg:500,observedDate:"2026-10-15"}]},"1442")`. The back-dated weight leaves the RECORD_WEIGHT job open (only a weight on/after its creation closes it) — correct — but its "Why?" had no C8 output reference, evidence pack, evidence strength, limitations or unknowns, and no unavailable notice.
- **Root cause (C10-owned):** the demo replay (`src/server/cattle-demo/demo-replay.ts`) kept Plan jobs open across runs but did not keep the evidence that raised them; `work-view.ts` resolved the "Why?" group and C8 record from the **latest** run (`groupOf` / `recordOf`). Once C8/C9 no longer proposed the action, the evidence silently vanished while the job stayed open.
- **Family:** JOB_PROVENANCE_LIFETIME — new; not a recurrence of UNAVAILABLE_AS_EMPTY or first-item.

## Repair (`512cab8`)
- `CattlePlanJobState.origin: CattlePlanJobOrigin | null` (`at`, the C9 proposal `group`, and `recommendation`: `BOUND` record / `NOT_C8` / `UNAVAILABLE`).
- At creation, `jobOrigin` keeps the group whose `identityKey` equals the job's and binds the C8 record **by pack id** only when exactly one record matches the group's cited outputs; otherwise `UNAVAILABLE` (never guessed). A group that cites no C8 output is `NOT_C8` and C8 is not run.
- `whyOf` builds "Why?" **only** from the origin. Missing origin → "The evidence this job was raised on wasn't kept, so it isn't shown."; unreadable record → "…couldn't be read when it was raised, so its evidence and assumptions aren't shown." Nothing is borrowed from a later run.
- Current state is separate: `why.raised` — "Raised <date>" and `STILL_RAISED` / `NO_LONGER_RAISED` ("That was the reason when it was raised. The latest records no longer raise it on their own; it stays open until it's done as described below.") / `UNKNOWN` (latest outputs unreadable — never read as "no longer raised") / `CLOSED`. Rendered in `WorkPanel` (Why block and primary job).
- Latest-run group still used only for blocker wording, falling back to the origin group.
- Files: `src/server/cattle-demo/demo-replay.ts`, `src/domain/cattle/presentation/{cattle-outputs,work-view}.ts`, `src/components/cattle/WorkPanel.tsx`, `DOMAIN_CONTRACTS.md` note. No C0–C9 file changed.

## Regression tests — `src/components/cattle/c10-audit-76481.test.tsx` (5)
1. Creation with valid evidence: origin BOUND, group kept, `raised` "Raised 16 Oct 2026" / STILL_RAISED; one evidence pack.
2. Auditor's case (replay while the job stays open): job still "To do"; evidence identical to before (pack, source, origins, limitations non-empty); NO_LONGER_RAISED with its note; latest run has no RECORD_WEIGHT group; WorkPanel renders the note.
3. Repeated replay: evidence unchanged and deterministic.
4. Missing (`origin: null`) or `UNAVAILABLE` evidence: no pack, matching caveat, nothing from the current run.
5. Binding: BOUND with the real C8 record; UNAVAILABLE on pack-id mismatch or C8 failure; herd-wide every job BOUND exactly when its group cites C8; synthetic non-C8 group → NOT_C8 and C8 never run.

**Mutations:** origin not kept → tests 1, 2, 3, 5 fail; "Why?" from the latest run (the original defect) → tests 1, 2, 4 fail. Both restored byte-identical (`cmp`).

## Verification (exact `512cab8`)
| Check | Result |
|---|---|
| C10 suite | 33 files, 1,338 tests pass |
| Full quality gate `quality-20261023T151202Z-79562` | **pass** — 319 files, 6,215 tests; typecheck pass; lint 0 errors (2 pre-existing C8 warnings); build pass |
| HEAD before/after gate | `512cab8` / `512cab8`, tree clean |

## Previously repaired findings (still in force)
| Audit | Findings | Repair |
|---|---|---|
| 59009 | F015 (H) every target comparison / `TARGET:MIXED`; F016 (H) one strict numeric parser, no rewriting; F017 (M) price basis kept (€/head); F018 (M) shared focus-trapped Sheet | `2a31681` — `C10_AUDIT_59009_REPAIR_REPORT.md` |
| Claude 2026-10-22-1 | CL-001 – CL-009 (4 H, 5 M) | `4ab6ed6`, `42405c8` |
| 97274 | F005, F013, F014 (H) | `8148e35` |

Open Lows (accepted follow-up): CL-010, CL-012, CL-013 remainder.

**Critical: none known open · High: none known open · Medium: none known open.**
