import { describe, expect, it } from "vitest";
import { externalReference } from "./external-reference";
import { subjectRef } from "./subject";

describe("externalReference", () => {
  it("constructs a farm-scoped reference from a subject to an external system id", () => {
    const ref = externalReference("farm-1", subjectRef("ANIMAL", "animal-1"), "eid", "IE1234567890");
    expect(ref).toEqual({
      farmId: "farm-1",
      subject: { type: "ANIMAL", id: "animal-1" },
      system: "eid",
      externalId: "IE1234567890",
    });
  });

  it("accepts optional capturedAt/source without requiring them", () => {
    const ref = externalReference("farm-1", subjectRef("MACHINE", "m1"), "machinery_telemetry", "TEL-9", {
      capturedAt: "2026-09-08T09:00:00.000Z",
      source: "Imported from telemetry vendor export",
    });
    expect(ref.capturedAt).toBe("2026-09-08T09:00:00.000Z");
    expect(ref.source).toBe("Imported from telemetry vendor export");
  });

  it("always carries its own farmId — a subject reference alone has no farm", () => {
    const ref = externalReference("farm-2", subjectRef("FIELD", "f1"), "government_animal_system", "GOV-1");
    expect(ref.farmId).toBe("farm-2");
  });
});
