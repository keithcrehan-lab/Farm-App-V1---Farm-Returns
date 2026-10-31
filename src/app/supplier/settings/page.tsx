import { SupplierNotice } from "@/components/supplier/SupplierShell";
import { SupplierSettingsForm } from "@/components/supplier/SupplierSettingsForm";
import { IRISH_COUNTIES } from "@/lib/irish-counties";
import { loadSupplierContext } from "../load";

export default async function SupplierSettingsPage() {
  const context = await loadSupplierContext();
  if (context.state !== "ready") {
    return <SupplierNotice title="Settings unavailable">{context.state === "unavailable" ? context.message : "This account is not linked to a supplier."}</SupplierNotice>;
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title text-fr-ink-900">Supplier settings</h1>
        <p className="text-sm text-fr-ink-600">
          {context.value.displayName}. The supplier name and who can access this account are managed by Farm Return.
        </p>
      </div>
      <SupplierSettingsForm context={context.value} counties={IRISH_COUNTIES.map((county) => county.name)} />
    </div>
  );
}
