-- Farm Return internal spatial reference cache.
-- Public-source geometry is copied into PostGIS so field calculations do not
-- depend on live third-party APIs at request time.

create extension if not exists postgis with schema extensions;

create table if not exists public.spatial_reference_sources (
  source_key text primary key,
  publisher text not null,
  title text not null,
  source_url text not null,
  licence text not null,
  source_version text not null,
  source_date date,
  refreshed_at timestamptz not null default now(),
  exhaustive boolean not null default false,
  negative_inference_allowed boolean not null default false,
  notes text
);

create table if not exists public.spatial_reference_coverage (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references public.spatial_reference_sources(source_key) on delete cascade,
  source_version text not null,
  coverage extensions.geometry(MultiPolygon, 4326) not null,
  status text not null check (status in ('complete','partial')),
  imported_at timestamptz not null default now(),
  feature_count integer not null default 0 check (feature_count >= 0),
  unique(source_key, source_version, id)
);
create index if not exists spatial_reference_coverage_gix on public.spatial_reference_coverage using gist (coverage);
create index if not exists spatial_reference_coverage_source_idx on public.spatial_reference_coverage(source_key, source_version, status);

create table if not exists public.spatial_lpis_parcels (
  id bigserial primary key,
  source_key text not null references public.spatial_reference_sources(source_key),
  source_version text not null,
  source_feature_id text not null,
  parcel_label text,
  commonage_indicator boolean,
  date_of_extract date,
  properties jsonb not null default '{}'::jsonb,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  unique(source_key, source_version, source_feature_id)
);
create index if not exists spatial_lpis_parcels_gix on public.spatial_lpis_parcels using gist (geom);
create index if not exists spatial_lpis_parcels_commonage_idx on public.spatial_lpis_parcels(commonage_indicator);

create table if not exists public.spatial_watercourses (
  id bigserial primary key,
  source_key text not null references public.spatial_reference_sources(source_key),
  source_version text not null,
  source_feature_id text not null,
  feature_name text,
  properties jsonb not null default '{}'::jsonb,
  geom extensions.geometry(MultiLineString, 4326) not null,
  unique(source_key, source_version, source_feature_id)
);
create index if not exists spatial_watercourses_gix on public.spatial_watercourses using gist (geom);

create table if not exists public.spatial_groundwater_features (
  id bigserial primary key,
  source_key text not null references public.spatial_reference_sources(source_key),
  source_version text not null,
  source_feature_id text not null,
  feature_type text not null check (feature_type in (
    'public_supply_source_protection_area',
    'group_water_scheme_source_protection_area',
    'well',
    'spring',
    'borehole',
    'dug_well',
    'other_groundwater_feature'
  )),
  feature_name text,
  location_accuracy_m numeric,
  properties jsonb not null default '{}'::jsonb,
  geom extensions.geometry(Geometry, 4326) not null,
  unique(source_key, source_version, source_feature_id)
);
create index if not exists spatial_groundwater_features_gix on public.spatial_groundwater_features using gist (geom);
create index if not exists spatial_groundwater_features_type_idx on public.spatial_groundwater_features(feature_type);

alter table public.spatial_reference_sources enable row level security;
alter table public.spatial_reference_coverage enable row level security;
alter table public.spatial_lpis_parcels enable row level security;
alter table public.spatial_watercourses enable row level security;
alter table public.spatial_groundwater_features enable row level security;

-- Public reference data is not user-private. Authenticated users may read it;
-- mutation stays server/admin only because no INSERT/UPDATE/DELETE grants are made.
grant select on public.spatial_reference_sources to authenticated;
grant select on public.spatial_reference_coverage to authenticated;
grant select on public.spatial_lpis_parcels to authenticated;
grant select on public.spatial_watercourses to authenticated;
grant select on public.spatial_groundwater_features to authenticated;

create policy spatial_reference_sources_read on public.spatial_reference_sources for select to authenticated using (true);
create policy spatial_reference_coverage_read on public.spatial_reference_coverage for select to authenticated using (true);
create policy spatial_lpis_parcels_read on public.spatial_lpis_parcels for select to authenticated using (true);
create policy spatial_watercourses_read on public.spatial_watercourses for select to authenticated using (true);
create policy spatial_groundwater_features_read on public.spatial_groundwater_features for select to authenticated using (true);

