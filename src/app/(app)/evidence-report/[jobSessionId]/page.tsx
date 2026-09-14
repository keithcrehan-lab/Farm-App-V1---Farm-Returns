/**
 * Fertiliser Vertical V1, Checkpoint 4 — Scientific Evidence Report.
 * Thin server wrapper, same shape as `soil-sample/[fieldId]/page.tsx` —
 * this file only resolves the dynamic route param; the real report is
 * assembled server-side by `getScientificEvidenceReportAction` and
 * rendered by the client component below.
 */
import { EvidenceReportPageClient } from "./EvidenceReportPageClient";

export default async function EvidenceReportPage({ params }: { params: Promise<{ jobSessionId: string }> }) {
  const { jobSessionId } = await params;
  return <EvidenceReportPageClient jobSessionId={jobSessionId} />;
}
