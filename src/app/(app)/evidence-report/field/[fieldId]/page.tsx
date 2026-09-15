/**
 * Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
 * F6/F10) — the Scientific Evidence Report reachable from the
 * legacy/manual "Add soil test" workflow, keyed by field rather than by
 * job session. Thin server wrapper, same shape as
 * `evidence-report/[jobSessionId]/page.tsx` — the real report is
 * assembled server-side by `getScientificEvidenceReportForFieldAction`
 * and rendered by the same client component the GPS-guided path uses.
 */
import { EvidenceReportPageClient } from "../../[jobSessionId]/EvidenceReportPageClient";

export default async function EvidenceReportForFieldPage({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  return <EvidenceReportPageClient fieldId={fieldId} />;
}
