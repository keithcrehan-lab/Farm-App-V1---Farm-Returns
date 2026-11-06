import { GrassPageClient } from "./GrassPageClient";

export default async function GrassPage({ searchParams }: { searchParams: Promise<{ field?: string | string[] }> }) {
  const { field } = await searchParams;
  return <GrassPageClient initialFieldId={typeof field === "string" ? field : undefined} />;
}
