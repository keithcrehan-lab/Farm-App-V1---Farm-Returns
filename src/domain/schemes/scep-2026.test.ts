import { describe, expect, it } from "vitest";
import type { SupportProfile } from "../support-profile";
import type { SchemeFactAssertion } from "./facts";
import type {
  StoredSchemeDefinition,
  StoredSchemeRule,
  StoredSchemeRuleInput,
} from "./repository";
import {
  buildScep2026View,
  SCEP_2026_RULE_KEYS,
} from "./scep-2026";
import { SCHEME_DATA_KEYS } from "./data-keys";

const source = {
  id: "source-dafm",
  schemeVersionId: "version-scep",
  sourceKey: "dafm-service",
  authorityTier: "dafm_official",
  publisher: "DAFM",
  title: "SCEP",
  url: "https://example.invalid/scep",
  publicationDate: null,
  retrievedAt: "2026-11-05T00:00:00.000Z",
  lastVerifiedAt: "2026-11-05T00:00:00.000Z",
  contentFingerprintSha256: "a".repeat(64),
  archivedStoragePath: "docs/evidence/schemes/scep.md",
};

function input(
  ruleId: string,
  dataKey: string,
  label: string,
  priority: number,
): StoredSchemeRuleInput {
  return {
    ruleId,
    schemeVersionId: "version-scep",
    dataKey,
    label,
    owner: "schemes",
    subjectScope: "farm",
    required: true,
    resolutionOwner: "farmer",
    priority,
    routeKey: null,
  };
}

function rule(
  id: string,
  ruleKey: string,
  operator: string,
  inputs: StoredSchemeRuleInput[],
  parameters: Record<string, unknown> = {},
  consequence: Record<string, unknown> = {},
): StoredSchemeRule {
  return {
    id,
    schemeVersionId: "version-scep",
    sourceId: source.id,
    ruleKey,
    ruleType:
      ruleKey === SCEP_2026_RULE_KEYS.PARTICIPATION
        ? "relevance"
        : ruleKey === SCEP_2026_RULE_KEYS.PAYMENT_AREA
          ? "payment"
          : ruleKey === SCEP_2026_RULE_KEYS.ACTION5_REVIEW
            ? "evidence_obligation"
            : "action_obligation",
    description: ruleKey,
    operator,
    parameters,
    consequence,
    hardGate: false,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: "2026-12-31T23:59:59.999Z",
    inputs,
  };
}

