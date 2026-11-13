# Fertiliser draft PR #6 — verification record, 13 November 2026

**Candidate:** `review/fertiliser-closeout-20261113` based on production release `bd935043`; review-only. **Do not merge or deploy** without independent source audit, CI release gate, product-owner authorisation and appropriate external agronomic sign-off for the scientifically material changes.

## Local tests

Six sequential local Vitest CI-equivalent shards were executed with:
```
vitest run --exclude src/tooling/agent-run.test.ts --shard=N/6 --retry=1 --reporter=default
```
The original shard results, before final test fixture repairs, were:

| Shard | Passed | Failed | Todo | Classification |
|---|---:|---:|---:|---|
| 1 | 1427 | 1 | 1 | Tillage evidence UI expectation (corrected and retested) |
| 2 | 1144 | 0 | 0 | Passed |
| 3 | 1446 | 1 | 0 | Tillage evidence report expectation (corrected and retested) |
| 4 | 1303 | 4 | 0 | Four **pre-existing** cattle navigation failures |
| 5 | 1361 | 3 | 0 | Three **pre-existing** Cattle/Schemes failures |
| 6 | 1457 | 0 | 0 | Passed |

The seven previously known failures exactly match named tests listed in `.github/known-failing-tests.txt`. We did not change those tests or ignore them in the code.

After the six-shard run, two legacy tests were corrected to enforce the updated scientific contract (no grazing table values for non-grassland/tillage fields). Separate complete targeted test-file reruns passed:
- `src/app/(app)/evidence-report/[jobSessionId]/EvidenceReportPageClient.test.tsx`: **27/27**.
- `src/orchestration/scientific-evidence-report/index.test.ts`: **46/46**.
- `src/domain/nutrients.purchase-status.test.ts`: **76/76**.
- `src/domain/grazing-production-system-resolution.test.ts` and `src/lib/farm-data/fields.grazing-system.test.ts`: **14/14** after adding an explicit unsupported dairy movement guard.

The entire six-shard suite has **not** been repeated after those final small fixes. The remaining seven baseline failures are still release-pipeline exemptions, not passes; the separate tooling orchestration test follows `.github/workflows/tooling-tests.yml` and was not part of the app shards.

## Scientific controls

- No fallback to an invented calf-to-beef grazing system; field data is resolved from movement history, explicit field exception, then farm baseline, else blocked.
- Dairy cattle recorded on a field now block unsupported beef/suckler nutrient recommendations; no farm-baseline substitution for that field.
- Table 12-3 conversion above 3.0 LU/ha fails closed rather than extending published rows. Source-policy interpretation and expected values still require expert agricultural sign-off.
- Non-grassland fields have no grassland nutrient requirement, product purchase, or mixed grazing/slurry report.
- **Independent fresh Claude code review, limited scope only:** no Critical/High in the grazing precedence, upper-bound guard or tillage/report pathways, but it noted the unsafe dairy movement fallback that was then corrected. This was NOT an independent whole-PR audit, not a formal scientific validation, and NOT agronomist certification.

## Database

See `docs/operations/production-schema-reconciliation-2026-11-13.md`. The live app points at Supabase project `whevugeisqlpfnrugfsd`. Most 7–10 November application objects exist but the matching migration-history versions were not recorded, and three unreleased Smart Camera tables were absent. No production SQL mutation was carried out.

## Required release gate

- **Completed on final working tree:** `npm run typecheck` PASS, `npm run lint` PASS (0 errors, 4 warnings in unrelated Grass/Cattle code), and `npm run build` PASS (Next.js 16.3.2, production-style compile and page generation).
- Resolve remaining actual regressions outside the documented baseline (none known in the six-shard initial run after the two corrected tillage cases).
- Independent **full delta** audit since `deploy/audited`, with no High or Critical issues and correctly formatted `audits/<sha>.md` record.
- Agronomist approval for the changed Teagasc table selection, stocking-rate policy, slurry credits, P Index 4 and silage assumptions.
- Authorised product-owner release via audited GitHub pipeline; do not directly deploy to Vercel or change the production database.
