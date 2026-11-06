# Task: Farm Return 10x workflow integration v1

Task ID: farm-return-10x-workflow-integration-v1-20261106
Starting HEAD: 4746a0a0594d30e498ff6e7e30f066b41044e093
Verify command: `npm run typecheck && npm run build`

# Farm Return 10x Workflow Integration V1

## Objective
Apply the “detect → pre-fill → farmer confirms → propagate → remember” UX principle across the highest-value existing Farm Return workflows. Reuse the production capabilities already in the repository instead of creating parallel systems. This task is specifically about removing repeated navigation/data entry and making the existing field, GPS, production-cycle, grass, soil-sampling and job-session capabilities work together.

## Scope
1. **Bulk field actions**
   - Turn the existing Fields “Select multiple” mode into a useful action surface.
   - Provide a safe bulk action to set the canonical field production-cycle crop/use for a selected season across selected fields.
   - Provide a safe explicit “carry current settings forward” action for a future season across selected fields where a current production cycle exists.
   - Use the canonical field-production-cycle actions/data layer; do not write legacy `plannedUse` as a competing source of truth.
   - Preserve per-field provenance and existing evidence; only overwrite the crop/use fields the farmer explicitly confirms.
   - Show selection count/area, target season, action summary and a confirmation step before saving.
   - Partial failure must be reported per field; never claim the whole bulk action succeeded if it did not.

2. **Universal Field Mode**
   - Extract/reuse the existing GPS-to-field capability (`findNearbyField`, current location providers) into a shared field-context UX.
   - Surface a clear “Field mode” entry point from the main Farm/Today map and Fields.
   - When location is available, suggest the likely mapped field and require farmer confirmation.
   - Once confirmed, show only real quick actions that already have production routes/capabilities:
     - Open field workspace.
     - Record grass for this field.
     - Start/review soil sampling for this field.
     - Open this field’s nutrient/fertiliser work.
     - If there is a real current actionable prompt/job for that field, open that existing action path.
   - Do not fabricate cattle/EID actions or unsupported operations.

3. **Guided Grass Walk**
   - Add a guided walk mode to the existing Grass screen, reusing the existing persisted cover observations and GPS assistance.
   - A farmer can start a walk, see progress (measured / remaining fields), record a reading, and advance to the next field without repeatedly choosing from the field dropdown.
   - Prefer the live GPS-suggested field when confidence is sufficient; farmer still confirms.
   - After a successful reading, advance to the next unmeasured field in the current walk.
   - Preserve the existing normal single-reading workflow and all existing evidence/freshness semantics.

4. **Carry-forward / “only ask what changed”**
   - Surface the repository’s existing future-season carry-forward behaviour as an explicit farmer workflow instead of making the farmer open every field.
   - For next-season setup, show which selected fields can be carried forward, which already have a target-season cycle, and which have no current cycle to copy.
   - Farmer confirmation creates/updates only the target-season cycle; current season remains untouched.
   - Do not invent agronomic values or silently fill missing evidence.

5. **Reuse existing soil sampling, offline job sessions and Confirm Actual**
   - Do not duplicate these systems.
   - Make them discoverable from Field Mode / field context where appropriate.
   - Where Today already has a canonical prompt that can start a job session or Confirm Actual, keep that as the action owner and link to it rather than creating a second “complete operation” implementation.

6. **Map/lens integration**
   - Keep the existing Current / Grass / Nutrients / Conditions lens architecture.
   - Field Mode and bulk actions should preserve the same field identity/selection mental model.
   - Do not add a “Schemes” or other field lens unless the repository already has real field-level data to support it.

7. **Small adjacent wins only where they reuse existing data contracts**
   - Housing: if safe with existing storage, offer “Add another like this” to prefill structural shed details while never copying live fill/observation state.
   - Records/Finance, document OCR, EID/RFID, generic field observations and broader offline support are out of scope unless a real durable production contract already exists in the repo. Do not add dead buttons, fake extraction, fake scanning, or local-only data that looks persisted.

## Out of scope
- No new scientific, regulatory or financial calculations.
- No new migration or schema change.
- No production deployment or push.
- No modification of the Schemes adviser implementation files; that build is continuing separately.
- No OCR/AI document extraction without an existing real service and persistence path.
- No cattle EID/RFID integration without a real device/input contract.
- No new map layer that implies unsupported data.
- No duplicate offline architecture; reuse the existing outbox where it already applies.

## Acceptance criteria
- Existing Fields multi-select no longer ends with “bulk planning isn’t available yet”; at least the canonical production-cycle bulk workflows above are usable end to end.
- Bulk actions are farmer-confirmed, farm-scoped, provenance-safe and tested for mixed success / missing current cycle / existing target cycle.
- Today and Fields expose Field Mode using the shared GPS-to-field logic and confirmed-field quick actions.
- Field Mode never auto-claims a field when GPS confidence is insufficient.
- Grass has a guided walk mode with real progress and next-field advancement after successful save.
- Existing soil-sampling and job-session/Confirm Actual routes are reused, not reimplemented.
- Future-season carry-forward is explicit, target-season-only and does not fabricate missing agronomic evidence.
- Existing standard workflows remain available and unchanged when the new modes are not used.
- Mobile-first accessibility: minimum existing tap-target conventions, labelled controls, keyboard-safe on desktop.
- All touched behaviour has focused tests; no regression to existing Fields, Grass, Today, soil-sampling or production-cycle tests.

## Required tests
- Focused Vitest for new bulk production-cycle actions/domain helpers.
- Fields page tests covering selection → bulk action → confirmation → success/partial failure.
- Shared Field Mode tests for GPS suggested, ambiguous/no suggestion, confirm, quick links.
- Today and Fields integration tests for Field Mode entry point.
- Grass tests for start walk, progress, GPS suggestion, save-and-advance, finish walk.
- Existing soil-sample and job-session/Confirm Actual tests must continue to pass when affected.
- Typecheck, scoped lint and Next build.

## STOP conditions
- A required workflow needs a database migration or destructive schema change.
- A proposed quick action has no real production route/action behind it.
- Carry-forward would require fabricating scientific/agronomic values rather than explicit farmer confirmation of existing recorded settings.
- A change would require editing the active Schemes adviser implementation files.
- A frozen/shared contract must change non-additively.
