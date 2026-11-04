-- Fertiliser pilot (Codex audit F010, HIGH): SYSTEM_FORECAST provenance must
-- be established only by the server, never by a direct client insert.
--
-- `20261103091000_slurry_forecast_adoptions.sql` grants `authenticated`
-- INSERT with an owner-only policy, so a signed-in client could call the
-- REST API directly and insert a SYSTEM_FORECAST row with a forged snapshot
-- (`20261103122537_slurry_forecast_adoption_system_binding.sql`), bypassing
-- the server-side recomputation in `adoptSlurryForecastScenarioAction`.
--
-- Write boundary after this migration:
-- - `authenticated` (RLS, owner-scoped) may still insert FARMER_FORECAST
--   adoptions and withdrawals — farmer intent is the farmer's own
--   declaration — but a RESTRICTIVE policy forbids any row that is a
--   SYSTEM_FORECAST or carries any system-forecast snapshot or binding
--   column.
-- - SYSTEM_FORECAST rows are written only by the server action, after its
--   own ownership check and forecast recomputation, through the existing
--   server-only `service_role` client (`src/lib/supabase/service-role.ts`).
--   `service_role` is narrowed to select + insert on this table.
-- - `system_forecast_binding = 'SERVER_BOUND'` marks a row written through
--   that boundary. Every row that existed before this migration has it
--   null, so a legacy or forged SYSTEM_FORECAST row is never treated as a
--   system forecast (`currentSlurryForecastAdoption` fails closed).
--
-- No SECURITY DEFINER function. Forward-only and non-destructive: a
-- nullable column, a NOT VALID constraint (no existing row is rewritten or
-- rejected), an added restrictive policy and narrowed grants. The existing
-- permissive policies are left in place.
alter table public.slurry_forecast_adoptions
  add column system_forecast_binding text
    check (system_forecast_binding is null or system_forecast_binding = 'SERVER_BOUND');

alter table public.slurry_forecast_adoptions
  add constraint slurry_forecast_adoptions_system_forecast_server_bound check (
    action = 'withdraw'
    or forecast_source is distinct from 'SYSTEM_FORECAST'
    or system_forecast_binding = 'SERVER_BOUND'
  ) not valid;

create policy "slurry_forecast_adoptions_client_insert_never_system"
  on public.slurry_forecast_adoptions
  as restrictive
  for insert
  to authenticated
  with check (
    forecast_source is distinct from 'SYSTEM_FORECAST'
    and system_forecast_binding is null
    and system_forecast_version is null
    and system_forecast_assessed_on is null
    and system_forecast_stores is null
  );

-- Default-ACL hazard (20260902050000_fix_default_acl_over_grant.sql):
-- `service_role` received ALL on this table; it needs only to write and
-- read back an adoption.
revoke all on table public.slurry_forecast_adoptions from service_role;
grant select, insert on table public.slurry_forecast_adoptions to service_role;

comment on column public.slurry_forecast_adoptions.system_forecast_binding is
  'SERVER_BOUND only when the row was written by the server action through the server-only service_role boundary after recomputing the forecast. authenticated clients can never set it (restrictive RLS policy). Null on every legacy row.';
