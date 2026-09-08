import { describe, expect, it } from "vitest";
import { measurement, reviseMeasurement, type Measurement } from "./measurement";
import { subjectRef } from "./subject";
import { evidenceItem } from "./evidence-item";
import { externalReference } from "./external-reference";

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

  it("Codex audit CRITICAL (round 1): rejects a revision that changes farmId — never embeds one farm's data inside another farm's provenance chain", () => {
    const original = measurement(baseWeight({ farmId: "farm-a" }));
    expect(() => reviseMeasurement(original, { ...baseWeight(), farmId: "farm-b" })).toThrow(/different farm/);
  });

  it("Codex audit CRITICAL (round 1): rejects a revision that changes subject", () => {
    const original = measurement(baseWeight({ subject: subjectRef("ANIMAL", "animal-1") }));
    expect(() => reviseMeasurement(original, { ...baseWeight(), subject: subjectRef("ANIMAL", "animal-2") })).toThrow(/different subject/);
  });
});

describe("cross-farm evidence rejection (Codex audit CRITICAL, round 1)", () => {
  it("measurement() rejects evidence whose own externalReference belongs to a different farm", () => {
    const crossFarmEvidence = evidenceItem("weigh_head_measurement", "Weighbridge reading", {
      externalReference: externalReference("farm-b", subjectRef("ANIMAL", "a1"), "weigh_head", "WH-1"),
    });
    expect(() => measurement(baseWeight({ farmId: "farm-a", evidence: [crossFarmEvidence] }))).toThrow(/cross-farm evidence/);
  });

  it("measurement() accepts evidence whose externalReference belongs to the same farm", () => {
    const sameFarmEvidence = evidenceItem("weigh_head_measurement", "Weighbridge reading", {
      externalReference: externalReference("farm-a", subjectRef("ANIMAL", "a1"), "weigh_head", "WH-1"),
    });
    expect(() => measurement(baseWeight({ farmId: "farm-a", evidence: [sameFarmEvidence] }))).not.toThrow();
  });

  it("reviseMeasurement() also rejects cross-farm evidence on the revised value", () => {
    const original = measurement(baseWeight({ farmId: "farm-a" }));
    const crossFarmEvidence = evidenceItem("weigh_head_measurement", "Weighbridge reading", {
      externalReference: externalReference("farm-b", subjectRef("ANIMAL", "a1"), "weigh_head", "WH-1"),
    });
    expect(() => reviseMeasurement(original, { ...baseWeight(), farmId: "farm-a", evidence: [crossFarmEvidence] })).toThrow(/cross-farm evidence/);
  });
});

describe("Codex audit CRITICAL (round 2): measurement() itself validates .previous, not just reviseMeasurement()", () => {
  it("rejects a caller building a farm-A measurement whose previous is a farm-B measurement directly, bypassing reviseMeasurement entirely", () => {
    const farmBOriginal = measurement(baseWeight({ farmId: "farm-b" }));
    expect(() => measurement({ ...baseWeight(), farmId: "farm-a", previous: farmBOriginal })).toThrow(/own \.previous chain belongs to farm farm-b/);
  });

  it("rejects a mismatch buried two revisions deep, not just at the immediate previous", () => {
    // v1 (farm-a) -> v2 (farm-a, legitimately revised) -> then a v3
    // constructed by hand, directly via measurement(), whose own
    // .previous is v2 but whose *grandparent* (v1) has been swapped for
    // a farm-B measurement after the fact.
    const v1 = measurement(baseWeight({ farmId: "farm-a", value: 300 }));
    const v2 = reviseMeasurement(v1, { ...baseWeight(), farmId: "farm-a", value: 310 });
    const tamperedV2 = { ...v2, previous: measurement(baseWeight({ farmId: "farm-b", value: 300 })) };
    expect(() => measurement({ ...baseWeight(), farmId: "farm-a", value: 320, previous: tamperedV2 })).toThrow(/own \.previous chain belongs to farm farm-b/);
  });

  it("rejects a previous chain about a different subject, even when the farm matches", () => {
    const originalAnimal1 = measurement(baseWeight({ subject: subjectRef("ANIMAL", "animal-1") }));
    expect(() => measurement({ ...baseWeight(), subject: subjectRef("ANIMAL", "animal-2"), previous: originalAnimal1 })).toThrow(/different subject/);
  });

  it("still accepts a genuinely consistent, multi-level previous chain", () => {
    const v1 = measurement(baseWeight({ value: 300 }));
    const v2 = reviseMeasurement(v1, { ...baseWeight(), value: 310 });
    expect(() => measurement({ ...baseWeight(), value: 320, previous: v2 })).not.toThrow();
  });

  it("copies the evidence array so mutating the caller's own array after construction never affects the already-returned measurement", () => {
    const evidence = [evidenceItem("farmer_confirmation", "Farmer confirmed")];
    const m = measurement(baseWeight({ evidence }));
    evidence.push(evidenceItem("photo", "Added after the fact"));
    expect(m.evidence).toHaveLength(1);
  });
});

