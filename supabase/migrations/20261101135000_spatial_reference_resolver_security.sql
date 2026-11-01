-- Explicitly remove PostgreSQL's default PUBLIC EXECUTE grant. RLS already
-- protects the underlying reference tables, but the resolver itself is an
-- authenticated app capability and should not be callable anonymously.
revoke all on function public.resolve_field_spatial_reference(jsonb) from public;
revoke all on function public.resolve_field_spatial_reference(jsonb) from anon;
grant execute on function public.resolve_field_spatial_reference(jsonb) to authenticated;
