# Farm Return production schema reconciliation — 13 November 2026

**Scope:** Read-only comparison of the current `release/farm-return-current-2026-11-07` migration source with production's configured Supabase project. **No database changes were made.** This is not authority to repair the migration history or apply migrations.

## Project binding

Vercel project `farm-return-pilot` (production environment's `NEXT_PUBLIC_SUPABASE_URL`) resolves to Supabase project `whevugeisqlpfnrugfsd` (`Farm Return V1 Dev`). The release head at the time of verification was `bd935043`, and the last reported applied migration version from `supabase_migrations.schema_migrations` was `20261106170937` (`field_scan_resolve_refs`). Production environment secrets were not recorded.

## 7–10 November migrations versus observed database

Ten migration filenames exist in release source but no matching entries were returned from the migration ledger:

- `20261107220000_smart_camera_verified_fertiliser_catalogue.sql`
- `20261107221000_smart_camera_orders_deliveries.sql`
- `20261109230000_medicine_purchases.sql`
- `20261110000000_grass_surveys.sql`
- `20261110080000_regional_grass_growth.sql`
- `20261110120000_calendar_entries.sql`
- `20261110160000_recommendation_states.sql`
- `20261110180000_feed_pesticide_records.sql`
- `20261110200000_records_evidence_treatments_health.sql`
- `20261110220000_field_paddock_split.sql`

We queried the live Postgres catalog without modifying it and observed **14 of 17 expected new public tables** present, each with row-level security enabled: `animal_health_events`, `app_admins`, `calendar_entries`, `feed_records`, `grass_survey_track_points`, `grass_surveys`, `medicine_product_links`, `medicine_purchases`, `medicine_treatments`, `pesticide_applications`, `recommendation_states`, `record_book_confirmations`, `regional_grass_growth`, and `spray_operators`.

Three **unreleased Smart Camera purchasing tables** were absent: `smart_camera_verified_fertiliser_products`, `smart_camera_purchase_orders`, and `smart_camera_delivery_receipts`. Their absence should not be described as a failure of the released fertiliser engine without an actual dependency check.

Additional observed supporting objects: `public.is_app_admin()` exists; the `record-evidence` storage bucket exists and `storage.objects` has `record_evidence_owner_read` (SELECT) and `record_evidence_owner_insert` (INSERT) policies. Policy definitions, access expressions and effective grants still require detailed verification.

Additional observed columns: `fields.split_from_field_id` (uuid), `grass_cover_observations.survey_id` (uuid), and `feed_records.evidence_path` / `pesticide_applications.evidence_path` (text). Observed row-security policy names for the 12 queried application tables aligned with those listed in relevant migrations, **but exact policy bodies, privileges, functions, check constraints, triggers, indexes and default values have not been checked exhaustively**.

## Determination and safe next action

This is a **migration ledger divergence with partial schema overlap**, not proof that all ten migrations need applying. Replaying the SQL against production or inserting migration-history rows based on table existence alone is not safe: some migrations are not fully idempotent, and absent tables and partially applied objects could conflict with data or permissions.

**Release gate:** A database owner should take a current recoverable database backup, compare the full live schema with every expected migration effect using a schema-only diff or equivalent, and create a reviewed forward-only remediation for only the missing effects. Separately review and release the three Smart Camera tables if that feature is launched. Never run production migrations from an automated agent (repository `AGENTS.md`).

This report concerns schema observations only, not confirmation of correct application behaviour. All factual observations were made with read-only queries against `information_schema`, `pg_class`, `pg_policies`, and `supabase_migrations.schema_migrations`.
