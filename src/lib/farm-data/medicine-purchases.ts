import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MedicinePurchaseInput } from "@/lib/medicines/purchase-form";

export interface MedicineProductLink {
  gtin: string;
  hpraLicenceNumber: string;
  productName: string;
}

export interface MedicinePurchase {
  id: string;
  gtin: string | null;
  hpraLicenceNumber: string;
  productName: string;
  legalStatus: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  dateReceived: string;
  supplierName: string;
  supplierAddress: string;
  vetName: string | null;
  prescriptionId: string | null;
  captureSource: string;
}

export async function findMedicineProductLink(gtin: string): Promise<MedicineProductLink | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("medicine_product_links")
    .select("gtin,hpra_licence_number,product_name").eq("gtin", gtin).maybeSingle();
  if (error) throw error;
  return data ? { gtin: data.gtin, hpraLicenceNumber: data.hpra_licence_number, productName: data.product_name } : null;
}

/** Creates the shared link if none exists. An existing link is left untouched. */
export async function ensureMedicineProductLink(link: MedicineProductLink): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("medicine_product_links")
    .insert({ gtin: link.gtin, hpra_licence_number: link.hpraLicenceNumber, product_name: link.productName });
  if (error && error.code !== "23505") throw error;
}

export async function createMedicinePurchase(
  farmId: string,
  input: MedicinePurchaseInput,
  product: { name: string; legalStatus: string },
): Promise<string> {
  const supabase = await createClient();
  const blank = (v: string) => (v && v.trim() ? v.trim() : null);
  const { data, error } = await supabase.from("medicine_purchases").insert({
    farm_id: farmId,
    gtin: input.gtin,
    hpra_licence_number: input.hpraLicenceNumber.trim(),
    product_name: product.name,
    legal_status: product.legalStatus || null,
    batch_number: blank(input.batchNumber),
    expiry_date: blank(input.expiryDate),
    quantity: input.quantity,
    date_received: input.dateReceived,
    supplier_name: input.supplierName.trim(),
    supplier_address: input.supplierAddress.trim(),
    vet_name: blank(input.vetName),
    prescription_id: blank(input.prescriptionId),
    capture_source: input.captureSource,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function listMedicinePurchases(farmId: string, limit = 200): Promise<MedicinePurchase[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("medicine_purchases")
    .select("id,gtin,hpra_licence_number,product_name,legal_status,batch_number,expiry_date,quantity,date_received,supplier_name,supplier_address,vet_name,prescription_id,capture_source")
    .eq("farm_id", farmId)
    .order("date_received", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    gtin: r.gtin,
    hpraLicenceNumber: r.hpra_licence_number,
    productName: r.product_name,
    legalStatus: r.legal_status,
    batchNumber: r.batch_number,
    expiryDate: r.expiry_date,
    quantity: r.quantity,
    dateReceived: r.date_received,
    supplierName: r.supplier_name,
    supplierAddress: r.supplier_address,
    vetName: r.vet_name,
    prescriptionId: r.prescription_id,
    captureSource: r.capture_source,
  }));
}
