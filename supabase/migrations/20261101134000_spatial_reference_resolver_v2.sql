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
  coverage jsonb;
begin
  f := ST_SetSRID(ST_GeomFromGeoJSON(p_field_geojson::text), 4326);
  if f is null or ST_IsEmpty(f) then raise exception 'Invalid field geometry'; end if;

  select jsonb_build_object(
    'matched', count(*) > 0,
    'commonage', case when count(commonage_indicator)=0 then null else bool_or(commonage_indicator) end,
    'parcelCount', count(*),
    'parcelsWithUsableIndicator', count(commonage_indicator),
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
    order by ST_Distance(geom::geography, f::geography)
    limit 1
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x."distanceM"), '[]'::jsonb) into groundwater from (
    select source_feature_id as "featureId", feature_type as "featureType", feature_name as "featureName",
      location_accuracy_m as "locationAccuracyM", source_key as "sourceKey", source_version as "sourceVersion",
      ST_Distance(geom::geography, f::geography) as "distanceM",
      ST_Intersects(geom, f) as "intersectsField"
    from public.spatial_groundwater_features
    where ST_DWithin(geom::geography, f::geography, 2000)
    order by ST_Distance(geom::geography, f::geography)
    limit 25
  ) x;

  select jsonb_object_agg(source_key, covered) into coverage from (
    select s.source_key,
      exists(
        select 1 from public.spatial_reference_coverage c
        where c.source_key=s.source_key and c.source_version=s.source_version and c.status='complete'
          and ST_Covers(c.coverage, f)
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