function definition(): StoredSchemeDefinition {
  const p = "r-participation";
  const biss = "r-biss";
  const sblas = "r-sblas";
  const payment = "r-payment";
  const calving = "r-calving";
  const sire = "r-sire";
  const genotype = "r-genotype";
  const weighing = "r-weighing";
  return {
    version: {
      id: "version-scep",
      schemeKey: "scep",
      displayName: "Suckler Carbon Efficiency Programme (SCEP) — 2026",
      category: "livestock_support",
      authority: "DAFM",
      schemeYear: 2026,
      programmeGeneration: "CAP 2023-2027",
      rulesVersion: "scep-2026-v1",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      applicationOpen: null,
      applicationClose: null,
      lateApplicationClose: null,
      publicationState: "verified",
      v1Enabled: true,
      enterpriseRelevance: ["suckler_beef"],
      supportType: "area_based_suckler_support",
      recurrenceType: "annual_existing_participant",
      requiresAdviser: false,
      verifiedAt: "2026-11-05T00:00:00.000Z",
    },
    sources: [source],
    rules: [
      rule(
        p,
        SCEP_2026_RULE_KEYS.PARTICIPATION,
        "equals",
        [
          input(
            p,
            SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key,
            "SCEP participation",
            1,
          ),
        ],
        { expected: true },
      ),
      rule(
        biss,
        SCEP_2026_RULE_KEYS.BISS,
        "equals",
        [
          input(
            biss,
            SCHEME_DATA_KEYS.BISS_PARTICIPATION.key,
            "2026 BISS participation",
            2,
          ),
        ],
        { expected: true },
      ),
      rule(
        sblas,
        SCEP_2026_RULE_KEYS.SBLAS,
        "equals",
        [
          input(
            sblas,
            SCHEME_DATA_KEYS.SCEP_SBLAS_CURRENT_2026.key,
            "Current SBLAS participation",
            3,
          ),
        ],
        { expected: true },
      ),
      rule(
        payment,
        SCEP_2026_RULE_KEYS.PAYMENT_AREA,
        "exists",
        [
          input(
            payment,
            SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key,
            "Eligible forage area",
            5,
          ),
        ],
        {
          reference_divisor: 1.5,
          first_band_ha: 15,
          first_band_eur_per_ha: 225,
          remaining_eur_per_ha: 180,
          minimum_area_fraction_for_stated_payment_rule: 0.8,
        },
      ),
      rule(
        calving,
        SCEP_2026_RULE_KEYS.CALVING,
        "scep_floor_ratio_of_reference",
        [
          input(
            calving,
            SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key,
            "Eligible calves born",
            4,
          ),
          input(
            calving,
            SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key,
            "Yearly reference",
            5,
          ),
        ],
        { ratio: 0.5 },
        { scheme_year_calving_end: "2026-06-30" },
      ),
      rule(
        sire,
        SCEP_2026_RULE_KEYS.HIGH_MERIT_SIRES,
        "scep_high_merit_year4",
        [
          input(
            sire,
            SCHEME_DATA_KEYS.SCEP_HIGH_MERIT_SIRED_CALVES_2026.key,
            "High-merit sired calves",
            6,
          ),
          input(
            sire,
            SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key,
            "Eligible calves born",
            7,
          ),
          input(
            sire,
            SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key,
            "Yearly reference",
            8,
          ),
        ],
        { ratio: 0.85 },
        { scheme_year_calving_end: "2026-06-30" },
      ),
      rule(
        genotype,
        SCEP_2026_RULE_KEYS.GENOTYPING,
        "scep_floor_ratio_of_reference",
        [
          input(
            genotype,
            SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key,
            "Genotypes completed",
            9,
          ),
          input(
            genotype,
            SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key,
            "Yearly reference",
            10,
          ),
        ],
        { ratio: 0.7 },
        { deadline: "2026-11-30T23:59:59Z" },
      ),
      rule(
        weighing,
        SCEP_2026_RULE_KEYS.WEIGHING,
        "scep_weighing_year4",
        [
          input(
            weighing,
            SCHEME_DATA_KEYS.SCEP_WEIGHED_PAIRS_2026.key,
            "Cow-calf pairs weighed",
            11,
          ),
          input(
            weighing,
            SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key,
            "Eligible calves born",
            12,
          ),
          input(
            weighing,
            SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key,
            "Yearly reference",
            13,
          ),
        ],
        { ratio: 0.8 },
        { deadline: "2026-11-01T17:30:00Z" },
      ),
    ],
  };
}

function profile(
  biss: boolean | undefined = true,
): SupportProfile {
  return {
    farmId: "farm-1",
    version: "support-profile-v1",
    derived: {
      countyLocation: "Galway",
      primaryEnterprises: ["suckler_beef"],
      totalMappedAreaHa: 20,
      forageAreaHa: 20,
      fieldsWithUnresolvedUse: 0,
      totalLivestockUnits: 18,
    },
    knownFacts: [],
    farmerFacts:
      biss === undefined
        ? {}
        : {
            biss_participant_2026: {
              key: "biss_participant_2026",
              value: biss,
              status: "farmer_confirmed",
              source: "farmer_entered",
              updatedAt: "2026-11-05T00:00:00.000Z",
            },
          },
    gaps: [],
  };
}

let sequence = 0;
function assertion(
  key: string,
  value: boolean | number,
): SchemeFactAssertion {
  sequence += 1;
  return {
    id: "fact-" + String(sequence).padStart(3, "0"),
    farmId: "farm-1",
    schemeVersionId: "version-scep",
    dataKey: key,
    value,
    assertionStatus: "farmer_confirmed",
    sourceKind: "farmer_entered",
    sourceRef: "test",
    assertedBy: "user-1",
    observedAt: null,
    receivedAt: "2026-11-05T00:00:" + String(sequence).padStart(2, "0") + ".000Z",
    supersedesId: null,
  };
}

function completeAssertions(overrides: Partial<Record<string, boolean | number>> = {}) {
  const values: Record<string, boolean | number> = {
    [SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key]: true,
    [SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key]: 30,
    [SCHEME_DATA_KEYS.SCEP_SBLAS_CURRENT_2026.key]: true,
    [SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key]: 20,
    [SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key]: 22,
    [SCHEME_DATA_KEYS.SCEP_HIGH_MERIT_SIRED_CALVES_2026.key]: 19,
    [SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key]: 21,
    [SCHEME_DATA_KEYS.SCEP_WEIGHED_PAIRS_2026.key]: 17,
    ...overrides,
  };
  return Object.entries(values).map(([key, value]) => assertion(key, value));
}

