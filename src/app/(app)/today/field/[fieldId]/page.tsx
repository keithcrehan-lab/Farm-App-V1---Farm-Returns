/**
 * Farm Spatial V2 Phase 4 — the field nutrient plan reached from the Farm
 * map's field drawer. Thin server wrapper (same shape as
 * `soil-sample/[fieldId]/page.tsx`): the field comes from the already-loaded
 * client store; this file only resolves the dynamic route param.
 */
import { FieldNutrientPlanPageClient } from "./FieldNutrientPlanPageClient";

export default async function FieldNutrientPlanPage({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  return <FieldNutrientPlanPageClient fieldId={fieldId} />;
}
