import { describe, expect, it } from "vitest";
import { resolveSoilForFieldPolygon } from "./soil-resolution";

/**
 * Codex remediation Priority 8 — proves the resolver fails closed rather
 * than inventing a soil classification, and documents exactly why
 * (`SOIL_DATASET_NOT_INTEGRATED`) so a future dataset integration has a
 * regression test to flip once it lands.
 */
describe("resolveSoilForFieldPolygon", () => {
  const polygon: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [[[-8.5, 51.9], [-8.49, 51.9], [-8.49, 51.91], [-8.5, 51.9]]],
  };

  it("returns BLOCKED_INSUFFICIENT_EVIDENCE, never a fabricated soil classification", () => {
    const outcome = resolveSoilForFieldPolygon({ fieldId: "field-1", fieldPolygon: polygon, fieldAreaHa: 5 });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("SOIL_DATASET_NOT_INTEGRATED");
      expect(outcome.missingInputs.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic regardless of the input field's geometry/id", () => {
    const a = resolveSoilForFieldPolygon({ fieldId: "field-a", fieldPolygon: polygon, fieldAreaHa: 1 });
    const b = resolveSoilForFieldPolygon({ fieldId: "field-b", fieldPolygon: polygon, fieldAreaHa: 500 });
    expect(a).toEqual(b);
  });
});
