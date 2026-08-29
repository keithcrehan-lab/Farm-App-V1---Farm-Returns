import { describe, expect, it } from "vitest";
import { checkFieldSoilTestAgeValidity } from "./field-soil-test-age";
import type { FieldUse, SoilTest, TrackedValue } from "./types";

// Checkpoint 2, Vertical B — added so `src/orchestration/prompt/
// soil-test-age.ts` (and any other real caller) can get a field-scoped
// EngineOutcome without reimplementing this derivation outside
// src/domain/ (Codex audit HIGH, audit-logs/20260829T090928Z.md), and
// derives the P Index fresh from the lab test's own raw p reading rather
// than trusting a separately-tracked value (Codex audit HIGH,
// audit-logs/20260829T091854Z.md, 20260829T092808Z.md).
describe("checkFieldSoilTestAgeValidity", () => {
  const asOfDate = "2026-08-29";

  function use(value: FieldUse): TrackedValue<FieldUse> {
    return { value, status: "verified", source: "Farmer" };
  }

  function soilTest(sampleDate: string, p = 4): SoilTest {
    return { sampleDate, laboratory: "Southern Lab", sampleRef: "REF-1", p, k: 120, pH: 6.3 };
  }

  it("no verifiedTest at all -> NOT_APPLICABLE (an estimated P Index was never a soil test to age-check)", () => {
    const outcome = checkFieldSoilTestAgeValidity({ plannedUse: use("grazing") }, asOfDate);
    expect(outcome).toEqual({ status: "NOT_APPLICABLE", reasonCode: "NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE" });
  });

  it("a verifiedTest exists but plannedUse is missing -> BLOCKED_INSUFFICIENT_EVIDENCE, never assumed grazing/grassland", () => {
    const outcome = checkFieldSoilTestAgeValidity({ verifiedTest: soilTest("2025-08-29") }, asOfDate);
    expect(outcome).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "MISSING_FIELD_USE_FOR_P_INDEX",
      missingInputs: ["plannedUse"],
    });
  });

  it("derives a real Index from the lab test's own raw p reading (grassland, p=4 -> Index 2), delegating for VALID", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2025-08-29", 4), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome).toEqual({ status: "OK", value: "VALID", evidenceState: "MEASURED" });
  });

  it("delegates for DISREGARD (4+ years old, raw p reading is grassland Index 2, not 4)", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2020-08-29", 4), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome).toEqual({ status: "OK", value: "DISREGARD", evidenceState: "MEASURED" });
  });

  it("delegates for INDEX4_PERSISTED (4+ years old, raw p reading is grassland Index 4)", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2020-08-29", 9), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome).toEqual({ status: "OK", value: "INDEX4_PERSISTED", evidenceState: "MEASURED" });
  });

  it("a tillage field uses the other_crop band, not grassland's - the same raw p reading resolves to a genuinely different outcome", () => {
    // p=8.5: grassland's Index 3 max is 8.0, ambiguous gap ends 8.01, so
    // 8.5 -> Index 4 (INDEX4_PERSISTED, 4+ years old). other_crop's Index
    // 3 max is 10.0, so the same 8.5 -> Index 3, not 4 -> DISREGARD. Same
    // input, different plannedUse, different real statutory outcome -
    // proves cropGroupForFieldUse's routing actually ran, not a
    // hardcoded band.
    const grassland = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2020-08-29", 8.5), plannedUse: use("grazing") },
      asOfDate,
    );
    const tillage = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2020-08-29", 8.5), plannedUse: use("tillage") },
      asOfDate,
    );
    expect(grassland).toEqual({ status: "OK", value: "INDEX4_PERSISTED", evidenceState: "MEASURED" });
    expect(tillage).toEqual({ status: "OK", value: "DISREGARD", evidenceState: "MEASURED" });
  });

  it("AMBIGUOUS: a raw p reading in the literal statutory micro-gap is propagated honestly, never silently resolved to a firm Index", () => {
    // Grassland: Index 3 max 8.0, ambiguous gap (8.0, 8.01].
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2025-08-29", 8.005), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome.status).toBe("AMBIGUOUS");
    if (outcome.status === "AMBIGUOUS") expect(outcome.reasonCode).toBe("AMBIGUOUS_STATUTORY_BOUNDARY");
  });

  it("a malformed sampleDate fails closed (UNKNOWN_BLOCK), never a fabricated OK result", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("not-a-real-date", 4), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "UNKNOWN_BLOCK",
      missingInputs: ["soil test sample/report date"],
    });
  });

  // Codex audit HIGH (audit-logs/20260829T101336Z.md): JavaScript's Date
  // parser silently rolls a calendar-invalid but syntactically-plausible
  // date over to the next real date ("2025-02-30" -> 2 March) rather than
  // treating it as invalid — a plain NaN/negative check alone would have
  // missed this and let a corrupted date produce a real, finite,
  // plausible-looking age.
  it("a calendar-invalid date (2025-02-30) fails closed, never silently rolled over to a valid one", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2025-02-30", 4), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "UNKNOWN_BLOCK",
      missingInputs: ["soil test sample/report date"],
    });
  });

  it("a real calendar date close to a rollover boundary (2024-02-29, leap day) is still correctly accepted", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2024-02-29", 4), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome.status).toBe("OK");
  });

  // Codex audit HIGH (audit-logs/20260829T102057Z.md): asOfDate is
  // caller-supplied too (calculateNutrientPlan's own input.asOfDate
  // override), and wasn't validated the same way sampleDate is.
  it("a calendar-invalid asOfDate fails closed too, not just sampleDate", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2025-08-29", 4), plannedUse: use("grazing") },
      "2026-02-30",
    );
    expect(outcome).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "UNKNOWN_BLOCK",
      missingInputs: ["asOfDate"],
    });
  });

  it("a future-dated sampleDate (after asOfDate) fails closed (UNKNOWN_BLOCK), never a fabricated VALID", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2027-01-01", 4), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "UNKNOWN_BLOCK",
      missingInputs: ["soil test sample/report date"],
    });
  });

  // Codex audit HIGH (audit-logs/20260829T095253Z.md): pIndexFromMgL's
  // comparison chain falls through every real band for a non-finite `p`,
  // landing on its final "Index 4" return — a corrupt raw reading must
  // never silently produce a confident Index 4 (and, from there, a real
  // compliance_value outcome).
  it("a non-finite raw p reading (NaN) fails closed, never falls through to a fabricated Index 4", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2020-08-29", NaN), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "MISSING_SOIL_FERTILITY_INDEX",
      missingInputs: ["verifiedTest.p (invalid reading)"],
    });
  });

  it("a non-finite raw p reading (Infinity) also fails closed", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2020-08-29", Infinity), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  // Codex audit HIGH (audit-logs/20260829T100718Z.md): a negative p
  // reading is finite, so the earlier Number.isFinite guard alone let it
  // through to pIndexFromMgL, which has no lower-bound check of its own
  // and would classify it as a confident Index 1 (falls through every
  // real band's <= comparison upward) — a physical mg/l reading can never
  // be negative, so this must fail closed too.
  it("a negative raw p reading fails closed, never silently classified as Index 1", () => {
    const outcome = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2020-08-29", -1), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcome).toEqual({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "MISSING_SOIL_FERTILITY_INDEX",
      missingInputs: ["verifiedTest.p (invalid reading)"],
    });
  });

  // Codex audit HIGH (audit-logs/20260829T091854Z.md, 20260829T092808Z.md):
  // a farmer_adjusted (or any other) SoilFertility.pIndex value must have
  // zero influence on this calculation — only verifiedTest.p (this exact
  // lab test's own raw reading) determines the Index. This isn't
  // expressible as a parameter to checkFieldSoilTestAgeValidity any more
  // (its input type has no pIndex field at all) — the type itself is the
  // proof; this test documents that intent for a future reader.
  it("has no pIndex parameter at all — the Index is always derived fresh from verifiedTest.p, never accepted from a separately-tracked value", () => {
    const outcomeA = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2020-08-29", 9), plannedUse: use("grazing") },
      asOfDate,
    );
    // Same p, same date, same use -> always the same real result,
    // regardless of anything a caller might separately track as "the"
    // P Index for this field.
    const outcomeB = checkFieldSoilTestAgeValidity(
      { verifiedTest: soilTest("2020-08-29", 9), plannedUse: use("grazing") },
      asOfDate,
    );
    expect(outcomeA).toEqual(outcomeB);
    expect(outcomeA).toEqual({ status: "OK", value: "INDEX4_PERSISTED", evidenceState: "MEASURED" });
  });
});

