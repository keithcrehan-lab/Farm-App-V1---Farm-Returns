-- Schemes foundation — architecture only.
--
-- This migration deliberately does NOT seed scheme rules. The next Schemes
-- phase loads the selected source-pinned schemes into these tables. The
-- architecture is created first so no production eligibility/payment rule
-- is forced into code or copied from an unverified summary.
--
-- Core invariants
-- 1. Scheme facts/rules are versioned and local. Runtime farmer assessment
--    never depends on fetching the public internet.
-- 2. "Open", "upcoming" and "closed" are derived from dated fields. They are
--    not persisted as stale labels.
-- 3. Every rule has a source belonging to the same scheme version.
-- 4. A rule declares canonical data keys; Schemes never owns field/cattle/
--    farm facts that belong to another module.
-- 5. Farmer scheme facts/evidence are append-only assertions. Corrections
--    supersede rather than overwrite provenance.
-- 6. Adviser relationships are modelled but NOT yet used to widen RLS on
--    canonical farm tables. Farmer ownership remains the only live access
--    path until the adviser phase explicitly wires those boundaries.
-- 7. Scheme obligations will be projected into the shared Plan kernel.
--    There is intentionally no separate schemes task table.
--
-- Forward-only. No seed data and no destructive change.

-- ---------------------------------------------------------------------
-- Versioned master repository
-- ---------------------------------------------------------------------

create table public.scheme_catalogue (
  scheme_key text primary key
    check (scheme_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 180),
  category text not null check (category in (
    'direct_basic_support',
    'environmental_support',
    'young_new_farmer_support',
    'capital_investment_support',
    'livestock_support',
    'safety_support',
    'other'
  )),
  authority text not null check (authority in ('DAFM', 'EU_CAP', 'OTHER_OFFICIAL')),
  created_at timestamptz not null default now()
);

create table public.scheme_versions (
  id uuid primary key default gen_random_uuid(),
  scheme_key text not null references public.scheme_catalogue (scheme_key),
  scheme_year integer not null check (scheme_year between 2000 and 2100),
  programme_generation text,
  rules_version text not null check (length(btrim(rules_version)) between 1 and 120),
  effective_from date,
  effective_to date,
  application_open timestamptz,
  application_close timestamptz,
  late_application_close timestamptz,
  publication_state text not null default 'draft'
    check (publication_state in ('draft', 'verified', 'superseded')),
  v1_enabled boolean not null default false,
  enterprise_relevance text[] not null default '{}',
  support_type text,
  recurrence_type text,
  requires_adviser boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (effective_from is null or effective_to is null or effective_from <= effective_to),
  check (application_open is null or application_close is null or application_open <= application_close),
  check (application_close is null or late_application_close is null or application_close <= late_application_close),
  check (
    (publication_state = 'draft' and verified_at is null) or
    (publication_state in ('verified', 'superseded') and verified_at is not null)
  ),
  unique (scheme_key, scheme_year, rules_version),
  unique (id, scheme_key)
);

create index scheme_versions_scheme_key_idx
  on public.scheme_versions (scheme_key, scheme_year desc);

create table public.scheme_sources (
  id uuid primary key default gen_random_uuid(),
  scheme_version_id uuid not null references public.scheme_versions (id) on delete cascade,
  source_key text not null check (length(btrim(source_key)) between 1 and 120),
  authority_tier text not null check (authority_tier in (
    'statute',
    'dafm_official',
    'eu_official',
    'teagasc_technical',
    'authoritative_secondary'
  )),
  publisher text not null check (length(btrim(publisher)) between 1 and 180),
  title text not null check (length(btrim(title)) between 1 and 300),
  url text not null check (length(btrim(url)) between 1 and 2000),
  publication_date date,
  retrieved_at timestamptz,
  last_verified_at timestamptz,
  content_fingerprint_sha256 text
    check (content_fingerprint_sha256 is null or content_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  archived_storage_path text,
  created_at timestamptz not null default now(),
  unique (scheme_version_id, source_key),
  unique (id, scheme_version_id)
);

create table public.scheme_rules (
  id uuid primary key default gen_random_uuid(),
  scheme_version_id uuid not null references public.scheme_versions (id) on delete cascade,
  source_id uuid not null,
  rule_key text not null check (length(btrim(rule_key)) between 1 and 160),
  rule_type text not null check (rule_type in (
    'relevance',
    'eligibility',
    'payment',
    'cap',
    'exclusion',
    'action_obligation',
    'evidence_obligation',
    'compatibility',
    'deadline'
  )),
  description text not null check (length(btrim(description)) between 1 and 2000),
  operator text not null check (length(btrim(operator)) between 1 and 80),
  parameters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(parameters) = 'object'),
  consequence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(consequence) = 'object'),
  hard_gate boolean not null default false,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  check (effective_from is null or effective_to is null or effective_from <= effective_to),
  unique (scheme_version_id, rule_key),
  unique (id, scheme_version_id),
  foreign key (source_id, scheme_version_id)
    references public.scheme_sources (id, scheme_version_id)
);

