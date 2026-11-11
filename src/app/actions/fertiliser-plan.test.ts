import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fertiliser Vertical campaign — direct tests for the three new
 * fertiliser-plan actions at their own real boundary (mocking only the
 * farm-data reads/writes, exercising the real filtering/validation logic
 * in this file itself). Same mocking convention `decisions.test.ts`
 * already established.
 */
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/decisions", () => ({
  listDecisionsForFarm: vi.fn(),
  getDecisionById: vi.fn(),
}));
vi.mock("@/lib/farm-data/job-sessions", () => ({
  listJobSessionDecisionIdsForFarm: vi.fn(),
  getJobSessionById: vi.fn(),
}));
vi.mock("@/lib/farm-data/livestock", () => ({
  listLivestockGroupsForFarm: vi.fn(),
}));
vi.mock("@/lib/farm-data/slurry", () => {
  const listSlurryAllocationsForFarm = vi.fn();
  return {
    listSlurryAllocationsForFarm,
    // The planning loader reads lifecycle records; each test's planned
    // allocations become planned records with a stable identity.
    listSlurryAllocationRecordsForFarm: vi.fn(async (farmId: string) =>
      ((await listSlurryAllocationsForFarm(farmId)) ?? []).map(
        (allocation: object, index: number) => ({
          id: `alloc-${index + 1}`,
          farmId,
          status: "planned",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          ...allocation,
        }),
      ),
    ),
  };
});
vi.mock("@/lib/farm-data/slurry-forecast-adoptions", () => ({
  listSlurryForecastAdoptionsForFarm: vi.fn(async () => []),
  createSlurryForecastAdoption: vi.fn(),
  isSystemSlurryForecastWriteConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/farm-data/housing", () => ({ listHousingForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry-composition", () => ({
  listSlurryCompositionRecordsForFarm: vi.fn(async () => []),
}));
vi.mock("@/lib/farm-data/grazing-field-sessions", () => ({
  listGrazingFieldSessionsForFarm: vi.fn(async () => []),
}));
vi.mock("@/lib/farm-data/regulatory-evidence", () => ({
  loadRegulatoryEvidenceRecordsForFarm: vi.fn(async () => ({
    neatSlurryEvidenceRecords: [],
    spreadableAreaRecords: [],
    slurryOriginEvidenceRecords: [],
    evidenceTablesApplied: true,
  })),
}));
vi.mock("@/orchestration/job-session", () => ({
  startJobSessionFromPlan: vi.fn(),
}));
// `sanitiseDecisionRecordForClient` is a real, pure, no-I/O function
// (Codex audit CRITICAL, round 8) — imported from the real module
// rather than mocked, alongside the two real I/O functions this file's
// own tests still need mocked.
vi.mock("@/orchestration/fertiliser-plan", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/orchestration/fertiliser-plan")>();
  return {
    ...actual,
    getFieldRemainingFertiliserRequirement: vi.fn(),
    getFarmFertiliserDemand: vi.fn(),
  };
});
vi.mock("@/lib/farm-data/field-production-cycles", () => ({
  getFieldProductionCycle: vi.fn(async () => null),
  listFieldProductionCyclesForSeason: vi.fn(async () => []),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import {
  listDecisionsForFarm,
  getDecisionById,
} from "@/lib/farm-data/decisions";
import {
  listJobSessionDecisionIdsForFarm,
  getJobSessionById,
} from "@/lib/farm-data/job-sessions";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { listSlurryCompositionRecordsForFarm } from "@/lib/farm-data/slurry-composition";
import { listGrazingFieldSessionsForFarm } from "@/lib/farm-data/grazing-field-sessions";
import {
  getFieldProductionCycle,
  listFieldProductionCyclesForSeason,
} from "@/lib/farm-data/field-production-cycles";
import { startJobSessionFromPlan } from "@/orchestration/job-session";
import {
  getFieldRemainingFertiliserRequirement,
  getFarmFertiliserDemand,
} from "@/orchestration/fertiliser-plan";
import {
  getMatchablePlanForFieldAction,
  startJobSessionFromPlanAction,
  getLinkedFertiliserPlanForJobSessionAction,
  getFieldFertiliserStatusAction,
  getFarmFertiliserDemandAction,
  previewSlurryFirstFertiliserPlanAction,
  getFarmLimeRequirementAction,
  getAutomaticSlurryPlanAction,
  adoptSlurryForecastScenarioAction,
  getAdoptedSlurryForecastAction,
  getSlurryStorageForecastAction,
} from "./fertiliser-plan";
import type { Farm, Field } from "@/domain/types";
import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";
import type { DecisionRecord, JobSessionRecord } from "@/lib/farm-data/mappers";
import { aggregateFarmFertiliserPurchasing } from "@/domain/fertiliser-plan";
import { wholeFarmFieldRows } from "@/lib/whole-farm-nutrient-plan-presentation";
import { loadRegulatoryEvidenceRecordsForFarm } from "@/lib/farm-data/regulatory-evidence";
import { NUTRIENT_ENGINE_VERSION } from "@/domain/nutrients";
import {
  createSlurryForecastAdoption,
  isSystemSlurryForecastWriteConfigured,
  listSlurryForecastAdoptionsForFarm,
} from "@/lib/farm-data/slurry-forecast-adoptions";
import { SLURRY_COMPOSITION_VERSION } from "@/domain/slurry-composition";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockListDecisions = vi.mocked(listDecisionsForFarm);
const mockGetDecisionById = vi.mocked(getDecisionById);
const mockListJobSessionDecisionIds = vi.mocked(
  listJobSessionDecisionIdsForFarm,
);
const mockGetJobSessionById = vi.mocked(getJobSessionById);
const mockStartJobSessionFromPlan = vi.mocked(startJobSessionFromPlan);
const mockListLivestockGroups = vi.mocked(listLivestockGroupsForFarm);
const mockListSlurryAllocations = vi.mocked(listSlurryAllocationsForFarm);
const mockListHousing = vi.mocked(listHousingForFarm);
const mockListSlurryCompositionRecords = vi.mocked(
  listSlurryCompositionRecordsForFarm,
);
const mockListGrazingFieldSessions = vi.mocked(listGrazingFieldSessionsForFarm);
const mockGetFieldProductionCycle = vi.mocked(getFieldProductionCycle);
const mockListFieldProductionCyclesForSeason = vi.mocked(
  listFieldProductionCyclesForSeason,
);
const mockGetFieldRemainingFertiliserRequirement = vi.mocked(
  getFieldRemainingFertiliserRequirement,
);
const mockGetFarmFertiliserDemand = vi.mocked(getFarmFertiliserDemand);

afterEach(() => {
  vi.clearAllMocks();
  mockGetFieldProductionCycle.mockResolvedValue(null);
  mockListFieldProductionCyclesForSeason.mockResolvedValue([]);
  mockListGrazingFieldSessions.mockResolvedValue([]);
});

const farm: Farm = {
  id: "farm-1",
  name: "Green Acres",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: [],
  units: "metric",
  ownerName: "Keith",
  grazingProductionSystem: {
    value: "SUCKLER_CALF_TO_BEEF",
    status: "farmer_adjusted",
    source: "Keith",
  },
};

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Back Meadow",
    areaHa: 4.2,
    centroid: [0, 0],
    fertility: {},
    ...overrides,
  } as Field;
}

// A field with real soil evidence — used wherever a test needs
// `promptForFertiliserRecommendation`'s own live recompute to actually
// reach `OK` (Codex audit CRITICAL, round 7: `getMatchablePlanForFieldAction`/
// `startJobSessionFromPlanAction` now both recompute this before treating
// a plan as matchable/startable — see `isPlanStillCurrentlyRecommendable`'s
// own doc comment in `./fertiliser-plan.ts`).
function fertiliserField(overrides: Partial<Field> = {}): Field {
  return field({
    fertility: {
      pIndex: { value: 1, status: "verified", source: "Soil test" },
      kIndex: { value: 1, status: "verified", source: "Soil test" },
    },
    ...overrides,
  });
}

// A field `widthM` wide × 100 m tall near Mullingar, with a mapped stream
// running along its west boundary (S.I. 588/2025 Article 18(1) strip tests).
const STRIP_LAT_M = 1 / 111_320;
const STRIP_LON_M = 1 / (111_320 * Math.cos((53.5 * Math.PI) / 180));
function stripTestPolygon(widthM: number): GeoJSON.Polygon {
  const [w, s] = [-7.35, 53.5];
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [w + widthM * STRIP_LON_M, s],
        [w + widthM * STRIP_LON_M, s + 100 * STRIP_LAT_M],
        [w, s + 100 * STRIP_LAT_M],
        [w, s],
      ],
    ],
  };
}
function streamAlongWestEdge(): GeoJSON.MultiLineString {
  return {
    type: "MultiLineString",
    coordinates: [
      [
        [-7.35, 53.5 - 50 * STRIP_LAT_M],
        [-7.35, 53.5 + 150 * STRIP_LAT_M],
      ],
    ],
  };
}

// P Index 2 / K Index 4: a field whose agronomic P need and the P the
// potash product brings both sit within the Table 15a maximum, so tests of
// other contracts are not blocked by the statutory P ceiling (its own
// F002 tests set the soil indices they need explicitly).
function p3Field(overrides: Partial<Field> = {}): Field {
  return field({
    fertility: {
      pIndex: { value: 2, status: "verified", source: "Soil test" },
      kIndex: { value: 4, status: "verified", source: "Soil test" },
      verifiedTest: {
        sampleDate: "2026-01-10",
        laboratory: "Lab",
        sampleRef: "S1",
        p: 4,
        k: 90,
        pH: 6.3,
      },
    },
    commonageStatus: {
      value: "not_commonage",
      status: "verified",
      source: "Farmer",
    },
    waterBufferContext: {
      value: {
        featureType: "surface_water",
        distanceM: 10,
        localOverrideStatus: "verified_none",
      },
      status: "verified",
      source: "Farmer",
    },
    ...overrides,
  });
}

function p3GrazingCycle(fieldId = "field-1"): FieldProductionCycle {
  return {
    id: `cycle-${fieldId}`,
    fieldId,
    season: "2026",
    cropSystem: "GRASS_GRAZING",
    status: "active",
    evidence: {
      cropSystem: {
        value: "GRASS_GRAZING",
        method: "FARMER_DECLARED",
        source: "Keith",
      },
      grazingProductionSystem: {
        value: "SUCKLER_CALF_TO_BEEF",
        method: "FARMER_DECLARED",
        source: "Keith",
      },
      chemicalNAppliedKgHa: {
        value: 0,
        method: "FARMER_DECLARED",
        source: "Keith",
      },
      chemicalPAppliedKgHa: {
        value: 0,
        method: "FARMER_DECLARED",
        source: "Keith",
      },
      chemicalKAppliedKgHa: {
        value: 0,
        method: "FARMER_DECLARED",
        source: "Keith",
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function p3FirstCutCycle(
  overrides: Partial<FieldProductionCycle> = {},
): FieldProductionCycle {
  return {
    id: "cycle-1",
    fieldId: "field-1",
    season: "2026",
    cropSystem: "GRASS_FIRST_CUT_SILAGE",
    status: "active",
    evidence: {
      cropSystem: {
        value: "GRASS_FIRST_CUT_SILAGE",
        method: "FARMER_DECLARED",
        source: "Keith",
      },
      productionTargetTDMHa: {
        value: 5,
        method: "FARMER_DECLARED",
        source: "Keith",
      },
      chemicalNAppliedKgHa: {
        value: 10,
        method: "FARMER_DECLARED",
        source: "Keith",
      },
      chemicalPAppliedKgHa: {
        value: 0,
        method: "FARMER_DECLARED",
        source: "Keith",
      },
      chemicalKAppliedKgHa: {
        value: 0,
        method: "FARMER_DECLARED",
        source: "Keith",
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const REAL_LIVESTOCK_GROUPS = [
  {
    id: "g1",
    farmId: "farm-1",
    category: "suckler_cow" as const,
    label: "Cows",
    count: { value: 20, status: "verified" as const, source: "Farmer" },
    system: "grazing" as const,
    value: {
      value: 30000,
      status: "estimated" as const,
      source: "Farm Return estimate",
    },
  },
];

function plan(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: "decision-plan-1",
    farmId: "farm-1",
    promptId: "prompt-1",
    calculationKind: "fertiliser_recommendation",
    fieldId: "field-1",
    estimateSnapshot: {
      status: "OK",
      value: {
        fieldId: "field-1",
        areaHa: 4.2,
        products: [
          {
            name: "18-6-12",
            npkAnalysis: "18-6-12",
            rateKgHa: 66.7,
            totalKg: 266.7,
            costEur: 165,
          },
        ],
      },
      evidenceState: "IRISH_MODEL",
    },
    outcome: "accepted",
    decidedBy: "farmer",
    decidedAt: "2026-09-01T09:00:00Z",
    createdAt: "2026-09-01T09:00:00Z",
    ...overrides,
  };
}

describe("getMatchablePlanForFieldAction", () => {
  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getMatchablePlanForFieldAction("field-1")).rejects.toThrow(
      /no real farm/i,
    );
  });

  it("returns 'none' when no accepted fertiliser plan exists for this field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "none",
    });
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2): an archived field must never be matchable — it should behave
  // exactly as if the field genuinely doesn't exist any more.
  it("returns 'none' for a real archived field, even with a real accepted plan on record — an archived field is never matchable", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      field({ archivedAt: "2026-09-01T00:00:00Z" }),
    ]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "none",
    });
  });

  it("returns the single real matchable plan when exactly one unlinked accepted plan exists for this field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    // Codex audit CRITICAL (round 7): a real, currently-recommendable
    // field/herd is required — `getMatchablePlanForFieldAction` now
    // recomputes the field's own live recommendation before treating any
    // candidate as matchable (see `isPlanStillCurrentlyRecommendable`).
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    // Codex audit CRITICAL (round 7): the returned plan's own products
    // are sanitised of their real per-product mock `costEur` too — see
    // `sanitiseDecisionRecordForClient`.
    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "matched",
      plan: {
        ...plan(),
        estimateSnapshot: {
          status: "OK",
          value: {
            fieldId: "field-1",
            areaHa: 4.2,
            products: [
              {
                name: "18-6-12",
                npkAnalysis: "18-6-12",
                rateKgHa: 66.7,
                totalKg: 266.7,
              },
            ],
          },
          evidenceState: "IRISH_MODEL",
        },
      },
    });
  });

  it("returns 'ambiguous' — never auto-selects — when more than one real plan matches this field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [
        plan({ id: "decision-plan-1" }),
        plan({ id: "decision-plan-2" }),
      ],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "ambiguous",
      candidateCount: 2,
    });
  });

  it("excludes a plan already linked to a job session — never a second, competing link to the same real plan", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(["decision-plan-1"]),
      truncated: false,
    });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "none",
    });
  });

  it("excludes a dismissed decision and a decision for a different field/calculationKind — never a false match", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({
      decisions: [
        plan({ id: "d-dismissed", outcome: "dismissed" }),
        plan({ id: "d-other-field", fieldId: "field-2" }),
        plan({ id: "d-other-kind", calculationKind: "commonage_status" }),
      ],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "none",
    });
  });

  // Codex audit HIGH (round 4) — a bare acceptance of a multi-product
  // recommendation can never safely stand in for one GPS-detected job.
  it("excludes a bare-accepted plan representing more than one real product — never GPS-matchable, no farmer-chosen single product exists", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({
      decisions: [
        plan({
          outcome: "accepted",
          estimateSnapshot: {
            status: "OK",
            value: {
              fieldId: "field-1",
              products: [
                {
                  name: "18-6-12",
                  npkAnalysis: "18-6-12",
                  rateKgHa: 66.7,
                  totalKg: 266.7,
                  costEur: 165,
                },
                {
                  name: "Protected Urea",
                  npkAnalysis: "46-0-0",
                  rateKgHa: 50,
                  totalKg: 200,
                  costEur: 111,
                },
              ],
            },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "none",
    });
  });

  it("still matches a multi-product recommendation once the farmer has explicitly chosen a single planned product (an 'edited' plan)", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    const multiProductEditedPlan = plan({
      outcome: "edited",
      edits: { plannedProduct: "Protected Urea", plannedQuantityKg: 200 },
      estimateSnapshot: {
        status: "OK",
        value: {
          fieldId: "field-1",
          products: [
            {
              name: "18-6-12",
              npkAnalysis: "18-6-12",
              rateKgHa: 66.7,
              totalKg: 266.7,
              costEur: 165,
            },
            {
              name: "Protected Urea",
              npkAnalysis: "46-0-0",
              rateKgHa: 50,
              totalKg: 200,
              costEur: 111,
            },
          ],
        },
        evidenceState: "IRISH_MODEL",
      },
    });
    mockListDecisions.mockResolvedValue({
      decisions: [multiProductEditedPlan],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    // Codex audit CRITICAL (round 7): products sanitised of their real
    // per-product mock `costEur` — see `sanitiseDecisionRecordForClient`.
    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "matched",
      plan: {
        ...multiProductEditedPlan,
        estimateSnapshot: {
          status: "OK",
          value: {
            fieldId: "field-1",
            products: [
              {
                name: "18-6-12",
                npkAnalysis: "18-6-12",
                rateKgHa: 66.7,
                totalKg: 266.7,
              },
              {
                name: "Protected Urea",
                npkAnalysis: "46-0-0",
                rateKgHa: 50,
                totalKg: 200,
              },
            ],
          },
          evidenceState: "IRISH_MODEL",
        },
      },
    });
  });

  // Codex audit CRITICAL (round 7): a plan persisted before the field
  // became tillage (or before this campaign's own tillage gate existed)
  // must not remain matchable once the field's *current* state no
  // longer supports a real recommendation — its own frozen snapshot
  // once being "OK" is not enough.
  it("excludes a real, single-product, unlinked plan whose field is now tillage — no longer currently recommendable", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      fertiliserField({
        plannedUse: { value: "tillage", status: "verified", source: "Farmer" },
      }),
    ]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "none",
    });
  });

  it("excludes a real, single-product, unlinked plan whose farm no longer has any recorded livestock", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "none",
    });
  });

  // Codex audit HIGH (round 9, revised round 10 — the prior rejection is
  // withdrawn): the field still has *some* real, current "OK"
  // recommendation, but the stored plan's own selected product is no
  // longer among it — the live blend changed (e.g. new soil/slurry
  // evidence) since the plan was made. This is a distinct check from
  // quantity independence (round 9's own still-valid point, untouched
  // here): the plan's *product* must still be real and current, its
  // *quantity* never needs to match.
  it("excludes a real, single-product, unlinked plan whose own selected product is no longer part of the field's current live recommendation", async () => {
    mockGetFarm.mockResolvedValue(farm);
    // fertiliserField() (Index 1/1, 4.2 ha) + 20 cows, no slurry -> the
    // real, current live recommendation is ["0-7-30", "18-6-12",
    // "Protected Urea"] — verified directly against
    // calculateNutrientPlan for this exact fixture combination.
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [
        plan({
          estimateSnapshot: {
            status: "OK",
            // "CAN 27%" is not one of this app's own catalogue products
            // at all (the same fixture `validateFertiliserPlanEdits`'s
            // own tests already use as "a completely fabricated
            // product") — genuinely not part of any live recommendation.
            value: {
              fieldId: "field-1",
              products: [
                {
                  name: "CAN 27%",
                  npkAnalysis: "27-0-0",
                  rateKgHa: 40,
                  totalKg: 160,
                },
              ],
            },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "none",
    });
  });

  it("still matches when the stored plan's own selected product remains part of the field's current live recommendation", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    // The real, unmodified plan() fixture names "18-6-12" — genuinely
    // still part of this exact fixture's real current live blend.
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    const result = await getMatchablePlanForFieldAction("field-1");
    expect(result.status).toBe("matched");
  });
});

