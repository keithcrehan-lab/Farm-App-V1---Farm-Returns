/**
 * Field-level entry point for the 4-year statutory soil-test disregard
 * rule (`GFT011`-`GFT015`) — a genuinely new `src/domain/` module, per
 * `DOMAIN_CONTRACTS.md`'s own "New contracts this build programme adds"
 * section ("New `src/domain/` modules... join this table via the same
 * process every V1 domain module used: pure function, colocated test
 * file... They are proposed, not frozen, until they ship"). Added
 * Checkpoint 2, Vertical B, for `src/orchestration/prompt/soil-test-age.ts`.
 *
 * Deliberately its own file, not new exports grafted onto an already-
 * frozen module (`nutrients.ts`/`soil-test-validity.ts`) — Codex audit
 * HIGH (`audit-logs/20260829T105330Z.md`, round 18) correctly drew this
 * exact distinction after `checkFieldSoilTestAgeValidity` had briefly
 * lived inside `nutrients.ts`: `DOMAIN_CONTRACTS.md`'s carve-out is for
 * new *modules*, not new exports added to an existing frozen file. This
 * module only ever *imports* from `nutrients.ts`/`soil-test-validity.ts`
 * (`pIndexFromMgL`, `cropGroupForFieldUse`, `checkSoilTestAgeValidity`,
 * `yearsBetweenIsoDates` — every one a real, existing, unmodified export)
 * — neither frozen file gained a single new export or changed signature
 * because of this checkpoint.
 *
 * This module never invents or recomputes a scientific number itself —
 * it derives a real `SoilIndex` directly from `verifiedTest.p` (via
 * `pIndexFromMgL`, `nutrients.ts`'s own evidenced Green-Book banding
 * function) and the test's own age, then calls the frozen
 * `checkSoilTestAgeValidity` unmodified. Never reads a separately-tracked
 * `SoilFertility.pIndex` — see the Codex-audit history below for why.
 *
 * Added Checkpoint 2, Vertical B, across four real Codex audit rounds on
 * `src/orchestration/prompt/soil-test-age.ts`'s early versions:
 *
 * 1. (`audit-logs/20260829T090928Z.md`, HIGH) The first version of this
 *    derivation lived in the orchestration layer, independently
 *    reimplementing the exact decision (NOT_APPLICABLE vs.
 *    BLOCKED_INSUFFICIENT_EVIDENCE vs. a real age check)
 *    `nutrients.ts`'s own `calculateNutrientPlan` already makes for
 *    `NutrientPlan.soilTestAgeValidity` — a real `DOMAIN_CONTRACTS.md`
 *    reuse-boundary violation. Moved into `src/domain/`.
 * 2. (`audit-logs/20260829T091854Z.md`, HIGH) That first domain version
 *    read `field.fertility.pIndex.value` — a separately-tracked value
 *    that can be `"farmer_adjusted"` independent of `verifiedTest`, so it
 *    is not provably *this lab test's own* recorded Index. A first fix
 *    only trusted `status === "verified"`, still not a full proof (a
 *    `"verified"` Index could in principle trace to a *different*,
 *    since-replaced lab test — `SoilFertility` has no field linking the
 *    two).
 * 3. (`audit-logs/20260829T092808Z.md`, HIGH) Correctly rejected that
 *    partial fix as still unsafe. Real fix this round: stop reading the
 *    separately-tracked Index at all — derive it fresh from
 *    `verifiedTest.p` (the raw mg/l reading, part of the *same* `SoilTest`
 *    record as `sampleDate`) via `pIndexFromMgL`. `p` and `sampleDate` are
 *    two fields on the one object; there is no remaining seam through
 *    which a stale or differently-sourced Index could reach this
 *    calculation. `pIndexFromMgL`'s own literal statutory micro-gap
 *    (`AMBIGUOUS_STATUTORY_BOUNDARY`) is propagated honestly, not silently
 *    resolved via `resolvePIndexConservatively` (that function's own doc
 *    comment reserves conservative treatment for an explicit farmer-facing
 *    opt-in, not a background compliance calculation).
 * 4. (`audit-logs/20260829T105330Z.md`, HIGH) This module relocated out
 *    of `nutrients.ts` into its own file for the reason stated above.
 *
 * Deliberately **not** wired into `calculateNutrientPlan` itself —
 * `NutrientPlan.soilTestAgeValidity`'s own inline computation still reads
 * `field.fertility.pIndex.value` directly, unchanged. Two real attempts
 * were made to wire this function in (rounds 8 and 13) and both were
 * reverted; round 13's attempt did the full technical verification
 * `DOMAIN_CONTRACTS.md`'s contract-change protocol asks for and was still
 * the wrong call — `AGENTS.md`'s "Parallel/worktree work" section is an
 * *authority* rule ("stops and documents the need... rather than making
 * the change unilaterally"), not a quality bar a thorough-enough
 * verification can satisfy on this vertical's own say-so. See
 * `calculateNutrientPlan`'s own comment at its call site, and
 * `BLOCKERS.md`, for the complete, final account.
 *
 * Also fails closed (`UNKNOWN_BLOCK`) for a malformed or future-dated
 * `sampleDate`/`asOfDate` — `yearsBetweenIsoDates` can return `NaN` or a
 * negative value for either, and `checkSoilTestAgeValidity` itself only
 * guards `ageYears === undefined` (`GFT015`'s literal "undated test"
 * case). Also rejects a *calendar-invalid* but syntactically-plausible
 * date like `"2025-02-30"` (Codex audit HIGH,
 * `audit-logs/20260829T101336Z.md`): JavaScript's `Date` parser silently
 * rolls such a string over to the next real date (`"2025-02-30"` -> 2
 * March) rather than treating it as invalid, so `yearsBetweenIsoDates`
 * alone would return a finite, plausible-looking age for a date that was
 * never real — `isValidIsoDate` (below) round-trips the parsed date back
 * through `toISOString` and rejects anything that doesn't match its own
 * input exactly, catching this the same way it catches a non-`YYYY-MM-DD`
 * string.
 */
