# Schemes foundation — development validation

Validated: 2026-11-05
Project: Farm Return V1 Dev (`whevugeisqlpfnrugfsd`)
Migration: `20261105165506_schemes_foundation`

## Result

The architecture migration was applied to the development project only. No scheme catalogue or rule content was seeded.

Live checks after migration:

- 11/11 expected Schemes tables exist.
- All 11 tables have Row Level Security enabled.
- 14 RLS policies exist across the 11 tables.
- `anon` has no table privileges on any Schemes foundation table.
- The five master-repository tables are SELECT-only for `authenticated`.
- Farm-owned workflow tables expose only the grants declared by the migration.
- 5/5 expected integrity/update triggers exist.
- `scheme_rules` has both its scheme-version and same-version source foreign-key constraints.
- `scheme_rule_inputs` has its same-version rule foreign-key constraint.
- `scheme_catalogue`, `scheme_versions` and `scheme_rules` contain zero rows after migration, confirming architecture-only deployment.

## Trust boundary

This validation does not claim adviser access is live. `farm_adviser_access_grants` stores an owner-controlled future relationship, but the migration deliberately does not widen RLS on canonical farm, field or cattle tables. Farmer ownership remains the only live farm-data access path.

This validation also does not claim any scheme is implemented. A scheme becomes farmer-facing only after its authoritative source is archived/fingerprinted, its version/rules/inputs are stored, the definition passes application validation, its payment logic is source-reviewed, and it is explicitly enabled.
