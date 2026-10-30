# Field → Recommendation flow audit

## Canonical journey

1. **Create the field** — draw the boundary, confirm the derived area, give the field a name.
2. **Recommendation setup opens automatically** for that field.
3. **Crop & production** — one current-season `FieldProductionCycle` is the canonical crop/use record. Capture the supported grass pathway and the production evidence that pathway requires.
4. **Laboratory soil evidence** — enter the dated laboratory pH, P and K result once in the field workspace. Farm Return derives P/K indices through the existing scientific engine and preserves earlier tests in the evidence chain.
5. **Legal & spreading checks** — capture commonage, water-buffer evidence and, only where slurry is actually allocated, its method/date.
6. **Recommendation** — the canonical P3 engine produces gross requirement, organic contribution, remaining chemical need and products. The full calculation/evidence page remains available as drill-down.
7. **Whole-farm Fertiliser Plan** — aggregates the same field outputs for slurry-first planning and procurement. It does not collect the field evidence again.

## Duplicate paths removed

- `Field.plannedUse` is no longer collected or repeated in the field creation/Manage Field/Overview journey. Production cycle is the canonical crop/use input for the recommendation flow. Historical planned-use provenance is retained; no history is deleted.
- The standalone Soil screen no longer edits P/K assumptions or accepts a second laboratory-test entry. It is now a read-only farm evidence overview that links to the field's Recommendation setup.
- The legacy `/nutrients` planner no longer renders a second planner. It redirects to the canonical field workspace and its old client implementation has been removed.
- The separate “Field Nutrient Plan” navigation item is removed.
- Fertiliser overview, map lens and detailed calculation links now return to the field Recommendation setup rather than opening the retired planner.
- In the embedded field setup, Legal/Evidence output disclosures are not repeated below the Legal/Evidence setup stages. They remain on the full calculation page for auditability.
- The field list/header no longer displays the legacy planned-use value.
- Soil crop filters driven by legacy planned use have been removed.

## Deliberately separate, not duplicates

- **Guided soil sampling** records how a sample is taken; **laboratory soil evidence** records the returned lab result. They are different evidence events and remain separate.
- **Full calculation/evidence** is a read-only audit drill-down, not another input screen.
- **Whole-farm Fertiliser Plan** is aggregation/procurement planning, not another field evidence form.
- **Slurry-first future planning** is a forecast scenario and never overwrites today's physical slurry state.

## Scientific stop conditions

A field and soil test alone are not always enough for a defensible recommendation. The engine must also have the crop/production evidence required by the chosen pathway. Grazing additionally depends on farm-level livestock/grassland evidence for statutory stocking rate. Where a chemical recommendation is actionable, the existing commonage and water-buffer gates still fail closed. Where slurry contributes nutrients, application method/date and usable composition evidence are still required.

The UI therefore minimises questions, but it does not remove evidence merely to make the form shorter.
