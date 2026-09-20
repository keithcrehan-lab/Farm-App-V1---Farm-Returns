import { describe, expect, it } from "vitest";
import { mapCsoFertiliserSeries } from "./cso-fertiliser-mapping";

describe("mapCsoFertiliserSeries", () => {
  it("22. classifies Compound 0-7-30 (code 008) as an exact match, preserving the code", () => {
    expect(mapCsoFertiliserSeries("008", "Compound 0-7-30")).toEqual({
      sourceSeriesCode: "008",
      mappedProduct: "0-7-30",
      mappingKind: "EXACT_PRODUCT_MATCH",
    });
  });

  it("22. classifies Compound 18-6-12 (code 012) as an exact match", () => {
    expect(mapCsoFertiliserSeries("012", "Compound 18-6-12")).toEqual({
      sourceSeriesCode: "012",
      mappedProduct: "18-6-12",
      mappingKind: "EXACT_PRODUCT_MATCH",
    });
  });

  it("23. classifies Urea (code 002) as a benchmark, not an exact match", () => {
    const result = mapCsoFertiliserSeries("002", "Urea (46% N)");
    expect(result.mappingKind).toBe("CATEGORY_BENCHMARK");
    expect(result.mappedProduct).toBe("Protected Urea");
  });

  it("24. classifies an unrecognised series code as unsupported, never fabricating a product price", () => {
    const result = mapCsoFertiliserSeries("020", "Compound 10-5-25"); // real code, no Farm Return product
    expect(result.mappingKind).toBe("UNSUPPORTED_MAPPING");
    expect(result.mappedProduct).toBeNull();
  });

  it("25. an unsupported classification still preserves the original source code", () => {
    expect(mapCsoFertiliserSeries("999", "Something Unknown").sourceSeriesCode).toBe("999");
  });

  it("26. mapping is deterministic across repeated calls", () => {
    const a = mapCsoFertiliserSeries("012", "Compound 18-6-12");
    const b = mapCsoFertiliserSeries("012", "Compound 18-6-12");
    expect(a).toEqual(b);
  });

  it("27. (review hardening) a code/label mismatch on an otherwise-mapped code is never silently trusted — demotes to unsupported", () => {
    // Same stable code CSO uses for Compound 18-6-12 today, but a
    // hypothetically different label — must not keep claiming an
    // EXACT_PRODUCT_MATCH for a product identity that no longer matches
    // what was verified when this mapping was authored (brief §10: "a
    // code/label mismatch must not be silently trusted").
    const result = mapCsoFertiliserSeries("012", "Compound 12-6-18 (reformulated)");
    expect(result.mappingKind).toBe("UNSUPPORTED_MAPPING");
    expect(result.mappedProduct).toBeNull();
  });

  it("28. (review hardening) a purely cosmetic whitespace/case difference on code 008 does NOT break the exact match", () => {
    const result = mapCsoFertiliserSeries("008", "  compound 0-7-30  ");
    expect(result.mappingKind).toBe("EXACT_PRODUCT_MATCH");
    expect(result.mappedProduct).toBe("0-7-30");
  });

  it("29. (review hardening) the expected label still classifies exactly as before — no regression from the hardening", () => {
    expect(mapCsoFertiliserSeries("002", "Urea (46% N)").mappingKind).toBe("CATEGORY_BENCHMARK");
  });
});
