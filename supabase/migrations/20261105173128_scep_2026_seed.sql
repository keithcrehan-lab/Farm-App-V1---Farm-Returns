-- Source-pinned SCEP 2026 seed.
--
-- This migration loads the first live scheme into the Schemes repository.
-- It deliberately covers existing SCEP participants in Scheme Year 4
-- (2026); it does not imply that new entry is open.
--
-- Every encoded rule is backed by one of the archived/fingerprinted local
-- evidence extracts in docs/evidence/schemes/. No penalty rule, Action 2
-- 2026 checkpoint or below-80%-forage payment outcome is invented.

insert into public.scheme_catalogue (
  scheme_key,
  display_name,
  category,
  authority
) values (
  'scep',
  'Suckler Carbon Efficiency Programme (SCEP)',
  'livestock_support',
  'DAFM'
);

insert into public.scheme_versions (
  scheme_key,
  scheme_year,
  programme_generation,
  rules_version,
  effective_from,
  effective_to,
  application_open,
  application_close,
  late_application_close,
  publication_state,
  v1_enabled,
  enterprise_relevance,
  support_type,
  recurrence_type,
  requires_adviser,
  verified_at
) values (
  'scep',
  2026,
  'CAP 2023-2027',
  'scep-2026-v1',
  '2026-01-01',
  '2026-12-31',
  null,
  null,
  null,
  'verified',
  true,
  array['suckler_beef']::text[],
  'area_based_suckler_support',
  'annual_existing_participant',
  false,
  '2026-11-05T17:20:00Z'
);

insert into public.scheme_sources (
  scheme_version_id,
  source_key,
  authority_tier,
  publisher,
  title,
  url,
  publication_date,
  retrieved_at,
  last_verified_at,
  content_fingerprint_sha256,
  archived_storage_path
)
select
  v.id,
  source_key,
  authority_tier,
  publisher,
  title,
  url,
  publication_date,
  retrieved_at,
  last_verified_at,
  content_fingerprint_sha256,
  archived_storage_path
from public.scheme_versions v
cross join (
  values
    (
      'dafm-service',
      'dafm_official',
      'Department of Agriculture, Food and the Marine',
      'Suckler Carbon Efficiency Programme (SCEP)',
      'https://www.gov.ie/en/department-of-agriculture-food-and-the-marine/services/suckler-carbon-efficiency-programme-scep/',
      null::date,
      '2026-11-05T00:00:00Z'::timestamptz,
      '2026-11-05T00:00:00Z'::timestamptz,
      'bd8b2d4aac2a8cfdc110ac945996217b87bfde334708b2b02409d9b5419eb7f9',
      'docs/evidence/schemes/scep-2026-dafm-service.md'
    ),
    (
      'icbf-actions',
      'authoritative_secondary',
      'Irish Cattle Breeding Federation',
      'Suckler Carbon Efficiency Programme (SCEP)',
      'https://www.icbf.com/suckler-carbon-efficiency-programme-scep/',
      null::date,
      '2026-11-05T00:00:00Z'::timestamptz,
      '2026-11-05T00:00:00Z'::timestamptz,
      'f6d74736a6f1183b6aa5731048469ccd530a6ffaf07a61919163f758595d8f80',
      'docs/evidence/schemes/scep-2026-icbf-actions.md'
    ),
    (
      'year4-current',
      'authoritative_secondary',
      'Irish Cattle Breeding Federation / Department of Agriculture, Food and the Marine',
      'SCEP Scheme Year 4 (2026) current requirements and deadlines',
      'https://www.icbf.com/scep-your-essential-guide-to-genotyping-requirements-and-deadlines/',
      null::date,
      '2026-11-05T00:00:00Z'::timestamptz,
      '2026-11-05T00:00:00Z'::timestamptz,
      '5735f1fd8e577f3affe9ebcd904c987dbaeb1f7d88ec026f8068b6993071f5bd',
      'docs/evidence/schemes/scep-2026-year4-current.md'
    ),
    (
      'icbf-weighing-2026',
      'authoritative_secondary',
      'Irish Cattle Breeding Federation',
      'SCEP 2026 Weighing Requirements',
      'https://www.icbf.com/scep-2026-weighing-requirements/',
      null::date,
      '2026-11-05T00:00:00Z'::timestamptz,
      '2026-11-05T00:00:00Z'::timestamptz,
      'c364113cc9eae89026e572335bbdc8ad8e37945a483cc1ea13b0aa75ea4f9ebe',
      'docs/evidence/schemes/scep-2026-icbf-weighing.md'
    )
) as s(
  source_key,
  authority_tier,
  publisher,
  title,
  url,
  publication_date,
  retrieved_at,
  last_verified_at,
  content_fingerprint_sha256,
  archived_storage_path
)
where v.scheme_key = 'scep'
  and v.scheme_year = 2026
  and v.rules_version = 'scep-2026-v1';

-- ---------------------------------------------------------------------
-- Source-pinned rule set
-- ---------------------------------------------------------------------

