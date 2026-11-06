-- Field Scan V1 — provenance + bounded LPIS parcel discovery.
-- Reuses the internal DAFM 2025 LPIS PostGIS cache so the farmer-facing
-- workflow never downloads the national GeoPackage or trusts ownership from
-- a public parcel boundary.

alter table public.fields drop constraint if exists fields_polygon_source_check;
alter table public.fields
  add constraint fields_polygon_source_check
  check (
    polygon_source is null
    or polygon_source in ('farmer_drawn', 'lpis_imported', 'lpis_farmer_refined')
  );

create or replace function public.scan_lpis_parcels_near_point(
  p_lng double precision,
  p_lat double precision,
  p_radius_m integer default 1200,
  p_limit integer default 120
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  centre geometry;
  radius_m integer;
  result_limit integer;
  coverage_at_farm boolean;
  candidates jsonb;
begin
  if p_lng is null or p_lat is null
     or p_lng < -180 or p_lng > 180
     or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid scan centre';
  end if;

  radius_m := greatest(250, least(coalesce(p_radius_m, 1200), 3000));
  result_limit := greatest(1, least(coalesce(p_limit, 120), 200));
  centre := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

  select exists (
    select 1
    from public.spatial_reference_coverage c
    where c.source_key = 'dafm_lpis_2025'
      and c.source_version = '2025'
      and c.status = 'complete'
      and ST_Covers(c.coverage, centre)
  ) into coverage_at_farm;

  select coalesce(jsonb_agg(q.candidate order by q.distance_m, q.feature_id), '[]'::jsonb)
  into candidates
  from (
    select
      p.source_feature_id as feature_id,
      ST_Distance(p.geom::geography, centre::geography) as distance_m,
      jsonb_build_object(
        'id', concat('dafm-lpis-2025:', p.source_feature_id),
        'lpisRef', concat('dafm_lpis_2025:2025:', p.source_feature_id),
        'parcelLabel', p.parcel_label,
        'sourceFeatureId', p.source_feature_id,
        'sourceLabel', 'DAFM LPIS 2025',
        'sourceYear', '2025',
        'polygon', ST_AsGeoJSON(part.part)::jsonb
      ) as candidate
    from public.spatial_lpis_parcels p
    cross join lateral (
      select dumped.geom as part
      from ST_Dump(p.geom) as dumped
      where GeometryType(dumped.geom) = 'POLYGON'
      order by ST_Area(dumped.geom::geography) desc
      limit 1
    ) part
    where p.source_key = 'dafm_lpis_2025'
      and p.source_version = '2025'
      and ST_DWithin(p.geom::geography, centre::geography, radius_m)
    order by p.geom <-> centre
    limit result_limit
  ) q;

  return jsonb_build_object(
    'sourceLabel', 'DAFM LPIS 2025',
    'sourceYear', '2025',
    'coverageAtFarm', coverage_at_farm,
    'candidates', candidates
  );
end;
$$;

revoke all on function public.scan_lpis_parcels_near_point(double precision, double precision, integer, integer) from public;
revoke all on function public.scan_lpis_parcels_near_point(double precision, double precision, integer, integer) from anon;
grant execute on function public.scan_lpis_parcels_near_point(double precision, double precision, integer, integer) to authenticated;
