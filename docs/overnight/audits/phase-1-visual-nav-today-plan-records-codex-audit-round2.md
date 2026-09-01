# Codex audit — Phase 1 (visual patterns / nav cutover / Today-Plan-Records) — round 2 (fix-verification)

Command: `codex exec --sandbox read-only` from a detached worktree at the round-1 fix commit.
Round-1 PHASE_COMMIT (base for this diff): f58e175675bf564e7c72692f1373b1156c190094
Round-2 commit (current HEAD reviewed): b2021d0f0b48d1a0e1e14a9a715ed1926def316b

Note: Codex correctly observed the round-1 report file didn't exist yet in its worktree at review time (it now does, saved alongside this file) -- it verified round-1 findings against the actual diff/code directly instead, which is the more rigorous check anyway.

---

codex
The round-1 audit file is absent from both current HEAD and the phase commit, so I verified against the findings enumerated in the request and the actual diff/code.

## CRITICAL

None.

## HIGH

None.

Round-1 HIGH — trusted client-supplied evidence: **RESOLVED**. The action now reloads the authenticated farm and field, recomputes the Prompt server-side, and persists that derived evidence. Farm isolation and fail-closed handling are preserved.

## MEDIUM

1. **Records is not ordered by the activity’s actual timestamp.** **Round-1 timeline finding: PARTIALLY RESOLVED.**

   The two sources are now genuinely merged and deduplication no longer relies on the 200-row display query. However, job entries are sorted and displayed using `job.decision.decidedAt` rather than the job completion/update timestamp or the recorded Actual’s observation timestamp ([RecordsPageClient.tsx](/private/tmp/farm-return-audit-phase1-r2/src/app/(app)/records/RecordsPageClient.tsx:34), [JobHistoryCard.tsx](/private/tmp/farm-return-audit-phase1-r2/src/components/farm/JobHistoryCard.tsx:110)). A job decided on 1 August but completed on 1 September will appear among August activity, contrary to the chronological activity-history requirement.

   The capped-dedup defect itself is **RESOLVED**: `listJobDecisionIdsForFarm` queries all statuses independently, detects truncation, and the page fails closed when completeness cannot be established.

2. **The high-risk server action has no direct tests.**

   Component tests only mock `submitPromptDecisionAction`. There are no tests proving that the real action reloads the authenticated farm/field, rejects cross-farm or unknown fields, recomputes each Prompt kind, rejects acceptance after evidence becomes non-OK, or never passes client evidence to persistence ([decisions.ts](/private/tmp/farm-return-audit-phase1-r2/src/app/actions/decisions.ts:62)). The most security- and provenance-sensitive fix therefore lacks regression coverage at its actual boundary.

Round-1 focus-trap finding: **RESOLVED**. Forward and reverse wrapping, initial focus, Escape, and focus restoration are implemented and tested.

## LOW

1. **Prompt-state reset can briefly render stale success state.** **Round-1 stale-state finding: PARTIALLY RESOLVED.**

   Resetting in `useEffect` occurs after React commits the new Prompt render ([ExpandedPromptSheet.tsx](/private/tmp/farm-return-audit-phase1-r2/src/components/next/ExpandedPromptSheet.tsx:82)). Consequently, a newly selected Prompt can receive one committed render showing the previous Prompt’s “recorded” state before the effect resets it. Keying the state by Prompt ID or remounting the state-owning component would avoid that transient false claim.

Round-1 raw-error finding: **RESOLVED**. Full errors are logged, while the farmer sees stable generic copy.

## Verification

`node_modules` is missing. I did not run `npm test`, `npm run typecheck`, or `npm run lint` because this environment is read-only and network-restricted, making dependency installation unavailable. `git diff --check` passed, and the worktree remained unmodified.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=2 LOW=1
tokens used
81,263
The round-1 audit file is absent from both current HEAD and the phase commit, so I verified against the findings enumerated in the request and the actual diff/code.

## CRITICAL

None.

## HIGH

None.

Round-1 HIGH — trusted client-supplied evidence: **RESOLVED**. The action now reloads the authenticated farm and field, recomputes the Prompt server-side, and persists that derived evidence. Farm isolation and fail-closed handling are preserved.

## MEDIUM

1. **Records is not ordered by the activity’s actual timestamp.** **Round-1 timeline finding: PARTIALLY RESOLVED.**

   The two sources are now genuinely merged and deduplication no longer relies on the 200-row display query. However, job entries are sorted and displayed using `job.decision.decidedAt` rather than the job completion/update timestamp or the recorded Actual’s observation timestamp ([RecordsPageClient.tsx](/private/tmp/farm-return-audit-phase1-r2/src/app/(app)/records/RecordsPageClient.tsx:34), [JobHistoryCard.tsx](/private/tmp/farm-return-audit-phase1-r2/src/components/farm/JobHistoryCard.tsx:110)). A job decided on 1 August but completed on 1 September will appear among August activity, contrary to the chronological activity-history requirement.

   The capped-dedup defect itself is **RESOLVED**: `listJobDecisionIdsForFarm` queries all statuses independently, detects truncation, and the page fails closed when completeness cannot be established.

2. **The high-risk server action has no direct tests.**

   Component tests only mock `submitPromptDecisionAction`. There are no tests proving that the real action reloads the authenticated farm/field, rejects cross-farm or unknown fields, recomputes each Prompt kind, rejects acceptance after evidence becomes non-OK, or never passes client evidence to persistence ([decisions.ts](/private/tmp/farm-return-audit-phase1-r2/src/app/actions/decisions.ts:62)). The most security- and provenance-sensitive fix therefore lacks regression coverage at its actual boundary.

Round-1 focus-trap finding: **RESOLVED**. Forward and reverse wrapping, initial focus, Escape, and focus restoration are implemented and tested.

## LOW

1. **Prompt-state reset can briefly render stale success state.** **Round-1 stale-state finding: PARTIALLY RESOLVED.**

   Resetting in `useEffect` occurs after React commits the new Prompt render ([ExpandedPromptSheet.tsx](/private/tmp/farm-return-audit-phase1-r2/src/components/next/ExpandedPromptSheet.tsx:82)). Consequently, a newly selected Prompt can receive one committed render showing the previous Prompt’s “recorded” state before the effect resets it. Keying the state by Prompt ID or remounting the state-owning component would avoid that transient false claim.

Round-1 raw-error finding: **RESOLVED**. Full errors are logged, while the farmer sees stable generic copy.

## Verification

`node_modules` is missing. I did not run `npm test`, `npm run typecheck`, or `npm run lint` because this environment is read-only and network-restricted, making dependency installation unavailable. `git diff --check` passed, and the worktree remained unmodified.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=2 LOW=1
