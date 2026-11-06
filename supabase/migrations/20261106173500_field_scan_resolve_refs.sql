-- Field scan: resolve a farmer's selected public LPIS refs independently
-- of the viewport used to discover them. This lets Eircode search and outfarm
-- scans save canonical server-side geometry without trusting browser polygons.

create or replace function public.resolve_lpis_parcels_by_feature_ids(
  p_feature_ids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  ids text[];
  candidates jsonb;
begin
  ids := (
    select array_agg(distinct id order by id)
    from (
      select trim(value) as id
      from unnest(coalesce(p_feature_ids, array[]::text[])) as value
      where trim(value) <> ''
      limit 80
    ) x
  );

  if coalesce(array_length(ids, 1), 0) = 0 then
    return jsonb_build_object(
      'sourceLabel', 'DAFM LPIS 2025',
      'sourceYear', '2025',
      'coverageAtFarm', true,
      'candidates', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(q.candidate order by q.feature_id), '[]'::jsonb)
  into candidates
  from (
    select
      p.source_feature_id as feature_id,
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
      and p.source_feature_id = any(ids)
  ) q;

  return jsonb_build_object(
    'sourceLabel', 'DAFM LPIS 2025',
    'sourceYear', '2025',
    'coverageAtFarm', true,
    'candidates', candidates
  );
end;
$$;

revoke all on function public.resolve_lpis_parcels_by_feature_ids(text[]) from public;
revoke all on function public.resolve_lpis_parcels_by_feature_ids(text[]) from anon;
grant execute on function public.resolve_lpis_parcels_by_feature_ids(text[]) to authenticated;
