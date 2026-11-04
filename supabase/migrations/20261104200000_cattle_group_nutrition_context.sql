-- Goal-first cattle nutrition planning context (additive, forward-only).
--
-- The farmer states the outcome (target weight/date, already stored) plus
-- the minimum feeding context the Teagasc guidance needs: the feeding
-- situation and the silage quality being fed. Silage quality keeps its
-- provenance: a lab analysis (dated, DMD required) is never confused with a
-- farmer-chosen planning scenario (a published DairyBeef 500 DMD row only).
-- Existing concentrate/forage/housing columns are retained untouched as
-- farmer/advisor overrides.

alter table public.cattle_group_production_plans
  add column feeding_situation text null
    check (feeding_situation is null or feeding_situation in ('housed_grass_silage', 'at_grass', 'other_diet')),
  add column silage_quality_basis text null
    check (silage_quality_basis is null or silage_quality_basis in ('lab_analysis', 'planning_scenario')),
  add column silage_dmd_pct numeric null
    check (silage_dmd_pct is null or (silage_dmd_pct > 0 and silage_dmd_pct <= 100)),
  add column silage_cp_pct numeric null
    check (silage_cp_pct is null or (silage_cp_pct > 0 and silage_cp_pct <= 100)),
  add column silage_analysis_date date null;

alter table public.cattle_group_production_plans
  add constraint cattle_group_production_plans_silage_basis_shape check (
    silage_quality_basis is null and silage_dmd_pct is null and silage_cp_pct is null and silage_analysis_date is null
    or silage_quality_basis = 'lab_analysis' and silage_dmd_pct is not null and silage_analysis_date is not null
    or silage_quality_basis = 'planning_scenario' and silage_dmd_pct in (66, 68, 70, 72, 74, 76)
       and silage_cp_pct is null and silage_analysis_date is null
  );

comment on column public.cattle_group_production_plans.silage_quality_basis is
  'lab_analysis = farmer-recorded laboratory silage result (dated); planning_scenario = an explicitly chosen published DMD row, never a measurement.';
