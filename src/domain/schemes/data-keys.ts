import type { SchemeDataOwner } from "./contracts";

export interface SchemeDataKeyDefinition {
  key: string;
  owner: SchemeDataOwner;
  label: string;
}

/**
 * Stable cross-module vocabulary consumed by stored scheme_rule_inputs.
 * Adding a database requirement with a key that is not registered here is
 * a content/import validation error, not permission to ask the farmer a
 * free-form duplicate question.
 */
export const SCHEME_DATA_KEYS = {
  FARM_COUNTY: {
    key: "farm.county",
    owner: "farm_profile",
    label: "Farm county",
  },
  FARM_PRIMARY_ENTERPRISES: {
    key: "farm.primary_enterprises",
    owner: "farm_profile",
    label: "Farm enterprise",
  },
  FARMER_DATE_OF_BIRTH: {
    key: "farm_profile.farmer.date_of_birth",
    owner: "farm_profile",
    label: "Date of birth",
  },
  HOLDING_HEAD_SINCE: {
    key: "farm_profile.holding.head_since",
    owner: "farm_profile",
    label: "Date you became head of holding",
  },
  AGRICULTURAL_QUALIFICATION_LEVEL: {
    key: "farm_profile.farmer.agricultural_qualification_level",
    owner: "farm_profile",
    label: "Agricultural qualification",
  },
  ANNEX_J_QUALIFICATION: {
    key: "farm_profile.farmer.annex_j_qualification",
    owner: "farm_profile",
    label: "Annex J-recognised qualification",
  },
  HOLDING_DECLARED_AREA_HA: {
    key: "farm_profile.holding.declared_area_ha",
    owner: "farm_profile",
    label: "DAFM-declared area",
  },
  FIELD_TOTAL_MAPPED_AREA_HA: {
    key: "fields.total_mapped_area_ha",
    owner: "fields",
    label: "Mapped farm area",
  },
  FIELD_FORAGE_AREA_HA: {
    key: "fields.forage_area_ha",
    owner: "fields",
    label: "Forage area",
  },
  LIVESTOCK_TOTAL_LU: {
    key: "livestock.total_livestock_units",
    owner: "livestock",
    label: "Total livestock units",
  },
  BISS_PARTICIPATION: {
    key: "schemes.biss.2026.participation",
    owner: "schemes",
    label: "2026 BISS participation",
  },
  SCEP_PARTICIPATION_2026: {
    key: "schemes.scep.2026.participation",
    owner: "schemes",
    label: "SCEP participation",
  },
  SCEP_YEARLY_REFERENCE_2026: {
    key: "schemes.scep.2026.yearly_reference_number",
    owner: "schemes",
    label: "2026 SCEP yearly reference number",
  },
  SCEP_SBLAS_CURRENT_2026: {
    key: "schemes.scep.2026.sblas_current",
    owner: "schemes",
    label: "Current SBLAS participation",
  },
  SCEP_ELIGIBLE_FORAGE_AREA_2026: {
    key: "schemes.scep.2026.determined_eligible_forage_area_ha",
    owner: "schemes",
    label: "2026 DAFM-determined eligible forage area",
  },
  SCEP_ELIGIBLE_CALVES_2026: {
    key: "schemes.scep.2026.eligible_beef_calves_born",
    owner: "schemes",
    label: "Eligible beef-breed calves born in SCEP Scheme Year 4",
  },
  SCEP_HIGH_MERIT_SIRED_CALVES_2026: {
    key: "schemes.scep.2026.high_merit_sired_calves",
    owner: "schemes",
    label: "Eligible calves sired by a SCEP-eligible 4- or 5-star source",
  },
  SCEP_GENOTYPES_COMPLETED_2026: {
    key: "schemes.scep.2026.genotypes_completed",
    owner: "schemes",
    label: "2026 SCEP genotypes completed",
  },
  SCEP_WEIGHED_PAIRS_2026: {
    key: "schemes.scep.2026.weighed_cow_calf_pairs",
    owner: "schemes",
    label: "2026 SCEP cow-calf pairs weighed and submitted",
  },
  SCEP_SURVEYS_SUBMITTED_2026: {
    key: "schemes.scep.2026.surveys_submitted",
    owner: "schemes",
    label: "Annual SCEP calving details and surveys submitted",
  },
  CATTLE_ANIMAL_DATE_OF_BIRTH: {
    key: "cattle.animal.date_of_birth",
    owner: "cattle",
    label: "Animal date of birth",
  },
  CATTLE_ANIMAL_WEIGHT: {
    key: "cattle.animal.weight",
    owner: "cattle",
    label: "Current animal weight",
  },
  CATTLE_ANIMAL_WEANING_DATE: {
    key: "cattle.animal.weaning_date",
    owner: "cattle",
    label: "Weaning date",
  },
  CATTLE_ANIMAL_VACCINATION_EVIDENCE: {
    key: "cattle.animal.vaccination_evidence",
    owner: "cattle",
    label: "Vaccination evidence",
  },
  SHEEP_ELIGIBLE_EWE_COUNT: {
    key: "sheep.eligible_ewe_count",
    owner: "sheep",
    label: "Eligible breeding ewe count",
  },
} as const satisfies Record<string, SchemeDataKeyDefinition>;

export const SCHEME_DATA_KEY_BY_KEY = new Map<string, SchemeDataKeyDefinition>(
  Object.values(SCHEME_DATA_KEYS).map((definition) => [
    definition.key,
    definition,
  ]),
);

export function registeredSchemeDataKey(
  key: string,
): SchemeDataKeyDefinition | null {
  return SCHEME_DATA_KEY_BY_KEY.get(key) ?? null;
}
