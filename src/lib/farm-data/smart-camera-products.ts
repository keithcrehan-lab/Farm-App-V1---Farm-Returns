import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { normaliseGtin, type VerifiedFertiliserProduct } from '@/lib/smart-camera/fertiliser-products';

/** Only curated database rows are authoritative. No fallback model/guess. */
export async function findVerifiedFertiliserProduct(code: string): Promise<VerifiedFertiliserProduct | null> {
  const gtin = normaliseGtin(code);
  if (!gtin) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('smart_camera_verified_fertiliser_products')
    .select('gtin,product_name,declared_analysis,source_name,source_url,reviewed_at')
    .eq('gtin', gtin).eq('is_active', true).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    barcode: data.gtin,
    productName: data.product_name,
    sourceName: data.source_name,
    sourceUrl: data.source_url,
    reviewedAt: data.reviewed_at,
    ...(data.declared_analysis ? { declaredAnalysis: data.declared_analysis } : {}),
  };
}
