import "server-only";

/**
 * Real Mode Completion Phase 20 — supplier quotes (the farm-scoped half
 * of the market-data subsystem; see
 * `supabase/migrations/20260828050000_supplier_quotes.sql`'s header for
 * why the public reference-observation half stays as `market.ts`'s
 * existing sourced code constants rather than a new empty table).
 */
import { createClient } from "@/lib/supabase/server";

export interface SupplierQuote {
  id: string;
  farmId: string;
  supplierName: string;
  product: string;
  quantity: number | null;
  unit: string;
  priceEur: number;
  deliveryIncluded: boolean;
  quoteDate: string;
  validUntil: string | null;
  notes: string | null;
}

interface SupplierQuoteRow {
  id: string;
  farm_id: string;
  supplier_name: string;
  product: string;
  quantity: number | null;
  unit: string;
  price_eur: number;
  delivery_included: boolean;
  quote_date: string;
  valid_until: string | null;
  notes: string | null;
}

function rowToSupplierQuote(row: SupplierQuoteRow): SupplierQuote {
  return {
    id: row.id,
    farmId: row.farm_id,
    supplierName: row.supplier_name,
    product: row.product,
    quantity: row.quantity,
    unit: row.unit,
    priceEur: row.price_eur,
    deliveryIncluded: row.delivery_included,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    notes: row.notes,
  };
}

export async function listSupplierQuotesForFarm(farmId: string): Promise<SupplierQuote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_quotes")
    .select("*")
    .eq("farm_id", farmId)
    .order("quote_date", { ascending: false });
  if (error) throw error;

  return (data as SupplierQuoteRow[]).map(rowToSupplierQuote);
}

export interface NewSupplierQuoteInput {
  supplierName: string;
  product: string;
  quantity?: number;
  unit: string;
  priceEur: number;
  deliveryIncluded: boolean;
  quoteDate: string;
  validUntil?: string;
  notes?: string;
}

export async function createSupplierQuote(farmId: string, input: NewSupplierQuoteInput): Promise<SupplierQuote> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_quotes")
    .insert({
      farm_id: farmId,
      supplier_name: input.supplierName,
      product: input.product,
      quantity: input.quantity ?? null,
      unit: input.unit,
      price_eur: input.priceEur,
      delivery_included: input.deliveryIncluded,
      quote_date: input.quoteDate,
      valid_until: input.validUntil ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  return rowToSupplierQuote(data as SupplierQuoteRow);
}
