-- Farm Return cattle group production plans.
--
-- This is an operational planning store beside the frozen cattle engine.
-- It owns farmer-entered target/diet assumptions only. Market prices,
-- veterinary records and compliance evidence remain separate capabilities.

create table public.cattle_group_production_plans (
  group_id uuid primary key references public.livestock_groups (id) on delete cascade,
  farm_id uuid not null references public.farms (id) on delete cascade,
  target_weight_kg numeric null check (target_weight_kg is null or target_weight_kg > 0),
  target_date date null,
  diet_label text null,
  concentrate_kg_head_day numeric null check (concentrate_kg_head_day is null or concentrate_kg_head_day >= 0),
  concentrate_price_eur_t numeric null check (concentrate_price_eur_t is null or concentrate_price_eur_t >= 0),
  forage_cost_eur_head_day numeric null check (forage_cost_eur_head_day is null or forage_cost_eur_head_day >= 0),
  housing_cost_eur_head_day numeric null check (housing_cost_eur_head_day is null or housing_cost_eur_head_day >= 0),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cattle_group_production_plans is
  'Farmer-entered beef group production-plan assumptions. Does not imply market, health or compliance evidence.';

alter table public.cattle_group_production_plans enable row level security;

create policy cattle_group_production_plans_owner_select on public.cattle_group_production_plans
  for select to authenticated
  using (
    exists (
      select 1
      from public.farms f
      join public.livestock_groups g on g.farm_id = f.id
      where f.id = farm_id
        and g.id = group_id
        and g.farm_id = farm_id
        and f.user_id = (select auth.uid())
    )
  );

create policy cattle_group_production_plans_owner_insert on public.cattle_group_production_plans
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.farms f
      join public.livestock_groups g on g.farm_id = f.id
      where f.id = farm_id
        and g.id = group_id
        and g.farm_id = farm_id
        and f.user_id = (select auth.uid())
    )
  );

create policy cattle_group_production_plans_owner_update on public.cattle_group_production_plans
  for update to authenticated
  using (
    exists (
      select 1
      from public.farms f
      join public.livestock_groups g on g.farm_id = f.id
      where f.id = farm_id
        and g.id = group_id
        and g.farm_id = farm_id
        and f.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.farms f
      join public.livestock_groups g on g.farm_id = f.id
      where f.id = farm_id
        and g.id = group_id
        and g.farm_id = farm_id
        and f.user_id = (select auth.uid())
    )
  );

create policy cattle_group_production_plans_owner_delete on public.cattle_group_production_plans
  for delete to authenticated
  using (
    exists (
      select 1
      from public.farms f
      join public.livestock_groups g on g.farm_id = f.id
      where f.id = farm_id
        and g.id = group_id
        and g.farm_id = farm_id
        and f.user_id = (select auth.uid())
    )
  );

revoke all on public.cattle_group_production_plans from anon;
grant select, insert, update, delete on public.cattle_group_production_plans to authenticated;
