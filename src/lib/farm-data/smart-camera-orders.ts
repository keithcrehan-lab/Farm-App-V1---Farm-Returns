import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { normaliseGtin } from '@/lib/smart-camera/fertiliser-products';
import type { DeliveryFormInput, OrderFormInput } from '@/lib/smart-camera/order-forms';

export interface CameraOrder {
  id: string;
  productGtin: string;
  productName: string;
  supplierName: string;
  supplierReference: string;
  orderedKg: number;
  receivedKg: number;
}

export async function createCameraOrder(farmId: string, input: OrderFormInput): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('smart_camera_purchase_orders').insert({
    farm_id: farmId, product_gtin: normaliseGtin(input.productGtin),
    supplier_name: input.supplierName.trim(), supplier_reference: input.supplierReference.trim(),
    ordered_kg: input.orderedKg, confirmed_date: input.confirmedDate,
    confirmation_source: input.confirmationSource.trim(),
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function listCameraOrders(farmId: string): Promise<CameraOrder[]> {
  const supabase = await createClient();
  const { data: orders, error } = await supabase.from('smart_camera_purchase_orders')
    .select('id,product_gtin,supplier_name,supplier_reference,ordered_kg').eq('farm_id', farmId).order('created_at', { ascending: false });
  if (error) throw error;
  if (!orders?.length) return [];
  const ids = orders.map((o) => o.id);
  const codes = [...new Set(orders.map((o) => o.product_gtin))];
  const [receiptsResult, productsResult] = await Promise.all([
    supabase.from('smart_camera_delivery_receipts').select('order_id,received_kg').eq('farm_id',farmId).in('order_id',ids),
    supabase.from('smart_camera_verified_fertiliser_products').select('gtin,product_name').in('gtin',codes),
  ]);
  if (receiptsResult.error) throw receiptsResult.error;
  if (productsResult.error) throw productsResult.error;
  const names = new Map((productsResult.data ?? []).map((p) => [p.gtin, p.product_name]));
  return orders.map((order) => ({
    id: order.id,
    productGtin: order.product_gtin,
    productName: names.get(order.product_gtin) ?? 'Catalogue identity unavailable',
    supplierName: order.supplier_name,
    supplierReference: order.supplier_reference,
    orderedKg: Number(order.ordered_kg),
    receivedKg: (receiptsResult.data ?? []).filter((receipt) => receipt.order_id === order.id).reduce((sum, receipt) => sum + Number(receipt.received_kg), 0),
  }));
}

/** RLS + atomic owner-authorised, idempotent RPC, never a stock mutation. */
export async function recordCameraDelivery(input: DeliveryFormInput): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('record_smart_camera_delivery', {
    p_order_id: input.orderId,
    p_product_gtin: normaliseGtin(input.productGtin),
    p_received_kg: input.receivedKg,
    p_delivery_reference: input.deliveryReference.trim(),
    p_received_date: input.receivedDate,
  });
  if (error) throw error;
  return data as string;
}
