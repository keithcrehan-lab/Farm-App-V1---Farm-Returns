import { GrassWalkSummaryClient } from "./GrassWalkSummaryClient";

export const dynamic = "force-dynamic";

export default async function GrassWalkSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GrassWalkSummaryClient id={id} />;
}
