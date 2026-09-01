# Codex audit — Phase 1 (visual patterns / nav cutover / Today-Plan-Records) — round 1

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: 7f037bd73cab0e132a110c02e140fdc06c1edea3
PHASE_COMMIT: f58e175675bf564e7c72692f1373b1156c190094

Full raw transcript (Codex's own file reads, in full) is not included here — trimmed to Codex's final report only, per the overnight-run instruction ("Use a temporary output path for Codex's final message and copy it into the audit log").

---

codex
HIGH

- `submitPromptDecisionAction` trusts the entire client-supplied decision, including `calculationKind`, evidence snapshot, calculation version, inputs, prompt ID, and timestamp, and persists it without reconstructing or validating the Prompt server-side ([decisions.ts](/private/tmp/farm-return-audit-phase1/src/app/actions/decisions.ts:24)). `insertDecision` verifies farm ownership and RLS prevents cross-farm access ([decisions.ts](/private/tmp/farm-return-audit-phase1/src/lib/farm-data/decisions.ts:113)), so no cross-farm leak was found; however, any authenticated owner can invoke the server action with fabricated scientific or financial provenance and have Records present it as a real historical fact. The database constraint validates little beyond accepted/edited having `status: "OK"`. This conflicts with the repository’s scientific-honesty and provenance requirements.

MEDIUM

- Decision submission state is retained across prompts. `state` is initialized only once and is never reset when `prompt`, `open`, or `prompt.id` changes ([ExpandedPromptSheet.tsx](/private/tmp/farm-return-audit-phase1/src/components/next/ExpandedPromptSheet.tsx:60)). After accepting or dismissing one Prompt, closing the sheet and opening another shows “recorded to your farm” for the new Prompt and removes its action buttons, although no decision was recorded for it ([ExpandedPromptSheet.tsx](/private/tmp/farm-return-audit-phase1/src/components/next/ExpandedPromptSheet.tsx:134)). Existing tests cover only isolated mounts and miss this real navigation sequence.

- `Sheet` declares a modal dialog but does not trap keyboard focus or make the underlying application inert. It focuses the panel initially and handles Escape, but Tab/Shift+Tab can move into controls behind the overlay ([Sheet.tsx](/private/tmp/farm-return-audit-phase1/src/components/ui/Sheet.tsx:47), [Sheet.tsx](/private/tmp/farm-return-audit-phase1/src/components/ui/Sheet.tsx:67)). This violates expected modal-dialog keyboard behavior. Tests assert opening and dismissal only; they do not test focus containment or restoration.

- Records does not implement the claimed chronological activity timeline. It renders all jobs in one card followed by all unattached decisions in another, irrespective of timestamps. Additionally, de-duplication considers only the capped jobs result ([page.tsx](/private/tmp/farm-return-audit-phase1/src/app/(app)/records/page.tsx:33), [page.tsx](/private/tmp/farm-return-audit-phase1/src/app/(app)/records/page.tsx:55)); a decision whose job falls outside that cap can therefore be presented as an unattached decision. If the jobs query fails, every readable decision is similarly presented as unattached.

LOW

- Raw server/database error messages are rendered directly to signed-in users ([ExpandedPromptSheet.tsx](/private/tmp/farm-return-audit-phase1/src/components/next/ExpandedPromptSheet.tsx:90)). Supabase/Postgres errors can expose table, constraint, or implementation details. The UI should show a stable user-facing failure message while retaining the detailed error only in server-side logging.

- Independent execution could not be completed because dependencies are absent in the audit worktree: `npm test`, `npm run typecheck`, and `npm run lint` respectively failed because `vitest`, `tsc`, and `eslint` were not found. This does not contradict the session’s reported build, but means its green quality-gate claim was not independently reproduced here.

AUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=3 LOW=2
tokens used
52,340
HIGH

- `submitPromptDecisionAction` trusts the entire client-supplied decision, including `calculationKind`, evidence snapshot, calculation version, inputs, prompt ID, and timestamp, and persists it without reconstructing or validating the Prompt server-side ([decisions.ts](/private/tmp/farm-return-audit-phase1/src/app/actions/decisions.ts:24)). `insertDecision` verifies farm ownership and RLS prevents cross-farm access ([decisions.ts](/private/tmp/farm-return-audit-phase1/src/lib/farm-data/decisions.ts:113)), so no cross-farm leak was found; however, any authenticated owner can invoke the server action with fabricated scientific or financial provenance and have Records present it as a real historical fact. The database constraint validates little beyond accepted/edited having `status: "OK"`. This conflicts with the repository’s scientific-honesty and provenance requirements.

MEDIUM

- Decision submission state is retained across prompts. `state` is initialized only once and is never reset when `prompt`, `open`, or `prompt.id` changes ([ExpandedPromptSheet.tsx](/private/tmp/farm-return-audit-phase1/src/components/next/ExpandedPromptSheet.tsx:60)). After accepting or dismissing one Prompt, closing the sheet and opening another shows “recorded to your farm” for the new Prompt and removes its action buttons, although no decision was recorded for it ([ExpandedPromptSheet.tsx](/private/tmp/farm-return-audit-phase1/src/components/next/ExpandedPromptSheet.tsx:134)). Existing tests cover only isolated mounts and miss this real navigation sequence.

- `Sheet` declares a modal dialog but does not trap keyboard focus or make the underlying application inert. It focuses the panel initially and handles Escape, but Tab/Shift+Tab can move into controls behind the overlay ([Sheet.tsx](/private/tmp/farm-return-audit-phase1/src/components/ui/Sheet.tsx:47), [Sheet.tsx](/private/tmp/farm-return-audit-phase1/src/components/ui/Sheet.tsx:67)). This violates expected modal-dialog keyboard behavior. Tests assert opening and dismissal only; they do not test focus containment or restoration.

- Records does not implement the claimed chronological activity timeline. It renders all jobs in one card followed by all unattached decisions in another, irrespective of timestamps. Additionally, de-duplication considers only the capped jobs result ([page.tsx](/private/tmp/farm-return-audit-phase1/src/app/(app)/records/page.tsx:33), [page.tsx](/private/tmp/farm-return-audit-phase1/src/app/(app)/records/page.tsx:55)); a decision whose job falls outside that cap can therefore be presented as an unattached decision. If the jobs query fails, every readable decision is similarly presented as unattached.

LOW

- Raw server/database error messages are rendered directly to signed-in users ([ExpandedPromptSheet.tsx](/private/tmp/farm-return-audit-phase1/src/components/next/ExpandedPromptSheet.tsx:90)). Supabase/Postgres errors can expose table, constraint, or implementation details. The UI should show a stable user-facing failure message while retaining the detailed error only in server-side logging.

- Independent execution could not be completed because dependencies are absent in the audit worktree: `npm test`, `npm run typecheck`, and `npm run lint` respectively failed because `vitest`, `tsc`, and `eslint` were not found. This does not contradict the session’s reported build, but means its green quality-gate claim was not independently reproduced here.

AUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=3 LOW=2