insert into public.spatial_reference_sources
(source_key,publisher,title,source_url,licence,source_version,source_date,exhaustive,negative_inference_allowed,notes)
values
('dafm_lpis_2025','Department of Agriculture, Food and the Marine','Anonymous LPIS data for 2025','https://opendata.agriculture.gov.ie/dataset/anonymous-lpis-data-for-2025','CC BY 4.0','2025','2025-12-31',true,true,'Commonage is resolved only from intersecting LPIS parcels with a usable Commonage Indicator; no parcel match remains unresolved.'),
('epa_water_flow_network','Environmental Protection Agency','Water Flow Network','https://data.gov.ie/dataset/water-flow-network','CC BY 4.0','2026-06-24','2026-06-24',true,false,'Used for nearest mapped river/stream geometry. Absence does not prove absence of every field drain or water feature.'),
('gsi_public_supply_spa','Geological Survey Ireland','Public Supply Source Protection Areas','https://data.gov.ie/dataset/public-supply-source-protection-areas-ireland-roi-itm','CC BY 4.0','2024-02-26','2024-02-26',true,true,'Polygon source-protection areas around groundwater public-supply abstractions.'),
('gsi_group_scheme_spa','Geological Survey Ireland','Group Water Scheme Zones of Contribution','https://gsi.geodata.gov.ie/server/rest/services/Groundwater/IE_GSI_Group_Water_Scheme_Public_Water_Supply_Source_Protection_Areas_20K_IE26_ITM/MapServer','CC BY 4.0','2024-02-26','2024-02-26',true,true,'Preliminary zones of contribution for group water schemes.'),
('gsi_wells_springs','Geological Survey Ireland','Groundwater Wells and Springs Ireland','https://data.gov.ie/dataset/groundwater-wells-and-springs-ireland-roi-itm','CC BY 4.0','2025-10-10','2025-10-10',false,false,'Explicitly non-exhaustive; a missing record must never be interpreted as no well/spring exists.')
on conflict (source_key) do update set
  publisher=excluded.publisher,title=excluded.title,source_url=excluded.source_url,licence=excluded.licence,
  source_version=excluded.source_version,source_date=excluded.source_date,refreshed_at=now(),
  exhaustive=excluded.exhaustive,negative_inference_allowed=excluded.negative_inference_allowed,notes=excluded.notes;

create or replace function public.resolve_field_spatial_reference(p_field_geojson jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  f geometry;
  lpis jsonb;
  water jsonb;
  groundwater jsonb;
begin
  f := ST_SetSRID(ST_GeomFromGeoJSON(p_field_geojson::text), 4326);
  if f is null or ST_IsEmpty(f) then raise exception 'Invalid field geometry'; end if;

  select jsonb_build_object(
    'matched', count(*) > 0,
    'commonage', case when count(*)=0 then null else bool_or(commonage_indicator is true) end,
    'parcelCount', count(*),
    'maxOverlapRatio', coalesce(max(ST_Area(ST_Intersection(geom, f)::geography) / nullif(ST_Area(f::geography),0)),0),
    'sourceKey', 'dafm_lpis_2025',
    'sourceVersion', max(source_version)
  ) into lpis
  from public.spatial_lpis_parcels
  where ST_Intersects(geom, f)
    and ST_Area(ST_Intersection(geom, f)::geography) > 1;

  select to_jsonb(x) into water from (
    select source_feature_id as "featureId", feature_name as "featureName", source_version as "sourceVersion",
      ST_Distance(geom::geography, f::geography) as "distanceM"
    from public.spatial_watercourses
    where ST_DWithin(geom::geography, f::geography, 2000)
    order by geom <-> f
    limit 1
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x."distanceM"), '[]'::jsonb) into groundwater from (
    select source_feature_id as "featureId", feature_type as "featureType", feature_name as "featureName",
      location_accuracy_m as "locationAccuracyM", source_key as "sourceKey", source_version as "sourceVersion",
      ST_Distance(geom::geography, f::geography) as "distanceM",
      ST_Intersects(geom, f) as "intersectsField"
    from public.spatial_groundwater_features
    where ST_DWithin(geom::geography, f::geography, 2000)
    order by geom <-> f
    limit 25
  ) x;

  return jsonb_build_object('lpis',lpis,'nearestWatercourse',water,'groundwaterFeatures',groundwater);
end;
$$;

grant execute on function public.resolve_field_spatial_reference(jsonb) to authenticated;
revoke all on function public.resolve_field_spatial_reference(jsonb) from anon;
