import { GrassPageClient } from "./GrassPageClient";
import { isGrassIntakePreviewAvailableForCurrentUser } from "@/lib/farm-data/grass-intake-preview";

export default async function GrassPage({ searchParams }: { searchParams: Promise<{ field?: string | string[] }> }) {
  const { field } = await searchParams;
  // OFF by default: with the private flag unset this returns false without any query.
  const intakePreview = await isGrassIntakePreviewAvailableForCurrentUser();
  return <GrassPageClient initialFieldId={typeof field === "string" ? field : undefined} intakePreview={intakePreview} />;
}
