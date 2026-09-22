import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { calculateNutrientPlan } from "./nutrients";
import { tracked, type Field, type LivestockGroup, type NutrientPlan, type SlurryAllocation } from "./types";
import { createMarketPriceObservation, canonicalContentHashInput, type MarketPriceObservation, type CreateMarketPriceObservationInput } from "./market-evidence";
import { resolveMarketReferencePrice, type AuditableMarketPriceResolution } from "./market-price-resolution";
import type { EngineOutcome } from "./evidence";
import { buildSlurryDirectEconomicAssessment, type SlurryDirectEconomicAssessmentInput, type SlurryDirectEconomicAssessment } from "./slurry-direct-economic-assessment";
import {
  ASSESSMENT_INTEGRITY_SCHEMA_VERSION,
  ASSESSMENT_FINGERPRINT_ALGORITHM,
  buildPhase5IntegrityPayload,
  canonicalizeValue,
  computeAssessmentFingerprint,
  computePhase5AssessmentFingerprint,
  verifyAssessmentFingerprint,
} from "./assessment-integrity";

const hash = (input: string) => createHash("sha256").update(input, "utf8").digest("hex");

// ---------------------------------------------------------------------------
// Real end-to-end fixtures — mirrors audited-opportunity-record.test.ts's
// own pattern (real calculateNutrientPlan / real Phase 2-3 price pipeline /
// real buildSlurryDirectEconomicAssessment), so at least one adversarial
// mutation test operates on genuine engine output, not a fabricated object
// (brief §25/§36).
// ---------------------------------------------------------------------------

const livestockGroups: LivestockGroup[] = [
  { id: "g1", farmId: "farm-test", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
];
const farmGrasslandAreaHa = 27;
const asOfDate = "2026-09-25";

function makeField(id: string, areaHa: number, pIndex: 1 | 2 | 3 | 4, kIndex: 1 | 2 | 3 | 4): Field {
  return {
    id,
    farmId: "farm-test",
    name: id,
    areaHa,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
    fertility: { pIndex: tracked(pIndex, "farmer_adjusted", "Keith"), kIndex: tracked(kIndex, "farmer_adjusted", "Keith") },
    history: [],
  };
}

const goldenField = makeField("field-golden", 10, 2, 2);

function slurryOn(field: Field, volumeM3: number): SlurryAllocation {
  return {
    fieldId: field.id,
    housingId: "h1",
    priority: "high",
    volumeM3,
    score: 90,
    applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith"),
    applicationDate: tracked("2026-02-15", "farmer_adjusted", "Keith"),
  };
}
const unsupportedMethodOn = (field: Field, volumeM3: number): SlurryAllocation => ({
  fieldId: field.id,
  housingId: "h1",
  priority: "high",
  volumeM3,
  score: 90,
  applicationMethod: tracked("incorporate_24h", "farmer_adjusted", "Keith"),
  applicationDate: tracked("2026-02-15", "farmer_adjusted", "Keith"),
});

function planWithout(field: Field): NutrientPlan {
  return calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: undefined, asOfDate });
}
function planWith(field: Field, allocation: SlurryAllocation): NutrientPlan {
  return calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: allocation, asOfDate });
}