import { blockedInsufficientEvidence, notApplicable, type EngineOutcome } from "./evidence";
import { cropGroupForFieldUse, pIndexFromMgL, yearsBetweenIsoDates } from "./nutrients";
import { checkSoilTestAgeValidity, type SoilTestAgeStatus } from "./soil-test-validity";
import type { FieldUse, SoilTest, TrackedValue } from "./types";

/** The subset of `Field` (`types.ts`) `checkFieldSoilTestAgeValidity`
 * needs — not the whole `Field`, so a caller with just this much data can
 * still call it. */
export interface FieldEvidenceForSoilTestAgeCheck {
  verifiedTest?: SoilTest;
  /** `Field.plannedUse` — determines which statutory P-Index band table
   * applies to `verifiedTest.p` (`cropGroupForFieldUse`, Table 6-4/13-1
   * grassland vs. other_crop). Absent fails closed, never defaulted —
   * `types.ts`'s own `Field.plannedUse` doc comment: "every consumer that
   * needs a land use for a legal/compliance calculation... must treat an
   * absent plannedUse as unresolved, not 'grazing'." (Stricter than
   * `nutrients.ts`'s `calculateNutrientPlan`'s separate NAP-compliance
   * sub-calculation, which still defaults an absent `plannedUse` to
   * `"grass"` for its own, different, unchanged purpose.) */
  plannedUse?: TrackedValue<FieldUse>;
}

/** Real, strict ISO calendar-date validation: `YYYY-MM-DD` syntax *and*
 * a real calendar date (rejects `Date`'s own silent day/month rollover,
 * e.g. `"2025-02-30"` -> 2 March). Not exported — this checkpoint's one
 * real caller, `checkFieldSoilTestAgeValidity`, applies it to *both*
 * dates it reads (`verifiedTest.sampleDate` and `asOfDate` — Codex audit
 * HIGH, `audit-logs/20260829T102057Z.md`, on an earlier version that only
 * validated the former, leaving a caller-supplied `asOfDate` — e.g. a
 * future "run this as of a chosen date" feature — just as exposed to a
 * silent rollover). Every other real `yearsBetweenIsoDates` caller
 * already supplies its own trusted `Date.toISOString().slice(0, 10)`
 * output, not farmer/import/caller-chosen input. */
