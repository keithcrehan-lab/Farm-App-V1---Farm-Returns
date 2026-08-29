import { describe, expect, it } from "vitest";
import { NUTRIENT_ENGINE_VERSION } from "@/domain/nutrients";
import { SOIL_OM_MAX_AGE_YEARS, SOIL_TEST_MAX_AGE_YEARS, SOIL_TEST_VALIDITY_VERSION } from "@/domain/soil-test-validity";
import type { FieldUse, SoilTest, TrackedValue } from "@/domain/types";
import { describeBlockedBasis } from "./index";
import { promptForSoilTestAge, SOIL_TEST_AGE_PROMPT_KIND, type SoilTestAgeField } from "./soil-test-age";

const ASOF = "2026-08-29";
const createdAt = "2026-08-29T09:00:00Z";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// calculationVersion now combines both real domain module versions that
// materially determine this result (Codex audit HIGH,
// audit-logs/20260829T100014Z.md): the disregard rule itself
// (SOIL_TEST_VALIDITY_VERSION) and the P-Index band table
// (NUTRIENT_ENGINE_VERSION, nutrients.ts's pIndexFromMgL).
const EXPECTED_CALCULATION_VERSION = `${SOIL_TEST_VALIDITY_VERSION}+${NUTRIENT_ENGINE_VERSION}`;

function plannedUse(value: FieldUse): TrackedValue<FieldUse> {
  return { value, status: "verified", source: "Farmer" };
}

/** `p` chosen from the real Green Book grassland bands (`P_INDEX_BOUNDS`,
 * `nutrients.ts`): Index 2 (<=5.04), Index 4 (>8.01). */
function verifiedTest(sampleDate: string, p = 4): SoilTest {
  return { sampleDate, laboratory: "Southern Lab", sampleRef: "REF-1", p, k: 120, pH: 6.3 };
}

function field(
  overrides: { verifiedTest?: SoilTest; plannedUse?: TrackedValue<FieldUse> } = {},
  id = "field-1",
  farmId = "farm-1",
  name = "Home Field",
): SoilTestAgeField {
  return { id, farmId, name, fertility: { verifiedTest: overrides.verifiedTest }, plannedUse: overrides.plannedUse };
}

