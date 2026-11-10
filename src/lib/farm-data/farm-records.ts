import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FeedRecord, FeedRecordInput, PesticideApplication, RecordBook, SprayOperator } from "@/domain/farm-records";

/* eslint-disable @typescript-eslint/no-explicit-any */
const toFeed = (r: any): FeedRecord => ({
  id: r.id, receivedOn: r.received_on, supplierName: r.supplier_name, supplierAddress: r.supplier_address, product: r.product,
  feedType: r.feed_type, batchNumber: r.batch_number, quantity: Number(r.quantity), unit: r.unit,
  livestockGroupId: r.livestock_group_id, homeGrown: Boolean(r.home_grown), notes: r.notes,
});
const toOperator = (r: any): SprayOperator => ({
  id: r.id, name: r.name, puNumber: r.pu_number, isContractor: Boolean(r.is_contractor), address: r.address, sprayerCert: r.sprayer_cert,
});
const toApplication = (r: any): PesticideApplication => ({
  id: r.id, sprayJobId: r.spray_job_id, appliedOn: r.applied_on, fieldId: r.field_id, lpisRef: r.lpis_ref, cropSituation: r.crop_situation,
  productName: r.product_name, pcsNumber: r.pcs_number, areaHa: Number(r.area_ha), rate: Number(r.rate), rateUnit: r.rate_unit,
  waterLHa: r.water_l_ha === null ? null : Number(r.water_l_ha), reason: r.reason, operatorId: r.operator_id,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listFeedRecords(farmId: string, from: string): Promise<FeedRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("feed_records").select("*").eq("farm_id", farmId).gte("received_on", from).order("received_on", { ascending: false }).limit(2000);
  if (error) throw error;
  return (data ?? []).map(toFeed);
}

export async function insertFeedRecord(farmId: string, r: FeedRecordInput): Promise<FeedRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("feed_records").insert({
    id: r.id, farm_id: farmId, received_on: r.receivedOn, supplier_name: r.supplierName.trim(), supplier_address: r.supplierAddress?.trim() || null,
    product: r.product.trim(), feed_type: r.feedType, batch_number: r.batchNumber?.trim() || null, quantity: r.quantity, unit: r.unit,
    livestock_group_id: r.livestockGroupId, home_grown: Boolean(r.homeGrown), notes: r.notes?.trim() || null,
  }).select("*").single();
  if (error) throw error;
  return toFeed(data);
}

export async function listSprayOperators(farmId: string): Promise<SprayOperator[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("spray_operators").select("*").eq("farm_id", farmId).order("created_at", { ascending: true }).limit(200);
  if (error) throw error;
  return (data ?? []).map(toOperator);
}

export async function insertSprayOperator(farmId: string, o: SprayOperator): Promise<SprayOperator> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("spray_operators").insert({
    id: o.id, farm_id: farmId, name: o.name.trim(), pu_number: o.puNumber.trim(), is_contractor: o.isContractor,
    address: o.address?.trim() || null, sprayer_cert: o.sprayerCert?.trim() || null,
  }).select("*").single();
  if (error) throw error;
  return toOperator(data);
}

export async function listPesticideApplications(farmId: string, from: string): Promise<PesticideApplication[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pesticide_applications").select("*").eq("farm_id", farmId).gte("applied_on", from).order("applied_on", { ascending: false }).limit(2000);
  if (error) throw error;
  return (data ?? []).map(toApplication);
}

export async function insertPesticideRows(farmId: string, rows: Array<Omit<PesticideApplication, "fieldName">>): Promise<PesticideApplication[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pesticide_applications").insert(rows.map((r) => ({
    id: r.id, farm_id: farmId, spray_job_id: r.sprayJobId, applied_on: r.appliedOn, field_id: r.fieldId, lpis_ref: r.lpisRef,
    crop_situation: r.cropSituation, product_name: r.productName.trim(), pcs_number: r.pcsNumber.trim(), area_ha: r.areaHa,
    rate: r.rate, rate_unit: r.rateUnit, water_l_ha: r.waterLHa, reason: r.reason.trim(), operator_id: r.operatorId,
  }))).select("*");
  if (error) throw error;
  return (data ?? []).map(toApplication);
}

export async function listBookConfirmations(farmId: string): Promise<Partial<Record<RecordBook, string>>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("record_book_confirmations").select("book,not_used_confirmed_on").eq("farm_id", farmId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.book, r.not_used_confirmed_on]));
}

export async function upsertBookConfirmation(farmId: string, book: RecordBook, on: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("record_book_confirmations").upsert({ farm_id: farmId, book, not_used_confirmed_on: on }, { onConflict: "farm_id,book" });
  if (error) throw error;
}