describe("startJobSessionFromPlanAction", () => {
  const stubbedJobSession = { id: "session-1" } as JobSessionRecord;

  // Codex audit HIGH (round 32): this action now re-verifies the real
  // statutory closed-period calendar at execution time, which reads the
  // real wall-clock date — every other test in this block needs a fixed
  // "clearly open" date so it doesn't start silently failing once the
  // real calendar date passes into `farm`'s (Cork, Zone A) chemical-
  // fertiliser closed period (15 Sep - 29 Jan).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T09:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects any activityType other than fertiliser_spreading — never links a fertiliser plan to an unrelated job type", async () => {
    mockGetFarm.mockResolvedValue(farm);
    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        // @ts-expect-error deliberately testing a runtime-only invalid value a direct caller could still send
        activityType: "slurry_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/must be "fertiliser_spreading"/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/no real farm/i);
  });

  it("rejects a fieldId not on this farm's own real fields", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ id: "field-1" })]);

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "someone-elses-field",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/not found/i);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2): a new job session must never be startable against a field the
  // farmer has archived — the same "not found" failure a genuinely
  // deleted field would produce.
  it("rejects a real archived field — never starts a new job session against it", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      field({ id: "field-1", archivedAt: "2026-09-01T00:00:00Z" }),
    ]);

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/not found/i);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects a planDecisionId not found on this farm's own real decisions", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "nonexistent",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/not found/i);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects a dismissed plan — only accepted/edited plans can start a job", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan({ outcome: "dismissed" })],
      truncated: false,
    });

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/only an accepted\/edited plan/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects a decision that is not a real fertiliser plan", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan({ calculationKind: "commonage_status" })],
      truncated: false,
    });

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/not a real fertiliser plan/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects a plan for a different field than requested — never links a mismatched field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      field({ id: "field-1" }),
      field({ id: "field-2" }),
    ]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan({ fieldId: "field-2" })],
      truncated: false,
    });

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/different field/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects a plan already linked to a job session — defense in depth on top of the database's own unique constraint", async () => {
    mockGetFarm.mockResolvedValue(farm);
    // Codex audit CRITICAL (round 7): a real, currently-recommendable
    // field/herd is required to reach this check at all — see
    // `isPlanStillCurrentlyRecommendable`.
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(["decision-plan-1"]),
      truncated: false,
    });

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/already linked/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects starting the job during the farm county's real statutory closed period for chemical fertiliser — re-verified at this real execution boundary, not trusted from the plan's own recompute alone", async () => {
    vi.setSystemTime(new Date("2026-10-01T09:00:00.000Z")); // Cork (Zone A) chemical-fertiliser closed period: 15 Sep - 29 Jan
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/cannot start this job/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("starts a real job session from a real, valid, unlinked accepted plan", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });
    mockStartJobSessionFromPlan.mockResolvedValue({
      decision: plan(),
      jobSession: stubbedJobSession,
    });

    const result = await startJobSessionFromPlanAction({
      planDecisionId: "decision-plan-1",
      fieldId: "field-1",
      activityType: "fertiliser_spreading",
      jobSessionId: "session-1",
    });

    expect(mockStartJobSessionFromPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        planDecision: plan(),
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
        primaryFieldId: "field-1",
      }),
    );
    expect(result.jobSession).toBe(stubbedJobSession);
  });

  // Codex audit HIGH (round 4) — defense in depth: a direct caller
  // bypassing getMatchablePlanForFieldAction's own identical check must
  // still be refused.
  it("rejects starting a job from a bare-accepted plan representing more than one real product — never safely executable as one job", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({
      decisions: [
        plan({
          outcome: "accepted",
          estimateSnapshot: {
            status: "OK",
            value: {
              fieldId: "field-1",
              products: [
                {
                  name: "18-6-12",
                  npkAnalysis: "18-6-12",
                  rateKgHa: 66.7,
                  totalKg: 266.7,
                  costEur: 165,
                },
                {
                  name: "Protected Urea",
                  npkAnalysis: "46-0-0",
                  rateKgHa: 50,
                  totalKg: 200,
                  costEur: 111,
                },
              ],
            },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/more than one product/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("also accepts an 'edited' plan (a farmer-adjusted quantity/product/date), not only 'accepted'", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [
        plan({ outcome: "edited", edits: { plannedQuantityKg: 240 } }),
      ],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({
      decisionIds: new Set(),
      truncated: false,
    });
    mockStartJobSessionFromPlan.mockResolvedValue({
      decision: plan(),
      jobSession: stubbedJobSession,
    });

    await startJobSessionFromPlanAction({
      planDecisionId: "decision-plan-1",
      fieldId: "field-1",
      activityType: "fertiliser_spreading",
      jobSessionId: "session-1",
    });
    expect(mockStartJobSessionFromPlan).toHaveBeenCalledTimes(1);
  });

  // Codex audit CRITICAL (round 7): defense in depth on top of
  // `getMatchablePlanForFieldAction`'s own identical check — a direct
  // caller bypassing the UI's own matching lookup must not be able to
  // start a job from a plan whose field is no longer currently
  // recommendable either.
  it("rejects starting a job from a plan whose field is now tillage — no longer currently recommendable", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      fertiliserField({
        plannedUse: { value: "tillage", status: "verified", source: "Farmer" },
      }),
    ]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/no longer currently recommendable/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects starting a job from a plan whose farm no longer has any recorded livestock", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan()],
      truncated: false,
    });

    await expect(
      startJobSessionFromPlanAction({
        planDecisionId: "decision-plan-1",
        fieldId: "field-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
      }),
    ).rejects.toThrow(/no longer currently recommendable/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });
});

describe("getLinkedFertiliserPlanForJobSessionAction", () => {
  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(
      getLinkedFertiliserPlanForJobSessionAction("session-1"),
    ).rejects.toThrow(/no real farm/i);
  });

  it("returns null when the job session doesn't exist on this farm", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue(null);
    await expect(
      getLinkedFertiliserPlanForJobSessionAction("session-1"),
    ).resolves.toBeNull();
  });

  it("returns null for a non-'plan'-origin job session — nothing genuine to prefill from", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({
      id: "session-1",
      farmId: "farm-1",
      decisionId: "d1",
      activityType: "fertiliser_spreading",
      origin: "manual",
      status: "active",
      fieldSegments: [],
      activeIntervals: [],
      interruptionGaps: [],
      createdAt: "x",
      updatedAt: "x",
    });
    await expect(
      getLinkedFertiliserPlanForJobSessionAction("session-1"),
    ).resolves.toBeNull();
  });

  it("returns null when the linked decision is not a real fertiliser plan", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({
      id: "session-1",
      farmId: "farm-1",
      decisionId: "decision-plan-1",
      activityType: "fertiliser_spreading",
      origin: "plan",
      status: "active",
      fieldSegments: [],
      activeIntervals: [],
      interruptionGaps: [],
      createdAt: "x",
      updatedAt: "x",
    });
    mockGetDecisionById.mockResolvedValue(
      plan({ calculationKind: "commonage_status" }),
    );
    await expect(
      getLinkedFertiliserPlanForJobSessionAction("session-1"),
    ).resolves.toBeNull();
  });

  it("returns null when the linked decision id does not resolve to any real decision on this farm", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({
      id: "session-1",
      farmId: "farm-1",
      decisionId: "decision-plan-1",
      activityType: "fertiliser_spreading",
      origin: "plan",
      status: "active",
      fieldSegments: [],
      activeIntervals: [],
      interruptionGaps: [],
      createdAt: "x",
      updatedAt: "x",
    });
    mockGetDecisionById.mockResolvedValue(null);
    await expect(
      getLinkedFertiliserPlanForJobSessionAction("session-1"),
    ).resolves.toBeNull();
  });

  it("returns the real recommended products plus the farmer's own real planned edits for a genuine 'plan'-origin session — via a real, uncapped single-decision lookup, never the capped history list", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({
      id: "session-1",
      farmId: "farm-1",
      decisionId: "decision-plan-1",
      activityType: "fertiliser_spreading",
      origin: "plan",
      status: "active",
      fieldSegments: [],
      activeIntervals: [],
      interruptionGaps: [],
      createdAt: "x",
      updatedAt: "x",
    });
    mockGetDecisionById.mockResolvedValue(
      plan({
        outcome: "edited",
        edits: {
          plannedProduct: "18-6-12",
          plannedQuantityKg: 240,
          plannedDate: "2026-09-20",
        },
      }),
    );

    // Codex audit CRITICAL (round 7): `recommendedProducts` is sanitised
    // of its real per-product mock `costEur`, defensively, regardless of
    // whether the persisted snapshot predates round 6's own fix.
    await expect(
      getLinkedFertiliserPlanForJobSessionAction("session-1"),
    ).resolves.toEqual({
      decisionId: "decision-plan-1",
      fieldId: "field-1",
      recommendedProducts: [
        {
          name: "18-6-12",
          npkAnalysis: "18-6-12",
          rateKgHa: 66.7,
          totalKg: 266.7,
        },
      ],
      plannedProduct: "18-6-12",
      plannedQuantityKg: 240,
      plannedDate: "2026-09-20",
    });
    expect(mockGetDecisionById).toHaveBeenCalledWith(
      "farm-1",
      "decision-plan-1",
    );
    expect(mockListDecisions).not.toHaveBeenCalled();
  });

  it("falls back to the single-product recommendation's own real product/quantity for a plan accepted as-is (no farmer edit) — Codex audit HIGH, round 14", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({
      id: "session-1",
      farmId: "farm-1",
      decisionId: "decision-plan-1",
      activityType: "fertiliser_spreading",
      origin: "plan",
      status: "active",
      fieldSegments: [],
      activeIntervals: [],
      interruptionGaps: [],
      createdAt: "x",
      updatedAt: "x",
    });
    mockGetDecisionById.mockResolvedValue(plan());

    // "Accept as recommended" for a single-product recommendation is
    // already treated elsewhere (Planned demand, GPS matching/starting)
    // as authoritative enough to execute — Confirm Actual must prefill
    // the identical real product/quantity, not leave a farmer to confirm
    // an unresolved-composition Actual. `plannedDate` genuinely has no
    // fallback (no real "planned date" exists anywhere but a farmer's
    // own explicit edit), so it correctly stays undefined.
    const result =
      await getLinkedFertiliserPlanForJobSessionAction("session-1");
    expect(result?.plannedProduct).toBe("18-6-12");
    expect(result?.plannedQuantityKg).toBe(266.7);
    expect(result?.plannedDate).toBeUndefined();
  });

  it("does not fall back to a recommended quantity for a multi-product recommendation accepted as-is (no unambiguous single product)", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({
      id: "session-1",
      farmId: "farm-1",
      decisionId: "decision-plan-1",
      activityType: "fertiliser_spreading",
      origin: "plan",
      status: "active",
      fieldSegments: [],
      activeIntervals: [],
      interruptionGaps: [],
      createdAt: "x",
      updatedAt: "x",
    });
    mockGetDecisionById.mockResolvedValue(
      plan({
        estimateSnapshot: {
          status: "OK",
          value: {
            fieldId: "field-1",
            areaHa: 4.2,
            products: [
              {
                name: "18-6-12",
                npkAnalysis: "18-6-12",
                rateKgHa: 66.7,
                totalKg: 266.7,
                costEur: 165,
              },
              {
                name: "Protected Urea",
                npkAnalysis: "46-0-0",
                rateKgHa: 20,
                totalKg: 84,
                costEur: 40,
              },
            ],
          },
          evidenceState: "IRISH_MODEL",
        },
      }),
    );

    const result =
      await getLinkedFertiliserPlanForJobSessionAction("session-1");
    expect(result?.plannedProduct).toBeUndefined();
    expect(result?.plannedQuantityKg).toBeUndefined();
  });

  it("falls back to the named product's own real recommended quantity when a farmer edited plannedProduct but never overrode plannedQuantityKg", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({
      id: "session-1",
      farmId: "farm-1",
      decisionId: "decision-plan-1",
      activityType: "fertiliser_spreading",
      origin: "plan",
      status: "active",
      fieldSegments: [],
      activeIntervals: [],
      interruptionGaps: [],
      createdAt: "x",
      updatedAt: "x",
    });
    mockGetDecisionById.mockResolvedValue(
      plan({
        outcome: "edited",
        estimateSnapshot: {
          status: "OK",
          value: {
            fieldId: "field-1",
            areaHa: 4.2,
            products: [
              {
                name: "18-6-12",
                npkAnalysis: "18-6-12",
                rateKgHa: 66.7,
                totalKg: 266.7,
                costEur: 165,
              },
              {
                name: "Protected Urea",
                npkAnalysis: "46-0-0",
                rateKgHa: 20,
                totalKg: 84,
                costEur: 40,
              },
            ],
          },
          evidenceState: "IRISH_MODEL",
        },
        edits: { plannedProduct: "Protected Urea" },
      }),
    );

    const result =
      await getLinkedFertiliserPlanForJobSessionAction("session-1");
    expect(result?.plannedProduct).toBe("Protected Urea");
    expect(result?.plannedQuantityKg).toBe(84);
  });
});

