import { FertiliserCalculationAuditClient } from "./FertiliserCalculationAuditClient";

export default async function FertiliserCalculationAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string }>;
}) {
  const params = await searchParams;
  return <FertiliserCalculationAuditClient fieldId={params.field} />;
}