create index scheme_rules_version_type_idx
  on public.scheme_rules (scheme_version_id, rule_type);

create table public.scheme_rule_inputs (
  rule_id uuid not null,
  scheme_version_id uuid not null,
  data_key text not null check (length(btrim(data_key)) between 1 and 200),
  label text not null check (length(btrim(label)) between 1 and 300),
  owner text not null check (owner in ('farm_profile', 'fields', 'livestock', 'cattle', 'schemes', 'sheep')),
  subject_scope text not null check (subject_scope in ('farm', 'field', 'animal', 'group')),
  required boolean not null default true,
  resolution_owner text not null default 'farmer'
    check (resolution_owner in ('farmer', 'adviser', 'system')),
  priority integer not null default 100 check (priority between 0 and 10000),
  route_key text,
  created_at timestamptz not null default now(),
  primary key (rule_id, data_key),
  foreign key (rule_id, scheme_version_id)
    references public.scheme_rules (id, scheme_version_id) on delete cascade
);

create index scheme_rule_inputs_data_key_idx
  on public.scheme_rule_inputs (data_key);

-- ---------------------------------------------------------------------
-- Per-farm scheme workflow. Assessment outputs remain derived; no cached
-- eligibility/payment result is made authoritative by storage.
-- ---------------------------------------------------------------------

create table public.farm_scheme_cases (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  scheme_version_id uuid not null references public.scheme_versions (id),
  status text not null default 'DISCOVERED' check (status in (
    'DISCOVERED',
    'ASSESSING',
    'INFORMATION_MISSING',
    'APPLICATION_READY',
    'SUBMITTED_EXTERNALLY',
    'OUTCOME_RECORDED',
    'PAYMENT_EXPECTED',
    'PAYMENT_RECEIVED',
    'CLOSED'
  )),
  participation_status text not null default 'unknown'
    check (participation_status in ('unknown', 'interested', 'existing_participant', 'not_participating')),
  external_reference text check (external_reference is null or length(external_reference) <= 200),
  submitted_externally_at timestamptz,
  outcome_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, scheme_version_id)
);

create trigger farm_scheme_cases_set_updated_at
  before update on public.farm_scheme_cases
  for each row execute function public.set_updated_at();

-- Scheme-owned facts only. Farm/field/cattle facts remain in their canonical
-- owners and are referenced by data_key through scheme_rule_inputs.
create table public.farm_scheme_fact_assertions (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  scheme_version_id uuid not null references public.scheme_versions (id),
  data_key text not null check (length(btrim(data_key)) between 1 and 200),
  value jsonb not null,
  assertion_status text not null check (assertion_status in (
    'farmer_confirmed',
    'adviser_confirmed',
    'imported',
    'verified_external'
  )),
  source_kind text not null check (source_kind in (
    'farmer_entered',
    'adviser_entered',
    'imported_record',
    'official_confirmation'
  )),
  source_ref text,
  asserted_by uuid,
  observed_at timestamptz,
  received_at timestamptz not null default now(),
  supersedes_id uuid,
  created_at timestamptz not null default now(),
  unique (id, farm_id, scheme_version_id, data_key),
  foreign key (supersedes_id, farm_id, scheme_version_id, data_key)
    references public.farm_scheme_fact_assertions (id, farm_id, scheme_version_id, data_key)
);

create index farm_scheme_fact_assertions_lookup_idx
  on public.farm_scheme_fact_assertions (farm_id, scheme_version_id, data_key, received_at desc);