insert into public.scheme_rules (
  scheme_version_id,
  source_id,
  rule_key,
  rule_type,
  description,
  operator,
  parameters,
  consequence,
  hard_gate,
  effective_from,
  effective_to
)
select
  v.id,
  src.id,
  r.rule_key,
  r.rule_type,
  r.description,
  r.operator,
  r.parameters,
  r.consequence,
  r.hard_gate,
  r.effective_from,
  r.effective_to
from public.scheme_versions v
join (
  values
    (
      'scep-2026-participation',
      'relevance',
      'This farm is an existing participant in the 2023-2027 Suckler Carbon Efficiency Programme.',
      'equals',
      '{"expected":true}'::jsonb,
      '{"presentation":"existing_participant"}'::jsonb,
      false,
      '2026-01-01T00:00:00Z'::timestamptz,
      '2026-12-31T23:59:59Z'::timestamptz,
      'dafm-service'
    ),
    (
      'scep-2026-biss',
      'action_obligation',
      'An SCEP participant must submit an annual BISS application declaring all land parcels.',
      'equals',
      '{"expected":true}'::jsonb,
      '{"presentation":"ongoing_condition"}'::jsonb,
      false,
      '2026-01-01T00:00:00Z'::timestamptz,
      '2026-12-31T23:59:59Z'::timestamptz,
      'dafm-service'
    ),
    (
      'scep-2026-sblas',
      'action_obligation',
      'An SCEP participant must remain a member of the Sustainable Beef and Lamb Assurance Scheme.',
      'equals',
      '{"expected":true}'::jsonb,
      '{"presentation":"ongoing_condition"}'::jsonb,
      false,
      '2026-01-01T00:00:00Z'::timestamptz,
      '2026-12-31T23:59:59Z'::timestamptz,
      'dafm-service'
    ),
    (
      'scep-2026-payment-area',
      'payment',
      'Maximum potential SCEP payment uses the 2026 yearly reference number and DAFM-determined eligible forage area.',
      'exists',
      '{"reference_divisor":1.5,"first_band_ha":15,"first_band_eur_per_ha":225,"remaining_eur_per_ha":180,"minimum_area_fraction_for_stated_payment_rule":0.8}'::jsonb,
      '{"presentation":"maximum_potential_gross_payment"}'::jsonb,
      false,
      '2026-01-01T00:00:00Z'::timestamptz,
      '2026-12-31T23:59:59Z'::timestamptz,
      'dafm-service'
    ),
    (
      'scep-2026-calving-50pct',
      'action_obligation',
      'At least 50% of the 2026 yearly reference number must be calved as eligible beef-breed animals during Scheme Year 4.',
      'scep_floor_ratio_of_reference',
      '{"ratio":0.5}'::jsonb,
      '{"scheme_year_calving_start":"2025-07-01","scheme_year_calving_end":"2026-06-30"}'::jsonb,
      false,
      '2026-01-01T00:00:00Z'::timestamptz,
      '2026-12-31T23:59:59Z'::timestamptz,
      'year4-current'
    ),
    (
      'scep-2026-action1-high-merit-sires',
      'action_obligation',
      'In Scheme Year 4, at least 85% of eligible calves born up to the yearly reference number must be sired by an eligible 4- or 5-star source.',
      'scep_high_merit_year4',
      '{"ratio":0.85}'::jsonb,
      '{"scheme_year_calving_end":"2026-06-30"}'::jsonb,
      false,
      '2026-01-01T00:00:00Z'::timestamptz,
      '2026-12-31T23:59:59Z'::timestamptz,
      'icbf-actions'
    ),
    (
      'scep-2026-action3-genotyping',
      'action_obligation',
      'Scheme Year 4 requires genotype samples equivalent to at least 70% of the yearly reference number, rounded down.',
      'scep_floor_ratio_of_reference',
      '{"ratio":0.7}'::jsonb,
      '{"deadline":"2026-11-30T23:59:59Z"}'::jsonb,
      false,
      '2026-01-01T00:00:00Z'::timestamptz,
      '2026-12-31T23:59:59Z'::timestamptz,
      'year4-current'
    ),
    (
      'scep-2026-action4-weighing',
      'action_obligation',
      'At least 80% of eligible calves born, capped at the yearly reference number, must be weighed with their dams and submitted to ICBF.',
      'scep_weighing_year4',
      '{"ratio":0.8}'::jsonb,
      '{"deadline":"2026-11-01T17:30:00Z","calf_minimum_age_days":50,"must_be_unweaned":true,"dam_same_day":true}'::jsonb,
      false,
      '2026-01-01T00:00:00Z'::timestamptz,
      '2026-12-31T23:59:59Z'::timestamptz,
      'icbf-weighing-2026'
    ),
    (
      'scep-2026-action5-review',
      'evidence_obligation',
      'Calving details and the annual ICBF surveys are programme actions that must be kept under review.',
      'equals',
      '{"expected":true}'::jsonb,
      '{"presentation":"review_only","full_compliance_not_inferred":true}'::jsonb,
      false,
      '2026-01-01T00:00:00Z'::timestamptz,
      '2026-12-31T23:59:59Z'::timestamptz,
      'icbf-actions'
    )
) as r(
  rule_key,
  rule_type,
  description,
  operator,
  parameters,
  consequence,
  hard_gate,
  effective_from,
  effective_to,
  source_key
) on true
join public.scheme_sources src
  on src.scheme_version_id = v.id
 and src.source_key = r.source_key
