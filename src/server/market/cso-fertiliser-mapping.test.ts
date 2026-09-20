import { describe, expect, it } from "vitest";
import { mapCsoFertiliserSeries } from "./cso-fertiliser-mapping";

describe("mapCsoFertiliserSeries", () => {
  it("22. classifies Compound 0-7-30 (code 008) as an exact match, preserving the code", () => {
    expect(mapCsoFertiliserSeries("008")).toEqual({ sourceSeriesCode: "008", mappedProduct: "0-7-30", mappingKind: "EXACT_PRODUCT_MATCH" });
  });

  it("22. classifies Compound 18-6-12 (code 012) as an exact match", () => {
    expect(mapCsoFertiliserSeries("012")).toEqual({ sourceSeriesCode: "012", mappedProduct: "18-6-12", mappingKind: "EXACT_PRODUCT_MATCH" });
  });

  it("23. classifies Urea (code 002) as a benchmark, not an exact match", () => {
    const result = mapCsoFertiliserSeries("002");
    expect(result.mappingKind).toBe("CATEGORY_BENCHMARK");
    expect(result.mappedProduct).toBe("Protected Urea");
  });

  it("24. classifies an unrecognised series code as unsupported, never fabricating a product price", () => {
    const result = mapCsoFertiliserSeries("020"); // Compound 10-5-25 — real code, no Farm Return product
    expect(result.mappingKind).toBe("UNSUPPORTED_MAPPING");
    expect(result.mappedProduct).toBeNull();
  });

  it("25. an unsupported classification still preserves the original source code", () => {
    expect(mapCsoFertiliserSeries("999").sourceSeriesCode).toBe("999");
  });

  it("26. mapping is deterministic across repeated calls", () => {
    const a = mapCsoFertiliserSeries("012");
    const b = mapCsoFertiliserSeries("012");
    expect(a).toEqual(b);
  });
});
