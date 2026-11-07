-- Smart Camera: farmer-confirmed purchase order and immutable delivery receipt.
-- No quote or supplier offer is implicitly accepted. No automatic stock mutation.
-- Apply in development only after independent review and RLS testing.
create table public.smart_camera_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  product_gtin text not null references public.smart_camera_verified_fertiliser_products(gtin),
  supplier_name text not null check (length(btrim(supplier_name)) between 1 and 200),
  supplier_reference text not null check (length(btrim(supplier_reference)) between 1 and 120),
  ordered_kg numeric not null check (ordered_kg > 0 and ordered_kg < 100000000),
  confirmed_date date not null,
  confirmation_source text not null check (length(btrim(confirmation_source)) between 1 and 240),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  unique(id, farm_id)
);
create index smart_camera_orders_farm_idx on public.smart_camera_purchase_orders(farm_id);
-- A repeated farmer submission must not silently create a second order line.
create unique index smart_camera_orders_no_duplicate_reference
  on public.smart_camera_purchase_orders(farm_id, product_gtin, lower(btrim(supplier_name)), lower(btrim(supplier_reference)));
alter table public.smart_camera_purchase_orders enable row level security;
create policy smart_camera_orders_owner_read on public.smart_camera_purchase_orders
  for select to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
create policy smart_camera_orders_owner_insert on public.smart_camera_purchase_orders
  for insert to authenticated with check (created_by = (select auth.uid()) and exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
revoke all on public.smart_camera_purchase_orders from public, anon, authenticated;
grant select, insert on public.smart_camera_purchase_orders to authenticated;

create table public.smart_camera_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null,
  order_id uuid not null,
  product_gtin text not null,
  received_kg numeric not null check (received_kg > 0 and received_kg < 100000000),
  delivery_reference text not null check (length(btrim(delivery_reference)) between 1 and 120),
  received_date date not null,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  foreign key (order_id, farm_id) references public.smart_camera_purchase_orders(id, farm_id),
  unique (farm_id, order_id, delivery_reference)
);
create index smart_camera_deliveries_order_idx on public.smart_camera_delivery_receipts(order_id);
alter table public.smart_camera_delivery_receipts enable row level security;
create policy smart_camera_deliveries_owner_read on public.smart_camera_delivery_receipts
  for select to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
revoke all on public.smart_camera_delivery_receipts from public, anon, authenticated;
grant select on public.smart_camera_delivery_receipts to authenticated;

-- Atomic and idempotent farmer confirmation. A replay with different values
-- is rejected rather than treating a duplicate reference as successful.
create function public.record_smart_camera_delivery(
  p_order_id uuid, p_product_gtin text, p_received_kg numeric,
  p_delivery_reference text, p_received_date date
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.smart_camera_purchase_orders%rowtype;
  v_received numeric;
  v_existing public.smart_camera_delivery_receipts%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_received_kg is null or p_received_kg <= 0 or p_received_kg >= 100000000
     or p_delivery_reference is null or length(btrim(p_delivery_reference)) not between 1 and 120
     or p_received_date is null or p_received_date > current_date then
     raise exception 'Invalid delivery information';
  end if;
  select po.* into v_order from public.smart_camera_purchase_orders po
    join public.farms f on f.id = po.farm_id
    where po.id = p_order_id and f.user_id = auth.uid() for update of po;
  if not found then raise exception 'Purchase order not found for current farm'; end if;
  if v_order.product_gtin <> p_product_gtin then raise exception 'Product does not match order'; end if;
  if p_received_date < v_order.confirmed_date then raise exception 'Delivery predates confirmed order'; end if;
  select * into v_existing from public.smart_camera_delivery_receipts
    where farm_id = v_order.farm_id and order_id = p_order_id and delivery_reference = btrim(p_delivery_reference);
  if found then
    if v_existing.product_gtin = p_product_gtin and v_existing.received_kg = p_received_kg
       and v_existing.received_date = p_received_date then
      return v_existing.id;
    end if;
    raise exception 'Delivery reference already used for different details';
  end if;
  select coalesce(sum(received_kg),0) into v_received
    from public.smart_camera_delivery_receipts where order_id = p_order_id;
  if v_received + p_received_kg > v_order.ordered_kg then
    raise exception 'Received quantity exceeds confirmed order';
  end if;
  insert into public.smart_camera_delivery_receipts
    (farm_id, order_id, product_gtin, received_kg, delivery_reference, received_date, recorded_by)
    values (v_order.farm_id, p_order_id, p_product_gtin, p_received_kg,
      btrim(p_delivery_reference), p_received_date, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_smart_camera_delivery(uuid,text,numeric,text,date) from public, anon;
grant execute on function public.record_smart_camera_delivery(uuid,text,numeric,text,date) to authenticated;
