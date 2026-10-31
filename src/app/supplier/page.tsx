import { getSupplierPortalOverview } from "@/orchestration/supplier-portal";
import { SupplierNotice } from "@/components/supplier/SupplierShell";
import { SupplierOverview } from "@/components/supplier/SupplierOverview";
import { loadForSupplier } from "./load";

export default async function SupplierOverviewPage() {
  const overview = await loadForSupplier(() => getSupplierPortalOverview());
  if (overview.state === "no-access") return <SupplierNotice title="No supplier access">This account is not linked to a supplier.</SupplierNotice>;
  if (overview.state !== "ready") {
    return <SupplierNotice title="Overview unavailable">{overview.state === "unavailable" ? overview.message : "Not found."}</SupplierNotice>;
  }
  return <SupplierOverview overview={overview.value} />;
}
