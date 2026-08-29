/**
 * The first real Prompt producer (`BUILD_PLAN.md`'s Checkpoint 2, Vertical
 * B, first slice) — proves the Estimate -> Prompt layering
 * `ARCHITECTURE.md` describes actually works end-to-end for one real case,
 * not just documented. Wraps `src/domain/field-soil-test-age.ts`'s
 * `checkFieldSoilTestAgeValidity` (the 4-year statutory disregard rule
 * with its P-Index-4 persistence exception, `GFT011`-`GFT015`) in a
 * presentable `Prompt`, via `buildPrompt` (`./index.ts`) so the blocked-
 * description guarantee is structural for this producer, not
 * caller-discipline.
 *
 * This module makes zero decisions about the underlying Estimate — every
 * NOT_APPLICABLE/BLOCKED_INSUFFICIENT_EVIDENCE/AMBIGUOUS/real-age-check
 * branch lives in `checkFieldSoilTestAgeValidity` itself
 * (`src/domain/field-soil-test-age.ts` — see that module's own doc
 * comment for why it's a standalone module, not new exports added to
 * `nutrients.ts`/`soil-test-validity.ts`), not here. This module only
 * supplies presentation copy (`title`/`description`) for each of the
 * outcome's real arms — the `basis` field on the returned `Prompt` is
 * always the exact `EngineOutcome` that domain call returned.
 */
import { checkFieldSoilTestAgeValidity, type FieldEvidenceForSoilTestAgeCheck } from "@/domain/field-soil-test-age";
import { cropGroupForFieldUse, NUTRIENT_ENGINE_VERSION } from "@/domain/nutrients";
import {
  SOIL_OM_MAX_AGE_YEARS,
  SOIL_TEST_MAX_AGE_YEARS,
  SOIL_TEST_VALIDITY_VERSION,
  type SoilTestAgeStatus,
} from "@/domain/soil-test-validity";
import type { Field } from "@/domain/types";
import { buildPrompt, type Prompt } from "./index";

/** `Prompt.kind` for every Prompt this module produces. */
export const SOIL_TEST_AGE_PROMPT_KIND = "soil_test_age";

/**
 * The one real, farm-scoped source this producer reads from — a single
 * `Field` record, not separately-suppliable id/farmId/name/soil-test
 * parameters.
 *
 * Codex audit findings across four rounds
 * (`audit-logs/20260829T085255Z.md` HIGH, `20260829T085836Z.md` CRITICAL,
 * `20260829T090356Z.md` CRITICAL, `20260829T091854Z.md`/
 * `20260829T092808Z.md` HIGH) on this function's earlier versions: each
 * still let a caller pair one field's identity with another field's (or
 * another farm's, or a stale/differently-sourced) evidence, whether via a
 * hand-typed id/name bag, a separately-supplied pre-computed `basis`, a
 * separately-supplied raw `{ageYears, pIndex}` input, or a
 * separately-tracked `fertility.pIndex` not provably from the same lab
 * test. Fixed for real by removing every such seam: `promptForSoilTestAge`
 * takes only this one `Field`, and `checkFieldSoilTestAgeValidity`
 * derives the P-Index it needs directly from `fertility.verifiedTest.p`
 * (the same object that carries `sampleDate`) rather than from any
 * separately-tracked value. There is no remaining parameter through which
 * a caller could supply evidence for a field other than the one named by
 * `id`/`farmId`.
 */
export type SoilTestAgeField = Pick<Field, "id" | "farmId" | "name" | "fertility" | "plannedUse">;