// Fertiliser Vertical campaign, item 14 — remaining requirement.
describe("getFieldFertiliserStatusAction", () => {
  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getFieldFertiliserStatusAction("field-1")).rejects.toThrow(
      /no real farm/i,
    );
  });

  it("rejects a fieldId not on this farm's own real fields", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ id: "field-1" })]);
    await expect(
      getFieldFertiliserStatusAction("someone-elses-field"),
    ).rejects.toThrow(/not found/i);
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2): an archived field's own current fertiliser status must not be
  // computable — the field is treated as not found, same as above.
  it("rejects a real archived field — its own current status is never computed", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      field({ id: "field-1", archivedAt: "2026-09-01T00:00:00Z" }),
    ]);
    await expect(getFieldFertiliserStatusAction("field-1")).rejects.toThrow(
      /not found/i,
    );
  });

  it("returns blocked when the P3 cycle exists but soil evidence is missing", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3FirstCutCycle(),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    const result = await getFieldFertiliserStatusAction("field-1");
    expect(result.status).toBe("blocked");
  });

  it("applies the existing commonage prohibition after P3 agronomy and before a recommendation is actionable", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      p3Field({
        commonageStatus: {
          value: "commonage",
          status: "verified",
          source: "Farmer",
        },
      }),
    ]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3FirstCutCycle(),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    await expect(getFieldFertiliserStatusAction("field-1")).resolves.toEqual({
      status: "prohibited",
      reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED",
    });
  });

  it.each([
    [
      "commonage",
      { commonageStatus: { value: "commonage", status: "verified", source: "DAFM" } },
      { status: "prohibited", reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" },
    ],
    [
      "unknown commonage",
      { commonageStatus: { value: "unknown", status: "unverified", source: "DAFM" } },
      { status: "blocked" },
    ],
    [
      "a watercourse inside the 3 m strip with no mapped water geometry",
      {
        waterBufferContext: {
          value: { featureType: "surface_water", distanceM: 0, localOverrideStatus: "verified_none" },
          status: "mapped",
          source: "EPA",
        },
      },
      { status: "blocked", reasonCode: "CHEMICAL_WATER_STRIP_GEOMETRY_UNRESOLVED" },
    ],
    [
      "a field lying wholly inside the 3 m surface-water strip",
      {
        areaHa: 0.02,
        polygon: stripTestPolygon(2),
        waterBufferContext: {
          value: {
            featureType: "surface_water",
            distanceM: 0,
            localOverrideStatus: "verified_none",
            chemicalStripWaterLines: streamAlongWestEdge(),
          },
          status: "mapped",
          source: "EPA",
        },
      },
      { status: "prohibited", reasonCode: "WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED" },
    ],
    [
      "a null watercourse distance",
      {
        waterBufferContext: {
          value: { featureType: "surface_water", distanceM: null, localOverrideStatus: "verified_none" },
          status: "mapped",
          source: "EPA",
        },
      },
      { status: "blocked", reasonCode: "MISSING_NATIONAL_BUFFER_ASSESSMENT" },
    ],
    [
      "a non-finite watercourse distance",
      {
        waterBufferContext: {
          value: { featureType: "surface_water", distanceM: Number.NaN, localOverrideStatus: "verified_none" },
          status: "mapped",
          source: "EPA",
        },
      },
      { status: "blocked", reasonCode: "MISSING_NATIONAL_BUFFER_ASSESSMENT" },
    ],
  ] as const)(
    "distinguishes legal prohibition from unknown evidence for %s, in the field status and the farm basket alike",
    async (_label, overrides, expected) => {
      mockGetFarm.mockResolvedValue(farm);
      mockListFields.mockResolvedValue([p3Field(overrides as Partial<Field>)]);
      mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
      mockListFieldProductionCyclesForSeason.mockResolvedValue([
        p3FirstCutCycle(),
      ]);
      mockListLivestockGroups.mockResolvedValue([]);
      mockListSlurryAllocations.mockResolvedValue([]);

      const status = await getFieldFertiliserStatusAction("field-1");
      expect(status).toMatchObject(expected);
      // A legal state is never reported as "not applicable".
      expect(status.status).not.toBe("not_applicable");

      const demand = await getFarmFertiliserDemandAction();
      const entry = demand.aggregation.fields[0];
      if (expected.status === "prohibited") {
        expect(entry.purchaseStatus).toEqual({
          status: "PROHIBITED",
          reasonCode: expected.reasonCode,
        });
        expect(demand.aggregation.counts).toMatchObject({
          prohibited: 1,
          notApplicable: 0,
        });
      } else {
        expect(entry.purchaseClass).toBe("UNRESOLVED");
        expect(demand.aggregation.counts).toMatchObject({
          prohibited: 0,
          notApplicable: 0,
          unresolved: 1,
        });
      }
      expect(demand.aggregation.products).toEqual([]);
    },
  );

  it("does not block a chemical recommendation when the local-authority organic setback status is unknown", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      p3Field({
        waterBufferContext: {
          value: {
            featureType: "surface_water",
            distanceM: 10,
            localOverrideStatus: "unknown",
          },
          status: "mapped",
          source: "EPA",
        },
      }),
    ]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3FirstCutCycle(),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    const result = await getFieldFertiliserStatusAction("field-1");
    expect(result.status).toBe("ok");
  });

  it("returns the P3 gross and remaining first-cut requirement from explicit in-season chemical evidence", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3FirstCutCycle(),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    const result = await getFieldFertiliserStatusAction("field-1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.requirementKgHa).toEqual({ n: 100, p: 30, k: 0 });
    expect(result.confirmedAppliedKgHa).toEqual({ n: 10, p: 0, k: 0 });
    expect(result.remainingKgHa).toEqual({ n: 90, p: 30, k: 0 });
  });

  // Fertiliser close-out (2026-11-11): the Green Book table row is keyed on
  // the holding's grassland stocking rate (Table 12-3 footnote 3); the
  // field's own movement history is disclosed as context only.
  it("keys the grazing table row on the holding stocking rate and discloses the field's movement history as context", async () => {
    const target = p3Field({ id: "field-1", areaHa: 4.2 });
    const other = p3Field({ id: "field-2", name: "Other Field", areaHa: 10 });
    const targetCycle = p3GrazingCycle("field-1");
    const otherCycle = p3GrazingCycle("field-2");
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([target, other]);
    mockGetFieldProductionCycle.mockResolvedValue(targetCycle);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      targetCycle,
      otherCycle,
    ]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListGrazingFieldSessions.mockResolvedValue([
      {
        id: "session-a",
        farmId: "farm-1",
        livestockGroupId: "g1",
        fieldId: "field-1",
        startedAt: "2026-10-01T00:00:00.000Z",
        endedAt: "2026-10-11T00:00:00.000Z",
        headCountSnapshot: 20,
        livestockCategorySnapshot: "suckler_cow",
        livestockUnitsPerHeadSnapshot: 0.9,
        source: "Keith",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "session-b",
        farmId: "farm-1",
        livestockGroupId: "g1",
        fieldId: "field-2",
        startedAt: "2026-10-11T00:00:00.000Z",
        headCountSnapshot: 20,
        livestockCategorySnapshot: "suckler_cow",
        livestockUnitsPerHeadSnapshot: 0.9,
        source: "Keith",
        createdAt: "2026-10-11T00:00:00.000Z",
      },
    ]);

    const result = await getFieldFertiliserStatusAction("field-1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.ruleTraces.n?.inputs.stockingEvidenceBasis).toBe(
      "HOLDING_GSR",
    );
    expect(result.ruleTraces.n?.inputs.sourceSessionCount).toBe(1);
    expect(
      Number(result.ruleTraces.n?.inputs.fieldAverageStockingRateLUHa),
    ).toBeGreaterThan(0);
    expect(result.limitations.join(" ")).toMatch(/farm's grassland stocking rate/i);
    expect(result.limitations.join(" ")).toMatch(/does not change the table row/i);
  });

  it("lets clear field movement evidence override the farm grazing-system baseline in the P3 pathway", async () => {
    const target = p3Field({ id: "field-1", areaHa: 4.2 });
    const targetCycle = p3GrazingCycle("field-1");
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([target]);
    mockGetFieldProductionCycle.mockResolvedValue(targetCycle);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([targetCycle]);
    // Keep the separate statutory holding-GSR input valid. The grazing
    // session snapshots the animal category at the time of the field move,
    // so field-specific evidence can legitimately differ from the group's
    // current category later without rewriting history.
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListGrazingFieldSessions.mockResolvedValue([
      {
        id: "store-session",
        farmId: "farm-1",
        livestockGroupId: "g1",
        fieldId: "field-1",
        startedAt: "2026-10-01T00:00:00.000Z",
        headCountSnapshot: 10,
        livestockCategorySnapshot: "store",
        livestockUnitsPerHeadSnapshot: 0.7,
        source: "Farmer",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ]);

    const result = await getFieldFertiliserStatusAction("field-1");

    // The farm baseline is suckler calf-to-beef, but the field's actual
    // recorded occupancy is drystock-only. P3 must therefore switch to the
    // OTHER_DRYSTOCK pathway rather than silently keep the farm default.
    // That pathway is not validated in the current P3 pack, so it fails
    // closed as blocked rather than pretending no fertiliser is applicable.
    expect(result).toEqual({
      status: "blocked",
      reasonCode: "P3_UNSUPPORTED_PATHWAY",
    });
  });

  it("normalises an explicit future-season cycle to zero prior chemical application in the per-field status path", async () => {
    mockGetFarm.mockResolvedValue({
      ...farm,
      grazingProductionSystem: {
        value: "SUCKLER_CALF_TO_WEANING",
        status: "farmer_adjusted",
        source: "Keith",
      },
    });
    mockListFields.mockResolvedValue([p3Field()]);
    const futureCycle: FieldProductionCycle = {
      ...p3GrazingCycle(),
      season: "2027",
      status: "planned",
      evidence: {
        cropSystem: {
          value: "GRASS_GRAZING",
          method: "FARMER_DECLARED",
          source: "Keith",
        },
      },
    };
    mockListFieldProductionCyclesForSeason
      .mockResolvedValueOnce([futureCycle])
      .mockResolvedValueOnce([]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);

    const result = await getFieldFertiliserStatusAction("field-1", "2027");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.confirmedAppliedKgHa).toEqual({ n: 0, p: 0, k: 0 });
    expect(result.requirementKgHa.n).toBeGreaterThan(0);
  });

  it("does not call the legacy confirmed-application remaining calculator for a P3 cycle", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3FirstCutCycle(),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    await getFieldFertiliserStatusAction("field-1");
    expect(mockGetFieldRemainingFertiliserRequirement).not.toHaveBeenCalled();
  });
});

