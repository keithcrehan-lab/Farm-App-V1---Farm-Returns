/**
 * Render the actual Teagasc N table that was recorded in the sealed
 * calculation trace. No crop-system inference or hardcoded Table 12-3.
 */
export function grazingNSourceLabel(ruleId: string, isClover: boolean): string {
  if (isClover) return "N — clover strategy";
  if (ruleId.includes("TABLE_12_2")) return "N — Table 12-2";
  if (ruleId.includes("TABLE_12_3")) return "N — Table 12-3";
  return "N — source not verified";
}
