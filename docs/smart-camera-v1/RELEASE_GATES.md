# Smart Camera: product catalogue and delivery release gates

## Catalogue curator process
1. Obtain the exact GTIN from the manufacturer or supplier, and match it to a primary-source product specification. Do not infer GTIN from a photo of an NPK bag.
2. Record productName, gtin, sourceName, sourceUrl, reviewedAt, optional declaredAnalysis, reviewerAttestation = `Source independently checked` in a private JSON array.
3. Run `node scripts/smart-camera-catalogue-import.mjs /path/to/curated.json /tmp/catalogue-review.sql`.
4. Independently review every emitted SQL row against the original supplier evidence, then apply via a controlled migration or admin SQL process in development. This helper **does not** upload data or establish that independent review actually occurred.
5. Test an exact matching barcode, unknown valid GTIN, invalid GTIN, and product deactivation. No real products are seeded in this branch.

## Purchase / delivery semantics
- `smart_camera_purchase_orders`: farmer's affirmative declaration of a genuinely supplier-accepted order, not an automatic conversion of a quote or independent supplier confirmation.
- `smart_camera_delivery_receipts`: farmer-confirmed physical receipt from a delivery docket, immutable, unique docket reference per order, and bounded by ordered quantity. Source evidence is a reference typed by the farmer, not an uploaded or verified document.
- Delivery recording is atomic under a row lock and idempotent for identical retry payloads. Different payloads with same docket reference fail.
- Receipts do NOT mutate `fertiliser_stock_records`. That table is a dated full inventory observation, not a running balance. There is no financial posting, invoice matching or proof-of-delivery file storage yet.
- The new schema migrations have not been applied to the development or production database. Supabase role/RLS/integration acceptance checks remain required before release.

## Acceptance
- Correct QR field routing and invalid/unmatched scan handling.
- Curated catalogue exact lookup and unavailable states.
- Real order confirmation requires verified GTIN plus supplier, reference, source and farmer attestation.
- Delivery receipt requires existing same-farm order, matching GTIN, non-overrunning kg, genuine date, unique reference.
- Concurrency: concurrent receipts cannot overrun the total, even if they both use different docket references.
- Same-reference retries: identical accepted; conflicting rejected.
- Supabase RLS: cross-farm list/create/receipt attempts denied.
- Mobile camera test on iOS Safari and Android Chrome; browser API fallback tested; manual input works.
- Full quality gate, independent audit, controlled migration, and explicit merge/deploy review.

## Free Verified by GS1 testing
- Manual external lookup bridge only: 30 single queries in 24 hours, on GS1 website; no unlicensed API use or scraping.
- Open the official page, select Verify Product, enter the copied GTIN; review whether it returns company-only or the specific registered product.
- Do not import free query results into a shared commercial catalogue. Request API and data licensing from GS1 Ireland for automatic identification.
- Validate mobile browser clipboard and external-tab behaviour using a real product barcode on a phone.

## Three-source automatic lookup pilot
- Confirm source terms, caching/attribution and commercial rights before wider pilot distribution; free endpoints are not unlimited production infrastructure.
- Run a signed-in phone walkthrough: QR field scan, GTIN barcode scan on iOS Safari and Android, manual entry, three-source results, missing matches, rate limits, camera-denied fallback.
- Confirm no third-party match can save stock, medicines, fertiliser prescriptions or purchase orders, and that verified manufacturer catalogue matches remain distinctly labelled.
- Confirm no API responses are written to the permanent fertiliser catalogue. Add server-side durable rate limiting if external testing scales beyond a few developers.
