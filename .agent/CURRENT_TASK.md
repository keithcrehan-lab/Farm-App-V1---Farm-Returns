# Task: Apply final Codex corrections to Slurry Recommendation Evidence Audit

Perform ONE narrow documentation-only correction pass on:

`docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md`

Do not modify application code.
Do not add migrations.
Do not change tests.
Do not change UI.
Do not resolve scientific questions.
Do not implement recommendation logic.

## Purpose

Incorporate the four independently confirmed Codex findings from:

`.agent/history/audit-20260926T071847Z.md`

The resulting document should become the canonical repository evidence audit for the future slurry recommendation workflow.

---

## Correction 1 — prior slurry nutrients are not safely derivable

The report currently overstates the ability to reconstruct the statutory nutrient ledger from recorded slurry spreading.

Correct this.

Repository evidence shows:

- `SlurrySpreadingActual` does not retain regulatory neat-slurry basis or dilution evidence;
- a recorded physical slurry quantity is not equivalent to regulatory neat slurry;
- multiple fields may share one recorded quantity without a defensible field-level split;
- using `statutoryManureNutrientValue` directly would repeat the physical-volume → neat-volume assumption already identified as unsafe elsewhere.

Therefore classify:

- existing physical slurry application records as **partially reusable evidence**;
- historical agronomic/statutory nutrient reconstruction as NOT safely derivable from those records alone;
- statutory reconstruction as `BLOCKED_BY_UNRESOLVED_SCIENCE` where the required material/neat-volume basis is absent;
- missing field-level allocation/split evidence separately where relevant.

Do not convert recorded physical m3 directly into statutory N/P.

Preserve the principle that existing records should be reused where valid rather than asking the farmer to re-enter data unnecessarily.

---

## Correction 2 — gross area must not substitute for spreadable area

Remove any implementation recommendation that permits:

`spreadable area = gross field area`

for an executable slurry recommendation merely because the assumption is disclosed.

Repository evidence confirms:

- current geometry calculates the whole field polygon;
- current nutrient calculations can divide allocation volume by whole-field area;
- exclusion geometry/buffers are not presently subtracted;
- the report already recognises missing exclusion evidence.

Therefore:

- effective `spreadable_area_ha` must remain UNKNOWN until supported by defensible spatial/exclusion evidence or an appropriately qualified explicit evidence source;
- gross field area may be used for provisional illustrations/research calculations only;
- gross area must NOT produce an executable recommended total slurry volume;
- a scientifically valid m3/ha rate may still exist independently;
- unknown spreadable area should block `TOTAL_VOLUME`, not necessarily `RATE`.

Reflect this explicitly in the five-layer blocking model and implementation sequence.

---

## Correction 3 — laboratory-name validation wording

Correct the report's statement that slurry laboratory name is validated only in the UI.

Repository evidence shows:

- UI validation exists;
- `addSlurryCompositionRecordAction`
  calls `validateNewSlurryCompositionInput`;
- verified composition without a laboratory name is rejected by the server action;
- the database itself does not authenticate or independently verify the claimed laboratory evidence.

Retain the classification:

`EXISTS_WEAK_PROVENANCE`

but describe the enforcement accurately:

> laboratory name is required/validated by UI and server-action validation for the relevant record state, but the persistence layer does not independently verify the authenticity of the laboratory evidence.

---

## Correction 4 — LESS failure reason

Remove wording implying that every positive-volume LESS allocation necessarily fails with:

`BLOCK_NO_INTERPOLATION`

Repository verification showed:

- unsupported DM can produce `BLOCK_NO_INTERPOLATION`;
- unsupported timing can instead produce
  `SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED`;
- the important substantive finding remains that positive-volume LESS scenarios in the tested unsupported contexts remain blocked.

Describe the blocker accurately without overgeneralising the exact reason code.

---

## Preserve independently confirmed findings

Do not weaken or remove the independently confirmed findings that:

- relevant commonage/buffer evidence is omitted from the current What Matters path;
- slurry composition/DM evidence is not fully forwarded through the relevant candidate path;
- archived fields can enter the relevant eligibility path;
- planned slurry allocations lack a complete completion/cancel/release lifecycle;
- outstanding allocations interact with the store-capacity invariant;
- farmer P/K overrides can reach compliance calculations without a sufficiently strong provenance distinction;
- physical volume enters statutory calculations where regulatory neat volume should remain distinct;
- Housing can present placeholder zero nutrient values where the evidence is actually unknown/not calculated;
- prior nutrient application reconstruction is only partial;
- the whole-farm optimiser is not currently wired into the farmer-facing recommendation path;
- the existing provenance/fingerprinting architecture is substantially reusable.

---

## Update implementation dependency sequence

Ensure the recommended build sequence now explicitly includes:

1. allocation lifecycle/reconciliation;
2. evidence/provenance semantic corrections;
3. existing-evidence wiring;
4. farm regulatory context and physical-vs-neat separation;
5. defensible spreadable-area evidence;
6. minimal evidence-check UX;
7. peer-reviewed/frozen scientific rate rules;
8. field rate calculation;
9. whole-farm finite-resource optimisation;
10. farmer override/reallocation;
11. actionability/live E2E validation.

Do not imply that an executable farm allocation can be produced before spreadable-area evidence is defensible.

---

## Output

Modify only:

`docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md`

Provide a concise summary of the four corrections.

Verify command: `npm run typecheck && npm run build`