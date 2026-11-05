import { describe, expect, it } from "vitest";
import { SCHEME_DATA_KEYS } from "./data-keys";
import {
  isScep2026SchemeFactKey,
  validateScep2026SchemeFact,
} from "./facts";

describe("SCEP 2026 scheme fact validation", () => {
  it("accepts only registered SCEP 2026 keys", () => {
    expect(
      isScep2026SchemeFactKey(
        SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key,
      ),
    ).toBe(true);
    expect(isScep2026SchemeFactKey("schemes.scep.magic")).toBe(false);
  });

  it("accepts boolean participation/compliance answers without coercion", () => {
    expect(
      validateScep2026SchemeFact(
        SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key,
        true,
      ),
    ).toEqual({ valid: true, value: true });
    expect(
      validateScep2026SchemeFact(
        SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key,
        "true",
      ).valid,
    ).toBe(false);
  });

  it("requires a positive whole-number yearly reference", () => {
    const key = SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key;
    expect(validateScep2026SchemeFact(key, 27)).toEqual({
      valid: true,
      value: 27,
    });
    expect(validateScep2026SchemeFact(key, 0).valid).toBe(false);
    expect(validateScep2026SchemeFact(key, 27.5).valid).toBe(false);
  });

  it("allows zero for progress counts but rejects negative/fractional counts", () => {
    const key = SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key;
    expect(validateScep2026SchemeFact(key, 0)).toEqual({
      valid: true,
      value: 0,
    });
    expect(validateScep2026SchemeFact(key, -1).valid).toBe(false);
    expect(validateScep2026SchemeFact(key, 4.5).valid).toBe(false);
  });

  it("accepts a finite non-negative DAFM eligible forage area", () => {
    const key = SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key;
    expect(validateScep2026SchemeFact(key, 12.45)).toEqual({
      valid: true,
      value: 12.45,
    });
    expect(validateScep2026SchemeFact(key, -0.1).valid).toBe(false);
    expect(validateScep2026SchemeFact(key, Number.NaN).valid).toBe(false);
  });
});
