/**
 * Supplier Portal — `/supplier/...`. Access requires an active
 * `supplier_portal_members` row for the signed-in account, resolved
 * server-side from the session (never from the URL or the client).
 * `src/proxy.ts` already requires a signed-in user for this path. The
 * layout is not the only gate: every page's reads go through RPCs that
 * re-check membership, and every Server Action re-checks it again.
 *
 * Mock mode (no Supabase configured) has no membership to check, so the
 * portal is unavailable rather than showing a fabricated supplier.
 */
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SupplierShell, SupplierNotice } from "@/components/supplier/SupplierShell";
import { loadSupplierContext } from "./load";

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <SupplierNotice title="Supplier portal unavailable">
        The supplier portal needs a configured Farm Return database. Nothing is shown in demo mode.
      </SupplierNotice>
    );
  }

  const context = await loadSupplierContext();
  if (context.state === "unavailable") {
    return <SupplierNotice title="Supplier portal unavailable">{context.message}</SupplierNotice>;
  }
  if (context.state !== "ready") {
    return (
      <SupplierNotice title="No supplier access">
        This account is not linked to a supplier. Farm Return links supplier accounts manually — contact the Farm Return team if you
        supply fertiliser and should have access.
      </SupplierNotice>
    );
  }

  return (
    <SupplierShell supplierName={context.value.displayName} role={context.value.role}>
      {children}
    </SupplierShell>
  );
}