describe("SCEP 2026 source-pinned view", () => {
  it("asks only whether the farm participates before exposing programme-specific requirements", () => {
    const view = buildScep2026View({
      definition: definition(),
      profile: profile(),
      assertions: [],
      nowIso: "2026-11-05T12:00:00.000Z",
    });

    expect(view.state).toBe("PARTICIPATION_UNKNOWN");
    expect(view.readiness.totalCount).toBe(1);
    expect(view.readiness.needsYou.map((item) => item.dataKey)).toEqual([
      SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key,
    ]);
    expect(view.readiness.needsYou[0]?.route?.href).toBe(
      "/schemes?scheme=scep&version=2026#scep-fact-schemes-scep-2026-participation",
    );
    expect(view.actions).toEqual([]);
  });

  it("stops asking for SCEP figures when the farmer records that they are not participating", () => {
    const view = buildScep2026View({
      definition: definition(),
      profile: profile(),
      assertions: [
        assertion(SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key, false),
      ],
      nowIso: "2026-11-05T12:00:00.000Z",
    });

    expect(view.state).toBe("NOT_PARTICIPATING");
    expect(view.readiness.totalCount).toBe(1);
    expect(view.actions).toEqual([]);
  });

  it("uses the published Year 4 integer target conventions", () => {
    const view = buildScep2026View({
      definition: definition(),
      profile: profile(),
      assertions: completeAssertions(),
      nowIso: "2026-11-05T12:00:00.000Z",
    });

    expect(
      view.actions.map((action) => [action.key, action.target]),
    ).toEqual([
      ["calving", 15],
      ["eligible_sires", 19],
      ["genotyping", 21],
      ["weighing", 17],
    ]);
    expect(
      view.actions.map((action) => [
        action.key,
        action.deadline,
        action.deadlineState,
      ]),
    ).toEqual([
      ["calving", "2026-06-30", "past"],
      ["eligible_sires", "2026-06-30", "past"],
      ["genotyping", "2026-11-30", "upcoming"],
      ["weighing", "2026-11-01", "past"],
    ]);
    expect(view.state).toBe("TRACKED_ACTIONS_ON_TRACK");
  });

  it("flags a tracked requirement below target without calling the farm ineligible", () => {
    const view = buildScep2026View({
      definition: definition(),
      profile: profile(),
      assertions: completeAssertions({
        [SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key]: 20,
      }),
      nowIso: "2026-11-05T12:00:00.000Z",
    });

    expect(view.state).toBe("NEEDS_ATTENTION");
    expect(
      view.actions.find((action) => action.key === "genotyping")?.state,
    ).toBe("FAIL");
  });

  it("calculates only the maximum potential gross area-based payment", () => {
    const view = buildScep2026View({
      definition: definition(),
      profile: profile(),
      assertions: completeAssertions({
        [SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key]: 30,
        [SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key]: 20,
      }),
      nowIso: "2026-11-05T12:00:00.000Z",
    });

    // Reference 30 => MPA 20ha: 15 × €225 + 5 × €180.
    expect(view.payment.state).toBe("CALCULATED");
    expect(view.payment.amount).toBe(4275);
    expect(view.payment.detail).toMatch(/maximum potential gross/i);
  });

  it("uses the recorded eligible forage area when it is 80-100% of MPA", () => {
    const view = buildScep2026View({
      definition: definition(),
      profile: profile(),
      assertions: completeAssertions({
        [SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key]: 30,
        [SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key]: 18,
      }),
      nowIso: "2026-11-05T12:00:00.000Z",
    });

    expect(view.payment.state).toBe("CALCULATED");
    expect(view.payment.amount).toBe(3915);
  });

  it("fails closed on payment when eligible forage is below the sourced 80% boundary", () => {
    const view = buildScep2026View({
      definition: definition(),
      profile: profile(),
      assertions: completeAssertions({
        [SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key]: 30,
        [SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key]: 15,
      }),
      nowIso: "2026-11-05T12:00:00.000Z",
    });

    expect(view.payment.state).toBe("REVIEW_REQUIRED");
    expect(view.payment.amount).toBeNull();
  });

  it("reuses the existing 2026 BISS fact instead of asking a duplicate SCEP question", () => {
    const view = buildScep2026View({
      definition: definition(),
      profile: profile(true),
      assertions: completeAssertions(),
      nowIso: "2026-11-05T12:00:00.000Z",
    });

    expect(
      view.evaluations.find(
        (evaluation) => evaluation.ruleKey === SCEP_2026_RULE_KEYS.BISS,
      )?.state,
    ).toBe("PASS");
    expect(
      view.readiness.needsYou.some(
        (item) => item.dataKey === SCHEME_DATA_KEYS.BISS_PARTICIPATION.key,
      ),
    ).toBe(false);
  });
});