where v.scheme_key = 'scep'
  and v.scheme_year = 2026
  and v.rules_version = 'scep-2026-v1';

-- ---------------------------------------------------------------------
-- Canonical data dependencies.
-- Priorities affect checklist order only, never scheme-rule precedence.
-- ---------------------------------------------------------------------

insert into public.scheme_rule_inputs (
  rule_id,
  scheme_version_id,
  data_key,
  label,
  owner,
  subject_scope,
  required,
  resolution_owner,
  priority,
  route_key
)
select
  rule.id,
  rule.scheme_version_id,
  i.data_key,
  i.label,
  i.owner,
  i.subject_scope,
  true,
  i.resolution_owner,
  i.priority,
  i.route_key
from public.scheme_versions v
join public.scheme_rules rule on rule.scheme_version_id = v.id
join (
  values
    ('scep-2026-participation', 'schemes.scep.2026.participation', 'Are you participating in SCEP in 2026?', 'schemes', 'farm', 'farmer', 1, 'schemes.scep.2026'),
    ('scep-2026-biss', 'schemes.biss.2026.participation', '2026 BISS participation', 'schemes', 'farm', 'farmer', 2, 'schemes.biss.2026'),
    ('scep-2026-sblas', 'schemes.scep.2026.sblas_current', 'Current SBLAS participation', 'schemes', 'farm', 'farmer', 3, 'schemes.scep.2026'),
    ('scep-2026-payment-area', 'schemes.scep.2026.determined_eligible_forage_area_ha', '2026 DAFM-determined eligible forage area', 'schemes', 'farm', 'farmer', 5, 'schemes.scep.2026'),
    ('scep-2026-calving-50pct', 'schemes.scep.2026.eligible_beef_calves_born', 'Eligible beef-breed calves born in Scheme Year 4', 'schemes', 'farm', 'farmer', 6, 'schemes.scep.2026'),
    ('scep-2026-calving-50pct', 'schemes.scep.2026.yearly_reference_number', '2026 SCEP yearly reference number', 'schemes', 'farm', 'farmer', 7, 'schemes.scep.2026'),
    ('scep-2026-action1-high-merit-sires', 'schemes.scep.2026.high_merit_sired_calves', 'Eligible calves sired by a SCEP-eligible 4- or 5-star source', 'schemes', 'farm', 'farmer', 8, 'schemes.scep.2026'),
    ('scep-2026-action1-high-merit-sires', 'schemes.scep.2026.eligible_beef_calves_born', 'Eligible beef-breed calves born in Scheme Year 4', 'schemes', 'farm', 'farmer', 9, 'schemes.scep.2026'),
    ('scep-2026-action1-high-merit-sires', 'schemes.scep.2026.yearly_reference_number', '2026 SCEP yearly reference number', 'schemes', 'farm', 'farmer', 10, 'schemes.scep.2026'),
    ('scep-2026-action3-genotyping', 'schemes.scep.2026.genotypes_completed', '2026 SCEP genotypes completed', 'schemes', 'farm', 'farmer', 11, 'schemes.scep.2026'),
    ('scep-2026-action3-genotyping', 'schemes.scep.2026.yearly_reference_number', '2026 SCEP yearly reference number', 'schemes', 'farm', 'farmer', 12, 'schemes.scep.2026'),
    ('scep-2026-action4-weighing', 'schemes.scep.2026.weighed_cow_calf_pairs', '2026 SCEP cow-calf pairs weighed and submitted', 'schemes', 'farm', 'farmer', 13, 'schemes.scep.2026'),
    ('scep-2026-action4-weighing', 'schemes.scep.2026.eligible_beef_calves_born', 'Eligible beef-breed calves born in Scheme Year 4', 'schemes', 'farm', 'farmer', 14, 'schemes.scep.2026'),
    ('scep-2026-action4-weighing', 'schemes.scep.2026.yearly_reference_number', '2026 SCEP yearly reference number', 'schemes', 'farm', 'farmer', 15, 'schemes.scep.2026'),
    ('scep-2026-action5-review', 'schemes.scep.2026.surveys_submitted', 'Annual SCEP calving details and ICBF surveys submitted', 'schemes', 'farm', 'farmer', 16, 'schemes.scep.2026')
) as i(
  rule_key,
  data_key,
  label,
  owner,
  subject_scope,
  resolution_owner,
  priority,
  route_key
) on i.rule_key = rule.rule_key
where v.scheme_key = 'scep'
  and v.scheme_year = 2026
  and v.rules_version = 'scep-2026-v1';