function observation(overrides: Partial<CreateMarketPriceObservationInput>): MarketPriceObservation {
  const fields = {
    datasetId: "AJM09",
    sourceSeriesCode: "012",
    sourceSeriesLabel: "Compound 18-6-12",
    mappedProduct: "18-6-12",
    mappingKind: "EXACT_PRODUCT_MATCH" as const,
    priceAmount: "645",
    referencePeriod: "2026-07",
    priceBasis: "per_tonne" as const,
    vatTreatment: "unknown" as const,
    deliveryBasis: "unknown" as const,
    sourceId: "CSO_AG_PRICES" as const,
    geography: "Ireland",
    sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
    retrievedAt: "2026-09-20T12:00:00.000Z",
    ingestionBatchId: "11111111-1111-1111-1111-111111111111",
    sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
    ...overrides,
  };
  return createMarketPriceObservation({ ...fields, contentHash: hash(canonicalContentHashInput(fields)) });
}
function resolved(candidates: MarketPriceObservation[], mappedProduct: string, decisionDate = asOfDate): EngineOutcome<AuditableMarketPriceResolution> {
  return resolveMarketReferencePrice({ candidates, mappedProduct, asOfDate: decisionDate });
}
function allProductPrices(priceAmount = "645"): Record<string, EngineOutcome<AuditableMarketPriceResolution>> {
  const zeroSevenThirty = observation({ sourceSeriesCode: "008", priceAmount: "412", mappingKind: "EXACT_PRODUCT_MATCH", mappedProduct: "0-7-30", sourceSeriesLabel: "Compound 0-7-30" });
  const eighteenSixTwelve = observation({ sourceSeriesCode: "012", priceAmount, mappingKind: "EXACT_PRODUCT_MATCH", mappedProduct: "18-6-12", sourceSeriesLabel: "Compound 18-6-12" });
  const protectedUrea = observation({ sourceSeriesCode: "002", priceAmount: "550", mappingKind: "CATEGORY_BENCHMARK", mappedProduct: "Protected Urea", sourceSeriesLabel: "Urea (46% N)" });
  return {
    "0-7-30": resolved([zeroSevenThirty], "0-7-30"),
    "18-6-12": resolved([eighteenSixTwelve], "18-6-12"),
    "Protected Urea": resolved([protectedUrea], "Protected Urea"),
  };
}
const pricesOk = allProductPrices()["18-6-12"];
const knownAt = pricesOk.status === "OK" ? pricesOk.value.trace.knownAt : "";

function realAssessment(overrides: Partial<SlurryDirectEconomicAssessmentInput> & Pick<SlurryDirectEconomicAssessmentInput, "id" | "evaluatedActionId" | "fieldId" | "baselinePlan" | "interventionPlan">): SlurryDirectEconomicAssessment {
  return buildSlurryDirectEconomicAssessment({
    asOfDate,
    knownAt,
    resolvedPricesByProduct: allProductPrices(),
    realisationCost: { status: "known_zero" },
    createdAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
  });
}

function positiveAssessment(): SlurryDirectEconomicAssessment {
  return realAssessment({
    id: "assessment-positive",
    evaluatedActionId: "allocation-real-db-id-1",
    fieldId: goldenField.id,
    baselinePlan: planWithout(goldenField),
    interventionPlan: planWith(goldenField, slurryOn(goldenField, 20 * goldenField.areaHa)),
  });
}
function blockedAssessment(): SlurryDirectEconomicAssessment {
  return realAssessment({
    id: "assessment-blocked",
    evaluatedActionId: "allocation-real-db-id-2",
    fieldId: goldenField.id,
    baselinePlan: planWithout(goldenField),
    interventionPlan: planWith(goldenField, unsupportedMethodOn(goldenField, 20 * goldenField.areaHa)),
  });
}

// ---------------------------------------------------------------------------
// §1 canonicalizeValue — generic canonicaliser correctness/fail-closed
// behaviour (brief §3/§28/§31/§39).
// ---------------------------------------------------------------------------

describe("canonicalizeValue — canonical key-order independence", () => {
  it("produces the same canonical string for objects with different key insertion order", () => {
    const a = { b: 2, a: 1, c: { z: 3, y: 4 } };
    const b = { c: { y: 4, z: 3 }, a: 1, b: 2 };
    expect(canonicalizeValue(a)).toBe(canonicalizeValue(b));
  });

  it("preserves array order — never reorders an array", () => {
    expect(canonicalizeValue([1, 2, 3])).not.toBe(canonicalizeValue([3, 2, 1]));
  });

  it("treats a missing key and an explicit null as different", () => {
    expect(canonicalizeValue({ a: 1 })).not.toBe(canonicalizeValue({ a: 1, b: null }));
  });

  it("treats differently-scaled equal decimal strings as different canonical values (documented design choice)", () => {
    expect(canonicalizeValue({ amount: "0", currency: "EUR" })).not.toBe(canonicalizeValue({ amount: "0.00", currency: "EUR" }));
    expect(canonicalizeValue("200")).not.toBe(canonicalizeValue("200.0"));
  });

  it("is deterministic across repeated calls on the same input", () => {
    const payload = { a: [1, 2, { x: "y" }], b: null, c: "hello" };
    const first = canonicalizeValue(payload);
    for (let i = 0; i < 20; i++) {
      expect(canonicalizeValue(payload)).toBe(first);
    }
  });
});

