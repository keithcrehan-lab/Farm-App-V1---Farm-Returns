'use server';

import { getFarmForCurrentUser } from '@/lib/farm-data/farms';
import { findVerifiedFertiliserProduct } from '@/lib/farm-data/smart-camera-products';
import { normaliseGtin, type VerifiedFertiliserProduct } from '@/lib/smart-camera/fertiliser-products';

export type ProductScanResult =
  | { status: 'invalid' | 'unmatched' | 'unavailable' }
  | { status: 'verified'; product: VerifiedFertiliserProduct };

export async function lookupScannedFertiliserProductAction(code: string): Promise<ProductScanResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: 'unavailable' };
  if (!normaliseGtin(code)) return { status: 'invalid' };
  try {
    const product = await findVerifiedFertiliserProduct(code);
    return product ? { status: 'verified', product } : { status: 'unmatched' };
  } catch (err) {
    console.error('[Smart Camera] curated product catalogue unavailable', err);
    return { status: 'unavailable' };
  }
}

import { createCameraOrder, listCameraOrders, recordCameraDelivery, type CameraOrder } from '@/lib/farm-data/smart-camera-orders';
import { validateDeliveryInput, validateOrderInput, type DeliveryFormInput, type OrderFormInput } from '@/lib/smart-camera/order-forms';

export async function listSmartCameraOrdersAction(): Promise<CameraOrder[]> {
  if (process.env.SMART_CAMERA_ORDERS_ENABLED !== 'true') throw new Error('Order recording is not enabled');
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error('Farm sign-in required');
  return listCameraOrders(farm.id);
}

export async function confirmSmartCameraPurchaseOrderAction(input: OrderFormInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (process.env.SMART_CAMERA_ORDERS_ENABLED !== 'true') return { ok: false, error: 'Order recording is not enabled yet' };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: 'Farm sign-in required' };
  const validation = validateOrderInput(input, new Date().toISOString().slice(0,10));
  if (validation) return { ok: false, error: validation };
  try {
    const product = await findVerifiedFertiliserProduct(input.productGtin);
    if (!product) return { ok: false, error: 'Product is not in the verified catalogue' };
    return { ok: true, id: await createCameraOrder(farm.id,input) };
  } catch {
    return { ok: false, error: 'Could not save the confirmed purchase order. Check the catalogue and try again.' };
  }
}

export async function recordSmartCameraDeliveryAction(input: DeliveryFormInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (process.env.SMART_CAMERA_ORDERS_ENABLED !== 'true') return { ok: false, error: 'Delivery recording is not enabled yet' };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: 'Farm sign-in required' };
  const validation = validateDeliveryInput(input,new Date().toISOString().slice(0,10));
  if (validation) return { ok: false, error: validation };
  try {
    // The RPC itself checks farm ownership, exact product, available quantity, and idempotency.
    return { ok: true, id: await recordCameraDelivery(input) };
  } catch {
    return { ok: false, error: 'Delivery not recorded. Check the accepted order, remaining quantity and docket reference.' };
  }
}

import { lookupAcrossFreeProviders, type PublicBarcodeLookupResult } from '@/lib/smart-camera/public-product-lookup';

/** Read-only test workflow. No source responses are stored or sent to stock/finance. */
export async function lookupFreeBarcodeSourcesAction(code: string): Promise<PublicBarcodeLookupResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: 'not_signed_in' };
  if (typeof code !== 'string' || code.length > 32 || !normaliseGtin(code)) return { status: 'invalid' };
  return lookupAcrossFreeProviders(code);
}
