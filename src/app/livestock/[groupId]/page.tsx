import { mockLivestockGroups } from "@/data/mock-farm";
import { LivestockEconomicsView } from "./LivestockEconomicsView";

export function generateStaticParams() {
  return mockLivestockGroups.map((g) => ({ groupId: g.id }));
}

export default async function LivestockEconomicsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <LivestockEconomicsView groupId={groupId} />;
}