// Fertiliser Vertical campaign, items 19/20 — farm-wide demand.
describe("getFarmFertiliserDemandAction", () => {
  it("aggregates P3 field product lines directly into the procurement basket without calling the legacy farm-demand engine", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3FirstCutCycle(),
    ]);

    const result = await getFarmFertiliserDemandAction();

    expect(mockGetFarmFertiliserDemand).not.toHaveBeenCalled();
    expect(result.fieldsWithBlockedEvidence).toBe(0);
    expect(result.aggregation.engineVersions).toEqual([
      "grass_fertiliser_engine_v2.0.0",
    ]);
    expect(result.aggregation.status).toBe("READY");
    expect(result.demand.map((row) => row.product).sort()).toEqual(
      ["18-6-12", "Protected Urea"].sort(),
    );
    expect(
      result.purchaseRequirementTonnes.every(
        (line) => line.remainingTotalKg > 0,
      ),
    ).toBe(true);
  });

  it("reconciles the canonical field nutrient need through product kg into the farm tonnes lines", async () => {
    mockGetFarm.mockResolvedValue(farm);
    // P Index 2 / K Index 1 grazing: the potash product is used and the P
    // it brings stays within the Table 15a maximum.
    const targetField = p3Field({
      areaHa: 4.2,
      fertility: {
        ...p3Field().fertility,
        pIndex: { value: 2, status: "verified", source: "Soil test" },
        kIndex: { value: 1, status: "verified", source: "Soil test" },
      },
    });
    mockListFields.mockResolvedValue([targetField]);
    // Six suckler cows: a moderate stocking rate.
    mockListLivestockGroups.mockResolvedValue([
      { ...REAL_LIVESTOCK_GROUPS[0], count: { value: 6, status: "verified", source: "Farmer" } },
    ]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3GrazingCycle(),
    ]);

    const result = await getFarmFertiliserDemandAction();
    const calculation = result.fieldCalculations?.[0];
    expect(calculation?.status).toBe("OK");
    if (!calculation || calculation.status !== "OK")
      throw new Error("expected canonical field calculation");

    expect(calculation.chemicalAreaHa).toBe(calculation.areaHa);
    const need = {
      n: calculation.remainingKgHa.n * calculation.chemicalAreaHa,
      p: calculation.remainingKgHa.p * calculation.chemicalAreaHa,
      k: calculation.remainingKgHa.k * calculation.chemicalAreaHa,
    };
    const delivered = { n: 0, p: 0, k: 0 };
    for (const product of result.aggregation.products) {
      const analysis = product.npkAnalysis.split("-").map(Number);
      delivered.n += product.totalKg * (analysis[0] / 100);
      delivered.p += product.totalKg * (analysis[1] / 100);
      delivered.k += product.totalKg * (analysis[2] / 100);

      const tonnesLine = result.purchaseRequirementTonnes.find(
        (line) => line.product === product.name,
      );
      expect(tonnesLine?.remainingTotalKg).toBeCloseTo(product.totalKg, 6);
      expect(tonnesLine?.recommendedTotalTonnes).toBeGreaterThanOrEqual(
        product.totalKg / 1000,
      );
      expect(
        (tonnesLine?.recommendedTotalTonnes ?? 0) - product.totalKg / 1000,
      ).toBeLessThan(0.011);
    }

    expect(result.aggregation.products.map((p) => p.name).sort()).toEqual(
      ["0-7-30", "Protected Urea"].sort(),
    );
    expect(calculation.phosphorusLimit).toBeUndefined();
    // The fixed blend waterfall sizes N and K to their need; P may be
    // over-delivered as a by-product of the K product — but never beyond
    // the statutory maximum (Table 15a Index 2, lowest band: 17 kg P/ha).
    expect(Math.abs(delivered.n - need.n)).toBeLessThan(1);
    expect(Math.abs(delivered.k - need.k)).toBeLessThan(1);
    expect(delivered.p).toBeGreaterThanOrEqual(need.p - 1);
    expect(delivered.p / calculation.chemicalAreaHa).toBeLessThanOrEqual(17);
  });

  it("F002: on a P Index 4 field (maximum 0) with a K need and no prior P, recommends phosphorus-free potash, never a P-bearing compound", async () => {
    mockGetFarm.mockResolvedValue(farm);
    const index4 = p3Field({
      areaHa: 1,
      fertility: {
        pIndex: { value: 4, status: "verified", source: "Soil test" },
        kIndex: { value: 1, status: "verified", source: "Soil test" },
        verifiedTest: {
          sampleDate: "2026-01-10",
          laboratory: "Lab",
          sampleRef: "S1",
          p: 12,
          k: 40,
          pH: 6.3,
        },
      },
    });
    mockListFields.mockResolvedValue([index4]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    const noPriorChemical = p3FirstCutCycle({
      evidence: {
        ...p3FirstCutCycle().evidence,
        chemicalNAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
      },
    });
    mockGetFieldProductionCycle.mockResolvedValue(noPriorChemical);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([noPriorChemical]);

    const status = await getFieldFertiliserStatusAction("field-1");
    const result = await getFarmFertiliserDemandAction();

    // The audit's reproduction: N/P/K need 100/0/175 at P Index 4.
    const calculation = result.fieldCalculations?.[0];
    if (!calculation || calculation.status !== "OK")
      throw new Error("expected the requirement to stay visible");
    expect(calculation.remainingKgHa).toMatchObject({ n: 100, p: 0, k: 175 });
    // 0-7-30 for 175 kg K would bring ~41 kg P onto a 0 kg P/ha maximum,
    // so the K comes from Muriate of Potash (0-0-50) and the N from
    // Protected Urea — no P-bearing product at all.
    if (status.status !== "ok") throw new Error("expected a lawful P-free recommendation");
    expect(
      status.recommendedProducts.map((p) => [p.name, p.npkAnalysis, p.rateKgHa]),
    ).toEqual([
      ["Muriate of Potash (50% K)", "0-0-50", 350],
      ["Protected Urea", "46-0-0", 217.4],
    ]);
    expect(
      status.recommendedProducts.every((p) => Number(p.npkAnalysis.split("-")[1]) === 0),
    ).toBe(true);
    expect(status.phosphorusLimit).toMatchObject({
      statutoryMaximumKgHa: 0,
      agronomicPNeedKgHa: 0,
      priorChemicalPKgHa: 0,
      productPKgHa: 0,
    });
    const disclosure = status.limitations.find((l) => /legal maximum of 0 kg P\/ha/.test(l));
    expect(disclosure).toMatch(/^Phosphorus-free potash \(Muriate of Potash, 0-0-50\) was selected/);
    expect(disclosure).toMatch(/No phosphorus is needed agronomically\.$/);
    expect(status.limitations.some((l) => /not fully met/.test(l))).toBe(false);

    expect(result.aggregation.fields[0].purchaseStatus).toEqual({ status: "RECOMMENDED" });
    expect(result.aggregation.status).toBe("READY");
    expect(result.aggregation.unsupportedProducts).toEqual([]);
    expect(result.fieldsWithBlockedEvidence).toBe(0);
    const mop = result.aggregation.products.find((p) => p.name === "Muriate of Potash (50% K)");
    expect(mop).toMatchObject({ npkAnalysis: "0-0-50", totalKg: 350, catalogueVerified: true });
    // Farm-wide kg -> tonnes reconciles for the new product too.
    const mopTonnes = result.purchaseRequirementTonnes.find((line) => line.product === "Muriate of Potash (50% K)");
    expect(mopTonnes).toMatchObject({ npkAnalysis: "0-0-50", recommendedTotalTonnes: 0.35, remainingTotalKg: 350 });
    // The whole-farm table no longer says "Needs more information".
    const [row] = wholeFarmFieldRows([], result.aggregation);
    expect(row.purchase.label).toBe("Contributes to purchase");
    expect(row.purchase.contributions.map((c) => c.name)).toContain("Muriate of Potash (50% K)");
  });

  describe("F002: the statutory P maximum is checked against delivered P in every case", () => {
    const soil = (pIndex: 1 | 2 | 3 | 4, kIndex: 1 | 2 | 3 | 4) => ({
      pIndex: { value: pIndex, status: "verified" as const, source: "Soil test" },
      kIndex: { value: kIndex, status: "verified" as const, source: "Soil test" },
      verifiedTest: { sampleDate: "2026-01-10", laboratory: "Lab", sampleRef: "S1", p: 4, k: 90, pH: 6.3 },
    });
    const firstCut = (applied: { n?: number; p?: number; k?: number } = {}) =>
      p3FirstCutCycle({
        evidence: {
          ...p3FirstCutCycle().evidence,
          chemicalNAppliedKgHa: { value: applied.n ?? 10, method: "FARMER_DECLARED", source: "Keith" },
          chemicalPAppliedKgHa: { value: applied.p ?? 0, method: "FARMER_DECLARED", source: "Keith" },
          chemicalKAppliedKgHa: { value: applied.k ?? 0, method: "FARMER_DECLARED", source: "Keith" },
        },
      });
    const run = async (fieldValue: Field, cycle: FieldProductionCycle) => {
      mockGetFarm.mockResolvedValue(farm);
      mockListFields.mockResolvedValue([fieldValue]);
      mockListLivestockGroups.mockResolvedValue([]);
      mockGetFieldProductionCycle.mockResolvedValue(cycle);
      mockListFieldProductionCyclesForSeason.mockResolvedValue([cycle]);
      return {
        status: await getFieldFertiliserStatusAction("field-1"),
        demand: await getFarmFertiliserDemandAction(),
      };
    };
    const deliveredPKgHa = (products: { npkAnalysis: string; rateKgHa: number }[]) =>
      products.reduce((sum, p) => sum + p.rateKgHa * (Number(p.npkAnalysis.split("-")[1]) / 100), 0);
    afterEach(() => mockListSlurryAllocations.mockResolvedValue([]));

    it("audit reproduction 1: the 0.931 kg P 13.3 kg 0-7-30 would bring onto a P Index 4 field (maximum 0) is replaced by P-free potash, with no tolerance", async () => {
      mockListSlurryAllocations.mockResolvedValue([]);
      // Remaining N/P/K 90/0/4: 175 kg K need less 171 kg already applied.
      const { status, demand } = await run(p3Field({ areaHa: 1, fertility: soil(4, 1) }), firstCut({ k: 171 }));
      const calculation = demand.fieldCalculations?.[0];
      if (!calculation || calculation.status !== "OK") throw new Error("expected the requirement to stay visible");
      expect(calculation.remainingKgHa).toMatchObject({ n: 90, p: 0, k: 4 });
      if (status.status !== "ok") throw new Error("expected a lawful P-free recommendation");
      expect(status.recommendedProducts.map((p) => [p.name, p.rateKgHa])).toEqual([
        ["Muriate of Potash (50% K)", 8],
        ["Protected Urea", 195.7],
      ]);
      expect(deliveredPKgHa(status.recommendedProducts)).toBe(0);
      expect(demand.aggregation.fields[0].purchaseStatus).toEqual({ status: "RECOMMENDED" });
      expect(demand.aggregation.products.map((p) => p.name)).not.toContain("0-7-30");
    });

    it("audit reproduction 2: an Index 1 need the default blend would deliver as 40.8 kg P against a 27 kg maximum is limited to the maximum, with K from P-free potash", async () => {
      mockListSlurryAllocations.mockResolvedValue([]);
      const { status, demand } = await run(p3Field({ areaHa: 1, fertility: soil(1, 1) }), firstCut());
      // 0-7-30 sized to 175 kg K alone brings 40.8 kg P; the constrained
      // mix sizes 18-6-12 to the 27 kg budget and tops K up with MOP.
      if (status.status !== "ok") throw new Error("expected a lawful, limited recommendation");
      expect(status.recommendedProducts.map((p) => p.name)).toEqual(["18-6-12", "Muriate of Potash (50% K)", "Protected Urea"]);
      expect(deliveredPKgHa(status.recommendedProducts)).toBeLessThanOrEqual(27);
      expect(deliveredPKgHa(status.recommendedProducts)).toBeGreaterThan(26.9);
      const deliveredK = status.recommendedProducts.reduce((sum, p) => sum + p.rateKgHa * (Number(p.npkAnalysis.split("-")[2]) / 100), 0);
      expect(Math.abs(deliveredK - (status.remainingKgHa?.k ?? 0))).toBeLessThan(0.1);
      expect(status.phosphorusLimit).toMatchObject({ statutoryMaximumKgHa: 27, agronomicPNeedKgHa: 40 });
      const disclosure = status.limitations.find((l) => /legal maximum of 27 kg P\/ha/.test(l));
      // A genuine positive-P shortfall keeps the truthful shortfall wording.
      expect(disclosure).toMatch(/The agronomic need of 40\.0 kg P\/ha is not fully met\./);
      expect(disclosure).toMatch(/phosphorus-free Muriate of Potash \(0-0-50\)/);
      expect(demand.aggregation.status).toBe("READY");
      expect(demand.fieldsWithBlockedEvidence).toBe(0);
      expect(deliveredPKgHa(demand.aggregation.products.map((p) => ({ npkAnalysis: p.npkAnalysis, rateKgHa: p.totalKg })))).toBeLessThanOrEqual(27);
    });

    it("a small positive P budget: the permitted P comes from 18-6-12, residual K from MOP, and delivered P stays at or below the budget after rate rounding", async () => {
      mockListSlurryAllocations.mockResolvedValue([]);
      // Index 1 / K Index 1, 25 kg P already applied: 2 kg of the 27 kg maximum remains.
      const { status, demand } = await run(p3Field({ areaHa: 1, fertility: soil(1, 1) }), firstCut({ p: 25 }));
      if (status.status !== "ok") throw new Error("expected a lawful, limited recommendation");
      const names = status.recommendedProducts.map((p) => p.name);
      expect(names).toContain("18-6-12");
      expect(names).toContain("Muriate of Potash (50% K)");
      expect(names).not.toContain("0-7-30");
      const delivered = deliveredPKgHa(status.recommendedProducts);
      expect(delivered).toBeGreaterThan(1.9);
      expect(delivered + 25).toBeLessThanOrEqual(27);
      expect(status.phosphorusLimit).toMatchObject({ priorChemicalPKgHa: 25, statutoryMaximumKgHa: 27 });
      expect(status.phosphorusLimit?.productPKgHa).toBeCloseTo(delivered, 6);
      expect(demand.aggregation.fields[0].purchaseStatus).toEqual({ status: "RECOMMENDED" });
    });

    it("limits products to the lawful P budget when the agronomic need is above the maximum, and discloses it", async () => {
      mockListSlurryAllocations.mockResolvedValue([]);
      // Index 1 / K Index 4 first cut: P need 40, maximum 27 (lowest band).
      const { status, demand } = await run(p3Field({ areaHa: 1, fertility: soil(1, 4) }), firstCut());
      if (status.status !== "ok") throw new Error("expected a lawful, limited recommendation");
      expect(status.remainingKgHa?.p).toBe(40);
      expect(deliveredPKgHa(status.recommendedProducts)).toBeLessThanOrEqual(27);
      expect(deliveredPKgHa(status.recommendedProducts)).toBeGreaterThan(26);
      expect(status.phosphorusLimit).toMatchObject({
        statutoryMaximumKgHa: 27,
        // No livestock: the holding's stocking rate resolves to the lowest band.
        band: "HOLDING_GSR",
        agronomicPNeedKgHa: 40,
        priorChemicalPKgHa: 0,
        organicPCountedKgHa: 0,
      });
      expect(status.limitations.some((l) => /limited to .* kg P\/ha .* legal maximum of 27 kg P\/ha/.test(l))).toBe(true);
      expect(demand.aggregation.status).toBe("READY");
      expect(deliveredPKgHa(demand.aggregation.products.map((p) => ({ npkAnalysis: p.npkAnalysis, rateKgHa: p.totalKg })))).toBeLessThanOrEqual(27);
    });

    it("counts chemical P already applied this season against the maximum", async () => {
      mockListSlurryAllocations.mockResolvedValue([]);
      // 15 kg P already applied: only 12 kg of the 27 kg maximum remains.
      const limited = await run(p3Field({ areaHa: 1, fertility: soil(1, 4) }), firstCut({ p: 15 }));
      if (limited.status.status !== "ok") throw new Error("expected ok");
      expect(deliveredPKgHa(limited.status.recommendedProducts) + 15).toBeLessThanOrEqual(27);
      expect(limited.status.phosphorusLimit).toMatchObject({ priorChemicalPKgHa: 15, statutoryMaximumKgHa: 27 });
      // 30 kg already applied: over the maximum before anything is proposed —
      // still blocked, under its own reason, never shown as within it.
      const over = await run(p3Field({ areaHa: 1, fertility: soil(1, 4) }), firstCut({ p: 30 }));
      expect(over.status).toEqual({ status: "blocked", reasonCode: "P3_PRIOR_CHEMICAL_P_EXCEEDS_NAP_CEILING" });
      expect(over.demand.aggregation.fields[0].purchaseStatus).toMatchObject({
        status: "UNKNOWN",
        reasonCode: "P3_PRIOR_CHEMICAL_P_EXCEEDS_NAP_CEILING",
      });
      expect(over.demand.aggregation.products).toEqual([]);
      // Also when the remaining need is K only (the MOP path never rescues it).
      const overIndex4 = await run(p3Field({ areaHa: 1, fertility: soil(4, 1) }), firstCut({ p: 5 }));
      expect(overIndex4.status).toEqual({ status: "blocked", reasonCode: "P3_PRIOR_CHEMICAL_P_EXCEEDS_NAP_CEILING" });
    });

    it("counts planned slurry's statutory P unless its home-produced grazing origin is evidenced (Art. 17(8))", async () => {
      mockListSlurryCompositionRecords.mockResolvedValue([
        { id: "comp-1", farmId: farm.id, housingId: "h1", slurryType: "cattle_slurry", status: "farmer_adjusted", dmPct: 6, sampleDate: "2026-01-01", source: "Farmer estimate", recordedAt: "2026-01-01T12:00:00.000Z" },
      ]);
      // 200 m³ on 4.2 ha of a P Index 3 field (maximum 7 kg P/ha).
      mockListSlurryAllocations.mockResolvedValue([
        {
          id: "alloc-h",
          planRevision: 2,
          fieldId: "field-1",
          housingId: "h1",
          volumeM3: 200,
          applicationMethod: { value: "LESS", status: "verified", source: "Keith" },
          applicationDate: { value: "2026-03-15", status: "verified", source: "Keith" },
        } as never,
      ]);
      const index3 = p3Field({ fertility: soil(3, 4), waterBufferContext: { value: { featureType: "surface_water", distanceM: 110, localOverrideStatus: "verified_none" }, status: "verified", source: "Farmer" } });
      const unknownOrigin = await run(index3, firstCut());
      expect(unknownOrigin.status).toEqual({ status: "blocked", reasonCode: "P3_NAP_P_CEILING_UNRESOLVED" });
      expect(unknownOrigin.demand.aggregation.fields[0].purchaseStatus).toMatchObject({
        status: "UNKNOWN",
        reasonCode: "P3_NAP_P_CEILING_UNRESOLVED",
        missingInputs: ["slurry.regulatoryOrigin", "slurry.regulatoryNeatVolume"],
      });

      vi.mocked(loadRegulatoryEvidenceRecordsForFarm).mockResolvedValue({
        neatSlurryEvidenceRecords: [],
        spreadableAreaRecords: [],
        evidenceTablesApplied: true,
        slurryOriginEvidenceRecords: [
          {
            id: "origin-1",
            farmId: farm.id,
            allocationId: "alloc-h",
            origin: "home_produced_grazing_livestock",
            status: "farmer_adjusted",
            source: "Keith",
            planRevisionAtRecord: 2,
            fieldIdAtRecord: "field-1",
            housingIdAtRecord: "h1",
            volumeM3AtRecord: 200,
            recordedAt: "2026-02-01T09:00:00.000Z",
          },
        ],
      });
      const homeProduced = await run(index3, firstCut());
      expect(homeProduced.status.status).toBe("ok");
      vi.mocked(loadRegulatoryEvidenceRecordsForFarm).mockResolvedValue({
        neatSlurryEvidenceRecords: [],
        spreadableAreaRecords: [],
        slurryOriginEvidenceRecords: [],
        evidenceTablesApplied: true,
      });
      mockListSlurryCompositionRecords.mockResolvedValue([]);
    });
  });

  it("excludes only the 3 m surface-water strip (S.I. 588/2025 Art. 18(1)) and sizes product kg to the rest of the field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    // 100 m × 100 m = 1 ha; the stream along the west edge excludes ~0.03 ha.
    const stripField = p3Field({
      areaHa: 1,
      polygon: stripTestPolygon(100),
      waterBufferContext: {
        value: {
          featureType: "surface_water",
          distanceM: 0,
          localOverrideStatus: "verified_none",
          chemicalStripWaterLines: streamAlongWestEdge(),
        },
        status: "mapped",
        source: "EPA Water Flow Network",
      },
    });
    const wholeField = p3Field({ areaHa: 1 });
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3FirstCutCycle(),
    ]);

    mockListFields.mockResolvedValue([wholeField]);
    const control = await getFarmFertiliserDemandAction();
    mockListFields.mockResolvedValue([stripField]);
    const status = await getFieldFertiliserStatusAction("field-1");
    const result = await getFarmFertiliserDemandAction();

    // Not a whole-field prohibition: the field is recommended.
    expect(status.status).toBe("ok");
    if (status.status !== "ok") throw new Error("expected ok");
    expect(status.waterStrip).toMatchObject({
      ruleId: "SI_588_2025_ART_18_1_CHEMICAL_FERTILISER_3M_SURFACE_WATER",
      source: "S.I. No. 588 of 2025, Article 18(1)",
    });
    const excluded = status.waterStrip!.excludedStripHa;
    expect(excluded).toBeGreaterThan(0.028);
    expect(excluded).toBeLessThan(0.032);
    expect(status.waterStrip!.chemicalAreaHa).toBeCloseTo(1 - excluded, 4);

    expect(result.aggregation.fields[0].purchaseStatus.status).toBe(
      "RECOMMENDED",
    );
    const calculation = result.fieldCalculations?.[0];
    if (!calculation || calculation.status !== "OK")
      throw new Error("expected canonical field calculation");
    expect(calculation.areaHa).toBe(1);
    expect(calculation.chemicalAreaHa).toBeCloseTo(1 - excluded, 4);
    // The kg/ha need is the field's own; only the area it is bought for
    // shrinks. Product kg scale with the chemical area exactly.
    const controlCalc = control.fieldCalculations?.[0];
    if (!controlCalc || controlCalc.status !== "OK")
      throw new Error("expected control calculation");
    expect(calculation.remainingKgHa).toEqual(controlCalc.remainingKgHa);
    for (const product of result.aggregation.products) {
      const whole = control.aggregation.products.find(
        (candidate) => candidate.name === product.name,
      );
      expect(product.totalKg).toBeCloseTo(
        (whole?.totalKg ?? 0) * calculation.chemicalAreaHa,
        1,
      );
    }
    for (const product of status.recommendedProducts) {
      expect(product.totalKg).toBeCloseTo(
        product.rateKgHa * calculation.chemicalAreaHa,
        1,
      );
    }
  });

  it("keeps the farm chemical procurement basket actionable when the local organic setback status is unknown", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      p3Field({
        waterBufferContext: {
          value: {
            featureType: "surface_water",
            distanceM: 10,
            localOverrideStatus: "unknown",
          },
          status: "mapped",
          source: "EPA",
        },
      }),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3FirstCutCycle(),
    ]);

    const result = await getFarmFertiliserDemandAction();
    expect(result.fieldsWithBlockedEvidence).toBe(0);
    expect(result.aggregation.status).toBe("READY");
    expect(result.demand.length).toBeGreaterThan(0);
  });

  it("produces a real grazing recommendation for a suckler calf-to-weaning farm instead of treating the pathway as not applicable", async () => {
    mockGetFarm.mockResolvedValue({
      ...farm,
      grazingProductionSystem: {
        value: "SUCKLER_CALF_TO_WEANING",
        status: "farmer_adjusted",
        source: "Keith",
      },
    });
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3GrazingCycle(),
    ]);

    const result = await getFarmFertiliserDemandAction("2026");

    expect(result.fieldsWithBlockedEvidence).toBe(0);
    expect(result.aggregation.status).toBe("READY");
    expect(result.aggregation.fields[0].purchaseStatus.status).toBe(
      "RECOMMENDED",
    );
    expect(result.purchaseRequirementTonnes.length).toBeGreaterThan(0);
  });

  it("builds a next-season quote from carried-forward field use while resetting prior chemical applications to zero", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    const currentCycle = p3FirstCutCycle();
    mockListFieldProductionCyclesForSeason.mockResolvedValueOnce([
      currentCycle,
    ]);
    const current = await getFarmFertiliserDemandAction("2026");

    mockListFieldProductionCyclesForSeason
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([currentCycle]);
    const next = await getFarmFertiliserDemandAction("2027");

    const currentKg = current.purchaseRequirementTonnes.reduce(
      (sum, line) => sum + line.remainingTotalKg,
      0,
    );
    const nextKg = next.purchaseRequirementTonnes.reduce(
      (sum, line) => sum + line.remainingTotalKg,
      0,
    );

    expect(next.fieldsWithBlockedEvidence).toBe(0);
    expect(next.aggregation.status).toBe("READY");
    expect(nextKg).toBeGreaterThan(currentKg);
    expect(mockListFieldProductionCyclesForSeason).toHaveBeenCalledWith(
      ["field-1"],
      "2027",
    );
    expect(mockListFieldProductionCyclesForSeason).toHaveBeenCalledWith(
      ["field-1"],
      "2026",
    );
  });

  it("treats a saved future-season cycle as zero prior chemical application for quote planning", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    const futureCycle = p3FirstCutCycle({
      season: "2027",
      status: "planned",
      evidence: {
        cropSystem: {
          value: "GRASS_FIRST_CUT_SILAGE",
          method: "FARMER_DECLARED",
          source: "Keith",
        },
        productionTargetTDMHa: {
          value: 5,
          method: "FARMER_DECLARED",
          source: "Keith",
        },
      },
    });
    mockListFieldProductionCyclesForSeason
      .mockResolvedValueOnce([futureCycle])
      .mockResolvedValueOnce([]);

    const result = await getFarmFertiliserDemandAction("2027");

    expect(result.fieldsWithBlockedEvidence).toBe(0);
    expect(result.aggregation.status).toBe("READY");
    expect(result.purchaseRequirementTonnes.length).toBeGreaterThan(0);
  });

  it("never lets current-season slurry reduce or block a next-season quote; only target-season slurry is considered", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    const futureCycle = p3FirstCutCycle({
      season: "2027",
      status: "planned",
      evidence: {
        cropSystem: {
          value: "GRASS_FIRST_CUT_SILAGE",
          method: "FARMER_DECLARED",
          source: "Keith",
        },
        productionTargetTDMHa: {
          value: 5,
          method: "FARMER_DECLARED",
          source: "Keith",
        },
      },
    });
    mockListFieldProductionCyclesForSeason.mockImplementation(
      async (_fieldIds, season) => (season === "2027" ? [futureCycle] : []),
    );
    // Deliberately incomplete (no application method): if it were in scope
    // for the target season it would block the field's calculation.
    const slurryOn = (date: string) =>
      ({
        fieldId: "field-1",
        housingId: "h1",
        volumeM3: 60,
        applicationDate: { value: date, status: "verified", source: "Keith" },
      }) as never;
    const totalKg = (
      result: Awaited<ReturnType<typeof getFarmFertiliserDemandAction>>,
    ) =>
      result.purchaseRequirementTonnes.reduce(
        (sum, line) => sum + line.remainingTotalKg,
        0,
      );

    mockListSlurryAllocations.mockResolvedValue([]);
    const baseline = await getFarmFertiliserDemandAction("2027");

    mockListSlurryAllocations.mockResolvedValue([slurryOn("2026-03-15")]);
    const withCurrentSeasonSlurry = await getFarmFertiliserDemandAction("2027");

    expect(baseline.aggregation.status).toBe("READY");
    expect(withCurrentSeasonSlurry.aggregation.status).toBe("READY");
    expect(withCurrentSeasonSlurry.fieldsWithBlockedEvidence).toBe(0);
    expect(totalKg(withCurrentSeasonSlurry)).toBe(totalKg(baseline));

    // Control: the same allocation dated in the target season is in scope,
    // and its missing evidence fails closed rather than counting as zero.
    mockListSlurryAllocations.mockResolvedValue([slurryOn("2027-03-15")]);
    const withTargetSeasonSlurry = await getFarmFertiliserDemandAction("2027");
    expect(withTargetSeasonSlurry.fieldsWithBlockedEvidence).toBe(1);
    expect(
      withTargetSeasonSlurry.aggregation.fields[0].purchaseStatus,
    ).toMatchObject({
      status: "UNKNOWN",
      reasonCode: "P3_INCOMPLETE_SLURRY_EVIDENCE",
    });
  });

  it("never lets a legally prohibited slurry plan reduce the chemical requirement, in either path", async () => {
    const cycle = p3FirstCutCycle();
    mockGetFarm.mockResolvedValue(farm);
    mockGetFieldProductionCycle.mockResolvedValue(cycle);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([cycle]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryCompositionRecords.mockResolvedValue([
      {
        id: "comp-1",
        farmId: farm.id,
        housingId: "h1",
        slurryType: "cattle_slurry",
        status: "farmer_adjusted",
        dmPct: 6,
        sampleDate: "2026-01-01",
        source: "Farmer estimate",
        recordedAt: "2026-01-01T12:00:00.000Z",
      },
    ]);
    const slurryOn = (date: string) =>
      ({
        fieldId: "field-1",
        housingId: "h1",
        volumeM3: 60,
        applicationMethod: {
          value: "LESS",
          status: "verified",
          source: "Keith",
        },
        applicationDate: { value: date, status: "verified", source: "Keith" },
      }) as never;
    const withWaterAt = (distanceM: number) =>
      p3Field({
        waterBufferContext: {
          value: {
            featureType: "surface_water",
            distanceM,
            localOverrideStatus: "verified_none",
          },
          status: "verified",
          source: "EPA",
        },
      });
    const totalKg = (
      result: Awaited<ReturnType<typeof getFarmFertiliserDemandAction>>,
    ) =>
      result.purchaseRequirementTonnes.reduce(
        (sum, line) => sum + line.remainingTotalKg,
        0,
      );

    mockListFields.mockResolvedValue([withWaterAt(12)]);
    mockListSlurryAllocations.mockResolvedValue([]);
    const noSlurry = await getFarmFertiliserDemandAction();

    // Control: an open-season application clear of every buffer is credited.
    mockListSlurryAllocations.mockResolvedValue([slurryOn("2026-03-15")]);
    const lawful = await getFarmFertiliserDemandAction();
    expect(lawful.fieldsWithBlockedEvidence).toBe(0);
    expect(totalKg(lawful)).toBeLessThan(totalKg(noSlurry));

    const cases: { date: string; distanceM: number; reasonCode: string }[] = [
      // Cork (Zone A) organic closed period runs 1 Oct – 12 Jan.
      {
        date: "2026-10-20",
        distanceM: 12,
        reasonCode: "P3_PLANNED_SLURRY_IN_CLOSED_PERIOD",
      },
      // Below the 5 m baseline organic surface-water buffer, though clear of
      // the 3 m chemical buffer.
      {
        date: "2026-03-15",
        distanceM: 4,
        reasonCode: "P3_PLANNED_SLURRY_WITHIN_WATER_BUFFER",
      },
      // Meets the baseline but not the elevated 10 m distance, which cannot
      // be ruled out without slope/enhanced-period evidence.
      {
        date: "2026-03-15",
        distanceM: 7,
        reasonCode: "P3_PLANNED_SLURRY_BUFFER_UNRESOLVED",
      },
      // A null or non-finite distance is unknown evidence: never a 0 m
      // prohibition (null < 5) and never a pass (NaN < 5 is false).
      {
        date: "2026-03-15",
        distanceM: null as unknown as number,
        reasonCode: "MISSING_NATIONAL_BUFFER_ASSESSMENT",
      },
      {
        date: "2026-03-15",
        distanceM: Number.NaN,
        reasonCode: "MISSING_NATIONAL_BUFFER_ASSESSMENT",
      },
    ];
    for (const { date, distanceM, reasonCode } of cases) {
      mockListFields.mockResolvedValue([withWaterAt(distanceM)]);
      mockListSlurryAllocations.mockResolvedValue([slurryOn(date)]);
      const demand = await getFarmFertiliserDemandAction();
      expect(demand.aggregation.fields[0].purchaseStatus).toMatchObject({
        status: "UNKNOWN",
        reasonCode,
        missingInputs: ["slurry"],
      });
      expect(demand.demand).toHaveLength(0);
      expect(await getFieldFertiliserStatusAction("field-1")).toEqual({
        status: "blocked",
        reasonCode,
      });
    }
    mockListSlurryCompositionRecords.mockResolvedValue([]);
  });

  it("F003: never credits slurry that fails the LESS or local-authority buffer gates, in either path", async () => {
    const cycle = p3FirstCutCycle();
    mockGetFarm.mockResolvedValue(farm);
    mockGetFieldProductionCycle.mockResolvedValue(cycle);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([cycle]);
    mockListSlurryCompositionRecords.mockResolvedValue([
      {
        id: "comp-1",
        farmId: farm.id,
        housingId: "h1",
        slurryType: "cattle_slurry",
        status: "farmer_adjusted",
        dmPct: 6,
        sampleDate: "2026-01-01",
        source: "Farmer estimate",
        recordedAt: "2026-01-01T12:00:00.000Z",
      },
    ]);
    const slurry = (method: "LESS" | "splashplate") =>
      ({
        fieldId: "field-1",
        housingId: "h1",
        volumeM3: 60,
        applicationMethod: { value: method, status: "verified", source: "Keith" },
        applicationDate: { value: "2026-03-15", status: "verified", source: "Keith" },
      }) as never;
    const withLocal = (
      localOverrideStatus: "verified_none" | "authoritative_rule" | "unknown",
      localOverrideDistanceM?: number,
    ) =>
      p3Field({
        waterBufferContext: {
          value: {
            featureType: "surface_water",
            distanceM: 110,
            localOverrideStatus,
            ...(localOverrideDistanceM !== undefined ? { localOverrideDistanceM } : {}),
          },
          status: "verified",
          source: "Farmer",
        },
      });
    // The LESS trigger (Art. 19(1)(b)) is the PREVIOUS year's stocking
    // rate: a recorded 2025 figure of 140 kg N/ha governs 2026 slurry.
    const gsrRecord = (referenceYear: string, gsrKgNHa: number) => ({
      id: `gsr-${referenceYear}-${gsrKgNHa}`,
      referenceYear,
      gsrKgNHa,
      status: "verified" as const,
      source: `DAFM Nitrates Statement ${referenceYear}`,
      recordedAt: "2026-01-20T09:00:00.000Z",
    });
    mockGetFarm.mockResolvedValue({ ...farm, precedingYearGsrRecords: [gsrRecord("2025", 140)] });
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);

    const expectBlocked = async (reasonCode: string) => {
      const demand = await getFarmFertiliserDemandAction();
      expect(demand.aggregation.fields[0].purchaseStatus).toMatchObject({
        status: "UNKNOWN",
        reasonCode,
        missingInputs: ["slurry"],
      });
      expect(await getFieldFertiliserStatusAction("field-1")).toEqual({
        status: "blocked",
        reasonCode,
      });
    };

    // Control: LESS clear of every buffer, local status confirmed → credited.
    mockListFields.mockResolvedValue([withLocal("verified_none")]);
    mockListSlurryAllocations.mockResolvedValue([slurry("LESS")]);
    const credited = await getFieldFertiliserStatusAction("field-1");
    expect(credited.status).toBe("ok");
    if (credited.status !== "ok") throw new Error("expected ok");
    expect(credited.organicCreditsKgHa.k).toBeGreaterThan(0);

    // Splashplate at GSR ≥ 100: LESS is required.
    mockListSlurryAllocations.mockResolvedValue([slurry("splashplate")]);
    await expectBlocked("P3_PLANNED_SLURRY_LESS_REQUIRED");

    // A recorded 150 m local abstraction buffer with the field at 110 m.
    mockListSlurryAllocations.mockResolvedValue([slurry("LESS")]);
    mockListFields.mockResolvedValue([withLocal("authoritative_rule", 150)]);
    await expectBlocked("P3_PLANNED_SLURRY_WITHIN_LOCAL_BUFFER");

    // Local status unknown, or a rule with no recorded distance: unresolved.
    mockListFields.mockResolvedValue([withLocal("unknown")]);
    await expectBlocked("P3_PLANNED_SLURRY_LOCAL_BUFFER_UNRESOLVED");
    mockListFields.mockResolvedValue([withLocal("authoritative_rule")]);
    await expectBlocked("P3_PLANNED_SLURRY_LOCAL_BUFFER_UNRESOLVED");

    mockListSlurryCompositionRecords.mockResolvedValue([]);
  });

  it("F003: the LESS gate uses only season-bound preceding-year stocking evidence — never the current herd", async () => {
    const cycle = p3FirstCutCycle();
    mockGetFieldProductionCycle.mockResolvedValue(cycle);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([cycle]);
    mockListFields.mockResolvedValue([p3Field({ waterBufferContext: { value: { featureType: "surface_water", distanceM: 110, localOverrideStatus: "verified_none" }, status: "verified", source: "Farmer" } })]);
    const splashplate = {
      fieldId: "field-1",
      housingId: "h1",
      volumeM3: 60,
      applicationMethod: { value: "splashplate", status: "verified", source: "Keith" },
      applicationDate: { value: "2026-03-15", status: "verified", source: "Keith" },
    } as never;
    mockListSlurryAllocations.mockResolvedValue([splashplate]);
    const record = (referenceYear: string, gsrKgNHa: number, recordedAt = "2026-01-20T09:00:00.000Z") => ({
      id: `gsr-${referenceYear}-${gsrKgNHa}-${recordedAt}`,
      referenceYear,
      gsrKgNHa,
      status: "verified" as const,
      source: `DAFM Nitrates Statement ${referenceYear}`,
      recordedAt,
    });
    const statusWith = async (precedingYearGsrRecords: ReturnType<typeof record>[], livestock = REAL_LIVESTOCK_GROUPS) => {
      mockGetFarm.mockResolvedValue({ ...farm, precedingYearGsrRecords });
      mockListLivestockGroups.mockResolvedValue(livestock);
      const status = await getFieldFertiliserStatusAction("field-1");
      const demand = await getFarmFertiliserDemandAction();
      return { status, demand };
    };

    // The audit's reproduction: no preceding-year evidence and no current
    // livestock (destocked). Splashplate must NOT be credited.
    const destocked = await statusWith([], []);
    expect(destocked.status).toEqual({ status: "blocked", reasonCode: "P3_PLANNED_SLURRY_METHOD_UNRESOLVED" });
    expect(destocked.demand.aggregation.fields[0].purchaseStatus).toMatchObject({ status: "UNKNOWN", reasonCode: "P3_PLANNED_SLURRY_METHOD_UNRESOLVED" });

    // Current herd far over the trigger but no preceding-year record: still
    // unresolved — the current herd is not the statutory year.
    expect((await statusWith([])).status).toEqual({ status: "blocked", reasonCode: "P3_PLANNED_SLURRY_METHOD_UNRESOLVED" });

    // A record for the wrong year (2024) never applies to 2026 slurry.
    expect((await statusWith([record("2024", 60)])).status).toEqual({ status: "blocked", reasonCode: "P3_PLANNED_SLURRY_METHOD_UNRESOLVED" });

    // Tied records for 2025 that disagree: conflict, unresolved.
    expect((await statusWith([record("2025", 60), record("2025", 140)])).status).toEqual({ status: "blocked", reasonCode: "P3_PLANNED_SLURRY_METHOD_UNRESOLVED" });

    // 2025 at/over 100 kg N/ha: LESS required, whatever the current herd.
    expect((await statusWith([record("2025", 100)], [])).status).toEqual({ status: "blocked", reasonCode: "P3_PLANNED_SLURRY_LESS_REQUIRED" });

    // A later correction for 2025 below the trigger supersedes it: the
    // splashplate credit is admitted and carries the evidence it used.
    const below = await statusWith([record("2025", 140), record("2025", 80, "2026-02-01T09:00:00.000Z")]);
    expect(below.status.status).toBe("ok");
    if (below.status.status !== "ok") throw new Error("expected ok");
    expect(below.status.organicCreditBasis?.lessTrigger).toMatchObject({
      status: "RESOLVED",
      referenceYear: "2025",
      gsrKgNHa: 80,
      source: "DAFM Nitrates Statement 2025",
    });
    expect(below.demand.fieldCalculations?.[0]).toMatchObject({ status: "OK" });
  });

  it("F008/F007: spreads slurry only on the declared spreadable area, blocks zero/stale areas, and carries the credit's calculation basis", async () => {
    const cycle = p3FirstCutCycle();
    mockGetFarm.mockResolvedValue(farm);
    mockGetFieldProductionCycle.mockResolvedValue(cycle);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([cycle]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryCompositionRecords.mockResolvedValue([
      {
        id: "comp-1",
        farmId: farm.id,
        housingId: "h1",
        slurryType: "cattle_slurry",
        status: "farmer_adjusted",
        dmPct: 6,
        sampleDate: "2026-01-01",
        source: "Farmer estimate",
        recordedAt: "2026-01-01T12:00:00.000Z",
      },
    ]);
    mockListFields.mockResolvedValue([p3Field()]); // 4.2 ha, no boundary date
    mockListSlurryAllocations.mockResolvedValue([
      {
        // A persisted plan's identity and database revision.
        id: "alloc-9",
        planRevision: 4,
        fieldId: "field-1",
        housingId: "h1",
        volumeM3: 42,
        applicationMethod: { value: "LESS", status: "verified", source: "Keith" },
        applicationDate: { value: "2026-03-15", status: "verified", source: "Keith" },
      } as never,
    ]);
    const evidence = (spreadableAreaHa?: number, grossAreaHaAtRecord = 4.2) =>
      vi.mocked(loadRegulatoryEvidenceRecordsForFarm).mockResolvedValue({
        neatSlurryEvidenceRecords: [],
        slurryOriginEvidenceRecords: [],
        evidenceTablesApplied: true,
        spreadableAreaRecords:
          spreadableAreaHa === undefined
            ? []
            : [
                {
                  id: "area-1",
                  farmId: farm.id,
                  fieldId: "field-1",
                  status: "farmer_adjusted",
                  spreadableAreaHa,
                  grossAreaHaAtRecord,
                  effectiveDate: "2026-02-01",
                  source: "Farmer mapped no-spread areas",
                  exclusionGeometry: [],
                  recordedAt: "2026-02-01T09:00:00.000Z",
                },
              ],
      });

    // No declaration: the mapped field (E1 default), 42 m³ over 4.2 ha.
    evidence();
    const whole = await getFieldFertiliserStatusAction("field-1");
    if (whole.status !== "ok") throw new Error("expected ok");
    expect(whole.organicCreditBasis).toMatchObject({
      // The slurry nutrient engine that produced the credit — not the
      // grass requirement engine's version.
      calculationVersion: NUTRIENT_ENGINE_VERSION,
      allocation: {
        fieldId: "field-1",
        housingId: "h1",
        volumeM3: 42,
        // Allocation identity and revision, and its composition record.
        contributing: [
          {
            housingId: "h1",
            volumeM3: 42,
            source: { kind: "PHYSICAL_RESERVATION", allocationId: "alloc-9", planRevision: 4 },
            compositionRecordId: "comp-1",
          },
        ],
      },
      // Tracked method/date keep their status, source and history.
      applicationMethod: { value: "LESS", status: "verified", source: "Keith", history: [] },
      applicationDate: { value: "2026-03-15", status: "verified", source: "Keith", history: [] },
      applicationRateM3ha: 10,
      spreadableArea: { areaHa: 4.2, basis: "MAPPED_FIELD_DEFAULT" },
      dryMatter: {
        dmPct: 6,
        status: "farmer_adjusted",
        compositionRecordId: "comp-1",
        compositionVersion: SLURRY_COMPOSITION_VERSION,
      },
      rule: { ruleId: expect.any(String), source: expect.any(String) },
    });

    // 2.1 ha spreadable after mapped exclusions: the same 42 m³ goes on at
    // 20 m³/ha, on half the field.
    evidence(2.1);
    const partial = await getFieldFertiliserStatusAction("field-1");
    if (partial.status !== "ok") throw new Error("expected ok");
    expect(partial.organicCreditBasis).toMatchObject({
      applicationRateM3ha: 20,
      spreadableArea: { areaHa: 2.1, basis: "SPREADABLE_AREA_DECLARATION", recordId: "area-1" },
    });
    const basis = partial.organicCreditBasis!;
    for (const key of ["n", "p", "k"] as const) {
      expect(basis.fieldAverageCreditKgHa[key]).toBeCloseTo(
        basis.creditOnSpreadAreaKgHa[key] * 0.5,
        6,
      );
      expect(partial.organicCreditsKgHa[key]).toBeCloseTo(basis.fieldAverageCreditKgHa[key], 6);
    }
    const demand = await getFarmFertiliserDemandAction();
    const calculation = demand.fieldCalculations?.[0];
    if (!calculation || calculation.status !== "OK") throw new Error("expected OK");
    expect(calculation.organicCreditBasis).toEqual(basis);

    // Zero spreadable area, and a declaration made for a different gross
    // area (stale): the slurry is not credited in either path.
    for (const [area, gross, reasonCode] of [
      [0, 4.2, "P3_SPREADABLE_AREA_ZERO"],
      [2.1, 5, "P3_SPREADABLE_AREA_STALE"],
    ] as const) {
      evidence(area, gross);
      expect(await getFieldFertiliserStatusAction("field-1")).toEqual({
        status: "blocked",
        reasonCode,
      });
      const blocked = await getFarmFertiliserDemandAction();
      expect(blocked.aggregation.fields[0].purchaseStatus).toMatchObject({
        status: "UNKNOWN",
        reasonCode,
        missingInputs: ["spreadableArea"],
      });
    }
    evidence();
    mockListSlurryCompositionRecords.mockResolvedValue([]);
  });

  it("never sizes a grazing field from a partial farm grassland area: farm demand and the per-field status agree when another field has no cycle", async () => {
    const grazing = p3Field({ id: "field-1", areaHa: 4.2 });
    const unclassified = p3Field({
      id: "field-2",
      name: "Unclassified field",
      areaHa: 10,
    });
    const grazingCycle = p3GrazingCycle("field-1");
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([grazing, unclassified]);
    mockGetFieldProductionCycle.mockResolvedValue(grazingCycle);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([grazingCycle]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListGrazingFieldSessions.mockResolvedValue([]);

    const demand = await getFarmFertiliserDemandAction();
    const status = await getFieldFertiliserStatusAction("field-1");

    // The holding stocking rate needs the whole farm's grassland area; with
    // a cycle missing it would be computed from 4.2 ha instead of 14.2 ha.
    expect(status).toEqual({
      status: "blocked",
      reasonCode: "MISSING_FARM_PRODUCTION_CYCLES_FOR_GRASSLAND_AREA",
    });
    const grazingEntry = demand.aggregation.fields.find(
      (entry) => entry.fieldId === "field-1",
    );
    expect(grazingEntry?.purchaseStatus).toMatchObject({
      status: "UNKNOWN",
      reasonCode: "MISSING_FARM_PRODUCTION_CYCLES_FOR_GRASSLAND_AREA",
    });
    expect(grazingEntry?.purchaseClass).toBe("UNRESOLVED");
    expect(
      demand.fieldCalculations?.find((row) => row.fieldId === "field-1"),
    ).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE" });
    expect(demand.demand).toHaveLength(0);
  });

  it("still sizes a grazing field (holding stocking rate, movement history as context) when another field has no cycle, identically in both paths", async () => {
    const grazing = p3Field({ id: "field-1", areaHa: 4.2 });
    const unclassified = p3Field({
      id: "field-2",
      name: "Unclassified field",
      areaHa: 10,
    });
    const grazingCycle = p3GrazingCycle("field-1");
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([grazing, unclassified]);
    mockGetFieldProductionCycle.mockResolvedValue(grazingCycle);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([grazingCycle]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListGrazingFieldSessions.mockResolvedValue([
      {
        id: "session-a",
        farmId: "farm-1",
        livestockGroupId: "g1",
        fieldId: "field-1",
        startedAt: "2026-10-01T00:00:00.000Z",
        endedAt: "2026-10-11T00:00:00.000Z",
        headCountSnapshot: 20,
        livestockCategorySnapshot: "suckler_cow",
        livestockUnitsPerHeadSnapshot: 0.9,
        source: "Keith",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "session-b",
        farmId: "farm-1",
        livestockGroupId: "g1",
        fieldId: "field-2",
        startedAt: "2026-10-11T00:00:00.000Z",
        headCountSnapshot: 20,
        livestockCategorySnapshot: "suckler_cow",
        livestockUnitsPerHeadSnapshot: 0.9,
        source: "Keith",
        createdAt: "2026-10-11T00:00:00.000Z",
      },
    ]);

    const demand = await getFarmFertiliserDemandAction();
    const status = await getFieldFertiliserStatusAction("field-1");

    expect(status.status).toBe("ok");
    if (status.status !== "ok") throw new Error("expected ok");
    expect(status.ruleTraces.n?.inputs.stockingEvidenceBasis).toBe(
      "HOLDING_GSR",
    );
    const calculation = demand.fieldCalculations?.find(
      (row) => row.fieldId === "field-1",
    );
    expect(calculation?.status).toBe("OK");
    if (calculation?.status !== "OK") throw new Error("expected OK");
    // The two calls read the clock separately, so an open grazing session
    // differs by milliseconds; the figures must agree, not drift by rule.
    for (const nutrient of ["n", "p", "k"] as const) {
      expect(calculation.requirementKgHa[nutrient]).toBeCloseTo(
        status.requirementKgHa[nutrient],
        4,
      );
      expect(calculation.remainingKgHa[nutrient]).toBeCloseTo(
        status.remainingKgHa?.[nutrient] ?? Number.NaN,
        4,
      );
    }
  });

  it("returns a partial P3 farm demand when another active field has no production cycle instead of crashing the overview", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      p3Field({ id: "field-1", name: "P Collins" }),
      p3Field({ id: "field-2", name: "Unclassified field" }),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3FirstCutCycle({ fieldId: "field-1" }),
    ]);

    const result = await getFarmFertiliserDemandAction();

    expect(mockGetFarmFertiliserDemand).not.toHaveBeenCalled();
    expect(result.fieldsWithBlockedEvidence).toBe(1);
    expect(result.aggregation.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: "field-1" }),
        expect.objectContaining({
          fieldId: "field-2",
          purchaseStatus: expect.objectContaining({
            status: "UNKNOWN",
            reasonCode: "P3_MISSING_PRODUCTION_CYCLE",
          }),
        }),
      ]),
    );
    expect(result.demand.length).toBeGreaterThan(0);
  });

  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getFarmFertiliserDemandAction()).rejects.toThrow(
      /no real farm/i,
    );
  });

  it("maps the real farm-wide demand rows to FarmInputDemand, farm-scoped", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({
      demand: [
        {
          product: "18-6-12",
          npkAnalysis: "18-6-12",
          recommendedTotalKg: 1000,
          recommendedTotalCostEur: 620,
          fieldsCount: 2,
          plannedTotalKg: 400,
          confirmedAppliedTotalKg: 300,
          remainingTotalKg: 700,
        },
      ],
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 0,
      aggregation: aggregateFarmFertiliserPurchasing([]),
    });

    const result = await getFarmFertiliserDemandAction();

    // Session 3b: the farm's recorded slurry composition reaches the farm aggregation.
    expect(mockGetFarmFertiliserDemand).toHaveBeenCalledWith(
      expect.objectContaining({
        farmId: "farm-1",
        slurryCompositionRecords: [],
      }),
    );
    expect(result).toEqual({
      demand: [
        {
          farmId: "farm-1",
          product: "18-6-12",
          unit: "kg",
          totalRequirementKg: 1000,
          plannedRequirementKg: 400,
          confirmedRequirementKg: 300,
          remainingRequirementKg: 700,
          confidence: "estimated",
        },
      ],
      purchaseRequirementTonnes: [
        {
          product: "18-6-12",
          npkAnalysis: "18-6-12",
          recommendedTotalTonnes: 1,
          plannedTotalTonnes: 0.4,
          confirmedAppliedTotalTonnes: 0.3,
          remainingTotalTonnes: 0.7,
          remainingTotalKg: 700,
          fieldsCount: 2,
        },
      ],
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 0,
      aggregation: aggregateFarmFertiliserPurchasing([]),
      basket: expect.objectContaining({
        farmId: "farm-1",
        status: "READY",
        lines: [],
        currency: "EUR",
      }),
    });
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2): `listFieldsForFarm` itself returns every field regardless of
  // `archivedAt` — an archived field must never reach the real farm-wide
  // aggregation this action drives (purchasing totals, stocking-rate
  // denominator), the exact real defect the audit found ("stocking
  // calculations and purchasing totals changed after an apparently
  // successful archive").
  it("excludes a real archived field from the farm-wide aggregation entirely", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      field({ id: "field-1" }),
      field({ id: "field-2", archivedAt: "2026-09-01T00:00:00Z" }),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({
      demand: [],
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 0,
      aggregation: aggregateFarmFertiliserPurchasing([]),
    });

    await getFarmFertiliserDemandAction();

    const call = mockGetFarmFertiliserDemand.mock.calls[0][0];
    expect(call.fields.map((f) => f.id)).toEqual(["field-1"]);
  });

  it("propagates truncated when a real farm-scoped read behind the aggregation hit its own cap", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({
      demand: [],
      truncated: true,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 0,
      aggregation: aggregateFarmFertiliserPurchasing([]),
    });

    const result = await getFarmFertiliserDemandAction();
    expect(result.truncated).toBe(true);
  });

  // Codex audit MEDIUM (round 21): a real confirmed Actual whose
  // quantity couldn't be resolved to a real kg figure (an unverified
  // "bags" unit) must not silently vanish from this farm-wide summary
  // with no disclosure — this action must propagate the real count
  // getFarmFertiliserDemand itself already computes.
  it("propagates applicationsWithUnknownComposition when a real confirmed Actual's quantity couldn't be resolved to a real kg figure", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({
      demand: [],
      truncated: false,
      applicationsWithUnknownComposition: 1,
      fieldsWithBlockedEvidence: 0,
      aggregation: aggregateFarmFertiliserPurchasing([]),
    });

    const result = await getFarmFertiliserDemandAction();
    expect(result.applicationsWithUnknownComposition).toBe(1);
  });

  // Codex audit HIGH (round 22): a real grazing field excluded from
  // Recommended purely because the farm has no recorded livestock must
  // not silently vanish from this farm-wide summary with no disclosure
  // — this action must propagate the real count getFarmFertiliserDemand
  // itself already computes.
  it("propagates fieldsWithBlockedEvidence when a real field was excluded from Recommended due to blocked evidence", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({
      demand: [],
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 1,
      aggregation: aggregateFarmFertiliserPurchasing([]),
    });

    const result = await getFarmFertiliserDemandAction();
    expect(result.fieldsWithBlockedEvidence).toBe(1);
  });

  // Fertiliser Vertical V1, Checkpoint 3 (item D/E): the farm-wide
  // Purchase Requirement (tonnes) must be a real conversion of this same
  // action's own kg totals, never a second independently-computed figure.
  it("converts the real farm-wide demand to a tonnes-based Purchase Requirement, product-for-product with the kg totals above", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({
      demand: [
        {
          product: "18-6-12",
          npkAnalysis: "18-6-12",
          recommendedTotalKg: 1000,
          recommendedTotalCostEur: 620,
          fieldsCount: 2,
          plannedTotalKg: 400,
          confirmedAppliedTotalKg: 300,
          remainingTotalKg: 700,
        },
      ],
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 0,
      aggregation: aggregateFarmFertiliserPurchasing([]),
    });

    const result = await getFarmFertiliserDemandAction();
    expect(result.purchaseRequirementTonnes).toEqual([
      {
        product: "18-6-12",
        npkAnalysis: "18-6-12",
        recommendedTotalTonnes: 1,
        plannedTotalTonnes: 0.4,
        confirmedAppliedTotalTonnes: 0.3,
        remainingTotalTonnes: 0.7,
        remainingTotalKg: 700,
        fieldsCount: 2,
      },
    ]);
  });
});

