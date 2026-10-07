# Task: Farm Spatial V2 — Today capability inventory reconciliation

Task ID: farm-spatial-v2-today-capability-inventory-reconciliation-20261007
Starting HEAD: 886e492b5f9d1964faf5e0a0e2f8fd959cc27b33
Verify command: `git diff --check`

## Objective

Reconcile the Farm Spatial V2 Phase 1 implementation map before any production UI work begins.

This is a documentation/reference-integrity task only. Do not change production UI, domain logic, orchestration, routes, navigation, database schema, tests unrelated to this documentation, or agent harness behaviour.

## Scope

1. Audit the complete current production `/today` screen and its directly rendered components/data paths.
2. Compare that real capability set against section 9 of `docs/farm-spatial-v2/IMPLEMENTATION_MAP.md`.
3. Extend T1–T13 with T14+ for every materially user-facing or operational capability that currently exists but is missing from the preservation inventory.
4. For each added capability:
   - name the real producer/component/data source;
   - state whether it must remain on Farm Spatial V2 or remain safely reachable elsewhere;
   - do not invent functionality that does not exist.
5. Specifically verify whether contextual Ask AI, mobile/tablet opportunity access, secondary-feed access, field drill-down/navigation, and any other current Today affordances are already represented. Add them only if genuinely missing.
6. Recompute SHA-256 for every file listed in:
   `design/reference/farm-spatial-v2/approved/CHECKSUMS.json`
   and confirm they match exactly.
7. Replace the reference-integrity "Open item" in the implementation map with the actual verified result.
8. Update the repository's required BUILD_STATE / IMPLEMENTATION_LOG records for this task.

## Constraints

- Documentation/reference verification only.
- No production code changes.
- No design changes.
- No changes to the approved reference files themselves.
- No mock values introduced anywhere.
- Preserve the existing REAL / REAL-needs-wiring / NEW HELPER / NEW DOMAIN AGGREGATE / PLACEHOLDER vocabulary.
- Do not reinterpret scientific, regulatory, economic or fertiliser contracts.
- Do not broaden into Phase 2 implementation.

## Acceptance criteria

- Section 9 is a complete source-backed preservation inventory for the current `/today` surface.
- No existing Today capability can be silently deleted in Phase 2 simply because it was omitted from the inventory.
- Every added inventory item points to an existing source/component/path.
- Approved reference checksums are independently recomputed and all match `CHECKSUMS.json`.
- The old checksum open item is resolved in the documentation.
- Required build-state / implementation-log updates are present.
- Production source code is unchanged.

## Required tests / verification

- Confirm reference SHA-256 values against `CHECKSUMS.json`.
- `git diff --check`
- Confirm no production source files changed.

## Out of scope

- unrelated Farm Return features;
- harness/runner changes unless explicitly named by the task;
- migrations unless explicitly authorised;
- pushes/deployments;
- secrets;
- external research unless explicitly allowed.

## STOP conditions

Stop with:

BUILD_RESULT: BLOCKED <reason>

if:

- task requires unsupported scientific interpretation;
- task requires external evidence not already available;
- task requires a migration without explicit authorisation;
- task requires frozen-contract changes not explicitly authorised;
- task scope materially expands;
- acceptance criteria contradict existing code/contracts;
- required files/context are unavailable.
