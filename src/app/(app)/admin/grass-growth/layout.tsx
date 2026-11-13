import { notFound } from "next/navigation";
import { canCurrentUserManageRegionalGrassGrowth } from "@/lib/farm-data/regional-grass-admin";

/** Direct URL access is protected as well as the More menu and actions. */
export default async function RegionalGrassGrowthAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await canCurrentUserManageRegionalGrassGrowth())) notFound();
  return children;
}