describe("previewSlurryFirstFertiliserPlanAction", () => {
  it("uses forecast slurry first and reduces the P3 chemical procurement preview without writing current slurry state", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListHousing.mockResolvedValue([
      {
        id: "h1",
        farmId: farm.id,
        shedName: "Main tank",
        animalType: "cattle",
        headCount: 0,
        weeksHoused: 0,
        storageCapacityM3: 500,
        storageFillPct: 10,
        storageFillStatus: "farmer_recorded",
        slurryEstimate: { volumeM3: 0, nKg: 0, pKg: 0, kKg: 0, source: "mock" },
      } as never,
    ]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([
      p3FirstCutCycle({
        season: "2027",
        evidence: {
          cropSystem: {
            value: "GRASS_FIRST_CUT_SILAGE",
            method: "FARMER_DECLARED",
            source: "Keith",
          },
          productionTargetTDMHa: {
            value: 5,
            method: "FARMER_DECLARED",
            source: "Keith",
          },
          chemicalNAppliedKgHa: {
            value: 0,
            method: "FARMER_DECLARED",
            source: "Keith",
          },
          chemicalPAppliedKgHa: {
            value: 0,
            method: "FARMER_DECLARED",
            source: "Keith",
          },
          chemicalKAppliedKgHa: {
            value: 0,
            method: "FARMER_DECLARED",
            source: "Keith",
          },
        },
      }),
    ]);
    mockListSlurryCompositionRecords.mockResolvedValue([
      {
        id: "comp-1",
        farmId: farm.id,
        housingId: "h1",
        slurryType: "cattle_slurry",
        status: "farmer_adjusted",
        dmPct: 6,
        sampleDate: "2026-10-01",
        source: "Farmer estimate",
        recordedAt: "2026-10-01T12:00:00.000Z",
      },
    ]);

    const result = await previewSlurryFirstFertiliserPlanAction({
      planningDate: "2027-01-30",
      expectedAvailableM3: 300,
      source: "FARMER_FORECAST",
      productionBasis: "TARGET_SEASON_SAVED",
      candidates: [
        {
          fieldId: "field-1",
          housingId: "h1",
          volumeM3: 100,
          applicationMethod: "LESS",
          applicationDate: "2027-02-01",
        },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.scenario).toMatchObject({
      expectedAvailableM3: 300,
      allocatedM3: 100,
      unallocatedM3: 200,
      source: "FARMER_FORECAST",
    });
    const baselineKg = result.baseline.purchaseRequirementTonnes.reduce(
      (sum, line) => sum + line.remainingTotalKg,
      0,
    );
    const afterSlurryKg =
      result.withPlannedSlurry.purchaseRequirementTonnes.reduce(
        (sum, line) => sum + line.remainingTotalKg,
        0,
      );
    expect(afterSlurryKg).toBeLessThan(baselineKg);
    // A preview is never adopted or persisted by itself.
    expect(vi.mocked(createSlurryForecastAdoption)).not.toHaveBeenCalled();
    expect(result.automaticOptimisation).toMatchObject({
      status: "BLOCKED",
      reasonCode: "P3_ECONOMIC_ADAPTER_NOT_AVAILABLE",
    });
  });

  it("can explicitly carry current production settings into the future scenario and resets prior chemical applications to zero", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListHousing.mockResolvedValue([
      {
        id: "h1",
        farmId: farm.id,
        shedName: "Main tank",
        storageCapacityM3: 500,
      } as never,
    ]);
    mockListSlurryCompositionRecords.mockResolvedValue([
      {
        id: "comp-1",
        farmId: farm.id,
        housingId: "h1",
        slurryType: "cattle_slurry",
        status: "farmer_adjusted",
        dmPct: 6,
        sampleDate: "2026-10-01",
        source: "Farmer estimate",
        recordedAt: "2026-10-01T12:00:00.000Z",
      },
    ]);
    mockListFieldProductionCyclesForSeason
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([p3FirstCutCycle()]);

    const result = await previewSlurryFirstFertiliserPlanAction({
      planningDate: "2027-01-30",
      expectedAvailableM3: 300,
      source: "FARMER_FORECAST",
      productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
      candidates: [
        {
          fieldId: "field-1",
          housingId: "h1",
          volumeM3: 100,
          applicationMethod: "LESS",
          applicationDate: "2027-02-01",
        },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.scenario).toMatchObject({
      productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
      carriedForwardFromSeason: "2026",
    });
    expect(result.baseline.fieldsWithBlockedEvidence).toBe(0);
    expect(result.withPlannedSlurry.fieldsWithBlockedEvidence).toBe(0);
    const baselineKg = result.baseline.purchaseRequirementTonnes.reduce(
      (sum, line) => sum + line.remainingTotalKg,
      0,
    );
    const afterSlurryKg =
      result.withPlannedSlurry.purchaseRequirementTonnes.reduce(
        (sum, line) => sum + line.remainingTotalKg,
        0,
      );
    expect(baselineKg).toBeGreaterThan(0);
    expect(afterSlurryKg).toBeLessThan(baselineKg);
  });

  it("F004: a carried-forward field exception gives the same production system and N in the plan and the slurry preview", async () => {
    // Farm baseline calf-to-beef; this field's 2026 exception is
    // calf-to-weaning (Table 12-2). Carried into 2027 with no saved cycle.
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListGrazingFieldSessions.mockResolvedValue([]);
    mockListHousing.mockResolvedValue([
      { id: "h1", farmId: farm.id, shedName: "Main tank", storageCapacityM3: 500 } as never,
    ]);
    mockListSlurryCompositionRecords.mockResolvedValue([]);
    const exception2026 = p3GrazingCycle();
    exception2026.evidence.grazingProductionSystem = {
      value: "SUCKLER_CALF_TO_WEANING",
      method: "FARMER_DECLARED",
      source: "Field exception · Keith",
    };
    mockListFieldProductionCyclesForSeason.mockImplementation(
      async (_fieldIds, season) => (season === "2026" ? [exception2026] : []),
    );

    const plan = await getFarmFertiliserDemandAction("2027");
    const preview = await previewSlurryFirstFertiliserPlanAction({
      planningDate: "2027-01-30",
      expectedAvailableM3: 0,
      source: "FARMER_FORECAST",
      productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
      candidates: [],
    });
    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") throw new Error("expected ready");

    const planCalc = plan.fieldCalculations?.[0];
    const previewCalc = preview.baseline.fieldCalculations?.[0];
    if (planCalc?.status !== "OK" || previewCalc?.status !== "OK")
      throw new Error("expected both paths to calculate");
    expect(previewCalc.requirementKgHa).toEqual(planCalc.requirementKgHa);
    expect(previewCalc.remainingKgHa).toEqual(planCalc.remainingKgHa);

    // Both use the field exception (Table 12-2), not the farm baseline.
    mockGetFieldProductionCycle.mockResolvedValue(null);
    const status = await getFieldFertiliserStatusAction("field-1", "2027");
    if (status.status !== "ok") throw new Error("expected ok");
    expect(status.ruleTraces.n?.ruleId).toBe(
      "TEAGASC_GREEN_BOOK_2020_TABLE_12_2_SUCKLER_CALF_TO_WEANING",
    );
    expect(status.requirementKgHa).toEqual(previewCalc.requirementKgHa);
    mockListFieldProductionCyclesForSeason.mockReset();
  });

  describe("F004: the preview reads the same movement evidence and viewpoint as the plan", () => {
    const session = (id: string, category: string, headCount: number) => ({
      id,
      farmId: "farm-1",
      livestockGroupId: "g1",
      fieldId: "field-1",
      startedAt: "2026-04-01T00:00:00.000Z",
      headCountSnapshot: headCount,
      livestockCategorySnapshot: category,
      livestockUnitsPerHeadSnapshot: category === "suckler_cow" ? 1 : 0.7,
      source: "Farmer",
      createdAt: "2026-04-01T00:00:00.000Z",
    });
    const setup = (farmValue: Farm, sessions: ReturnType<typeof session>[]) => {
      const cycle = p3GrazingCycle("field-1");
      mockGetFarm.mockResolvedValue(farmValue);
      mockListFields.mockResolvedValue([p3Field({ id: "field-1", areaHa: 4.2 })]);
      mockGetFieldProductionCycle.mockResolvedValue(cycle);
      mockListFieldProductionCyclesForSeason.mockResolvedValue([cycle]);
      mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
      mockListSlurryAllocations.mockResolvedValue([]);
      mockListSlurryCompositionRecords.mockResolvedValue([]);
      mockListHousing.mockResolvedValue([{ id: "h1", farmId: farm.id, shedName: "Main tank", storageCapacityM3: 500 } as never]);
      mockListGrazingFieldSessions.mockResolvedValue(sessions as never);
    };
    const preview = () =>
      previewSlurryFirstFertiliserPlanAction({
        planningDate: "2026-11-20",
        expectedAvailableM3: 0,
        source: "FARMER_FORECAST",
        productionBasis: "TARGET_SEASON_SAVED",
        candidates: [],
      });

    it("recorded store-cattle occupancy blocks the field (unsupported pathway) in the plan AND the preview — never the farm baseline", async () => {
      setup(farm, [session("store-session", "store", 10)]);
      const plan = await getFarmFertiliserDemandAction();
      expect(plan.fieldCalculations?.[0]).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "P3_UNSUPPORTED_PATHWAY" });
      const result = await preview();
      if (result.status !== "ready") throw new Error("expected ready");
      expect(result.assessment.planningSeason).toBe("2026");
      expect(result.baseline.fieldCalculations?.[0]).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "P3_UNSUPPORTED_PATHWAY" });
      expect(result.withPlannedSlurry.fieldCalculations?.[0]).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "P3_UNSUPPORTED_PATHWAY" });
      // The same viewpoint: sessions read as of one assessment instant.
      const viewpoints = mockListGrazingFieldSessions.mock.calls.map((call) => call[1]);
      expect(viewpoints.every((value) => typeof value === "string")).toBe(true);
    });

    it("a supported movement override (suckler cows with retained stores) replaces an unsupported farm baseline identically in the plan and the preview", async () => {
      setup(
        { ...farm, grazingProductionSystem: { value: "OTHER_DRYSTOCK", status: "farmer_adjusted", source: "Keith" } },
        [session("cows", "suckler_cow", 12), session("stores", "store", 10)],
      );
      const plan = await getFarmFertiliserDemandAction();
      const planCalc = plan.fieldCalculations?.[0];
      if (planCalc?.status !== "OK") throw new Error("expected the movement override to calculate in the plan");
      const result = await preview();
      if (result.status !== "ready") throw new Error("expected ready");
      const previewCalc = result.baseline.fieldCalculations?.[0];
      if (previewCalc?.status !== "OK") throw new Error("expected the movement override to calculate in the preview");
      expect(previewCalc.requirementKgHa).toEqual(planCalc.requirementKgHa);
      expect(previewCalc.remainingKgHa).toEqual(planCalc.remainingKgHa);
      const status = await getFieldFertiliserStatusAction("field-1");
      if (status.status !== "ok") throw new Error("expected ok");
      expect(status.requirementKgHa).toEqual(previewCalc.requirementKgHa);
    });
  });

  it("keeps a saved target-season cycle when carrying forward, and only carries fields that have none", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      p3Field({ id: "field-1", name: "Saved for 2027" }),
      p3Field({ id: "field-2", name: "Carried from 2026" }),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListHousing.mockResolvedValue([
      {
        id: "h1",
        farmId: farm.id,
        shedName: "Main tank",
        storageCapacityM3: 500,
      } as never,
    ]);
    mockListSlurryCompositionRecords.mockResolvedValue([]);
    const saved2027 = p3FirstCutCycle({
      id: "cycle-2027",
      fieldId: "field-1",
      season: "2027",
      status: "planned",
    });
    mockListFieldProductionCyclesForSeason.mockImplementation(
      async (_fieldIds, season) =>
        season === "2027"
          ? [saved2027]
          : [
              // This season field-1 is grazed; the saved 2027 plan is silage.
              p3GrazingCycle("field-1"),
              p3FirstCutCycle({ id: "cycle-2026-f2", fieldId: "field-2" }),
            ],
    );

    const result = await previewSlurryFirstFertiliserPlanAction({
      planningDate: "2027-01-30",
      expectedAvailableM3: 0,
      source: "FARMER_FORECAST",
      productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
      candidates: [],
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.scenario.carriedForwardFromSeason).toBe("2026");
    const byField = new Map(
      (result.baseline.fieldCalculations ?? []).map((row) => [row.fieldId, row]),
    );
    expect(byField.get("field-1")).toMatchObject({
      status: "OK",
      cropSystem: "GRASS_FIRST_CUT_SILAGE",
    });
    expect(byField.get("field-2")).toMatchObject({
      status: "OK",
      cropSystem: "GRASS_FIRST_CUT_SILAGE",
    });
  });

  it("blocks a future preview until every active field has an explicit target-season production cycle", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListHousing.mockResolvedValue([
      {
        id: "h1",
        farmId: farm.id,
        shedName: "Main tank",
        storageCapacityM3: 500,
      } as never,
    ]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([]);

    const result = await previewSlurryFirstFertiliserPlanAction({
      planningDate: "2027-01-30",
      expectedAvailableM3: 300,
      source: "FARMER_FORECAST",
      productionBasis: "TARGET_SEASON_SAVED",
      candidates: [
        {
          fieldId: "field-1",
          housingId: "h1",
          volumeM3: 100,
          applicationMethod: "LESS",
          applicationDate: "2027-02-01",
        },
      ],
    });
    expect(result).toMatchObject({
      status: "blocked",
      reasonCode: "MISSING_TARGET_SEASON_PRODUCTION_CYCLES",
    });
  });
});

// Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding F5).
describe("getAutomaticSlurryPlanAction — canonical economics, spreadable area and LESS evidence", () => {
  const PLANNING_DATE = "2027-02-15";
  const lawfulGrazing = (id: string, name: string, overrides: Partial<Field> = {}) =>
    p3Field({
      id,
      name,
      areaHa: 4.2,
      fertility: {
        ...p3Field().fertility,
        pIndex: { value: 2, status: "verified", source: "Soil test" },
        kIndex: { value: 1, status: "verified", source: "Soil test" },
      },
      waterBufferContext: {
        value: { featureType: "surface_water", distanceM: 110, localOverrideStatus: "verified_none" },
        status: "verified",
        source: "Farmer",
      },
      ...overrides,
    });
  const store = (fillPct: number) =>
    ({
      id: "h1",
      farmId: farm.id,
      shedName: "Main tank",
      shedType: "slatted",
      linkedGroupIds: [],
      housingPeriod: { start: "2026-11-01", end: "2027-03-15" },
      slurryEstimate: {},
      storageCapacityM3: 500,
      storageFillPct: fillPct,
      storageFillStatus: "farmer_recorded",
      storageFillRecordedAt: "2026-11-01T09:00:00.000Z",
    }) as never;
  const setup = (fields: Field[], fillPct: number, farmValue: Farm = farm) => {
    mockGetFarm.mockResolvedValue(farmValue);
    mockListFields.mockResolvedValue(fields);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    // A recorded 6% DM: a value both the LESS and splashplate tables publish.
    mockListSlurryCompositionRecords.mockResolvedValue([
      { id: "comp-1", farmId: farm.id, housingId: "h1", slurryType: "cattle_slurry", status: "farmer_adjusted", dmPct: 6, sampleDate: "2026-10-01", source: "Farmer estimate", recordedAt: "2026-10-01T12:00:00.000Z" },
    ]);
    mockListHousing.mockResolvedValue([store(fillPct)]);
    mockListFieldProductionCyclesForSeason.mockImplementation(async (_ids, season) =>
      season === "2026" ? fields.map((f) => p3GrazingCycle(f.id)) : [],
    );
  };
  const cost = (products: { costEur: number }[]) => products.reduce((sum, p) => sum + p.costEur, 0);
  /** The canonical field status for 2027 with exactly this planned slurry. */
  const canonicalCost = async (fieldId: string, slurry?: { volumeM3: number; method: string }) => {
    mockListSlurryAllocations.mockResolvedValue(
      slurry
        ? [
            {
              fieldId,
              housingId: "h1",
              volumeM3: slurry.volumeM3,
              applicationMethod: { value: slurry.method, status: "estimated", source: "test" },
              applicationDate: { value: PLANNING_DATE, status: "estimated", source: "test" },
            } as never,
          ]
        : [],
    );
    mockGetFieldProductionCycle.mockResolvedValue(null);
    const status = await getFieldFertiliserStatusAction(fieldId, "2027");
    mockListSlurryAllocations.mockResolvedValue([]);
    if (status.status !== "ok") throw new Error(`expected ok, got ${JSON.stringify(status)}`);
    return cost(status.recommendedProducts);
  };
  afterEach(() => {
    mockListSlurryCompositionRecords.mockResolvedValue([]);
    mockListFieldProductionCyclesForSeason.mockReset();
    mockListFieldProductionCyclesForSeason.mockResolvedValue([]);
    vi.mocked(loadRegulatoryEvidenceRecordsForFarm).mockResolvedValue({
      neatSlurryEvidenceRecords: [],
      spreadableAreaRecords: [],
      slurryOriginEvidenceRecords: [],
      evidenceTablesApplied: true,
    });
  });

  it("F014: recomputes cost and saving for the supply-limited volume through the canonical calculation", async () => {
    // Plenty of slurry: the field takes its full useful rate.
    setup([lawfulGrazing("field-1", "Back Meadow")], 80);
    const full = await getAutomaticSlurryPlanAction(PLANNING_DATE);
    if (full.status !== "ready") throw new Error(JSON.stringify(full));
    const unconstrained = full.recommendations[0];
    expect(unconstrained.volumeM3).toBeGreaterThan(50);

    // Only 50 m³ available: the same field is cut back.
    setup([lawfulGrazing("field-1", "Back Meadow")], 10);
    const limited = await getAutomaticSlurryPlanAction(PLANNING_DATE);
    if (limited.status !== "ready") throw new Error(JSON.stringify(limited));
    const rec = limited.recommendations[0];
    expect(rec.volumeM3).toBeLessThanOrEqual(50);
    expect(rec.volumeM3).toBeLessThan(unconstrained.volumeM3);
    // Never the candidate's full-rate saving.
    expect(rec.estimatedChemicalSavingEur).toBeLessThan(unconstrained.estimatedChemicalSavingEur);

    // Every figure equals the canonical field calculation at that volume.
    const baseline = await canonicalCost("field-1");
    const withSlurry = await canonicalCost("field-1", { volumeM3: rec.volumeM3, method: rec.applicationMethod });
    expect(rec.baselineChemicalCostEur).toBe(baseline);
    expect(rec.withSlurryChemicalCostEur).toBe(withSlurry);
    expect(rec.estimatedChemicalSavingEur).toBe(Math.max(0, baseline - withSlurry));
    expect(rec.estimatedSavingEurPerM3).toBeCloseTo(rec.estimatedChemicalSavingEur / rec.volumeM3, 9);
  });

  it("F014: allocates finite slurry across competing fields with each field's figures recomputed for its final volume", async () => {
    const fields = [lawfulGrazing("field-1", "Back Meadow"), lawfulGrazing("field-2", "Front Meadow")];
    setup(fields, 20); // 100 m³ for two fields that could each take more
    const plan = await getAutomaticSlurryPlanAction(PLANNING_DATE);
    if (plan.status !== "ready") throw new Error(JSON.stringify(plan));
    expect(plan.allocatedM3).toBeLessThanOrEqual(100 + 1e-9);
    expect(plan.recommendations.length).toBeGreaterThan(0);
    for (const rec of plan.recommendations) {
      setup(fields, 20);
      expect(rec.withSlurryChemicalCostEur).toBe(
        await canonicalCost(rec.fieldId, { volumeM3: rec.volumeM3, method: rec.applicationMethod }),
      );
      expect(rec.estimatedChemicalSavingEur).toBe(Math.max(0, rec.baselineChemicalCostEur - rec.withSlurryChemicalCostEur));
    }
  });

  it("F008: sizes rates on the spreadable area and excludes zero, stale and conflicting declarations", async () => {
    const area = (fieldId: string, spreadableAreaHa: number, extra: { id?: string; grossAreaHaAtRecord?: number; recordedAt?: string } = {}) => ({
      id: extra.id ?? `area-${fieldId}`,
      farmId: farm.id,
      fieldId,
      status: "farmer_adjusted" as const,
      spreadableAreaHa,
      grossAreaHaAtRecord: extra.grossAreaHaAtRecord ?? 4.2,
      effectiveDate: "2026-10-01",
      source: "Farmer mapped no-spread areas",
      exclusionGeometry: [],
      recordedAt: extra.recordedAt ?? "2026-10-01T09:00:00.000Z",
    });
    const fields = [
      lawfulGrazing("field-1", "Partial"),
      lawfulGrazing("field-2", "Zero"),
      lawfulGrazing("field-3", "Stale"),
      lawfulGrazing("field-4", "Conflicting"),
    ];
    setup(fields, 80);
    vi.mocked(loadRegulatoryEvidenceRecordsForFarm).mockResolvedValue({
      neatSlurryEvidenceRecords: [],
      slurryOriginEvidenceRecords: [],
      evidenceTablesApplied: true,
      spreadableAreaRecords: [
        area("field-1", 2.1),
        area("field-2", 0),
        area("field-3", 2.1, { grossAreaHaAtRecord: 5 }),
        area("field-4", 2.1, { id: "area-4a" }),
        area("field-4", 3.0, { id: "area-4b" }),
      ],
    });
    const plan = await getAutomaticSlurryPlanAction(PLANNING_DATE);
    if (plan.status !== "ready") throw new Error(JSON.stringify(plan));
    const partial = plan.recommendations.find((r) => r.fieldId === "field-1");
    if (!partial) throw new Error("expected the partial field to be recommended");
    expect(partial.spreadableAreaHa).toBe(2.1);
    expect(partial.spreadableAreaBasis).toBe("SPREADABLE_AREA_DECLARATION");
    expect(partial.volumeM3).toBeCloseTo(partial.rateM3ha * 2.1, 9);
    const excluded = Object.fromEntries(plan.excludedFields.map((e) => [e.fieldId, e.reasonCode]));
    expect(excluded).toMatchObject({
      "field-2": "P3_SPREADABLE_AREA_ZERO",
      "field-3": "P3_SPREADABLE_AREA_STALE",
      "field-4": "P3_SPREADABLE_AREA_CONFLICT",
    });
    for (const id of ["field-2", "field-3", "field-4"])
      expect(plan.recommendations.some((r) => r.fieldId === id)).toBe(false);
  });

  it("F003: chooses the method from preceding-year stocking evidence, and LESS when none is recorded", async () => {
    const fields = [lawfulGrazing("field-1", "Back Meadow")];
    const record = (gsrKgNHa: number) => ({
      id: `gsr-${gsrKgNHa}`,
      referenceYear: "2026",
      gsrKgNHa,
      status: "verified" as const,
      source: "DAFM Nitrates Statement 2026",
      recordedAt: "2026-11-01T09:00:00.000Z",
    });
    setup(fields, 80);
    const none = await getAutomaticSlurryPlanAction(PLANNING_DATE);
    if (none.status !== "ready") throw new Error(JSON.stringify(none));
    expect(none.recommendations[0]).toMatchObject({
      applicationMethod: "LESS",
      methodBasis: { status: "UNRESOLVED", referenceYear: "2026", reasonCode: "PRECEDING_YEAR_GSR_NOT_RECORDED" },
    });

    setup(fields, 80, { ...farm, precedingYearGsrRecords: [record(80)] });
    const below = await getAutomaticSlurryPlanAction(PLANNING_DATE);
    if (below.status !== "ready") throw new Error(JSON.stringify(below));
    expect(below.recommendations[0]).toMatchObject({
      applicationMethod: "splashplate",
      methodBasis: { status: "RESOLVED", referenceYear: "2026", gsrKgNHa: 80 },
    });

    setup(fields, 80, { ...farm, precedingYearGsrRecords: [record(140)] });
    const above = await getAutomaticSlurryPlanAction(PLANNING_DATE);
    if (above.status !== "ready") throw new Error(JSON.stringify(above));
    expect(above.recommendations[0].applicationMethod).toBe("LESS");
  });

  describe("F014: a supply-clipped splashplate rate below the Table 9-8 minimum is never recommended or credited", () => {
    // Preceding-year stocking below the LESS trigger: splashplate, whose
    // Table 9-8 rule is only tabulated from 11 m³/ha.
    const splashFarm = {
      ...farm,
      precedingYearGsrRecords: [
        { id: "gsr-80", referenceYear: "2026", gsrKgNHa: 80, status: "verified" as const, source: "DAFM Nitrates Statement 2026", recordedAt: "2026-11-01T09:00:00.000Z" },
      ],
    };

    it("5 m³ for a 4.2 ha field (1.1 m³/ha) is left unused, with the reason — never credited at the 11 m³/ha row", async () => {
      setup([lawfulGrazing("field-1", "Back Meadow")], 1, splashFarm); // 1% of 500 m³ = 5 m³
      const plan = await getAutomaticSlurryPlanAction(PLANNING_DATE);
      if (plan.status !== "ready") throw new Error(JSON.stringify(plan));
      expect(plan.expectedAvailableM3).toBeCloseTo(5, 9);
      expect(plan.recommendations).toEqual([]);
      expect(plan.allocatedM3).toBe(0);
      expect(plan.unallocatedM3).toBeCloseTo(5, 9);
      expect(plan.excludedFields).toEqual([
        expect.objectContaining({ fieldId: "field-1", reasonCode: "SLURRY_SUPPLY_BELOW_SUPPORTED_MINIMUM_RATE" }),
      ]);
    });

    it("competing fields: a remainder below the minimum for the next field is left unused; one at or above it is allocated", async () => {
      const fields = [lawfulGrazing("field-1", "Back Meadow"), lawfulGrazing("field-2", "Front Meadow")];
      setup(fields, 80, splashFarm);
      const ample = await getAutomaticSlurryPlanAction(PLANNING_DATE);
      if (ample.status !== "ready") throw new Error(JSON.stringify(ample));
      const first = ample.recommendations.find((r) => r.fieldId === "field-1");
      if (!first) throw new Error("expected field-1 to be recommended");
      expect(first.applicationMethod).toBe("splashplate");
      const firstVolume = first.volumeM3;

      // field-1 takes its full volume first; 20 m³ is left — 4.7 m³/ha on field-2.
      setup(fields, ((firstVolume + 20) / 500) * 100, splashFarm);
      const short = await getAutomaticSlurryPlanAction(PLANNING_DATE);
      if (short.status !== "ready") throw new Error(JSON.stringify(short));
      expect(short.recommendations.map((r) => r.fieldId)).toEqual(["field-1"]);
      expect(short.unallocatedM3).toBeCloseTo(20, 6);
      expect(short.excludedFields).toEqual([
        expect.objectContaining({ fieldId: "field-2", reasonCode: "SLURRY_SUPPLY_BELOW_SUPPORTED_MINIMUM_RATE" }),
      ]);
      for (const rec of short.recommendations) expect(rec.rateM3ha).toBeGreaterThanOrEqual(11);

      // 50 m³ left — 11.9 m³/ha, inside the table: field-2 is allocated it.
      setup(fields, ((firstVolume + 50) / 500) * 100, splashFarm);
      const enough = await getAutomaticSlurryPlanAction(PLANNING_DATE);
      if (enough.status !== "ready") throw new Error(JSON.stringify(enough));
      const second = enough.recommendations.find((r) => r.fieldId === "field-2");
      expect(second).toMatchObject({ rateM3ha: 11.9 });
      expect(second!.volumeM3).toBeCloseTo(11.9 * 4.2, 9);
      expect(enough.excludedFields.some((e) => e.fieldId === "field-2")).toBe(false);
    });
  });
});