/**
 * Real, honest copy for each arm `checkFieldSoilTestAgeValidity` can
 * actually return under `status: "OK"` — `VALID` and `INDEX4_PERSISTED`
 * deliberately say different things, per `soil-test-validity.ts`'s own
 * doc comments (a persisted Index 4 result is not the same claim as "this
 * test is still fresh").
 *
 * Codex audit finding (HIGH, `audit-logs/20260829T090356Z.md`): the
 * numeric thresholds mentioned in this copy are interpolated from the
 * real exported `SOIL_TEST_MAX_AGE_YEARS`/`SOIL_OM_MAX_AGE_YEARS`
 * constants, never hand-typed digits — this copy states no number
 * `soil-test-validity.ts` doesn't itself define, and can never drift from
 * it.
 *
 * `VALID`/`INDEX4_PERSISTED` are deliberately narrowed to what the age
 * outcome itself proves (whether age disqualifies the test), never a
 * broader "usable for nutrient planning" claim — the underlying check
 * doesn't evaluate the separate georeference/LPIS requirement or OM
 * validity limit, both real, separate gates in the same module this
 * Prompt's `basis` never ran (Codex audit HIGH,
 * `audit-logs/20260829T085255Z.md`, on an earlier, broader-claiming
 * version of this copy). `DISREGARD` is the one arm where the stronger
 * claim is still honest: age-disregarded is disqualifying on its own,
 * independent of what any other gate would say.
 */
function describeSoilTestAgeOk(
  value: SoilTestAgeStatus,
  fieldName: string,
): { title: string; description: string } {
  switch (value) {
    case "VALID":
      return {
        title: `Soil test age within limit — ${fieldName}`,
        description: `${fieldName}'s most recent soil test is within the ${SOIL_TEST_MAX_AGE_YEARS}-year statutory disregard limit — its age does not disqualify it. (This checks age only; the georeference/LPIS requirement and the ${SOIL_OM_MAX_AGE_YEARS}-year OM validity limit are separate checks.)`,
      };
    case "INDEX4_PERSISTED":
      return {
        title: `Soil test age exception applies (Index 4) — ${fieldName}`,
        description: `${fieldName}'s soil test is ${SOIL_TEST_MAX_AGE_YEARS} years old or older, but it recorded P Index 4. Under the statutory disregard rule's Index-4 exception, its age does not disqualify it — the Index 4 result persists rather than expiring. (This checks age only; the georeference/LPIS requirement and the ${SOIL_OM_MAX_AGE_YEARS}-year OM validity limit are separate checks.)`,
      };
    case "DISREGARD":
      return {
        title: `Soil test needs renewing — ${fieldName}`,
        description: `${fieldName}'s soil test is ${SOIL_TEST_MAX_AGE_YEARS} years old or older and did not record P Index 4, so under the statutory ${SOIL_TEST_MAX_AGE_YEARS}-year disregard rule it can no longer be used for nutrient planning. A new soil test is needed for this field.`,
      };
  }
}

