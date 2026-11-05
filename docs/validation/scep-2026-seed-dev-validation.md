# SCEP 2026 source-pinned seed — development validation

Validated: 2026-11-05
Project: Farm Return V1 Dev (`whevugeisqlpfnrugfsd`)
Migrations: `20261105173128_scep_2026_seed`, `20261105173401_scep_2026_weighing_source_repair`

## Result

The first database-backed scheme version was loaded into the development project.

Live checks after migration:

- Scheme: `scep` / year 2026 / rules version `scep-2026-v1`.
- Publication state: `verified`.
- Farmer-facing V1 flag: enabled.
- New-entry application dates: deliberately null. Farm Return does not present the closed 2023 entry window as open in 2026.
- 4 source records exist and all carry the expected SHA-256 content fingerprints. The weighing rule is bound to the exact ICBF 2026 weighing source rather than the broader Year 4 extract.
- 9 deterministic rule records exist.
- 15 rule-input dependency records exist.
- Payment parameters are stored with the source-pinned payment rule rather than inferred by the UI.
- Action ratios and 2026 dates are stored with their source-pinned rules.
- No penalty rule, 2026 Action 2 percentage checkpoint, or below-80%-forage payment outcome was invented.

Expected source fingerprints:

- DAFM service extract: `bd8b2d4aac2a8cfdc110ac945996217b87bfde334708b2b02409d9b5419eb7f9`
- ICBF action extract: `f6d74736a6f1183b6aa5731048469ccd530a6ffaf07a61919163f758595d8f80`
- Scheme Year 4 current extract: `5735f1fd8e577f3affe9ebcd904c987dbaeb1f7d88ec026f8068b6993071f5bd`
- ICBF 2026 weighing extract: `c364113cc9eae89026e572335bbdc8ad8e37945a483cc1ea13b0aa75ea4f9ebe`

## Product boundary

This validation does not claim a farmer is fully compliant with SCEP. Farm Return currently evaluates the source-pinned Year 4 calving, eligible-sire, genotyping and weighing targets, reuses the existing 2026 BISS answer, records SBLAS and Action 5 review facts, and calculates only a maximum potential gross area-based payment where the sourced payment rule is complete.

Farmer-entered SCEP figures are stored as append-only `farmer_confirmed` assertions. They are not presented as DAFM-verified. A later official data import can supersede them without overwriting provenance.
