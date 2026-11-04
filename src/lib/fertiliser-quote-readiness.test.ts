import { describe, expect, it } from "vitest";
import { buildFertiliserQuoteReadiness } from "./fertiliser-quote-readiness";
import { aggregateFarmFertiliserPurchasing } from "@/domain/fertiliser-plan";
import type { Field } from "@/domain/types";
import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";

const field = (overrides: Partial<Field> = {}): Field =>
  ({
    id: "f1",
    farmId: "farm",
    name: "P Collins",
    areaHa: 4,
    centroid: [0, 0],
    fertility: {
      pIndex: { value: 2, status: "verified", source: "Lab" },
      kIndex: { value: 2, status: "verified", source: "Lab" },
      verifiedTest: {
        sampleDate: "2026-01-01",
        laboratory: "Lab",
        sampleRef: "1",
        p: 4,
        k: 80,
        pH: 6.2,
      },
    },
    commonageStatus: {
      value: "not_commonage",
      status: "verified",
      source: "DAFM",
    },
    waterBufferContext: {
      value: {
        featureType: "surface_water",
        distanceM: 12,
        localOverrideStatus: "verified_none",
      },
      status: "verified",
      source: "EPA",
    },
    ...overrides,
  }) as Field;

const cycle: FieldProductionCycle = {
  id: "c1",
  fieldId: "f1",
  season: "2026",
  cropSystem: "GRASS_GRAZING",
  status: "active",
  evidence: {
    cropSystem: {
      value: "GRASS_GRAZING",
      method: "FARMER_DECLARED",
      source: "Farmer",
    },
    grazingProductionSystem: {
      value: "SUCKLER_CALF_TO_BEEF",
      method: "FARMER_DECLARED",
      source: "Farmer",
    },
    chemicalNAppliedKgHa: {
      value: 0,
      method: "FARMER_DECLARED",
      source: "Farmer",
    },
    chemicalPAppliedKgHa: {
      value: 0,
      method: "FARMER_DECLARED",
      source: "Farmer",
    },
    chemicalKAppliedKgHa: {
      value: 0,
      method: "FARMER_DECLARED",
      source: "Farmer",
    },
  },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("buildFertiliserQuoteReadiness", () => {
  it("is complete when every applicable P3/legal input is available", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: { status: "NONE_NEEDED", basis: "REMAINING_ZERO" },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const result = buildFertiliserQuoteReadiness({
      fields: [field()],
      cycles: [cycle],
      slurryAllocations: [],
      aggregation,
      farmGrazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
    });
    expect(result.ready).toBe(true);
    expect(result.percentage).toBe(100);
    expect(result.remainingCount).toBe(0);
  });

  it("deep-links each missing field input to the Nutrients stage holding its control and preserves the planning season", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "INCOMPLETE_EVIDENCE",
            missingInputs: ["fertility.pIndex"],
          },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const firstCut: FieldProductionCycle = {
      ...cycle,
      cropSystem: "GRASS_FIRST_CUT_SILAGE",
      evidence: {
        ...cycle.evidence,
        chemicalNAppliedKgHa: undefined,
        productionTargetTDMHa: undefined,
      },
    };
    const build = (planningSeason: string) =>
      buildFertiliserQuoteReadiness({
        fields: [
          field({
            fertility: {},
            commonageStatus: undefined,
            waterBufferContext: undefined,
          } as Partial<Field>),
        ],
        cycles: [firstCut],
        slurryAllocations: [],
        aggregation,
        planningSeason,
        currentSeason: "2026",
      });
    const hrefOf = (
      result: ReturnType<typeof buildFertiliserQuoteReadiness>,
      label: string,
    ) => result.items.find((row) => row.label === label)?.href;

    const current = build("2026");
    const exact = (focus: string, stage: string, season: string) =>
      `/fields?field=f1&chapter=nutrients&focus=${focus}&season=${season}#${stage}`;
    for (const [label, focus, stage] of [
      ["Soil P Index", "soil-p", "soil-evidence"],
      ["Soil K Index", "soil-k", "soil-evidence"],
      ["Soil test date", "soil-test-date", "soil-evidence"],
      ["Commonage status", "commonage", "legal-checks"],
      ["Nearest watercourse / buffer distance", "water-buffer", "legal-checks"],
      ["Fertiliser already spread this season", "prior-fertiliser", "production-cycle"],
      ["First-cut production target", "production-target", "production-cycle"],
    ] as const) {
      expect(hrefOf(current, label)).toBe(exact(focus, stage, "2026"));
    }

    const next = build("2027");
    expect(hrefOf(next, "First-cut production target")).toBe(
      exact("production-target", "production-cycle", "2027"),
    );
    expect(hrefOf(next, "Soil P Index")).toContain("&season=2027");
    // Area comes from the mapped boundary: the row opens Manage field on
    // the boundary control, for the season being quoted.
    expect(hrefOf(next, "Mapped field area")).toBe(
      "/fields?field=f1&chapter=overview&focus=field-area&season=2027#field-area",
    );
    // Next-season quotes never ask for current-season spreading history.
    expect(hrefOf(next, "Fertiliser already spread this season")).toBeUndefined();
  });

  it("shows missing production-cycle and legal evidence as incomplete checks", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "P3_MISSING_PRODUCTION_CYCLE",
            missingInputs: ["productionCycle"],
          },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const result = buildFertiliserQuoteReadiness({
      fields: [
        field({ commonageStatus: undefined, waterBufferContext: undefined }),
      ],
      cycles: [],
      slurryAllocations: [],
      aggregation,
      planningSeason: "2027",
    });
    expect(result.ready).toBe(false);
    const item = result.items.find(
      (row) => row.label === "Field use / production cycle",
    );
    expect(item?.complete).toBe(false);
    expect(item?.href).toBe(
      "/fields?field=f1&chapter=overview&focus=field-use&season=2027#field-use",
    );
  });

  it("collapses prior N/P/K into one farmer-facing fertiliser-history check and does not require a local-authority organic setback for a chemical quote", () => {
    const incompleteCycle: FieldProductionCycle = {
      ...cycle,
      evidence: {
        ...cycle.evidence,
        chemicalNAppliedKgHa: undefined,
        chemicalPAppliedKgHa: undefined,
        chemicalKAppliedKgHa: undefined,
      },
    };
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "INCOMPLETE_EVIDENCE",
            missingInputs: [
              "chemicalNAppliedKgHa",
              "chemicalPAppliedKgHa",
              "chemicalKAppliedKgHa",
            ],
          },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const result = buildFertiliserQuoteReadiness({
      fields: [
        field({
          waterBufferContext: {
            value: {
              featureType: "surface_water",
              distanceM: 12,
              localOverrideStatus: "unknown",
            },
            status: "mapped",
            source: "EPA",
          },
        }),
      ],
      cycles: [incompleteCycle],
      slurryAllocations: [],
      aggregation,
    });

    const fertiliserHistory = result.items.filter((item) =>
      item.id.endsWith(":prior-fertiliser"),
    );
    expect(fertiliserHistory).toHaveLength(1);
    expect(fertiliserHistory[0].complete).toBe(false);
    expect(
      result.items.some(
        (item) => item.label === "Chemical N already applied this cycle",
      ),
    ).toBe(false);
    expect(
      result.items.some(
        (item) => item.label === "Chemical P already applied this cycle",
      ),
    ).toBe(false);
    expect(
      result.items.some(
        (item) => item.label === "Chemical K already applied this cycle",
      ),
    ).toBe(false);
    expect(
      result.items.some(
        (item) => item.label === "Local buffer restriction status",
      ),
    ).toBe(false);
  });

  it("does not require current-season fertiliser history for a next-season quote", () => {
    const incompleteCycle: FieldProductionCycle = {
      ...cycle,
      evidence: {
        ...cycle.evidence,
        chemicalNAppliedKgHa: undefined,
        chemicalPAppliedKgHa: undefined,
        chemicalKAppliedKgHa: undefined,
      },
    };
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "INCOMPLETE_EVIDENCE",
            missingInputs: [
              "chemicalNAppliedKgHa",
              "chemicalPAppliedKgHa",
              "chemicalKAppliedKgHa",
            ],
          },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const result = buildFertiliserQuoteReadiness({
      fields: [field()],
      cycles: [incompleteCycle],
      slurryAllocations: [],
      aggregation,
      currentSeason: "2026",
      planningSeason: "2027",
    });

    expect(
      result.items.some((item) => item.id.endsWith(":prior-fertiliser")),
    ).toBe(false);
  });

  it("uses one farm-level grazing-system readiness item instead of repeating it for every grazing field", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "INCOMPLETE_EVIDENCE",
            missingInputs: ["grazingProductionSystem"],
          },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const result = buildFertiliserQuoteReadiness({
      fields: [field()],
      cycles: [cycle],
      slurryAllocations: [],
      aggregation,
    });
    const item = result.items.find((row) => row.id === "farm:grazing-system");
    expect(item).toMatchObject({
      label: "Farm grazing system",
      complete: false,
      href: "/settings#grazing-production-system",
    });
    expect(result.items.some((row) => row.id === "f1:grazing-system")).toBe(
      false,
    );
  });

  it("never reports 100% when the canonical fertiliser aggregation is still unresolved", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "MISSING_LIVESTOCK_DATA",
            missingInputs: ["livestockGroups"],
          },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const result = buildFertiliserQuoteReadiness({
      fields: [field()],
      cycles: [cycle],
      slurryAllocations: [],
      aggregation,
      farmGrazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
    });

    expect(result.ready).toBe(false);
    expect(result.percentage).toBeLessThan(100);
    expect(result.remainingCount).toBeGreaterThan(0);
    // Missing livestock records are a specific, actionable stocking input —
    // not the generic calculation-evidence fallback.
    expect(
      result.items.find((item) => item.id === "f1:stocking-evidence"),
    ).toMatchObject({ complete: false, href: "/cattle/manage" });
    expect(
      result.items.find((item) => item.id === "f1:calculation-evidence"),
    ).toBeUndefined();
  });

  it("caps the percentage below 100% and lists an actionable row whenever the quote is not ready, even with every field input complete", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: { status: "NONE_NEEDED", basis: "REMAINING_ZERO" },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const result = buildFertiliserQuoteReadiness({
      fields: [field()],
      cycles: [cycle],
      slurryAllocations: [],
      aggregation: { ...aggregation, status: "READY_WITH_PROVISIONAL_ITEMS" },
      farmGrazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
      planningSeason: "2027",
      currentSeason: "2026",
    });

    expect(result.ready).toBe(false);
    expect(result.percentage).toBeLessThan(100);
    expect(result.percentage).toBe(
      Math.min(
        99,
        Math.round((result.completeCount / result.totalCount) * 100),
      ),
    );
    // "Not ready" is never shown with nothing to resolve: one farm-level
    // row explains the unconfirmed aggregation and links to the season's
    // calculations.
    expect(result.remainingCount).toBe(1);
    expect(
      result.items.filter((item) => !item.complete),
    ).toEqual([
      expect.objectContaining({
        id: "farm:aggregation",
        fieldId: "__farm__",
        href: "/fertiliser-plan/calculations?season=2027",
      }),
    ]);
  });

  it("explains an unverified catalogue product as the reason the quote is not ready", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: { status: "RECOMMENDED" },
          purchasedProducts: [
            {
              name: "Unlisted blend",
              npkAnalysis: "1-2-3",
              rateKgHa: 100,
              totalKg: 400,
              costEur: 100,
            },
          ],
          calculationVersion: "p3",
        },
      },
    ]);
    expect(aggregation.status).toBe("INCOMPLETE");
    expect(aggregation.counts.unresolved).toBe(0);
    const result = buildFertiliserQuoteReadiness({
      fields: [field()],
      cycles: [cycle],
      slurryAllocations: [],
      aggregation,
      farmGrazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
    });

    expect(result.ready).toBe(false);
    expect(result.percentage).toBeLessThan(100);
    const row = result.items.find((item) => item.id === "farm:aggregation");
    expect(row).toMatchObject({ complete: false });
    expect(row?.detail).toMatch(/not in the verified fertiliser catalogue/i);
  });

  it("never asks a next-season quote for evidence about slurry planned in another season", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: { status: "NONE_NEEDED", basis: "REMAINING_ZERO" },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const currentSeasonSlurry = {
      fieldId: "f1",
      housingId: "h1",
      volumeM3: 80,
      // Planned for 2026 with no spreading method recorded.
      applicationDate: {
        value: "2026-04-10",
        status: "estimated" as const,
        source: "Farmer",
      },
    };
    const input = {
      fields: [field()],
      cycles: [{ ...cycle, id: "c1:quote:2027", season: "2027" }],
      slurryAllocations: [currentSeasonSlurry],
      aggregation,
      farmGrazingProductionSystem: "SUCKLER_CALF_TO_BEEF" as const,
      currentSeason: "2026",
    };

    const nextSeason = buildFertiliserQuoteReadiness({
      ...input,
      planningSeason: "2027",
    });
    expect(nextSeason.items.find((item) => item.id === "f1:slurry")).toBe(
      undefined,
    );
    expect(nextSeason.ready).toBe(true);

    // Control: the same allocation is required evidence for its own season.
    const sameSeason = buildFertiliserQuoteReadiness({
      ...input,
      cycles: [cycle],
      planningSeason: "2026",
    });
    expect(
      sameSeason.items.find((item) => item.id === "f1:slurry"),
    ).toMatchObject({ complete: false });
    expect(sameSeason.ready).toBe(false);
  });

  it("uses the generic calculation-evidence row only when the field has no more specific missing input", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "INCOMPLETE_EVIDENCE",
            missingInputs: ["fertility.pIndex"],
          },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const result = buildFertiliserQuoteReadiness({
      fields: [
        field({
          fertility: {
            kIndex: { value: 2, status: "verified", source: "Lab" },
            verifiedTest: {
              sampleDate: "2026-01-01",
              laboratory: "Lab",
              sampleRef: "1",
              p: 4,
              k: 80,
              pH: 6.2,
            },
          },
        } as Partial<Field>),
      ],
      cycles: [cycle],
      slurryAllocations: [],
      aggregation,
      farmGrazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
    });
    expect(
      result.items.find((item) => item.label === "Soil P Index")?.complete,
    ).toBe(false);
    expect(
      result.items.some((item) => item.id === "f1:calculation-evidence"),
    ).toBe(false);
  });

  it("keeps the water row open, with the exact reason, while the 3 m chemical-fertiliser strip cannot be measured", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "CHEMICAL_WATER_STRIP_GEOMETRY_UNRESOLVED",
            missingInputs: ["waterBufferContext.chemicalStripWaterLines"],
          },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const result = buildFertiliserQuoteReadiness({
      fields: [field()],
      cycles: [cycle],
      slurryAllocations: [],
      aggregation,
      farmGrazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
    });
    const water = result.items.find((item) => item.id === "f1:water-buffer");
    expect(water?.complete).toBe(false);
    expect(water?.detail).toMatch(/3 m strip where chemical fertiliser is not allowed/);
    expect(water?.href).toContain("focus=water-buffer");
    expect(
      result.items.some((item) => item.id === "f1:calculation-evidence"),
    ).toBe(false);
  });

  it("routes stocking evidence to cattle management", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "P Collins",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "INCOMPLETE_EVIDENCE",
            missingInputs: ["annualOrganicNStockingRateKgHa"],
          },
          purchasedProducts: [],
          calculationVersion: "p3",
        },
      },
    ]);
    const result = buildFertiliserQuoteReadiness({
      fields: [field()],
      cycles: [cycle],
      slurryAllocations: [],
      aggregation,
    });
    const item = result.items.find(
      (row) => row.label === "Livestock / grazing stocking evidence",
    );
    expect(item?.complete).toBe(false);
    expect(item?.href).toBe("/cattle/manage");
  });
});