/**
 * Builds a real `Prompt` for one field's soil-test age.
 * `field.fertility.verifiedTest`/`field.plannedUse` are passed straight to
 * `checkFieldSoilTestAgeValidity` (`FieldEvidenceForSoilTestAgeCheck`) —
 * this function makes no decision about which `EngineOutcome` arm
 * applies; that logic lives entirely in `src/domain/field-soil-test-age.ts`.
 * An absent `plannedUse` fails closed inside that domain function
 * (`MISSING_FIELD_USE_FOR_P_INDEX`) rather than being assumed — this
 * producer does not work around that by guessing a land use itself.
 *
 * `asOfDate` (ISO date, defaults to the real current date) follows the
 * same explicit-date-parameter convention `nutrients.ts`'s
 * `calculateNutrientPlan` already uses for the same calculation — never
 * read internally via `Date.now()`/`new Date()` without being an
 * explicit, overridable input.
 *
 * `calculationVersion` combines the real, exported versions of *both*
 * domain modules that materially determine `basis`:
 * `SOIL_TEST_VALIDITY_VERSION` (the 4-year disregard rule itself) and
 * `NUTRIENT_ENGINE_VERSION` (`nutrients.ts`, which owns `pIndexFromMgL`'s
 * statutory P-Index band table — a later change to that table changes
 * this result just as much as a change to the disregard rule would).
 * Codex audit finding (HIGH, `audit-logs/20260829T100014Z.md`): an
 * earlier version cited only `SOIL_TEST_VALIDITY_VERSION`, so a future
 * P-Index-table change would silently go unrecorded here.
 *
 * `inputsSnapshot` carries the real raw inputs `checkFieldSoilTestAgeValidity`
 * was actually fed for this call — `sampleDate`/`rawPMgL` (the lab test's
 * own recorded values, the same object `basis` was derived from),
 * `plannedUse`/`cropGroup` (which statutory P-Index band table applied —
 * `cropGroup` computed the same way `checkFieldSoilTestAgeValidity`
 * itself derives it, from the real `cropGroupForFieldUse`, not
 * reimplemented), `asOfDate`, and `rule` (a human-readable citation of
 * the statutory basis). This is the checkpoint's real answer to
 * `SCIENTIFIC_RULES.md`'s "which Estimate, which evidence, which legal
 * check" requirement surviving past the moment this `Prompt` (never
 * persisted) or the `Field` it was computed from (mutable — a later
 * lookup could see a changed test) may have changed; see
 * `Prompt.inputsSnapshot`'s own doc comment for why an earlier round's
 * "cross-reference the live Field later" argument, however
 * well-precedented against `NutrientPlan`, wasn't actually a sufficient
 * answer to that requirement.
 *
 * `regulatory: "compliance_value"` — the 4-year disregard rule (and its
 * Index-4 exception) is a statutory NAP requirement governing whether a
 * soil test may be used for nutrient planning, not a general planning
 * suggestion (`RegulatoryStatus`, `nutrients.ts`'s own
 * planning_advice/compliance_value precedent for NAP-derived checks).
 *
 * For every non-OK arm (`NOT_APPLICABLE` — no lab test at all;
 * `BLOCKED_INSUFFICIENT_EVIDENCE` — no `plannedUse` captured, or an
 * undated/malformed/future-dated test, `UNKNOWN_BLOCK`; `AMBIGUOUS` — the
 * lab test's raw P reading falls in the literal statutory Index-3/4
 * micro-gap `pIndexFromMgL` itself cannot resolve) — `description` comes
 * from `buildPrompt`'s own call to `describeBlockedBasis`, not from any
 * string this function supplies; see `buildPrompt`'s doc comment for why
 * that is structural, not caller-discipline.
 */
export function promptForSoilTestAge(field: SoilTestAgeField, asOfDate: string | undefined, createdAt: string): Prompt {
  const resolvedAsOfDate = asOfDate ?? new Date().toISOString().slice(0, 10);
  const evidence: FieldEvidenceForSoilTestAgeCheck = {
    verifiedTest: field.fertility.verifiedTest,
    plannedUse: field.plannedUse,
  };
  const basis = checkFieldSoilTestAgeValidity(evidence, resolvedAsOfDate);
  return buildPrompt({
    id: globalThis.crypto.randomUUID(),
    farmId: field.farmId,
    fieldId: field.id,
    kind: SOIL_TEST_AGE_PROMPT_KIND,
    basis,
    createdAt,
    regulatory: "compliance_value",
    calculationVersion: `${SOIL_TEST_VALIDITY_VERSION}+${NUTRIENT_ENGINE_VERSION}`,
    inputsSnapshot: {
      sampleDate: field.fertility.verifiedTest?.sampleDate,
      rawPMgL: field.fertility.verifiedTest?.p,
      plannedUse: field.plannedUse?.value,
      cropGroup: field.plannedUse === undefined ? undefined : cropGroupForFieldUse(field.plannedUse.value),
      asOfDate: resolvedAsOfDate,
      rule: "GFT011-GFT015 — 4-year statutory soil-test disregard rule, P-Index-4 persistence exception (rules_statutory/soil_test_compliance_rules_2026.csv); P Index derived via nutrients.ts's pIndexFromMgL (rules_statutory/soil_phosphorus_index_2026.csv)",
    },
    titleWhenBlocked: `Soil test status needs review — ${field.name}`,
    describeOk: (value) => describeSoilTestAgeOk(value, field.name),
  });
}
