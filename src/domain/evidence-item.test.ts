import { describe, expect, it } from "vitest";
import { evidenceItem } from "./evidence-item";
import { externalReference } from "./external-reference";
import { subjectRef } from "./subject";

describe("evidenceItem", () => {
  it("constructs a minimal evidence record with just a kind and description", () => {
    expect(evidenceItem("farmer_confirmation", "Farmer confirmed in Confirm Actual")).toEqual({
      kind: "farmer_confirmation",
      description: "Farmer confirmed in Confirm Actual",
    });
  });

  it("never fabricates a capturedAt/externalReference — both stay absent unless explicitly supplied", () => {
    const item = evidenceItem("photo", "Field gate photo");
    expect(item.capturedAt).toBeUndefined();
    expect(item.externalReference).toBeUndefined();
  });

  it("can carry a real ExternalReference for evidence that came through an external system", () => {
    const ref = externalReference("farm-1", subjectRef("ANIMAL", "a1"), "weigh_head", "WH-42");
    const item = evidenceItem("weigh_head_measurement", "Weighbridge reading", { externalReference: ref });
    expect(item.externalReference).toEqual(ref);
  });
});
