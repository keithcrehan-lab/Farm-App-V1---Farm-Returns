import { describe, expect, it } from "vitest";
import { measurement, reviseMeasurement, type Measurement } from "./measurement";
import { subjectRef } from "./subject";
import { evidenceItem } from "./evidence-item";

function baseWeight(overrides: Partial<Measurement<number>> = {}): Measurement<number> {
  return {
    farmId: "farm-1",
    subject: subjectRef("ANIMAL", "animal-1"),
    kind: "animal_weight",
    value: 320,
    unit: "kg",
    occurredAt: "2026-09-08T09:00:00.000Z",
    recordedAt: "2026-09-08T09:05:00.000Z",
    origin: "eid_or_weigh_head",
    source: "Weighbridge",
    status: "verified",
    ...overrides,
  };
}

describe("measurement", () => {
  it("constructs a farm-scoped measurement with a generic subject and value", () => {
    const m = measurement(baseWeight());
    expect(m.farmId).toBe("farm-1");
    expect(m.subject).toEqual({ type: "ANIMAL", id: "animal-1" });
    expect(m.value).toBe(320);
    expect(m.unit).toBe("kg");
  });

  it("supports a subject of any SubjectType, not just an animal — the whole point of reusing SubjectRef", () => {
    const grass = measurement(
      baseWeight({ subject: subjectRef("FIELD", "field-7"), kind: "grass_cover_cm", value: 8.4, unit: "cm", origin: "satellite_estimate", source: "Sentinel-2 estimate", status: "estimated" }),
    );
    expect(grass.subject).toEqual({ type: "FIELD", id: "field-7" });
    expect(grass.kind).toBe("grass_cover_cm");
  });

  it("reuses DataStatus for confidence — every valid DataStatus value is accepted", () => {
    const statuses: Array<Measurement<number>["status"]> = ["verified", "farmer_adjusted", "estimated", "mapped", "unavailable"];
    for (const status of statuses) {
      expect(measurement(baseWeight({ status })).status).toBe(status);
    }
  });

  it("carries optional evidence without requiring it", () => {
    const withEvidence = measurement(baseWeight({ evidence: [evidenceItem("weigh_head_measurement", "Weighbridge reading")] }));
    expect(withEvidence.evidence).toHaveLength(1);
    const withoutEvidence = measurement(baseWeight());
    expect(withoutEvidence.evidence).toBeUndefined();
  });
});

describe("reviseMeasurement", () => {
  it("chains the prior measurement under .previous rather than discarding it", () => {
    const original = measurement(baseWeight());
    const revised = reviseMeasurement(original, { ...baseWeight(), value: 325, source: "Farmer corrected a misread" });
    expect(revised.value).toBe(325);
    expect(revised.previous).toEqual(original);
    // The original itself is never mutated.
    expect(original.value).toBe(320);
  });

  it("supports a full history chain across multiple revisions", () => {
    const v1 = measurement(baseWeight({ value: 300 }));
    const v2 = reviseMeasurement(v1, { ...baseWeight(), value: 310 });
    const v3 = reviseMeasurement(v2, { ...baseWeight(), value: 320 });
    expect(v3.value).toBe(320);
    expect(v3.previous?.value).toBe(310);
    expect(v3.previous?.previous?.value).toBe(300);
  });
});
