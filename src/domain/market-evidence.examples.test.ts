import { describe, expect, it } from "vitest";
import { EXAMPLE_CANONICAL_OBSERVATION, EXAMPLE_REVISED_OBSERVATION, EXAMPLE_UNSUPPORTED_MAPPING_OBSERVATION } from "./market-evidence.examples";

describe("market-evidence.examples", () => {
  it("A: the canonical observation is a well-formed exact match", () => {
    expect(EXAMPLE_CANONICAL_OBSERVATION.mappingKind).toBe("EXACT_PRODUCT_MATCH");
    expect(EXAMPLE_CANONICAL_OBSERVATION.mappedProduct).toBe("18-6-12");
    expect(EXAMPLE_CANONICAL_OBSERVATION.price).toEqual({ amount: "645", currency: "EUR" });
  });

  it("B: the revised observation shares identity but has a distinct content hash and price from A", () => {
    expect(EXAMPLE_REVISED_OBSERVATION.datasetId).toBe(EXAMPLE_CANONICAL_OBSERVATION.datasetId);
    expect(EXAMPLE_REVISED_OBSERVATION.sourceSeriesCode).toBe(EXAMPLE_CANONICAL_OBSERVATION.sourceSeriesCode);
    expect(EXAMPLE_REVISED_OBSERVATION.referencePeriod).toBe(EXAMPLE_CANONICAL_OBSERVATION.referencePeriod);
    expect(EXAMPLE_REVISED_OBSERVATION.contentHash).not.toBe(EXAMPLE_CANONICAL_OBSERVATION.contentHash);
    expect(EXAMPLE_REVISED_OBSERVATION.price.amount).toBe("647");
  });

  it("C: the unsupported mapping never carries a fabricated product price", () => {
    expect(EXAMPLE_UNSUPPORTED_MAPPING_OBSERVATION.mappingKind).toBe("UNSUPPORTED_MAPPING");
    expect(EXAMPLE_UNSUPPORTED_MAPPING_OBSERVATION.mappedProduct).toBeNull();
    expect(EXAMPLE_UNSUPPORTED_MAPPING_OBSERVATION.sourceSeriesLabel).toBe("Compound 13-6-20");
  });
});