function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return false;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.toISOString().slice(0, 10) === iso;
}

export function checkFieldSoilTestAgeValidity(
  field: FieldEvidenceForSoilTestAgeCheck,
  asOfDate: string,
): EngineOutcome<SoilTestAgeStatus> {
  const verifiedTest = field.verifiedTest;
  if (verifiedTest === undefined) {
    return notApplicable("NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE");
  }
  if (field.plannedUse === undefined) {
    // Not a registered ReasonCode in evidence.ts's REASON_CODES array —
    // deliberately: that registry lives in a separate frozen file, and
    // ReasonCode/blockedInsufficientEvidence both accept any string at
    // runtime (evidence.ts's own doc comment: "a documentation aid, not a
    // runtime restriction"). Registering it is a real, separate, additive
    // documentation improvement for whoever next reviews `evidence.ts`,
    // not a functional requirement.
    return blockedInsufficientEvidence("MISSING_FIELD_USE_FOR_P_INDEX", ["plannedUse"]);
  }
  // Codex audit HIGH (audit-logs/20260829T102057Z.md): asOfDate is caller-
  // supplied (`calculateNutrientPlan`'s own `input.asOfDate` override, or
  // a future "run as of a chosen date" feature) and was previously never
  // validated the same way `sampleDate` is — a malformed/calendar-invalid
  // asOfDate would reach `yearsBetweenIsoDates` unchecked.
  if (!isValidIsoDate(asOfDate)) {
    return blockedInsufficientEvidence("UNKNOWN_BLOCK", ["asOfDate"]);
  }
  // Codex audit HIGH (audit-logs/20260829T095253Z.md): pIndexFromMgL's
  // comparison chain falls through every real band for a non-finite `p`
  // (e.g. `NaN <= 3.04` is false for every comparison), landing on its
  // final `return ok(4, ...)` — a corrupt raw reading would otherwise
  // silently produce a confident Index 4 and, from there, a real
  // `compliance_value` outcome. Guarded here rather than inside
  // `pIndexFromMgL` itself: that function's own contract (every other real
  // caller already relies on) is "classify this real mg/l number," not
  // "validate untrusted input" — this is the one call site currently
  // reading a raw lab value that could be corrupt before it's ever type-
  // checked, so the guard belongs here. Also rejects a negative reading
  // (Codex audit HIGH, `audit-logs/20260829T100718Z.md`): `P_INDEX_BOUNDS`
  // is defined for a real, physical mg/l concentration, which cannot be
  // negative — `pIndexFromMgL` doesn't itself validate its domain (every
  // other real caller only ever passes a genuine lab reading), so a
  // negative value would otherwise fall through every band's `<=` check
  // upward and land on Index 1's, silently classifying corrupt/negative
  // input as a confident real Index rather than failing closed.
  if (!Number.isFinite(verifiedTest.p) || verifiedTest.p < 0) {
    return blockedInsufficientEvidence("MISSING_SOIL_FERTILITY_INDEX", ["verifiedTest.p (invalid reading)"]);
  }
  const pIndexOutcome = pIndexFromMgL(verifiedTest.p, cropGroupForFieldUse(field.plannedUse.value));
  if (pIndexOutcome.status !== "OK") {
    // pIndexFromMgL only ever returns "OK" or "AMBIGUOUS" (its own doc
    // comment) — propagate the real ambiguity honestly rather than
    // silently resolving it into a firm Index.
    return pIndexOutcome;
  }
  if (!isValidIsoDate(verifiedTest.sampleDate)) {
    return blockedInsufficientEvidence("UNKNOWN_BLOCK", ["soil test sample/report date"]);
  }
  const ageYears = yearsBetweenIsoDates(verifiedTest.sampleDate, asOfDate);
  if (!Number.isFinite(ageYears) || ageYears < 0) {
    return blockedInsufficientEvidence("UNKNOWN_BLOCK", ["soil test sample/report date"]);
  }
  return checkSoilTestAgeValidity({ ageYears, pIndex: pIndexOutcome.value });
}