describe("Codex audit CRITICAL (round 3): the returned measurement's own metadata is frozen, not merely copied once at construction", () => {
  it("throws if a caller tries to mutate the returned subject", () => {
    const m = measurement(baseWeight());
    expect(() => {
      m.subject.id = "a-different-animal";
    }).toThrow();
  });

  it("throws if a caller tries to mutate an evidence item's externalReference.farmId after construction — the exact vector round 3 found", () => {
    const evidence = [evidenceItem("weigh_head_measurement", "Weighbridge reading", { externalReference: externalReference("farm-1", subjectRef("ANIMAL", "a1"), "weigh_head", "WH-1") })];
    const m = measurement(baseWeight({ farmId: "farm-1", evidence }));
    expect(() => {
      m.evidence![0].externalReference!.farmId = "farm-2";
    }).toThrow();
    expect(m.evidence![0].externalReference?.farmId).toBe("farm-1");
  });

  it("throws if a caller tries to push a new item onto the evidence array directly (not just reassign it)", () => {
    const m = measurement(baseWeight({ evidence: [evidenceItem("farmer_confirmation", "Farmer confirmed")] }));
    expect(() => {
      // @ts-expect-error — evidence is a frozen (readonly) array.
      m.evidence!.push(evidenceItem("photo", "Added after the fact"));
    }).toThrow();
  });

  it("freezes an inherited previous chain too — mutating a revised measurement's own previous.farmId after the fact throws", () => {
    const original = measurement(baseWeight({ farmId: "farm-1" }));
    const revised = reviseMeasurement(original, { ...baseWeight(), farmId: "farm-1", value: 325 });
    expect(() => {
      revised.previous!.farmId = "farm-2";
    }).toThrow();
  });
});

describe("Codex audit MEDIUM (round 3): cyclic previous chains fail closed instead of hanging", () => {
  it("rejects a self-referential previous chain rather than looping forever", () => {
    const cyclic: Measurement<number> = baseWeight();
    cyclic.previous = cyclic;
    expect(() => measurement({ ...baseWeight(), previous: cyclic })).toThrow(/cycle/);
  });

  it("rejects a multi-node cyclic chain (A -> B -> A)", () => {
    const nodeA: Measurement<number> = baseWeight({ value: 1 });
    const nodeB: Measurement<number> = baseWeight({ value: 2 });
    nodeA.previous = nodeB;
    nodeB.previous = nodeA;
    expect(() => measurement({ ...baseWeight(), previous: nodeA })).toThrow(/cycle/);
  });
});

describe("Codex audit CRITICAL (round 4): freezing a .previous chain node cannot be spoofed by a shallow Object.freeze wrapper", () => {
  it("still freezes an inherited previous whose own top level is frozen but whose nested subject/evidence are not", () => {
    // The exact adversarial shape round 4 found: Object.freeze only
    // protects a node's own direct properties, never the objects those
    // properties point to — a caller could construct a "frozen" node
    // whose nested subject/evidence remain fully mutable underneath.
    const mutableSubject = subjectRef("ANIMAL", "animal-1");
    const mutableEvidence = [evidenceItem("farmer_confirmation", "Farmer confirmed")];
    const shallowlyFrozenPrevious: Measurement<number> = Object.freeze({
      ...baseWeight({ subject: mutableSubject, evidence: mutableEvidence }),
    });

    measurement({ ...baseWeight({ subject: mutableSubject }), previous: shallowlyFrozenPrevious });

    // The previous node's own top level reads as "frozen" already, but
    // round 4's fix no longer trusts that as proof its own nested
    // subject/evidence are safe — both must now genuinely throw too.
    expect(() => {
      mutableSubject.id = "a-different-animal";
    }).toThrow();
    expect(() => {
      mutableEvidence.push(evidenceItem("photo", "Added after the fact"));
    }).toThrow();
  });
});
