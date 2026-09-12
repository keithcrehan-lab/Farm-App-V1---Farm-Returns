/**
 * Fertiliser Vertical V1, Checkpoint 1 — "Start Soil Sample" guided GPS
 * sampling screen (`docs/product/farm-return-next-v1.1/
 * SOIL_SAMPLING_ARCHITECTURE.md`). Thin server wrapper, same shape as
 * `nutrients/page.tsx` — the real field data comes from the already-
 * loaded client store (`useFields()`), not a second server fetch here;
 * this file only resolves the dynamic route param.
 */
import { SoilSamplePageClient } from "./SoilSamplePageClient";

export default async function SoilSamplePage({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  return <SoilSamplePageClient fieldId={fieldId} />;
}
