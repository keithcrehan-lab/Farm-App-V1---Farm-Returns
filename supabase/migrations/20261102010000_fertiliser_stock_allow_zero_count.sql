-- Fertiliser pilot gap closure: a farmer must be able to record that a
-- product's stock is used up. Stock records are full-replacement counts
-- (the latest record wins), so without a zero count an older positive
-- balance stays current and keeps reducing the quantity still to buy.
--
-- Forward-only and non-destructive: the check is only widened from
-- quantity > 0 to quantity >= 0. Every existing row already satisfies it.
alter table public.fertiliser_stock_records
  drop constraint if exists fertiliser_stock_records_quantity_check;

alter table public.fertiliser_stock_records
  add constraint fertiliser_stock_records_quantity_check
  check (quantity >= 0 and quantity = quantity and quantity < 'Infinity');
