# Farm Return unified release candidate — gates and provenance

## Canonical scope

- Integration branch: `release/farm-return-current-2026-11-07`, based on `feature/ui-continuity-audit-fixes` / V2 / 10x / field scanning, with a dedicated merge commit for frozen `schemes-adviser-v1` S0.
- Normal production alias is `farm-return-pilot-topaz.vercel.app` (Vercel project `farm-iq/farm-return-pilot`). Production was at deploy `dpl_HTwZcJpkgXNtDgjxRrvhYTafCCSz` (git SHA `a5d049b`) on 7 November 2026.
- Preserve the current live deployment as rollback target; release through a separate, tested **preview** before any alias promotion.
- No changes to main `farm-return-next`, parallel Schemes/10x worktrees, or existing customer data.

## Read-only database inventory (2026-11-07)

- Project `whevugeisqlpfnrugfsd` (labelled Farm Return V1 Dev) backs the current preview and is shared with the deployed app.
- Migration history already records through `20261106170937 field_scan_resolve_refs`, including Cattle, Housing, Grass, Schemes, and Field Scanning migrations.
- **Missing**: Smart Camera verified catalogue and purchase-order/delivery migrations (`20261107220000`, `20261107221000`); no independently verified fertiliser GTIN rows.
- Accordingly, `SMART_CAMERA_ORDERS_ENABLED` defaults **off** in server route AND server write/read actions. The customer-facing orders page truthfully displays Coming soon rather than a broken, writable form. Only explicitly turn on after migration/RLS/security/transaction verification and catalogue provenance review.
- The free barcode lookup is an **experimental suggestion** (not verified agricultural specifications). Provider 429 and commercial rate limits and Open Facts ODbL licence terms require review before high-volume public use. No external data persisted in canonical catalogue.

## Release acceptance required before production promotion

1. Merge inventory: UI/10x/Spatial plus S0 Schemes and documentation source included without modifying frozen branches. Source/gate notes updated.
2. Full production build, TypeScript and lint on release branch; targeted tests for field mapping, Smart Camera, cattle and Schemes; Playwright mobile/desktop screen evidence.
3. Read-only, **signed-in** walkthrough with a consented test farmer against the same DB: Farm map, field selection/refinement/deletion recovery, fertiliser plan and quote, grass walk, cattle group, Schemes eligibility, Smart Camera barcode search and controls. Must confirm no data corruption.
4. Run missing-migration guard: check orders page says Coming soon; mutation actions reject while disabled; no supplier/order data is inferred.
5. Vercel staging preview with appropriate Supabase env, smoke test and replayable deploy SHA. Do **not** promote a deployment that fails any gate. Keep live alias on existing release until signed-in acceptance can be completed.
6. Once all pass, promote the exact verified Vercel deployment to production, verify normal URL, sign-in and critical flows, and record rollback deployment ID. Reuse the same branch/pipeline for subsequent changes to avoid version drift.

**Never mark pilot ready on the strength of a demo-mode screenshot alone.**

## Free-source reuse note
Open Food Facts data are under ODbL with share-alike requirements if merged into a proprietary catalogue; Farm Return stores no provider records. ProductGuru publishes a free API but retains proprietary scoring/structure; UPCitemdb is capped at 100 requests/day. Recheck commercial API terms and implement durable global rate limiting before scaling public traffic.
