import { describe, expect, it } from "vitest";
import type { SchemeDataPoint, SchemeRequirement } from "./contracts";
import { evaluateSchemeReadiness } from "./readiness";

function requirement(
  id: string,
  dataKey: string,
  overrides: Partial<SchemeRequirement> = {},
): SchemeRequirement {
  return {
    id,
    schemeVersionKey: "scheme:2027:v1",
    dataKey,
    label: `Provide ${dataKey}`,
    owner: "schemes",
    purpose: "eligibility",
    required: true,
    applicable: true,
    priority: 10,
    ...overrides,
  };
}

function point(
  key: string,
  state: SchemeDataPoint["state"],
  overrides: Partial<SchemeDataPoint> = {},
): SchemeDataPoint {
  return {
    key,
    owner: "schemes",
    state,
    resolutionOwner: "farmer",
    ...overrides,
  };
}

describe("evaluateSchemeReadiness", () => {
  it("models 30 of 40 applicable data points as 75% without making an eligibility claim", () => {
    const requirements = Array.from({ length: 40 }, (_, index) =>
      requirement(`r-${index}`, `data-${index}`),
    );
    const points = new Map<string, SchemeDataPoint>(
      Array.from({ length: 40 }, (_, index) => [
        `data-${index}`,
        point(`data-${index}`, index < 30 ? "KNOWN" : "MISSING"),
      ]),
    );

    const result = evaluateSchemeReadiness("scheme:2027:v1", requirements, points);

    expect(result).toMatchObject({
      completeCount: 30,
      totalCount: 40,
      percentage: 75,
      assessable: true,
    });
    expect(result.needsYou).toHaveLength(10);
  });

  it("counts one canonical fact once even when several rules depend on it", () => {
    const requirements = [
      requirement("eligibility-area", "field.eligible_area_ha", { owner: "fields" }),
      requirement("payment-area", "field.eligible_area_ha", {
        owner: "fields",
        purpose: "payment",
        priority: 20,
      }),
    ];
    const points = new Map([
      [
        "field.eligible_area_ha",
        point("field.eligible_area_ha", "KNOWN", { owner: "fields" }),
      ],
    ]);

    const result = evaluateSchemeReadiness("scheme:2027:v1", requirements, points);

    expect(result.totalCount).toBe(1);
    expect(result.completeCount).toBe(1);
    expect(result.percentage).toBe(100);
  });

  it("excludes genuinely not-applicable data from the denominator", () => {
    const requirements = [
      requirement("a", "scheme.reference"),
      requirement("b", "animal.weight", { owner: "cattle" }),
    ];
    const points = new Map<string, SchemeDataPoint>([
      ["scheme.reference", point("scheme.reference", "KNOWN")],
      [
        "animal.weight",
        point("animal.weight", "NOT_APPLICABLE", {
          owner: "cattle",
          resolutionOwner: "system",
        }),
      ],
    ]);

    const result = evaluateSchemeReadiness("scheme:2027:v1", requirements, points);

    expect(result.totalCount).toBe(1);
    expect(result.percentage).toBe(100);
  });

  it("treats an absent canonical adapter as a system review gap, not farmer missing data", () => {
    const requirements = [
      requirement("animal-dob", "cattle.animal.date_of_birth", {
        owner: "cattle",
      }),
    ];

    const result = evaluateSchemeReadiness(
      "scheme:2027:v1",
      requirements,
      new Map(),
    );

    expect(result.needsYou).toHaveLength(0);
    expect(result.needsReview).toHaveLength(1);
    expect(result.needsReview[0]).toMatchObject({
      state: "UNSUPPORTED",
      resolutionOwner: "system",
    });
  });

  it("routes farmer-resolvable missing data to Needs you and conflicts to Needs review", () => {
    const requirements = [
      requirement("reference", "scheme.reference"),
      requirement("weight", "cattle.animal.weight", { owner: "cattle" }),
    ];
    const points = new Map<string, SchemeDataPoint>([
      [
        "scheme.reference",
        point("scheme.reference", "MISSING", {
          route: {
            href: "/schemes/example?edit=reference",
            returnTo: "/schemes?scheme=example#reference",
          },
        }),
      ],
      [
        "cattle.animal.weight",
        point("cattle.animal.weight", "CONFLICTING", {
          owner: "cattle",
          route: {
            href: "/cattle/animals/123?focus=weight",
            returnTo: "/schemes?scheme=example#weight",
          },
        }),
      ],
    ]);

    const result = evaluateSchemeReadiness("scheme:2027:v1", requirements, points);

    expect(result.needsYou.map((item) => item.dataKey)).toEqual([
      "scheme.reference",
    ]);
    expect(result.needsReview.map((item) => item.dataKey)).toEqual([
      "cattle.animal.weight",
    ]);
  });

  it("never reports 100% when no applicable requirements are loaded", () => {
    const result = evaluateSchemeReadiness(
      "scheme:2027:v1",
      [],
      new Map(),
    );

    expect(result.assessable).toBe(false);
    expect(result.percentage).toBeNull();
    expect(result.totalCount).toBe(0);
  });

  it("fails a conflicting ownership definition into system review instead of choosing an owner silently", () => {
    const requirements = [
      requirement("a", "shared.fact", { owner: "cattle" }),
      requirement("b", "shared.fact", { owner: "fields" }),
    ];
    const points = new Map<string, SchemeDataPoint>([
      [
        "shared.fact",
        point("shared.fact", "KNOWN", {
          owner: "cattle",
        }),
      ],
    ]);

    const result = evaluateSchemeReadiness("scheme:2027:v1", requirements, points);

    expect(result.completeCount).toBe(0);
    expect(result.needsReview[0]).toMatchObject({
      state: "REVIEW_REQUIRED",
      resolutionOwner: "system",
    });
  });
});
