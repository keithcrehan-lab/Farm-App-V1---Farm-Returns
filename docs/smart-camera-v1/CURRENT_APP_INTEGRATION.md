# Smart Camera — current Farm Return preview integration

Integration baseline: `feature/10x-workflows` @ `023d689` (7 Nov 2026). This branch descends from `feature/field-scan-boundaries` @ `4746a0a`; it therefore includes the current spatial field scanning, boundary naming, 30-day deletion/restore, 10x work and new Farm V2 design, unlike the first Smart Camera preview built on `72f1fbd` (6 Oct 2026).

`feature/smart-camera-current-preview` is a dedicated integration worktree. No changes were made to the 10x, Spatial or Schemes worktrees, or the production site. The original newer V2 Farm, Fields, Grass, Cattle and Schemes screens were retained. Only additive Smart Camera navigation and field/Farm shortcuts were applied to existing screens. The camera, verified-only catalogue, purchase/delivery prototypes, free GS1 link and 3-source lookup were copied from the previous dedicated Smart Camera branch.

The new SQL migrations remain un-applied. They are not required for testing external free public barcode lookups. Full purchase-order and curated-catalogue workflows require reviewed migrations and verified seed data.

The old Smart Camera preview must not be reused: it contains the older app baseline. Only share the new preview URL after Vercel verification.
