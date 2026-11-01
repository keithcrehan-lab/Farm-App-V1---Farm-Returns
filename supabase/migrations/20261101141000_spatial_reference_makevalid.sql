create or replace function public.resolve_field_spatial_reference(p_field_geojson jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  f geometry;
  fv geometry;
  lpis jsonb;
  water jsonb;
  groundwater jsonb;
  coverage jsonb;
begin
  f := ST_SetSRID(ST_GeomFromGeoJSON(p_field_geojson::text), 4326);
  if f is null or ST_IsEmpty(f) then raise exception 'Invalid field geometry'; end if;
  fv := ST_CollectionExtract(ST_MakeValid(f), 3);
  if fv is null or ST_IsEmpty(fv) then raise exception 'Field geometry cannot be normalised to polygon'; end if;

  with candidates as (
    select source_version, commonage_indicator,
      ST_CollectionExtract(ST_MakeValid(geom), 3) as g
    from public.spatial_lpis_parcels
    where ST_Intersects(ST_Envelope(geom), ST_Envelope(fv))
  ), parcel_overlaps as (
    select source_version, commonage_indicator,
      ST_Area(ST_Intersection(g, fv)::geography) as overlap_m2
    from candidates
    where g is not null and not ST_IsEmpty(g) and ST_Intersects(g, fv)
  )
  select jsonb_build_object(
    'matched', count(*) > 0,
    'commonage', case when count(commonage_indicator)=0 then null else bool_or(commonage_indicator) end,
    'parcelCount', count(*),
    'parcelsWithUsableIndicator', count(commonage_indicator),
    'maxOverlapRatio', coalesce(max(overlap_m2 / nullif(ST_Area(fv::geography),0)),0),
    'sourceKey', 'dafm_lpis_2025',
    'sourceVersion', max(source_version)
  ) into lpis
  from parcel_overlaps
  where overlap_m2 > 1;

  select to_jsonb(x) into water from (
    select source_feature_id as "featureId", feature_name as "featureName", source_version as "sourceVersion",
      ST_Distance(geom::geography, fv::geography) as "distanceM"
    from public.spatial_watercourses
    where ST_DWithin(geom::geography, fv::geography, 2000)
    order by ST_Distance(geom::geography, fv::geography)
    limit 1
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x."distanceM"), '[]'::jsonb) into groundwater from (
    select source_feature_id as "featureId", feature_type as "featureType", feature_name as "featureName",
      location_accuracy_m as "locationAccuracyM", source_key as "sourceKey", source_version as "sourceVersion",
      ST_Distance(geom::geography, fv::geography) as "distanceM",
      ST_Intersects(ST_MakeValid(geom), fv) as "intersectsField"
    from public.spatial_groundwater_features
    where ST_DWithin(geom::geography, fv::geography, 2000)
    order by ST_Distance(geom::geography, fv::geography)
    limit 25
  ) x;

  select jsonb_object_agg(source_key, covered) into coverage from (
    select s.source_key,
      exists(
        select 1 from public.spatial_reference_coverage c
        where c.source_key=s.source_key and c.source_version=s.source_version and c.status='complete'
          and ST_Covers(ST_MakeValid(c.coverage), fv)
      ) as covered
    from public.spatial_reference_sources s
    where s.source_key in ('dafm_lpis_2025','epa_water_flow_network','gsi_public_supply_spa','gsi_group_scheme_spa','gsi_wells_springs')
  ) c;

  return jsonb_build_object(
    'lpis',coalesce(lpis,'{}'::jsonb),
    'nearestWatercourse',water,
    'groundwaterFeatures',groundwater,
    'coverage',coalesce(coverage,'{}'::jsonb)
  );
end;
$$;

revoke all on function public.resolve_field_spatial_reference(jsonb) from public;
revoke all on function public.resolve_field_spatial_reference(jsonb) from anon;
grant execute on function public.resolve_field_spatial_reference(jsonb) to authenticated;
