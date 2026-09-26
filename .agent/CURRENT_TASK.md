# Task: Correct Slurry Recommendation Evidence Audit

Perform ONE narrow documentation-only correction pass on:

`docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md`

Do not modify application code, migrations, tests, UI, schemas or product behaviour.

## Purpose

Correct factual/environment-state issues in the audit and ensure the document distinguishes repository evidence from live-environment evidence.

## Required correction

The audit/build summary currently states or implies that the three 2026-09-25 slurry migrations are not applied to Dev.

That is incorrect.

The following migrations have already been successfully applied to the real `Farm Return V1 Dev` Supabase project and independently verified as present:

- `20260925000000_slurry_allocations_farmer_planned.sql`
- `20260925010000_create_farmer_planned_slurry_allocation_rpc.sql`
- `20260925020000_slurry_allocations_store_capacity_invariant.sql`

Update the audit accordingly.

Because this repository audit did not query Dev, do not make any unsupported claims about current deployment state based solely on repository contents.

Where environment state cannot be established from repository evidence, explicitly say so.

## Also review the document for epistemic accuracy

Without changing the substantive code findings:

- distinguish `confirmed from code` from `requires live/runtime validation`;
- do not describe a code-path concern as a proven live production failure unless the repository evidence logically proves it;
- preserve the findings about:
  - What Matters not forwarding existing commonage/water-buffer evidence;
  - slurry DM not reaching the relevant ranking path;
  - archived fields being included;
  - allocation lifecycle/edit/delete gaps;
  - P/K farmer override versus laboratory provenance;
  - physical slurry being treated as regulatory neat slurry;
  - Housing displaying placeholder zero N/P/K values;
- retain the dependency-based implementation sequence;
- retain all scientific blockers and do not resolve them.

## Output

Modify only:

`docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md`

Provide a concise summary of what was corrected.

Verify command: `npm run typecheck && npm run build`