import "server-only";

/** Read-only, authenticated evidence ledger adapter. No public action, no
 * feature flag, and no writes until the draft migration is validated.
 * RLS is an additional safeguard, not a substitute for farm ownership checks.
 */
import { getFarmForCurrentUser } from "./farms";
import { createClient } from "@/lib/supabase/server";
import { parseGrassIntakeEvidenceRow, type GrassIntakeEvidenceRow } from "@/domain/grass-intake-evidence-row";
import type { GrassIntakeLedgerRecord } from "@/domain/grass-intake-evidence-ledger";

export type GrassEvidenceReadResult =
  | { status: "NO_AUTHORISED_FARM" }
  | { status: "AVAILABLE"; farmId: string; records: GrassIntakeLedgerRecord[] };

/** Paginates deterministically to avoid silently truncating an evidence history.
 * Includes superseded events; resolving effective evidence is a separate step.
 */
export async function listCurrentFarmGrassIntakeEvidence(): Promise<GrassEvidenceReadResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "NO_AUTHORISED_FARM" };
  const supabase = await createClient();
  const records: GrassIntakeLedgerRecord[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("grass_intake_evidence")
      .select("id,farm_id,kind,payload,effective_from,effective_to,recorded_at,source,supersedes_id")
      .eq("farm_id", farm.id)
      .order("recorded_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as GrassIntakeEvidenceRow[];
    records.push(...rows.map(row => parseGrassIntakeEvidenceRow(row, farm.id)));
    if (rows.length < pageSize) break;
  }
  return { status: "AVAILABLE", farmId: farm.id, records };
}
