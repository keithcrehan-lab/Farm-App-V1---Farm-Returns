import { FertiliserCalculationAuditClient } from "./FertiliserCalculationAuditClient";

export default async function FertiliserCalculationAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string; season?: string }>;
}) {
  const params = await searchParams;
  // Only a four-digit season is honoured; anything else falls back to the
  // current season inside the actions rather than a guessed year.
  const planningSeason =
    params.season && /^\d{4}$/.test(params.season) ? params.season : undefined;
  return (
    <FertiliserCalculationAuditClient
      fieldId={params.field}
      planningSeason={planningSeason}
    />
  );
}
