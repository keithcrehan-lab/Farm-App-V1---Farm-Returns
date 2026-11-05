import { describe, expect, it } from "vitest";
import type { StoredSchemeDefinition } from "./repository";
import { calculateSchemePayment } from "./payment";

const definition: StoredSchemeDefinition = {
  version: {
    id: "v1",
    schemeKey: "example",
    displayName: "Example",
    category: "livestock_support",
    authority: "DAFM",
    schemeYear: 2027,
    programmeGeneration: null,
    rulesVersion: "v1",
    effectiveFrom: null,
    effectiveTo: null,
    applicationOpen: null,
    applicationClose: null,
    lateApplicationClose: null,
    publicationState: "verified",
    v1Enabled: true,
    enterpriseRelevance: [],
    supportType: null,
    recurrenceType: null,
    requiresAdviser: false,
    verifiedAt: "2027-01-01T00:00:00.000Z",
  },
  sources: [],
  rules: [],
};

describe("calculateSchemePayment", () => {
  it("never invents €0 when no source-reviewed calculator is registered", () => {
    const result = calculateSchemePayment(definition, new Map(), {});

    expect(result).toMatchObject({
      state: "UNSUPPORTED",
      amount: null,
      low: null,
      high: null,
    });
  });

  it("uses only an explicitly registered calculator", () => {
    const result = calculateSchemePayment(definition, new Map(), {
      "example:2027:v1": () => ({
        state: "CALCULATED",
        currency: "EUR",
        amount: 1200,
        low: 1200,
        high: 1200,
        method: "official_example_v1",
        rateStatus: "final",
        detail: "Calculated from the source-reviewed example.",
        sourceIds: ["source-1"],
      }),
    });

    expect(result.state).toBe("CALCULATED");
    expect(result.amount).toBe(1200);
  });
});