describe("canonicalizeValue — fail-closed on unsupported values", () => {
  it("rejects NaN", () => {
    expect(() => canonicalizeValue(NaN)).toThrow(/NaN|Infinity/);
  });
  it("rejects Infinity", () => {
    expect(() => canonicalizeValue(Infinity)).toThrow(/NaN|Infinity/);
  });
  it("rejects -Infinity", () => {
    expect(() => canonicalizeValue(-Infinity)).toThrow(/NaN|Infinity/);
  });
  it("rejects undefined", () => {
    expect(() => canonicalizeValue(undefined)).toThrow(/undefined/);
  });
  it("rejects a value with an undefined property", () => {
    expect(() => canonicalizeValue({ a: undefined })).toThrow(/undefined/);
  });
  it("rejects functions", () => {
    expect(() => canonicalizeValue(() => 1)).toThrow(/unsupported value type/);
  });
  it("rejects symbols", () => {
    expect(() => canonicalizeValue(Symbol("x"))).toThrow(/unsupported value type/);
  });
  it("rejects Date instances", () => {
    expect(() => canonicalizeValue(new Date())).toThrow(/unsupported object type/);
  });
  it("rejects Map instances", () => {
    expect(() => canonicalizeValue(new Map([["a", 1]]))).toThrow(/unsupported object type/);
  });
  it("rejects Set instances", () => {
    expect(() => canonicalizeValue(new Set([1, 2]))).toThrow(/unsupported object type/);
  });
  it("rejects a class instance", () => {
    class Foo {
      x = 1;
    }
    expect(() => canonicalizeValue(new Foo())).toThrow(/unsupported object type/);
  });
  it("rejects a circular object reference", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => canonicalizeValue(obj)).toThrow(/circular reference/);
  });
  it("rejects a circular array reference", () => {
    const arr: unknown[] = [1, 2];
    arr.push(arr);
    expect(() => canonicalizeValue(arr)).toThrow(/circular reference/);
  });
});

// ---------------------------------------------------------------------------
// §2 computeAssessmentFingerprint / verifyAssessmentFingerprint.
// ---------------------------------------------------------------------------

