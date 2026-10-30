import { redirect } from "next/navigation";

/**
 * Compatibility route only. Field-specific nutrient planning now lives in
 * the field workspace so crop, soil, legal evidence and recommendation are
 * captured/reviewed in one place rather than two competing planners.
 */
export default async function NutrientsPage({ searchParams }: { searchParams: Promise<{ field?: string }> }) {
  const params = await searchParams;
  if (params.field) {
    redirect(`/fields?field=${encodeURIComponent(params.field)}&chapter=nutrients`);
  }
  redirect("/fields");
}
