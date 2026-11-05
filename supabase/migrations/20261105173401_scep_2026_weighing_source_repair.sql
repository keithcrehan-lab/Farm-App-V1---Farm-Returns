-- Provenance-only repair for the SCEP 2026 weighing rule.
--
-- The initial seed used a combined Year 4 evidence extract as the weighing
-- rule source. This adds the exact ICBF 2026 weighing page as its own
-- fingerprinted source and rebinds only that rule's source_id. No rule
-- parameters, consequence or farmer data changes.

insert into public.scheme_sources (
  scheme_version_id,
  source_key,
  authority_tier,
  publisher,
  title,
  url,
  publication_date,
  retrieved_at,
  last_verified_at,
  content_fingerprint_sha256,
  archived_storage_path
)
select
  v.id,
  'icbf-weighing-2026',
  'authoritative_secondary',
  'Irish Cattle Breeding Federation',
  'SCEP 2026 Weighing Requirements',
  'https://www.icbf.com/scep-2026-weighing-requirements/',
  null,
  '2026-11-05T00:00:00Z',
  '2026-11-05T00:00:00Z',
  'c364113cc9eae89026e572335bbdc8ad8e37945a483cc1ea13b0aa75ea4f9ebe',
  'docs/evidence/schemes/scep-2026-icbf-weighing.md'
from public.scheme_versions v
where v.scheme_key = 'scep'
  and v.scheme_year = 2026
  and v.rules_version = 'scep-2026-v1'
on conflict (scheme_version_id, source_key) do nothing;

update public.scheme_rules r
set source_id = src.id
from public.scheme_versions v,
     public.scheme_sources src
where r.scheme_version_id = v.id
  and src.scheme_version_id = v.id
  and src.source_key = 'icbf-weighing-2026'
  and v.scheme_key = 'scep'
  and v.scheme_year = 2026
  and v.rules_version = 'scep-2026-v1'
  and r.rule_key = 'scep-2026-action4-weighing';
