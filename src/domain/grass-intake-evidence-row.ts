import { parseGrassIntakeEvidence, type GrassIntakeLedgerRecord } from "./grass-intake-evidence-ledger";

/** Strict translation from database snake_case into the versioned evidence contract.
 * Never coerce missing/null dates or unknown payloads into scientific evidence.
 */
export interface GrassIntakeEvidenceRow {
  id: string;
  farm_id: string;
  kind: string;
  payload: unknown;
  effective_from: string;
  effective_to: string | null;
  recorded_at: string;
  source: string;
  supersedes_id: string | null;
}

export function parseGrassIntakeEvidenceRow(row: GrassIntakeEvidenceRow, expectedFarmId: string): GrassIntakeLedgerRecord {
  if (row.farm_id !== expectedFarmId) throw new Error("grassEvidenceCrossFarmRow");
  const evidence = parseGrassIntakeEvidence({
    id: row.id,
    farmId: row.farm_id,
    recordedAt: row.recorded_at,
    effectiveFrom: row.effective_from,
    ...(row.effective_to === null ? {} : { effectiveTo: row.effective_to }),
    source: row.source,
    ...(row.supersedes_id === null ? {} : { supersedesId: row.supersedes_id }),
    payload: row.payload,
  });
  if (row.kind !== evidence.payload.kind) throw new Error("grassEvidenceKindMismatch");
  return evidence;
}
