"use client";

/**
 * Supplier Portal shell — a separate, minimal chrome (no farmer
 * navigation), the same choice `src/app/operator/layout.tsx` made for
 * operators.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/supplier", label: "Overview", exact: true },
  { href: "/supplier/rfqs", label: "RFQ inbox", exact: false },
  { href: "/supplier/quotes", label: "Quotes", exact: false },
  { href: "/supplier/settings", label: "Settings", exact: false },
] as const;

export function SupplierShell({ supplierName, role, children }: { supplierName: string; role: "admin" | "member"; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-fr-bg">
      <header className="border-b border-fr-border bg-fr-surface">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-label uppercase tracking-wide text-fr-ink-600">Farm Return supplier portal</p>
            <p className="text-base font-semibold text-fr-ink-900">
              {supplierName} <span className="text-xs font-normal text-fr-ink-600">· {role === "admin" ? "Admin" : "Member"}</span>
            </p>
          </div>
          <nav aria-label="Supplier portal" className="flex flex-wrap gap-1">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium",
                    active ? "bg-fr-green-700 text-white" : "text-fr-ink-600 hover:bg-fr-surface-alt",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}

export function SupplierNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-2 text-title text-fr-ink-900">{title}</h1>
      <div className="rounded-fr-control border border-dashed border-fr-border p-4 text-sm text-fr-ink-600">{children}</div>
    </div>
  );
}
