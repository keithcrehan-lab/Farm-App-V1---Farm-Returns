# Skill — Targeted Audit

Use this skill for Plan campaign audits and repairs.

## Principle

Audit the complete authorised task delta and the plausible blast radius of that delta. Do not repeatedly reopen unrelated clean domains.

## Audit method

1. Read the immutable task declaration and starting SHA.
2. Inventory the full task diff. Expected-file hints never filter the diff.
3. Map changed code to callers, callees, tests, contracts and canonical data owners.
4. Test the highest-risk invariants touched by the change.
5. Report findings by severity with concrete reproduction/evidence.
6. If a Critical/High finding is fixed, add or strengthen a regression test wherever feasible.
7. Re-review the finding, fix diff and directly related regressions. Do not restart a baseline-wide audit unless escalation conditions are met.

## Plan-specific audit invariants

Where relevant, verify:
- Plan does not become a second source of truth.
- Data-linked progress derives from canonical records.
- Status, readiness, system priority and farmer order are not accidentally conflated.
- Dynamic scope updates deterministically and leaves an explanation/audit trail where material.
- Deduplication prevents multiple active jobs for the same real work where the domain contract calls for one.
- Dependencies and blockers cannot incorrectly mark blocked work Ready.
- Manual override cannot erase the fact that required canonical data remains missing.
- Recommended windows do not masquerade as legal deadlines.
- Unknown values are not converted to zero.
- No AI/model call is used where deterministic state derivation is sufficient.
- Recommendation ranking is independent from supplier commission/monetisation.

## Escalation

Widen beyond the task's normal blast radius only if evidence indicates possible impact to:
- shared/frozen domain contracts,
- canonical persistence/schema ownership,
- statutory/legal logic,
- scientific calculations or evidence lifecycle,
- financial/economic calculations,
- security/privacy boundaries,
- cross-domain invariants used by multiple verticals,
- or multiple unrelated regressions suggesting a systemic defect.

When widening, state why and what additional surface is being reviewed.

## Token discipline

- Reuse deterministic test evidence when the relevant snapshot is unchanged.
- Prefer focused source inspection and targeted regression tests over broad prose review.
- Do not spend a second audit on Medium/Low findings automatically.
- Do not re-audit unrelated slurry, fertiliser, UI or finance surfaces just because a Plan task changed unless dependency tracing shows a real connection.
- A clean primary audit of the full task delta at the closing HEAD is sufficient closure under the existing harness rules.
