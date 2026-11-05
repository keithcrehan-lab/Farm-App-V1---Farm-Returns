import type { SupportProfile, SupportProfileFactKey } from "../support-profile";
import type {
  SchemeDataAdapterResult,
} from "./data-snapshot";
import type { SchemeDataPoint, SchemeDataOwner } from "./contracts";
import { SCHEME_DATA_KEYS } from "./data-keys";

function legacyFactPoint(
  profile: SupportProfile,
  input: {
    legacyKey: SupportProfileFactKey;
    key: string;
    owner: SchemeDataOwner;
  },
): SchemeDataPoint {
  const fact = profile.farmerFacts[input.legacyKey];
  if (!fact) {
    return {
      key: input.key,
      owner: input.owner,
      state: "MISSING",
      resolutionOwner: "farmer",
    };
  }

  return {
    key: input.key,
    owner: input.owner,
    state: "KNOWN",
    value: fact.value,
    resolutionOwner: "farmer",
    evidence: [
      {
        sourceKind:
          fact.status === "farmer_confirmed"
            ? "farmer_confirmed"
            : "recorded",
        sourceRef: `legacy:support_profile_facts:${input.legacyKey}`,
        receivedAt: fact.updatedAt,
        detail:
          "Compatibility read from the existing Support Profile store. Canonical ownership follows the new Schemes data-key registry.",
      },
    ],
  };
}

/**
 * Compatibility adapter from the existing SupportProfile into the new
 * owner-based Schemes data snapshot. This allows the Schemes architecture
 * to reuse real facts already captured before the new database repository
 * is populated, without creating duplicate farmer questions.
 *
 * It does not move persistence yet; the later Farm Profile work can
 * migrate the legacy farmer facts without changing scheme_rule_inputs.
 */
export function schemeDataAdaptersFromSupportProfile(
  profile: SupportProfile,
): SchemeDataAdapterResult[] {
  const farmProfile: SchemeDataPoint[] = [
    {
      key: SCHEME_DATA_KEYS.FARM_COUNTY.key,
      owner: "farm_profile",
      state: profile.derived.countyLocation ? "KNOWN" : "MISSING",
      value: profile.derived.countyLocation,
      resolutionOwner: "farmer",
      evidence: profile.derived.countyLocation
        ? [{ sourceKind: "recorded", sourceRef: "Farm.location.county" }]
        : undefined,
    },
    {
      key: SCHEME_DATA_KEYS.FARM_PRIMARY_ENTERPRISES.key,
      owner: "farm_profile",
      state:
        profile.derived.primaryEnterprises.length > 0 ? "KNOWN" : "MISSING",
      value: profile.derived.primaryEnterprises,
      resolutionOwner: "farmer",
      evidence:
        profile.derived.primaryEnterprises.length > 0
          ? [{ sourceKind: "recorded", sourceRef: "Farm.primaryEnterprises" }]
          : undefined,
    },
    legacyFactPoint(profile, {
      legacyKey: "date_of_birth",
      key: SCHEME_DATA_KEYS.FARMER_DATE_OF_BIRTH.key,
      owner: "farm_profile",
    }),
    legacyFactPoint(profile, {
      legacyKey: "head_of_holding_since",
      key: SCHEME_DATA_KEYS.HOLDING_HEAD_SINCE.key,
      owner: "farm_profile",
    }),
    legacyFactPoint(profile, {
      legacyKey: "agricultural_qualification_level",
      key: SCHEME_DATA_KEYS.AGRICULTURAL_QUALIFICATION_LEVEL.key,
      owner: "farm_profile",
    }),
    legacyFactPoint(profile, {
      legacyKey: "holds_annex_j_qualification",
      key: SCHEME_DATA_KEYS.ANNEX_J_QUALIFICATION.key,
      owner: "farm_profile",
    }),
    legacyFactPoint(profile, {
      legacyKey: "declared_area_ha",
      key: SCHEME_DATA_KEYS.HOLDING_DECLARED_AREA_HA.key,
      owner: "farm_profile",
    }),
  ];

  const fields: SchemeDataPoint[] = [
    {
      key: SCHEME_DATA_KEYS.FIELD_TOTAL_MAPPED_AREA_HA.key,
      owner: "fields",
      state: "KNOWN",
      value: profile.derived.totalMappedAreaHa,
      resolutionOwner: "farmer",
      evidence: [
        {
          sourceKind: "derived",
          sourceRef: "SupportProfile.derived.totalMappedAreaHa",
          detail:
            "Physical mapped area only; it is not treated as DAFM-declared or eligible area.",
        },
      ],
    },
    {
      key: SCHEME_DATA_KEYS.FIELD_FORAGE_AREA_HA.key,
      owner: "fields",
      state:
        profile.derived.forageAreaHa === null ? "MISSING" : "KNOWN",
      value: profile.derived.forageAreaHa ?? undefined,
      resolutionOwner: "farmer",
      evidence:
        profile.derived.forageAreaHa === null
          ? [
              {
                sourceKind: "derived",
                detail: `${profile.derived.fieldsWithUnresolvedUse} field use record(s) are unresolved.`,
              },
            ]
          : [
              {
                sourceKind: "derived",
                sourceRef: "SupportProfile.derived.forageAreaHa",
              },
            ],
    },
  ];

  const livestock: SchemeDataPoint[] = [
    {
      key: SCHEME_DATA_KEYS.LIVESTOCK_TOTAL_LU.key,
      owner: "livestock",
      state: "KNOWN",
      value: profile.derived.totalLivestockUnits,
      resolutionOwner: "farmer",
      evidence: [
        {
          sourceKind: "derived",
          sourceRef: "nutrients.totalLivestockUnits",
        },
      ],
    },
  ];

  const schemes: SchemeDataPoint[] = [
    legacyFactPoint(profile, {
      legacyKey: "biss_participant_2026",
      key: SCHEME_DATA_KEYS.BISS_PARTICIPATION.key,
      owner: "schemes",
    }),
  ];

  return [
    { owner: "farm_profile", points: farmProfile },
    { owner: "fields", points: fields },
    { owner: "livestock", points: livestock },
    { owner: "schemes", points: schemes },
  ];
}
