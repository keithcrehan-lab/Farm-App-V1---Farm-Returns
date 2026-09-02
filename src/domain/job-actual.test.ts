import { describe, expect, it } from "vitest";
import {
  computeRemainingPlannedAreaHa,
  validateFertiliserSpreadingActual,
  validateFieldInspectionActual,
  validateJobActualInput,
  validateLivestockWorkActual,
  validateSilageActual,
  validateSlurrySpreadingActual,
  type RawJobActualInput,
} from "./job-actual";

const FIELDS = [{ fieldId: "field-7", areaHa: 6.8 }];

function base(overrides: Partial<RawJobActualInput> = {}): RawJobActualInput {
  return { completionType: "whole", fieldIds: ["field-7"], ...overrides };
}

describe("A. fertiliser spreading", () => {
  it("whole completion derives areaHa from the real mapped field area, never invents one", () => {
    const result = validateFertiliserSpreadingActual(
      base({ product: "CAN", quantity: 250, quantityUnit: "kg" }),
      FIELDS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.areaHa).toBe(6.8);
  });

  it("partial completion uses only a farmer-confirmed area, never manufactures one when absent", () => {
    const noArea = validateFertiliserSpreadingActual(
      base({ completionType: "partial", product: "CAN", quantity: 100, quantityUnit: "kg" }),
      FIELDS,
    );
    expect(noArea.ok).toBe(true);
    if (!noArea.ok) return;
    expect(noArea.payload.areaHa).toBeUndefined();

    const withArea = validateFertiliserSpreadingActual(
      base({ completionType: "partial", product: "CAN", quantity: 100, quantityUnit: "kg", areaHa: 4.1 }),
      FIELDS,
    );
    expect(withArea.ok).toBe(true);
    if (!withArea.ok) return;
    expect(withArea.payload.areaHa).toBe(4.1);
  });

  it("did_not_happen requires no product/quantity and has no area", () => {
    const result = validateFertiliserSpreadingActual(base({ completionType: "did_not_happen" }), FIELDS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.product).toBeUndefined();
    expect(result.payload.areaHa).toBeUndefined();
  });

  it("rejects a whole/partial completion missing product or quantity", () => {
    const result = validateFertiliserSpreadingActual(base({}), FIELDS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("product"))).toBe(true);
    expect(result.errors.some((e) => e.includes("quantity"))).toBe(true);
  });

  it("rejects an empty field list", () => {
    const result = validateFertiliserSpreadingActual(
      { ...base({ product: "CAN", quantity: 1, quantityUnit: "kg" }), fieldIds: [] },
      FIELDS,
    );
    expect(result.ok).toBe(false);
  });

  it("supports multiple fields in one session (multi-field architecture)", () => {
    const twoFields = [
      { fieldId: "field-7", areaHa: 6.8 },
      { fieldId: "field-8", areaHa: 3.2 },
    ];
    const result = validateFertiliserSpreadingActual(
      base({ fieldIds: ["field-7", "field-8"], product: "CAN", quantity: 500, quantityUnit: "kg" }),
      twoFields,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.areaHa).toBe(10);
  });
});

describe("B. slurry spreading", () => {
  it("never infers volume from GPS -- a positive farmer-entered quantity is required", () => {
    const missing = validateSlurrySpreadingActual(base({}), FIELDS);
    expect(missing.ok).toBe(false);

    const zero = validateSlurrySpreadingActual(base({ quantity: 0, quantityUnit: "m3" }), FIELDS);
    expect(zero.ok).toBe(false);

    const real = validateSlurrySpreadingActual(base({ quantity: 20, quantityUnit: "m3" }), FIELDS);
    expect(real.ok).toBe(true);
  });

  it("accepts a known application method and rejects an unsupported one", () => {
    const known = validateSlurrySpreadingActual(
      base({ quantity: 20, quantityUnit: "m3", applicationMethod: "LESS" }),
      FIELDS,
    );
    expect(known.ok).toBe(true);

    const unknown = validateSlurrySpreadingActual(
      base({ quantity: 20, quantityUnit: "m3", applicationMethod: "helicopter" }),
      FIELDS,
    );
    expect(unknown.ok).toBe(false);
  });
});

describe("C. silage", () => {
  it("does not invent a yield -- bales/tonnes absent unless genuinely supplied", () => {
    const result = validateSilageActual(base({}), FIELDS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.bales).toBeUndefined();
    expect(result.payload.tonnes).toBeUndefined();
  });

  it("accepts genuinely supplied bales/tonnes", () => {
    const result = validateSilageActual(base({ bales: 120, tonnes: 45 }), FIELDS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.bales).toBe(120);
    expect(result.payload.tonnes).toBe(45);
  });
});

describe("D. field inspection", () => {
  it("is lightweight -- only a field and completion type are strictly required", () => {
    const result = validateFieldInspectionActual(base({ observationNote: "Yellowing in the wet corner" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.observationNote).toBe("Yellowing in the wet corner");
  });

  it("rejects with no field", () => {
    const result = validateFieldInspectionActual({ ...base({}), fieldIds: [] });
    expect(result.ok).toBe(false);
  });
});

describe("E. livestock work — field must be optional", () => {
  it("accepts a livestock action with no field at all", () => {
    const result = validateLivestockWorkActual({
      completionType: "whole",
      livestockGroupId: "group-1",
      action: "dosed",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("fieldIds" in result.payload).toBe(false);
  });

  it("requires at least a group or an animal, and an action", () => {
    const noTarget = validateLivestockWorkActual({ completionType: "whole", action: "dosed" });
    expect(noTarget.ok).toBe(false);

    const noAction = validateLivestockWorkActual({ completionType: "whole", animalId: "animal-1" } as never);
    expect(noAction.ok).toBe(false);
  });
});

describe("validateJobActualInput dispatcher", () => {
  it("routes to the correct per-activity validator", () => {
    const result = validateJobActualInput(
      "fertiliser_spreading",
      base({ product: "CAN", quantity: 250, quantityUnit: "kg" }),
      FIELDS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.activityType).toBe("fertiliser_spreading");
  });
});

describe("computeRemainingPlannedAreaHa", () => {
  it("computes the remainder without mutating any stored plan", () => {
    expect(computeRemainingPlannedAreaHa(6.8, 4.1)).toBeCloseTo(2.7);
  });

  it("floors at zero rather than going negative", () => {
    expect(computeRemainingPlannedAreaHa(6.8, 9)).toBe(0);
  });
});
