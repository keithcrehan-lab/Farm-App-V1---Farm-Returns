# Regional grass growth map automation

## Existing data path
1. Vercel checks `/api/cron/teagasc-growth` daily (`0 12 * * *`).
2. The server finds the latest dated Teagasc MoSt county map on the official grassland management page.
3. The image reader extracts each Republic of Ireland county's printed `kg DM/ha/day` prediction. It does **not** calculate growth or interpolate missing county figures.
4. Rows are stored in `regional_grass_growth` with the map URL, original caption, validity dates, read confidence and a shared batch ID.
5. The existing Grass server action selects the latest approved figure for the farm's county. Individual field measurements and validated farmer observations retain their own priority.

## Publication safety
- By default, every new map is **pending** until an administrator verifies it at `/admin/grass-growth`.
- Fewer than 20 of the 26 Republic of Ireland counties: extraction fails without insertion.
- Between 20 and 25 counties, unclear figures, or disagreement between image reads: **pending**; the admin page displays the county coverage and missing counties.
- Optional `REGIONAL_GROWTH_AUTO_PUBLISH=true` allows publishing without human review **only** when two separate image-reading requests transcribe all 26 ROI counties identically, all figures have high confidence, each is positive, and the map's prediction week includes today's date.
- Duplicate county values are flagged low confidence; null/blank numbers are never interpreted as zero. Zero may be stored for manual review but cannot be auto-published until the downstream grass engine supports it correctly.
- Re-checking the same `valid_from` does not duplicate the batch. The original map and figures remain auditable.

Two agreeing vision passes reduce transcription risk but do not guarantee scientific correctness. Keep automatic publication disabled during initial trials and periodically spot-check against the source image.

## Setup still required in the deployment
The Vercel production environment needs the server-only variables `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and `CRON_SECRET` alongside its existing public Supabase URL. Credentials must be added through secret configuration, never committed to GitHub or exposed in the frontend.

Only enable `REGIONAL_GROWTH_AUTO_PUBLISH` after checking real map image extraction and confirming permission to reuse the source data. The model API is a separately billed service; a Claude consumer login does not automatically provide an API key. The manual admin path remains available without the model key.

## Farmer-facing interpretation
County MoSt figures are **regional predictions for a stated week**, not field measurements. Display source, date and `kg DM/ha/day`; do not present an expired or unverified prediction as a current measured farm growth rate. The grass calculation engine must remain responsible for converting valid growth evidence into cover forecasts.