create table public.farm_scheme_evidence (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  scheme_version_id uuid not null references public.scheme_versions (id),
  evidence_key text not null check (length(btrim(evidence_key)) between 1 and 200),
  subject_type text not null check (subject_type in (
    'farm', 'field', 'cattle_animal', 'cattle_group', 'sheep_group'
  )),
  subject_id text not null check (length(btrim(subject_id)) between 1 and 200),
  source_kind text not null check (source_kind in (
    'canonical_record',
    'farmer_upload',
    'adviser_upload',
    'imported_record',
    'official_confirmation'
  )),
  source_ref text not null check (length(btrim(source_ref)) between 1 and 2000),
  content_fingerprint_sha256 text
    check (content_fingerprint_sha256 is null or content_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz,
  received_at timestamptz not null default now(),
  created_by uuid,
  supersedes_id uuid,
  created_at timestamptz not null default now(),
  unique (id, farm_id, scheme_version_id, evidence_key),
  foreign key (supersedes_id, farm_id, scheme_version_id, evidence_key)
    references public.farm_scheme_evidence (id, farm_id, scheme_version_id, evidence_key)
);

create index farm_scheme_evidence_lookup_idx
  on public.farm_scheme_evidence (farm_id, scheme_version_id, evidence_key, received_at desc);

-- Farmer-owned relationship record only. No existing farm table RLS uses
-- this relation yet; that is deliberately deferred to the adviser phase.
create table public.farm_adviser_access_grants (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  adviser_user_id uuid,
  adviser_email text check (
    adviser_email is null or
    (length(adviser_email) <= 254 and adviser_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  permissions text[] not null default array['schemes_view', 'schemes_assist']::text[]
    check (
      permissions <@ array[
        'schemes_view',
        'schemes_assist',
        'scheme_information_request',
        'scheme_evidence_review'
      ]::text[]
    ),
  invited_by uuid not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (adviser_user_id is not null or adviser_email is not null),
  check (status <> 'active' or granted_at is not null),
  check (status <> 'revoked' or revoked_at is not null)
);

create trigger farm_adviser_access_grants_set_updated_at
  before update on public.farm_adviser_access_grants
  for each row execute function public.set_updated_at();

create index farm_adviser_access_grants_farm_idx
  on public.farm_adviser_access_grants (farm_id, status);

create table public.farm_scheme_information_requests (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  scheme_version_id uuid references public.scheme_versions (id),
  data_key text not null check (length(btrim(data_key)) between 1 and 200),
  note text check (note is null or length(note) <= 1200),
  requested_by uuid not null,
  requested_from uuid,
  status text not null default 'open'
    check (status in ('open', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index farm_scheme_information_requests_farm_idx
  on public.farm_scheme_information_requests (farm_id, status, created_at desc);

create table public.farm_scheme_audit_events (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  scheme_version_id uuid references public.scheme_versions (id),
  event_type text not null check (length(btrim(event_type)) between 1 and 100),
  actor_user_id uuid,
  detail jsonb not null default '{}'::jsonb
    check (jsonb_typeof(detail) = 'object'),
  occurred_at timestamptz not null default now()
);

create index farm_scheme_audit_events_farm_idx
  on public.farm_scheme_audit_events (farm_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- Append-only guards for provenance-bearing records.
-- ---------------------------------------------------------------------

create or replace function public._schemes_append_only_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'schemes: provenance records are append-only';
end;
$$;

create trigger farm_scheme_fact_assertions_append_only
  before update or delete on public.farm_scheme_fact_assertions
  for each row execute function public._schemes_append_only_guard();

create trigger farm_scheme_evidence_append_only
  before update or delete on public.farm_scheme_evidence
  for each row execute function public._schemes_append_only_guard();

create trigger farm_scheme_audit_events_append_only
  before update or delete on public.farm_scheme_audit_events
  for each row execute function public._schemes_append_only_guard();

revoke all on function public._schemes_append_only_guard() from public;

-- ---------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------

alter table public.scheme_catalogue enable row level security;
alter table public.scheme_versions enable row level security;
alter table public.scheme_sources enable row level security;
alter table public.scheme_rules enable row level security;
alter table public.scheme_rule_inputs enable row level security;
alter table public.farm_scheme_cases enable row level security;
alter table public.farm_scheme_fact_assertions enable row level security;
alter table public.farm_scheme_evidence enable row level security;
alter table public.farm_adviser_access_grants enable row level security;
alter table public.farm_scheme_information_requests enable row level security;
alter table public.farm_scheme_audit_events enable row level security;

create policy "scheme_catalogue_authenticated_read"
  on public.scheme_catalogue for select to authenticated using (true);
create policy "scheme_versions_authenticated_read"
  on public.scheme_versions for select to authenticated using (true);
create policy "scheme_sources_authenticated_read"
  on public.scheme_sources for select to authenticated using (true);
create policy "scheme_rules_authenticated_read"
  on public.scheme_rules for select to authenticated using (true);
create policy "scheme_rule_inputs_authenticated_read"
  on public.scheme_rule_inputs for select to authenticated using (true);

create policy "farm_scheme_cases_owner_all"
  on public.farm_scheme_cases for all to authenticated
  using (exists (
    select 1 from public.farms f
    where f.id = farm_id and f.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.farms f
    where f.id = farm_id and f.user_id = (select auth.uid())
  ));

create policy "farm_scheme_fact_assertions_owner_read"
  on public.farm_scheme_fact_assertions for select to authenticated
  using (exists (
    select 1 from public.farms f
    where f.id = farm_id and f.user_id = (select auth.uid())
  ));
create policy "farm_scheme_fact_assertions_owner_insert"
  on public.farm_scheme_fact_assertions for insert to authenticated
  with check (
    asserted_by = (select auth.uid()) and
    exists (
      select 1 from public.farms f
      where f.id = farm_id and f.user_id = (select auth.uid())
    )
  );

create policy "farm_scheme_evidence_owner_read"
  on public.farm_scheme_evidence for select to authenticated
  using (exists (
    select 1 from public.farms f
    where f.id = farm_id and f.user_id = (select auth.uid())
  ));
create policy "farm_scheme_evidence_owner_insert"
  on public.farm_scheme_evidence for insert to authenticated
  with check (
    created_by = (select auth.uid()) and
    exists (
      select 1 from public.farms f
      where f.id = farm_id and f.user_id = (select auth.uid())
    )
  );

create policy "farm_adviser_access_grants_owner_all"
  on public.farm_adviser_access_grants for all to authenticated
  using (exists (
    select 1 from public.farms f
    where f.id = farm_id and f.user_id = (select auth.uid())
  ))
  with check (
    invited_by = (select auth.uid()) and
    exists (
      select 1 from public.farms f
      where f.id = farm_id and f.user_id = (select auth.uid())
    )
  );

create policy "farm_scheme_information_requests_owner_all"
  on public.farm_scheme_information_requests for all to authenticated
  using (exists (
    select 1 from public.farms f
    where f.id = farm_id and f.user_id = (select auth.uid())
  ))
  with check (
    requested_by = (select auth.uid()) and
    exists (
      select 1 from public.farms f
      where f.id = farm_id and f.user_id = (select auth.uid())
    )
  );

create policy "farm_scheme_audit_events_owner_read"
  on public.farm_scheme_audit_events for select to authenticated
  using (exists (
    select 1 from public.farms f
    where f.id = farm_id and f.user_id = (select auth.uid())
  ));
create policy "farm_scheme_audit_events_owner_insert"
  on public.farm_scheme_audit_events for insert to authenticated
  with check (
    actor_user_id = (select auth.uid()) and
    exists (
      select 1 from public.farms f
      where f.id = farm_id and f.user_id = (select auth.uid())
    )
  );

revoke all on public.scheme_catalogue from anon, authenticated;
revoke all on public.scheme_versions from anon, authenticated;
revoke all on public.scheme_sources from anon, authenticated;
revoke all on public.scheme_rules from anon, authenticated;
revoke all on public.scheme_rule_inputs from anon, authenticated;
revoke all on public.farm_scheme_cases from anon, authenticated;
revoke all on public.farm_scheme_fact_assertions from anon, authenticated;
revoke all on public.farm_scheme_evidence from anon, authenticated;
revoke all on public.farm_adviser_access_grants from anon, authenticated;
revoke all on public.farm_scheme_information_requests from anon, authenticated;
revoke all on public.farm_scheme_audit_events from anon, authenticated;

grant select on public.scheme_catalogue to authenticated;
grant select on public.scheme_versions to authenticated;
grant select on public.scheme_sources to authenticated;
grant select on public.scheme_rules to authenticated;
grant select on public.scheme_rule_inputs to authenticated;

grant select, insert, update, delete on public.farm_scheme_cases to authenticated;
grant select, insert on public.farm_scheme_fact_assertions to authenticated;
grant select, insert on public.farm_scheme_evidence to authenticated;
grant select, insert, update, delete on public.farm_adviser_access_grants to authenticated;
grant select, insert, update, delete on public.farm_scheme_information_requests to authenticated;
grant select, insert on public.farm_scheme_audit_events to authenticated;
