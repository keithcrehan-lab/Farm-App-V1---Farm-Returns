import type { FarmLegalSpatialAutoAssessmentResult } from "@/app/actions/farm";

const fields = (count: number) => `${count} field${count === 1 ? "" : "s"}`;

/**
 * Farmer-facing outcome of the farm-level automatic DAFM LPIS / EPA check.
 * Each public source reports its own result: a service failure is never
 * described as a completed check, and "nothing found" is never collapsed
 * into a generic message — the farmer is told which evidence remains and
 * why. Presentation only; the assessment itself is server-side.
 */
export function legalSpatialAutoStatusMessage(
  result: FarmLegalSpatialAutoAssessmentResult,
): string {
  const notFoundWater = Math.max(
    0,
    result.unresolvedWater - result.unavailableWater,
  );
  const notFoundCommonage = Math.max(
    0,
    result.unresolvedCommonage - result.unavailableCommonage,
  );
  const sentences: string[] = [];
  if (result.updated > 0)
    sentences.push(
      `Farm Return filled ${result.updated} mapped field evidence record${result.updated === 1 ? "" : "s"} automatically.`,
    );
  if (result.unavailableWater > 0)
    sentences.push(
      `The EPA watercourse service is currently unavailable for ${fields(result.unavailableWater)}; those distances stay unknown and are not assumed. Try again later or enter the nearest watercourse on the field's legal checks.`,
    );
  if (notFoundWater > 0)
    sentences.push(
      `No EPA-mapped watercourse was found within 1 km of ${fields(notFoundWater)}; Farm Return does not treat that as no watercourse. Confirm the nearest watercourse on the field's legal checks.`,
    );
  if (result.unavailableCommonage > 0)
    sentences.push(
      `The DAFM commonage service is currently unavailable for ${fields(result.unavailableCommonage)}. You can confirm remaining commonage status once for the farm below.`,
    );
  if (notFoundCommonage > 0)
    sentences.push(
      `No DAFM LPIS parcel matched ${fields(notFoundCommonage)}, so commonage status is still unknown. Confirm it for the farm below or on the field.`,
    );
  if (sentences.length === 0)
    sentences.push(
      "Automatic public-data checks completed. Any remaining items genuinely need confirmation.",
    );
  return sentences.join(" ");
}
