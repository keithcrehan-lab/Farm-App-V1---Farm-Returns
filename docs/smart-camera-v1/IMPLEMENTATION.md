# Farm Return Smart Camera V1 — isolated implementation

Branch: `feature/smart-camera-v1` (not merged or deployed).

## Implemented
- Farm screen / Smart Camera navigation; camera QR/EAN scanning on supported browsers and manual-code fallback.
- Exact farm-scoped field QR matching and local printable QR labels.
- GTIN-8/12/13/14 check-digit validation and zero-guess exact catalogue lookup.
- Read-only, curated, authenticated fertiliser catalogue schema with provenance (source URL, name and review date). **No production product rows are seeded or asserted as verified.** Migration is not applied.
- Stock observation hand-off reuses existing farm-scoped `AddFertiliserStockRecordSheet`. Product can be preselected only after an exact curated match; farmer must enter actual stock quantity and confirm saving. A stock observation is not a delivery record or live inventory balance.
- Pure delivery preflight check requires accepted order, exact same-farm order ID and GTIN, and consistent kg quantity. It cannot be connected to real deliveries until a trusted accepted-order and delivery-receipt persistence contract exists.

## Not implemented / blocked
1. Curator must source actual manufacturer/supplier mappings (GTIN, precise product name, provenance and review date), independently verify and seed the catalogue. Without rows, valid barcodes show unmatched. Product descriptions and composition must never be inferred from arbitrary codes.
2. Apply the additive catalogue migration in a controlled development environment after review. Do not apply to production during development.
3. Existing managed quote requests and recorded supplier quotes are *not* accepted purchase orders. A delivery-receipt workflow needs an authorised acceptance event, stock-movement rules, idempotency and audit trail before a photographed docket may update any inventory or financial record. Bag-weight conversions are unknown unless explicitly confirmed.
4. Browser `BarcodeDetector` availability varies. Test the mobile capture path on iOS Safari and Android Chrome and implement a scanner-library fallback for unsupported devices.
5. Full quality gate remains blocked by existing missing Capacitor mobile-spike dependencies and `LayoutProps` Next-generated types. The targeted Smart Camera tests and lint pass; a signed-in mobile and desktop acceptance run remains pending.
6. Independent final audit and merge/deployment are outstanding. Do not label feature production-ready.

## Safety invariants
- Unknown is not zero; an unavailable catalogue is not a negative product identification.
- No product, scientific nutrient composition, delivery, treatment or expense is generated from free-form OCR/vision guesses.
- QR codes are not access tokens: farm data remains session-scoped and subject to auth and RLS.
- No automatic stock delta is posted by scanning. The farmer's persisted record remains a dated total observation, with source attribution.

## 2026-11-07 follow-on: real order/delivery recording implementation
- Added `smart_camera_purchase_orders` (farmer-confirmed supplier-accepted order with source and date; not a quote or supplier-side independent verification), immutable `smart_camera_delivery_receipts`, and an atomic receipt RPC with same-farm checks, product matching, row locking, quantity caps, and duplicate-reference replay handling.
- Added `/smart-camera/orders` with explicit farmer attestation for accepted purchase orders and checked delivery dockets. Existing Smart Camera now links there, pre-filling verified scanned GTIN where available.
- Added curated-catalogue import helper requiring independent source review attestation. It emits SQL for manual review, never uploads or self-verifies provenance; no manufacturer GTIN data has been seeded.
- The delivery receipts ledger is **separate** from dated stock observations, because the existing stock engine is a series of farmer-confirmed totals, not a movement-based balance.
- Both new SQL migrations are un-applied; live acceptance testing, SQL RLS verification, supplier-grounded catalogue rows, mobile browser testing, independent audit, and integration remain outstanding. Do not call this production-complete.

## GS1 free lookup test bridge (2026-11-07)
- GS1 confirms 30 individual free searches per rolling 24 hours on its public Verified by GS1 website. Its free product search is **not** a public unattended API; API access is arranged separately through a GS1 member organisation.
- On scanning/pasting a checksum-valid GTIN, Farm Return shows the original number, a copy button and a link to `https://www.gs1.org/verified-by-gs1`. The farmer performs the interactive lookup in GS1's own UI.
- This workflow **cannot automatically identify or import the product**. GS1 free results are not fetched, cached, parsed or redistributed. GS1's public free terms restrict results to internal use; do not seed the commercial Farm Return catalogue from them without an appropriate licence.
- A checksum-valid code means only that the encoded digits satisfy the check-digit arithmetic. It is not a claim about GS1 registration or about the product's identity.
- GS1 may return only the company licensee. No nutrient composition, medicine or stock data is inferred or saved from that response.
- The curated product lookup and supplier-confirmed database remain separate until suitable source/licensing contracts exist.
- Tested with `src/lib/smart-camera/gs1-free-lookup.test.ts`; physical-device camera acceptance still pending and branch remains undeployed.

## Free multi-provider lookup pilot (2026-11-07)
- Adds an explicit, authenticated, read-only lookup button in Smart Camera for any checksum-valid GTIN-8/12/13/14. Sources queried server-side: UPCitemdb free trial lookup, Open Facts v3 product lookup (`product_type=all`), and ProductGuru's public EAN JSON endpoint.
- Returns each provider's separate exact-GTIN result, attribution, source-specific missing/rate-limit/error state and descriptive metadata. No best-match auto-verification, inferred chemical/nutrient properties, product photo storage, stock edit, vendor order, medicine record or finance entry.
- Source links are fixed official provider URLs. External response strings are plain text, length-limited, and not used to construct links, SQL, or other actions. Provider requests have timeout, `no-store` and in-process throttling; **this is not a distributed multi-instance quota limiter**. Free UPCitemdb is limited to 100 requests/day and approximately six per minute per source IP; Open Facts limits product reads to 15/min/IP. No guarantee for every code.
- Open Facts records are ODbL-licensed, with attribution/share-alike requirements when reused. ProductGuru data can include AI-estimated fields; licensing differs by source, and attribution is shown. UPCitemdb accuracy is not guaranteed and commercial rights/caching need legal review. We do not retain or merge third-party records in the curated catalogue.
- Camera capture now has a dynamic ZXing browser decoder fallback for browsers (notably iOS Safari) without a native BarcodeDetector. The app requires HTTPS and camera permission. Manual code entry remains available.
- Manual provider probes from the Mac: Open Facts and ProductGuru returned named records for a public sample GTIN; UPCitemdb returned zero matches for that sample. This is not field coverage validation.
- Tests: public adapter fixtures, exact GTIN guards, third-party mismatches, failures and throttling; camera code lint/typecheck coverage. Live physical-device acceptance and production deployment remain pending.