describe("F010: target-season slurry forecast adoption", () => {
  const SEASON = "2027";
  const grazingField = p3Field({
    id: "field-1",
    areaHa: 4.2,
    fertility: {
      ...p3Field().fertility,
      pIndex: { value: 2, status: "verified", source: "Soil test" },
      kIndex: { value: 1, status: "verified", source: "Soil test" },
    },
    waterBufferContext: {
      value: { featureType: "surface_water", distanceM: 110, localOverrideStatus: "verified_none" },
      status: "verified",
      source: "Farmer",
    },
  });
  const intent = { fieldId: "field-1", housingId: "h1", volumeM3: 60, applicationMethod: "LESS" as const, applicationDate: "2027-02-15" };
  const adoption = (overrides: object = {}) => ({
    id: "adopt-1",
    farmId: farm.id,
    planningSeason: SEASON,
    action: "adopt" as const,
    planningDate: "2027-01-30",
    forecastSource: "SYSTEM_FORECAST" as const,
    expectedAvailableM3: 120,
    productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS" as const,
    scenarioVersion: "slurry_planning_scenario_v1.0.0",
    systemForecast: {
      version: "slurry_storage_forecast_v1.0.0",
      assessedOn: "2026-11-02",
      targetDate: "2027-01-30",
      stores: [{ housingId: "h1", projectedAvailableForNewPlanM3: 120 }],
    },
    systemForecastBinding: "SERVER_BOUND" as const,
    intents: [intent],
    adoptedAt: "2026-11-02T10:00:00.000Z",
    ...overrides,
  });
  /** A store with a dated reading: 20% of 500 m³, no linked livestock, so
   * the server's own forecast for 2027-01-30 is exactly 100 m³. */
  const forecastableStore = {
    id: "h1", farmId: farm.id, shedName: "Main tank", shedType: "slatted", linkedGroupIds: [], housingPeriod: { start: "2026-11-01", end: "2027-03-15" }, slurryEstimate: {}, storageCapacityM3: 500, storageFillPct: 20, storageFillStatus: "farmer_recorded", storageFillRecordedAt: "2026-11-01T09:00:00.000Z",
  } as never;
  const setup = () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([grazingField]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListSlurryCompositionRecords.mockResolvedValue([
      { id: "comp-1", farmId: farm.id, housingId: "h1", slurryType: "cattle_slurry", status: "farmer_adjusted", dmPct: 6, sampleDate: "2026-10-01", source: "Farmer estimate", recordedAt: "2026-10-01T12:00:00.000Z" },
    ]);
    mockListHousing.mockResolvedValue([{ id: "h1", farmId: farm.id, shedName: "Main tank", storageCapacityM3: 500 } as never]);
    mockListFieldProductionCyclesForSeason.mockImplementation(async (_ids, season) =>
      season === "2026" ? [p3GrazingCycle("field-1")] : [],
    );
  };
  afterEach(() => {
    vi.mocked(listSlurryForecastAdoptionsForFarm).mockResolvedValue([]);
    mockListSlurryCompositionRecords.mockResolvedValue([]);
    mockListFieldProductionCyclesForSeason.mockReset();
    mockListFieldProductionCyclesForSeason.mockResolvedValue([]);
  });

  it("adopts a previewed future-season scenario as one immutable forecast-intent record — never a physical reservation", async () => {
    setup();
    vi.mocked(createSlurryForecastAdoption).mockImplementation(async (farmId, input) => ({ id: "adopt-new", farmId, adoptedAt: "2026-11-03T10:00:00.000Z", ...input }));
    const result = await adoptSlurryForecastScenarioAction(
      {
        planningDate: "2027-01-30",
        expectedAvailableM3: 120,
        source: "FARMER_FORECAST",
        productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
        candidates: [intent],
      },
    );
    expect(result).toMatchObject({ status: "adopted", adoption: { adoptionId: "adopt-new", planningSeason: SEASON, intents: [{ fieldId: "field-1", countsInPlan: true }] } });
    expect(vi.mocked(createSlurryForecastAdoption)).toHaveBeenCalledWith(farm.id, expect.objectContaining({
      planningSeason: SEASON,
      action: "adopt",
      planningDate: "2027-01-30",
      forecastSource: "FARMER_FORECAST",
      expectedAvailableM3: 120,
      carriedForwardFromSeason: "2026",
      scenarioVersion: "slurry_planning_scenario_v1.0.0",
      intents: [intent],
      adoptedBy: "Keith",
    }));
  });

  it("F010: a farmer-entered forecast stays FARMER_FORECAST with no system snapshot", async () => {
    setup();
    vi.mocked(createSlurryForecastAdoption).mockClear();
    vi.mocked(createSlurryForecastAdoption).mockImplementation(async (farmId, input) => ({ id: "adopt-new", farmId, adoptedAt: "2026-11-03T10:00:00.000Z", ...input }));
    await adoptSlurryForecastScenarioAction({ planningDate: "2027-01-30", expectedAvailableM3: 120, source: "FARMER_FORECAST", productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS", candidates: [intent] });
    const stored = vi.mocked(createSlurryForecastAdoption).mock.calls[0][1];
    expect(stored.forecastSource).toBe("FARMER_FORECAST");
    expect(stored.systemForecast).toBeUndefined();
  });

  it("F010: a SYSTEM_FORECAST adoption is bound to the server-calculated forecast and stores the server's volume and snapshot", async () => {
    setup();
    mockListHousing.mockResolvedValue([forecastableStore]);
    vi.mocked(createSlurryForecastAdoption).mockClear();
    vi.mocked(createSlurryForecastAdoption).mockImplementation(async (farmId, input) => ({ id: "adopt-new", farmId, adoptedAt: "2026-11-03T10:00:00.000Z", ...input }));
    const result = await adoptSlurryForecastScenarioAction({
      planningDate: "2027-01-30",
      // The client resubmits the calculated figure at 2 d.p.
      expectedAvailableM3: 100.004,
      source: "SYSTEM_FORECAST",
      productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
      candidates: [intent],
    });
    expect(result.status).toBe("adopted");
    expect(vi.mocked(createSlurryForecastAdoption)).toHaveBeenCalledWith(farm.id, expect.objectContaining({
      forecastSource: "SYSTEM_FORECAST",
      expectedAvailableM3: 100,
      systemForecast: {
        version: "slurry_storage_forecast_v1.0.0",
        assessedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        targetDate: "2027-01-30",
        stores: [{ housingId: "h1", projectedAvailableForNewPlanM3: 100 }],
      },
    }));
  });

  it("F010: rejects a SYSTEM_FORECAST label whose volume, store intent or forecast does not match — nothing is stored", async () => {
    setup();
    mockListHousing.mockResolvedValue([forecastableStore]);
    vi.mocked(createSlurryForecastAdoption).mockClear();
    const base = { planningDate: "2027-01-30", source: "SYSTEM_FORECAST" as const, productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS" as const };
    // A caller-inflated volume.
    expect(await adoptSlurryForecastScenarioAction({ ...base, expectedAvailableM3: 400, candidates: [{ ...intent, volumeM3: 300 }] })).toEqual({
      status: "validation_error",
      issues: ["SYSTEM_FORECAST_VOLUME_MISMATCH", "SYSTEM_FORECAST_STORE_VOLUME_EXCEEDED"],
    });
    // A plausible but different volume.
    expect(await adoptSlurryForecastScenarioAction({ ...base, expectedAvailableM3: 90, candidates: [intent] })).toEqual({
      status: "validation_error",
      issues: ["SYSTEM_FORECAST_VOLUME_MISMATCH"],
    });
    // No dated store reading: there is no system forecast to bind to.
    setup();
    expect(await adoptSlurryForecastScenarioAction({ ...base, expectedAvailableM3: 120, candidates: [intent] })).toEqual({
      status: "validation_error",
      issues: ["SYSTEM_FORECAST_UNAVAILABLE"],
    });
    expect(vi.mocked(createSlurryForecastAdoption)).not.toHaveBeenCalled();
  });

  it("F010: without the server-only write boundary a SYSTEM_FORECAST adoption fails closed; a FARMER_FORECAST still adopts", async () => {
    setup();
    mockListHousing.mockResolvedValue([forecastableStore]);
    vi.mocked(isSystemSlurryForecastWriteConfigured).mockReturnValue(false);
    vi.mocked(createSlurryForecastAdoption).mockClear();
    vi.mocked(createSlurryForecastAdoption).mockImplementation(async (farmId, input) => ({ id: "adopt-new", farmId, adoptedAt: "2026-11-03T10:00:00.000Z", ...input }));
    const base = { planningDate: "2027-01-30", productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS" as const, candidates: [intent] };
    try {
      expect(await adoptSlurryForecastScenarioAction({ ...base, expectedAvailableM3: 100, source: "SYSTEM_FORECAST" })).toEqual({
        status: "validation_error",
        issues: ["SYSTEM_FORECAST_WRITE_UNAVAILABLE"],
      });
      expect(vi.mocked(createSlurryForecastAdoption)).not.toHaveBeenCalled();
      expect((await adoptSlurryForecastScenarioAction({ ...base, expectedAvailableM3: 120, source: "FARMER_FORECAST" })).status).toBe("adopted");
    } finally {
      vi.mocked(isSystemSlurryForecastWriteConfigured).mockReturnValue(true);
    }
  });

  it("F010: a SYSTEM_FORECAST row with a snapshot but no SERVER_BOUND marker (legacy or directly inserted) never credits the plan", async () => {
    setup();
    const without = await getFarmFertiliserDemandAction(SEASON);
    vi.mocked(listSlurryForecastAdoptionsForFarm).mockResolvedValue([adoption({ systemForecastBinding: undefined })]);
    const forged = await getFarmFertiliserDemandAction(SEASON);
    const before = without.fieldCalculations?.[0];
    const after = forged.fieldCalculations?.[0];
    if (before?.status !== "OK" || after?.status !== "OK") throw new Error("expected both to calculate");
    expect(after.remainingKgHa).toEqual(before.remainingKgHa);
    expect(after.organicCreditBasis?.allocation.contributing ?? []).toEqual([]);
  });

  it("rejects adopting a forecast for the current season and an invalid scenario", async () => {
    setup();
    vi.mocked(createSlurryForecastAdoption).mockClear();
    const current = await adoptSlurryForecastScenarioAction(
      { planningDate: "2026-11-20", expectedAvailableM3: 120, source: "FARMER_FORECAST", productionBasis: "TARGET_SEASON_SAVED", candidates: [] },
    );
    expect(current.status).not.toBe("adopted");
    const over = await adoptSlurryForecastScenarioAction(
      { planningDate: "2027-01-30", expectedAvailableM3: 10, source: "FARMER_FORECAST", productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS", candidates: [intent] },
    );
    expect(over).toEqual({ status: "validation_error", issues: ["FORECAST_VOLUME_EXCEEDED"] });
    expect(vi.mocked(createSlurryForecastAdoption)).not.toHaveBeenCalled();
  });

  it("feeds the adopted intent into the canonical season plan and quote basket, with its forecast provenance", async () => {
    setup();
    const without = await getFarmFertiliserDemandAction(SEASON);
    vi.mocked(listSlurryForecastAdoptionsForFarm).mockResolvedValue([adoption()]);
    const withAdoption = await getFarmFertiliserDemandAction(SEASON);
    const before = without.fieldCalculations?.[0];
    const after = withAdoption.fieldCalculations?.[0];
    if (before?.status !== "OK" || after?.status !== "OK") throw new Error("expected both to calculate");
    expect(after.organicCreditsKgHa.k).toBeGreaterThan(0);
    expect(after.remainingKgHa.k).toBeLessThan(before.remainingKgHa.k);
    expect(after.organicCreditBasis?.allocation.contributing).toEqual([
      expect.objectContaining({
        housingId: "h1",
        volumeM3: 60,
        source: expect.objectContaining({
          kind: "FORECAST_INTENT",
          adoptionId: "adopt-1",
          forecastSource: "SYSTEM_FORECAST",
          expectedAvailableM3: 120,
          planningDate: "2027-01-30",
        }),
      }),
    ]);
    // The quote basket is built from the same calculation.
    const kgOf = (r: typeof without) => r.basket.lines.reduce((sum, line) => sum + line.quantityKg, 0);
    expect(kgOf(withAdoption)).toBeLessThan(kgOf(without));
    // The per-field status (field drawer) agrees.
    mockGetFieldProductionCycle.mockResolvedValue(null);
    const status = await getFieldFertiliserStatusAction("field-1", SEASON);
    if (status.status !== "ok") throw new Error("expected ok");
    expect(status.remainingKgHa).toEqual(after.remainingKgHa);
  });

  it("never changes today's tank contents or physical reservations", async () => {
    setup();
    vi.mocked(listSlurryForecastAdoptionsForFarm).mockClear();
    vi.mocked(listSlurryForecastAdoptionsForFarm).mockResolvedValue([adoption()]);
    mockListHousing.mockResolvedValue([
      { id: "h1", farmId: farm.id, shedName: "Main tank", shedType: "slatted", linkedGroupIds: [], housingPeriod: { start: "2026-11-01", end: "2027-03-15" }, slurryEstimate: {}, storageCapacityM3: 500, storageFillPct: 20, storageFillStatus: "farmer_recorded", storageFillRecordedAt: "2026-11-01T09:00:00.000Z" } as never,
    ]);
    const forecast = await getSlurryStorageForecastAction("2027-01-30");
    expect(forecast.forecast.projectedAvailableForNewPlanM3).toBe(100);
    expect(vi.mocked(listSlurryForecastAdoptionsForFarm)).not.toHaveBeenCalled();
  });

  it("a later withdrawal clears the adopted intent; a physical reservation for the field replaces it", async () => {
    setup();
    vi.mocked(listSlurryForecastAdoptionsForFarm).mockResolvedValue([
      adoption(),
      { id: "withdraw-1", farmId: farm.id, planningSeason: SEASON, action: "withdraw", intents: [], adoptedAt: "2026-11-03T10:00:00.000Z" },
    ]);
    const withdrawn = await getFarmFertiliserDemandAction(SEASON);
    const calc = withdrawn.fieldCalculations?.[0];
    if (calc?.status !== "OK") throw new Error("expected OK");
    expect(calc.organicCreditBasis).toBeUndefined();

    vi.mocked(listSlurryForecastAdoptionsForFarm).mockResolvedValue([adoption()]);
    mockListSlurryAllocations.mockResolvedValue([
      {
        id: "alloc-phys",
        planRevision: 1,
        fieldId: "field-1",
        housingId: "h1",
        volumeM3: 30,
        applicationMethod: { value: "LESS", status: "farmer_adjusted", source: "Keith" },
        applicationDate: { value: "2027-03-01", status: "farmer_adjusted", source: "Keith" },
      } as never,
    ]);
    const physical = await getFarmFertiliserDemandAction(SEASON);
    const physicalCalc = physical.fieldCalculations?.[0];
    if (physicalCalc?.status !== "OK") throw new Error("expected OK");
    // Never both: the forecast is not counted on top of the reservation.
    expect(physicalCalc.organicCreditBasis?.allocation).toMatchObject({
      volumeM3: 30,
      contributing: [expect.objectContaining({ source: { kind: "PHYSICAL_RESERVATION", allocationId: "alloc-phys", planRevision: 1 } })],
    });
  });

  describe("F010: lifecycle of a forecast superseded by a physical allocation", () => {
    const physical = (status: "planned" | "completed" | "cancelled", extra: object = {}) =>
      ({
        id: "alloc-phys",
        status,
        planRevision: 1,
        fieldId: "field-1",
        housingId: "h1",
        volumeM3: 30,
        applicationMethod: { value: "LESS", status: "farmer_adjusted", source: "Keith" },
        applicationDate: { value: "2027-03-01", status: "farmer_adjusted", source: "Keith" },
        ...extra,
      }) as never;
    const calc = async () => {
      const result = await getFarmFertiliserDemandAction(SEASON);
      const field = result.fieldCalculations?.[0];
      if (field?.status !== "OK") throw new Error("expected OK");
      return field;
    };
    beforeEach(() => {
      setup();
      vi.mocked(listSlurryForecastAdoptionsForFarm).mockResolvedValue([adoption()]);
    });
    afterEach(() => mockListSlurryAllocations.mockResolvedValue([]));

    it("completion keeps the forecast superseded: it is not resurrected and the summary keeps it out of the plan", async () => {
      mockListSlurryAllocations.mockResolvedValue([
        physical("completed", { actualVolumeM3: 30, actualSpreadDate: "2027-03-02", completedAt: "2027-03-02T12:00:00.000Z" }),
      ]);
      // The completed actual is the field's evidence; the replaced forecast
      // (60 m³) must not come back as a planning credit.
      expect((await calc()).organicCreditBasis).toBeUndefined();
      const summary = await getAdoptedSlurryForecastAction(SEASON);
      expect(summary?.intents).toEqual([expect.objectContaining({ fieldId: "field-1", countsInPlan: false })]);
    });

    it("cancellation returns the field to the still-adopted forecast, counted once", async () => {
      mockListSlurryAllocations.mockResolvedValue([physical("cancelled", { cancelledAt: "2027-02-01T12:00:00.000Z" })]);
      const field = await calc();
      expect(field.organicCreditBasis?.allocation).toMatchObject({
        volumeM3: 60,
        contributing: [expect.objectContaining({ source: expect.objectContaining({ kind: "FORECAST_INTENT", adoptionId: "adopt-1" }) })],
      });
      expect(field.organicCreditBasis?.allocation.contributing).toHaveLength(1);
    });

    it("season rollover: a 2027 completion or adoption never leaks into 2028", async () => {
      mockListSlurryAllocations.mockResolvedValue([
        physical("completed", { actualVolumeM3: 30, actualSpreadDate: "2027-03-02" }),
      ]);
      const result = await getFarmFertiliserDemandAction("2028");
      const field = result.fieldCalculations?.[0];
      if (field?.status !== "OK") throw new Error(`expected OK, got ${JSON.stringify(field)}`);
      expect(field.organicCreditBasis).toBeUndefined();
      expect(await getAdoptedSlurryForecastAction("2028")).toBeNull();
    });
  });
});

describe("getFarmLimeRequirementAction", () => {
  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getFarmLimeRequirementAction()).rejects.toThrow(
      /no real farm/i,
    );
  });

  it("aggregates the real farm-wide lime requirement from each field's own saved laboratory rate", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      field({
        id: "field-1",
        areaHa: 4,
        fertility: {
          verifiedTest: {
            sampleDate: "2026-06-01",
            laboratory: "Lab",
            sampleRef: "R1",
            p: 5,
            k: 90,
            pH: 5.8,
            limeRequirement: 2,
          },
        },
      }),
    ]);

    const result = await getFarmLimeRequirementAction();
    expect(result.farmTotalTonnes).toBe(8);
    expect(result.fieldsWithoutLimeEvidence).toBe(0);
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2) — the exact same archived-field scope bug, applied here too.
  it("excludes a real archived field from the farm-wide lime total", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      field({
        id: "field-1",
        areaHa: 4,
        fertility: {
          verifiedTest: {
            sampleDate: "2026-06-01",
            laboratory: "Lab",
            sampleRef: "R1",
            p: 5,
            k: 90,
            pH: 5.8,
            limeRequirement: 2,
          },
        },
      }),
      field({
        id: "field-2",
        areaHa: 100,
        archivedAt: "2026-09-01T00:00:00Z",
        fertility: {
          verifiedTest: {
            sampleDate: "2026-06-01",
            laboratory: "Lab",
            sampleRef: "R2",
            p: 5,
            k: 90,
            pH: 5.8,
            limeRequirement: 5,
          },
        },
      }),
    ]);

    const result = await getFarmLimeRequirementAction();
    expect(result.farmTotalTonnes).toBe(8);
    expect(result.fields.map((f) => f.fieldId)).toEqual(["field-1"]);
  });
});
