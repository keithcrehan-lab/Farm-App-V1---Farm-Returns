"use client";

/**
 * Supplier Portal shell — a separate, minimal chrome (no farmer
 * navigation), the same choice `src/app/operator/layout.tsx` made for
 * operators.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/today"
              className="rounded-full border border-fr-border px-3 py-1.5 text-sm font-medium text-fr-ink-600 hover:bg-fr-surface-alt"
            >
              ← Back to Farm Return
            </Link>
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
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}

export function SupplierNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-fr-v2-cream px-4 py-8 text-fr-v2-graphite">
      <div className="mx-auto max-w-xl border-t-2 border-fr-v2-gold pt-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fr-v2-muted">Farm Return · Supplier portal</p>
        <h1 className="mb-3 mt-3 font-display text-[32px] font-normal leading-tight">{title}</h1>
        <div className="border border-fr-v2-cream-rule bg-white p-4 text-sm leading-relaxed text-fr-v2-muted">{children}</div>
        <Link href="/today" className="mt-5 inline-flex min-h-11 items-center gap-2 bg-fr-v2-forest-deep px-4 py-3 text-sm font-semibold text-white">
          <ArrowLeft className="size-4" aria-hidden="true" /> Return to Farm Return
        </Link>
      </div>
    </main>
  );
}