describe("computeAssessmentFingerprint / verifyAssessmentFingerprint", () => {
  it("declares the current schema version and algorithm", () => {
    const fp = computeAssessmentFingerprint({ a: 1 }, hash);
    expect(fp.schemaVersion).toBe(ASSESSMENT_INTEGRITY_SCHEMA_VERSION);
    expect(fp.algorithm).toBe(ASSESSMENT_FINGERPRINT_ALGORITHM);
    expect(fp.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches independently-known public SHA-256 test vectors (adversarial review requirement: never verify a hash function using itself)", () => {
    expect(hash("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is deterministic — same payload, same fingerprint, across repeated calls", () => {
    const payload = { x: 1, y: [1, 2, 3], z: { a: "b" } };
    const first = computeAssessmentFingerprint(payload, hash);
    for (let i = 0; i < 10; i++) {
      expect(computeAssessmentFingerprint(payload, hash).digest).toBe(first.digest);
    }
  });

  it("verifies a genuinely matching payload as valid", () => {
    const payload = { a: 1, b: "two" };
    const fp = computeAssessmentFingerprint(payload, hash);
    expect(verifyAssessmentFingerprint(payload, fp, hash)).toEqual({ valid: true });
  });

  it("fails closed on a content mismatch — never silently regenerates", () => {
    const fp = computeAssessmentFingerprint({ a: 1 }, hash);
    const result = verifyAssessmentFingerprint({ a: 2 }, fp, hash);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ASSESSMENT_INTEGRITY_FINGERPRINT_MISMATCH");
  });

  it("fails closed on an unsupported schema version rather than attempting a best-effort comparison", () => {
    const payload = { a: 1 };
    const fp = computeAssessmentFingerprint(payload, hash);
    const result = verifyAssessmentFingerprint(payload, { ...fp, schemaVersion: 999 }, hash);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ASSESSMENT_INTEGRITY_UNSUPPORTED_SCHEMA_VERSION");
  });

  it("fails closed on an unsupported algorithm", () => {
    const payload = { a: 1 };
    const fp = computeAssessmentFingerprint(payload, hash);
    const result = verifyAssessmentFingerprint(payload, { ...fp, algorithm: "MD5" as "SHA-256" }, hash);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ASSESSMENT_INTEGRITY_UNSUPPORTED_ALGORITHM");
  });

  it("independently-reconstructed equivalent objects produce identical fingerprints", () => {
    const a = { product: "18-6-12", price: { amount: "645", currency: "EUR" }, limitations: ["x", "y"] };
    const b = { limitations: ["x", "y"], price: { currency: "EUR", amount: "645" }, product: "18-6-12" };
    expect(computeAssessmentFingerprint(a, hash).digest).toBe(computeAssessmentFingerprint(b, hash).digest);
  });

  it("survives a JSON round trip — fingerprint remains valid after serialise/deserialise", () => {
    const payload = { a: 1, b: [1, 2, { c: "d" }], e: null };
    const fp = computeAssessmentFingerprint(payload, hash);
    const roundTripped = JSON.parse(JSON.stringify(payload));
    expect(verifyAssessmentFingerprint(roundTripped, fp, hash)).toEqual({ valid: true });
  });
});

describe("computeAssessmentFingerprint — hash-provider trust boundary (adversarial review finding)", () => {
  // An adversarial review found that, before assertValidDigest existed,
  // computeAssessmentFingerprint/verifyAssessmentFingerprint accepted ANY
  // string a caller's `hash` function returned, with zero validation. Live
  // reproduction of the attack this motivated the fix: a hash function
  // that ignores its input and always returns the same constant caused two
  // COMPLETELY DIFFERENT payloads to verify as "matching" against the same
  // stored fingerprint — defeating the entire integrity mechanism. These
  // tests prove the fix closes the cheap, most-likely failure classes.
  it("rejects a hash function returning an empty string", () => {
    expect(() => computeAssessmentFingerprint({ a: 1 }, () => "")).toThrow(/not a well-formed SHA-256 hex digest/);
  });

  it("rejects a hash function returning a malformed non-hex digest", () => {
    expect(() => computeAssessmentFingerprint({ a: 1 }, () => "not-a-real-hash-at-all!!")).toThrow(
      /not a well-formed SHA-256 hex digest/,
    );
  });

  it("rejects a hash function returning a truncated (too-short) digest", () => {
    expect(() => computeAssessmentFingerprint({ a: 1 }, () => "deadbeef")).toThrow(/not a well-formed SHA-256 hex digest/);
  });

  it("rejects a hash function returning uppercase hex (not the declared lowercase canonical form)", () => {
    expect(() => computeAssessmentFingerprint({ a: 1 }, () => "A".repeat(64))).toThrow(/not a well-formed SHA-256 hex digest/);
  });

  it("a nondeterministic hash function returning differently-malformed output each call is rejected on every call, never silently accepted", () => {
    let counter = 0;
    const nondeterministicHash = () => `not-hex-${counter++}`;
    expect(() => computeAssessmentFingerprint({ a: 1 }, nondeterministicHash)).toThrow(/not a well-formed SHA-256 hex digest/);
    expect(() => computeAssessmentFingerprint({ a: 1 }, nondeterministicHash)).toThrow(/not a well-formed SHA-256 hex digest/);
  });

  it("documents the acknowledged residual limitation: a hash function that always returns the same well-FORMED constant cannot be caught by shape validation alone", () => {
    // A 64-char lowercase-hex constant IS well-formed shape, so this
    // specific attack is NOT fully closed by assertValidDigest — this is
    // the honest, documented residual gap (see assertValidDigest's own doc
    // comment): the domain layer cannot cryptographically prove a supplied
    // function computes REAL SHA-256 rather than some other deterministic
    // function that happens to produce correctly-shaped output. Real
    // defence against this resides in production wiring (using Node's
    // actual crypto.createHash) plus independent test verification against
    // known SHA-256 vectors (this file's own "matches independently-known
    // public SHA-256 test vectors" test above) — never a runtime guarantee
    // a pure, Node-independent domain module can make.
    const constantHash = () => "a".repeat(64);
    const fp1 = computeAssessmentFingerprint({ a: 1 }, constantHash);
    const fp2 = computeAssessmentFingerprint({ a: 999, totally: "different" }, constantHash);
    expect(fp1.digest).toBe(fp2.digest);
  });

  it("a real SHA-256 implementation always passes the shape check (no false positives against legitimate use)", () => {
    const fp = computeAssessmentFingerprint({ a: 1, b: [1, 2, 3] }, hash);
    expect(fp.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// §3 Real Phase 5 assessment — buildPhase5IntegrityPayload / semantic
// mutation tests (brief §29/§34) against genuine engine output.
// ---------------------------------------------------------------------------

describe("buildPhase5IntegrityPayload / computePhase5AssessmentFingerprint — real assessment", () => {
  it("is deterministic for the same real assessment across repeated computation", () => {
    const assessment = positiveAssessment();
    const first = computePhase5AssessmentFingerprint(assessment, hash);
    for (let i = 0; i < 5; i++) {
      expect(computePhase5AssessmentFingerprint(assessment, hash).digest).toBe(first.digest);
    }
  });

  it("does NOT change when only assessment.createdAt (a pure calculation-instance timestamp) changes", () => {
    const a = positiveAssessment();
    const b = { ...a, createdAt: "2099-01-01T00:00:00.000Z" };
    expect(computePhase5AssessmentFingerprint(a, hash).digest).toBe(computePhase5AssessmentFingerprint(b, hash).digest);
  });

  it("scientific audit-trace reconstruction: a real positive assessment's fingerprint payload exposes the real Teagasc rule/source used", () => {
    const assessment = positiveAssessment();
    const payload = buildPhase5IntegrityPayload(assessment);
    expect(payload.scienceSupport.status).toBe("OK");
    if (payload.scienceSupport.status === "OK") {
      // Real citation, not invented — see nutrients.ts's own
      // resolveAvailableSlurryNutrients / SLURRY_TABLE_9_8.
      expect(payload.scienceSupport.value.ruleId).toBe("SLURRY_TABLE_9_8");
      expect(payload.scienceSupport.value.source).toContain("Teagasc Green Book Table 9-8");
    }
    // The full chain is reconstructable from this one payload: real
    // evaluatedActionVolumeM3 -> real baseline/intervention plan costs
    // (each carrying real product/price provenance) -> real economic
    // conclusion -> this fingerprint.
    expect(payload.evaluatedActionVolumeM3).toBe(assessment.evaluatedActionVolumeM3);
    expect(payload.baselineFertiliserPlanCost.lines.length).toBeGreaterThan(0);
    expect(payload.interventionFertiliserPlanCost.lines.length).toBeGreaterThan(0);
    expect(payload.directCostDifference.status).toBe("OK");
  });

  it("a real unsupported-science assessment stays blocked in the fingerprint payload, never silently OK", () => {
    const assessment = blockedAssessment();
    const payload = buildPhase5IntegrityPayload(assessment);
    expect(payload.scienceSupport.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(payload.directCostDifference.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (payload.directCostDifference.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(payload.directCostDifference.reasonCode).toBe("ECONOMIC_SLURRY_ASSESSMENT_UNSUPPORTED_SCIENCE");
    }
    expect(payload.effect).toBeNull();
  });

  // brief §29/§34 — every listed mutation must change the fingerprint.
  const base = positiveAssessment();
  const baseFp = computePhase5AssessmentFingerprint(base, hash).digest;

  it("mutating assessment.id changes the fingerprint", () => {
    const mutated = { ...base, id: "assessment-different" };
    expect(computePhase5AssessmentFingerprint(mutated, hash).digest).not.toBe(baseFp);
  });
  it("mutating evaluatedActionId changes the fingerprint", () => {
    const mutated = { ...base, evaluatedActionId: "allocation-real-db-id-999" };
    expect(computePhase5AssessmentFingerprint(mutated, hash).digest).not.toBe(baseFp);
  });
  it("mutating fieldId changes the fingerprint", () => {
    const mutated = { ...base, fieldId: "field-other" };
    expect(computePhase5AssessmentFingerprint(mutated, hash).digest).not.toBe(baseFp);
  });
  it("mutating evaluatedActionVolumeM3 changes the fingerprint", () => {
    const mutated = { ...base, evaluatedActionVolumeM3: "999" };
    expect(computePhase5AssessmentFingerprint(mutated, hash).digest).not.toBe(baseFp);
  });
  it("mutating engineVersion changes the fingerprint", () => {
    const mutated = { ...base, engineVersion: "slurry_direct_economic_engine_v2.0.0" };
    expect(computePhase5AssessmentFingerprint(mutated, hash).digest).not.toBe(baseFp);
  });
  it("mutating a limitation string changes the fingerprint", () => {
    const mutated = { ...base, limitations: [...base.limitations, "An additional, real disclosed caveat."] };
    expect(computePhase5AssessmentFingerprint(mutated, hash).digest).not.toBe(baseFp);
  });
  it("mutating directCostDifferenceDirection changes the fingerprint", () => {
    const mutated = { ...base, directCostDifferenceDirection: "cost" as const };
    expect(computePhase5AssessmentFingerprint(mutated, hash).digest).not.toBe(baseFp);
  });
  it("mutating a real price observation used by the assessment changes the fingerprint (price-evidence mutation)", () => {
    // Rebuild the whole assessment with a genuinely different real price —
    // exercises the full real pipeline, not a hand-edited field.
    const differentPricedAssessment = buildSlurryDirectEconomicAssessment({
      id: base.id,
      evaluatedActionId: base.evaluatedActionId,
      fieldId: base.fieldId,
      asOfDate,
      knownAt,
      baselinePlan: planWithout(goldenField),
      interventionPlan: planWith(goldenField, slurryOn(goldenField, 20 * goldenField.areaHa)),
      resolvedPricesByProduct: allProductPrices("700"),
      realisationCost: { status: "known_zero" },
      createdAt: base.createdAt,
    });
    expect(computePhase5AssessmentFingerprint(differentPricedAssessment, hash).digest).not.toBe(baseFp);
  });

  it("does NOT change when the caller's original assessment object is mutated after fingerprinting (immutability)", () => {
    const assessment = positiveAssessment();
    const fp = computePhase5AssessmentFingerprint(assessment, hash);
    const mutable = assessment as unknown as { limitations: string[] };
    mutable.limitations.push("mutated after the fact");
    // The already-computed fingerprint object itself is just data — this
    // test documents that computePhase5AssessmentFingerprint takes a
    // snapshot in time; a NEW computation over the (now mutated) object
    // would legitimately differ, proving the function reads live state
    // rather than caching a stale answer silently.
    const recomputed = computePhase5AssessmentFingerprint(assessment, hash);
    expect(recomputed.digest).not.toBe(fp.digest);
  });
});

describe("buildPhase5IntegrityPayload — array ordering policy", () => {
  it("sorts limitations so insertion-order differences do not change the fingerprint", () => {
    const assessment = positiveAssessment();
    const reordered = { ...assessment, limitations: [...assessment.limitations].reverse() };
    expect(computePhase5AssessmentFingerprint(assessment, hash).digest).toBe(computePhase5AssessmentFingerprint(reordered, hash).digest);
  });

  it("preserves scenarios array order (meaningful: [baseline, intervention])", () => {
    const assessment = positiveAssessment();
    const reordered = { ...assessment, scenarios: [...assessment.scenarios].reverse() };
    expect(computePhase5AssessmentFingerprint(assessment, hash).digest).not.toBe(computePhase5AssessmentFingerprint(reordered, hash).digest);
  });
});