describe("promptForSoilTestAge", () => {
  it("OK/VALID: a test sampled under 4 years ago with a grassland P reading (Index 2) is not disqualified by age", () => {
    // 1 year old, well within SOIL_TEST_MAX_AGE_YEARS; p=4 -> grassland Index 2.
    const f = field({ plannedUse: plannedUse("grazing"), verifiedTest: verifiedTest("2025-08-29", 4) });

    const prompt = promptForSoilTestAge(f, ASOF, createdAt);

    expect(prompt.id).toMatch(UUID_RE);
    expect(prompt.farmId).toBe("farm-1");
    expect(prompt.fieldId).toBe("field-1");
    expect(prompt.kind).toBe(SOIL_TEST_AGE_PROMPT_KIND);
    expect(prompt.createdAt).toBe(createdAt);
    expect(prompt.regulatory).toBe("compliance_value");
    expect(prompt.calculationVersion).toBe(EXPECTED_CALCULATION_VERSION);
    expect(prompt.basis).toEqual({ status: "OK", value: "VALID", evidenceState: "MEASURED" });
    expect(prompt.title).toBe("Soil test age within limit — Home Field");
    expect(prompt.description).toContain("does not disqualify it");
    expect(prompt.description).toContain(`${SOIL_TEST_MAX_AGE_YEARS}-year`);
    expect(prompt.description).toContain(`${SOIL_OM_MAX_AGE_YEARS}-year`);
    // Codex audit HIGH (audit-logs/20260829T085255Z.md): the age check
    // alone never establishes general nutrient-planning usability.
    expect(prompt.description).not.toMatch(/can (still )?be used for nutrient planning/i);
    // Codex audit HIGH across four rounds (audit-logs/20260829T090928Z.md
    // through 20260829T094314Z.md): the raw inputs behind this compliance
    // result must be inspectable later even if the live Field has since
    // changed — real, snapshotted at calculation time, not just baked
    // into the classified EngineOutcome.
    expect(prompt.inputsSnapshot).toEqual({
      sampleDate: "2025-08-29",
      rawPMgL: 4,
      plannedUse: "grazing",
      cropGroup: "grassland",
      asOfDate: ASOF,
      rule: expect.stringContaining("GFT011-GFT015"),
    });
  });

  it("OK/INDEX4_PERSISTED: an aged-out test whose raw P reading is grassland Index 4 persists under the statutory exception", () => {
    // 6 years old; p=9 -> grassland Index 4 (>8.0).
    const f = field({ plannedUse: plannedUse("grazing"), verifiedTest: verifiedTest("2020-08-29", 9) });

    const prompt = promptForSoilTestAge(f, ASOF, createdAt);

    expect(prompt.basis).toEqual({ status: "OK", value: "INDEX4_PERSISTED", evidenceState: "MEASURED" });
    expect(prompt.fieldId).toBe("field-1");
    expect(prompt.calculationVersion).toBe(EXPECTED_CALCULATION_VERSION);
    expect(prompt.title).toBe("Soil test age exception applies (Index 4) — Home Field");
    expect(prompt.description).toContain("Index 4");
    expect(prompt.description).toContain("persists rather than expiring");
    expect(prompt.description).not.toMatch(/can (still )?be used for nutrient planning/i);
    // Must not read as the same claim as VALID's copy.
    const validField = field({ plannedUse: plannedUse("grazing"), verifiedTest: verifiedTest("2025-08-29", 4) });
    expect(prompt.description).not.toBe(promptForSoilTestAge(validField, ASOF, createdAt).description);
  });

  it("OK/DISREGARD: an aged-out test whose raw P reading is not Index 4 can no longer be used — the stronger claim is valid here", () => {
    // Exactly 4 years old; p=4 -> grassland Index 2 (not 4).
    const f = field({ plannedUse: plannedUse("grazing"), verifiedTest: verifiedTest("2022-08-29", 4) });

    const prompt = promptForSoilTestAge(f, ASOF, createdAt);

    expect(prompt.basis).toEqual({ status: "OK", value: "DISREGARD", evidenceState: "MEASURED" });
    expect(prompt.fieldId).toBe("field-1");
    expect(prompt.title).toBe("Soil test needs renewing — Home Field");
    expect(prompt.description).toContain("can no longer be used for nutrient planning");
    expect(prompt.description).toContain("A new soil test is needed");
  });

  it("NOT_APPLICABLE: no verified lab test at all — an estimated P Index was never a 'soil test' to age-check", () => {
    const f = field({ plannedUse: plannedUse("grazing") }); // no verifiedTest

    const prompt = promptForSoilTestAge(f, ASOF, createdAt);

    expect(prompt.basis).toEqual({ status: "NOT_APPLICABLE", reasonCode: "NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE" });
    expect(prompt.fieldId).toBe("field-1");
    expect(prompt.description).toBe(
      describeBlockedBasis(prompt.basis as Exclude<typeof prompt.basis, { status: "OK" }>),
    );
    expect(prompt.description).toBe("Not applicable here (NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE).");
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: a verified test exists but this field's plannedUse is missing — never assumed grazing/grassland", () => {
    const f = field({ verifiedTest: verifiedTest("2025-08-29", 4) }); // no plannedUse

    const prompt = promptForSoilTestAge(f, ASOF, createdAt);

    expect(prompt.basis).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "MISSING_FIELD_USE_FOR_P_INDEX",
      missingInputs: ["plannedUse"],
    });
    expect(prompt.fieldId).toBe("field-1");
    // This is the structural assertion the deferred BLOCKERS.md finding
    // asked for: description is byte-for-byte whatever describeBlockedBasis
    // produces for this exact basis — never a softer, hand-written one.
    expect(prompt.description).toBe(
      describeBlockedBasis(prompt.basis as Exclude<typeof prompt.basis, { status: "OK" }>),
    );
    expect(prompt.title).toBe("Soil test status needs review — Home Field");
    expect(prompt.title).not.toMatch(/invalid|expired|disregard/i);
  });

  it("AMBIGUOUS: a raw P reading in the literal statutory Index-3/4 micro-gap is propagated honestly, never silently resolved", () => {
    // Grassland bounds: Index 3 max 8.0, ambiguous gap (8.0, 8.01].
    const f = field({ plannedUse: plannedUse("grazing"), verifiedTest: verifiedTest("2025-08-29", 8.005) });

    const prompt = promptForSoilTestAge(f, ASOF, createdAt);

    expect(prompt.basis.status).toBe("AMBIGUOUS");
    expect(prompt.description).toBe(
      describeBlockedBasis(prompt.basis as Exclude<typeof prompt.basis, { status: "OK" }>),
    );
    expect(prompt.description).toMatch(/^Unresolved:/);
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: a future-dated sample fails closed rather than yielding a fabricated VALID", () => {
    const f = field({ plannedUse: plannedUse("grazing"), verifiedTest: verifiedTest("2027-01-01", 4) });

    const prompt = promptForSoilTestAge(f, ASOF, createdAt);

    expect(prompt.basis).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "UNKNOWN_BLOCK",
      missingInputs: ["soil test sample/report date"],
    });
    expect(prompt.description).toBe(
      describeBlockedBasis(prompt.basis as Exclude<typeof prompt.basis, { status: "OK" }>),
    );
  });

  it("each call produces a distinct id, even for the same field", () => {
    const f = field({ plannedUse: plannedUse("grazing"), verifiedTest: verifiedTest("2025-08-29", 4) });
    const first = promptForSoilTestAge(f, ASOF, createdAt);
    const second = promptForSoilTestAge(f, ASOF, createdAt);
    expect(first.id).not.toBe(second.id);
  });

  it("fieldId/farmId always come from the same Field the evidence was read off — a different field's prompt carries that field's own ids", () => {
    const homeField = field({ plannedUse: plannedUse("grazing"), verifiedTest: verifiedTest("2020-08-29", 9) }, "field-1", "farm-1", "Home Field");
    const backMeadow = field({ plannedUse: plannedUse("grazing"), verifiedTest: verifiedTest("2020-08-29", 9) }, "field-2", "farm-2", "Back Meadow");

    const homePrompt = promptForSoilTestAge(homeField, ASOF, createdAt);
    const backPrompt = promptForSoilTestAge(backMeadow, ASOF, createdAt);

    // Same real basis (identical underlying evidence) attached correctly
    // to each field's own identity — because both are read from the same
    // Field object, there is no remaining seam through which a caller
    // could mismatch identity and evidence (Codex audit CRITICAL/HIGH,
    // audit-logs/20260829T085836Z.md, 20260829T090356Z.md,
    // 20260829T090928Z.md, 20260829T091854Z.md, 20260829T092808Z.md).
    expect(homePrompt.basis).toEqual(backPrompt.basis);
    expect(homePrompt.farmId).toBe("farm-1");
    expect(homePrompt.fieldId).toBe("field-1");
    expect(backPrompt.farmId).toBe("farm-2");
    expect(backPrompt.fieldId).toBe("field-2");
  });

  // Codex audit MEDIUM (audit-logs/20260829T090928Z.md): a fixed calendar
  // sample date asserted against the *actual* current date goes stale.
  // Use a sample date relative to a freshly-computed "today" instead.
  it("defaults asOfDate to today when not supplied, and correctly resolves a genuinely recent test to VALID", () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    const recentSampleDate = d.toISOString().slice(0, 10);
    const f = field({ plannedUse: plannedUse("grazing"), verifiedTest: verifiedTest(recentSampleDate, 4) });
    const prompt = promptForSoilTestAge(f, undefined, createdAt);
    expect(prompt.basis).toEqual({ status: "OK", value: "VALID", evidenceState: "MEASURED" });
  });
});
